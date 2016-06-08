Could the following people please review this document:
 - [ ] @gordonguthrie
 - [ ] @macintux
 - [ ] @javajolt
 - [ ] @lehoff
 - [ ] @russelldb
 - [ ] @paegun

# RDF: Query buffers, temporary tables and snapshots

## Abstract

This is an RFC for (a) temporary query buffers, a means to deal with
arbitrarliy big queries that would otherwise result in OOM conditions
on the query coordinator node, and (b) snapshots, or static views of a
SELECT query, which are, technically, named and persistent, node-local
query buffers.

## Background

In Riak TS 1.3, in order to avoid accumulating too much data on the
heap, the query engine in riak_kv (`riak_kv_qry_worker`) enforces
restrictions on query range, effectively limiting the range of the
WHERE clause to 5 quanta.  This is a sensible, if crude and not always
guaranteed to prevent OOM from happening, temporary measure.  The
original query is broken up into up to 5 subqueries, which are
dispatched in parallel to corresponding vnodes; upon reception of data
from all of them, records are repackaged, encoded, and sent to the
client.

To support LIMIT, GROUP BY and ORDER BY clauses for queries with
arbitrary WHERE ranges, the coordinator needs to have the entire scan
range-full of data in order to (a) segregate the records according to
the GROUP BY clause, (b) sort the result by the field specified in the
ORDER BY clause, and only then (c) count the number of records as
specified by the LIMIT clause.

The LIMIT clause is about the *number* of records and their position
relative to the start or end of the scan range, rather than the
records with interesting fields falling within a certain range.
Unlike other databases, Riak TS requires the client to specify the
WHERE clause.  For the client to ensure the requested LIMIT number of
records is fetched, they need to include the entire timeline in the
WHERE clause, even in situations where the client is only interested
in the first N records (and those N records are likely to occur at the
very end of the WHERE range).


## Proposal

### Overview

1. A *disk-backed storage* for the data being accumulated for the
   currently running query ("query buffers").

    * Data are stored in a *separate, isolated instance of eleveldb*
      *running colocally with the coordinator*.
    * In order to support paging queries, the data in those per-query
      temporary tables are *persisted across queries*.
    * Records are inserted into the query buffers such that the table
      *natural order* in the snapshot is consistent with the GROUP BY
      and ORDER BY.
    * Operations on query buffers are done in *formal, standard SQL*.

2. Promotion of query buffers to *snapshots*.

    * Snapshots are assigned an *identifier* by which they can be
      referred to in normal queries, just as normal TS tables are,
      except that they are:

        - only accessible from the physical node where they were
          created at;
        - not updated by new writes to the table from which they were
          created.

    * Snapshot do not have an *expiry time* and are only dropped by an
      explicit DROP TABLE statement.

    * Snapshots are created.. how?


### Changes to external API

1. Paging implies holding the collected results in the query buffers
   or snapshots.  Paging is enabled for queries having a LIMIT or
   ORDER BY clause.

    * Data are persisted across a sequence of queries.  There is an
      expiry timeout for each query buffer.

    * A follow-up query attempting to fetch N next rows, for it to
      relate to another query for which data have been collected and
      stored in query buffers, must be *identical to the original
      query except for LIMIT and OFFSET* expressions.

    * Queries having the ONLY keywords are special:
        - an original query with ONLY, will have the query buffers
          dropped immediately;
        - a follow-up query with ONLY, drops the query buffer to which
          it relates.


### Initial and follow-up queries

1. Regular, non-streaming queries with a LIMIT or ORDER BY clause are
   eligible for query buffers/snapshots.

2. *Follow-up queries* are those which have SELECT, FROM, WHERE, GROUP
   BY and ORDER BY expressions identical with some previously issued
   query (which is then called "initial query" in relation to those
   following it).

3. A *query hash* can be computed for a query, which shall be the same
   for any two queries related to each other as initial and follow-up,
   and unique otherwise.


### Execution steps

1. The query dispatcher (`riak_kv_qry`, in `do_select`) computes the
   query hash for this query and checks if a previously created
   snapshot exists.  Unless it does, it creates a new snapshot,
   uniquely identified by the hash in its name; otherwise, go to step
   4;

2. The coordinator (`riak_kv_qry_worker`) proceeds to dispatch
   subqueries, collects and sends chunks to the query buffer manager
   (`riak_kv_qry_temptables`);

3. The query buffer manager applies the grouping and ordering such
   that the direct SELECT on the snapshot table will fetch the records
   in the correct order;

4. The dispatcher rewrites the query to be executed against the
   snapshot instead, and fetches LIMIT records at a given OFFSET;

5. If there was an ONLY keyword in the LIMIT clause, the query buffer
   is dropped; otherwise, its access time is updated.


### Grouping and ordering

### ORDER BY

* We must create a key that eleveldb can use to order the values for us.
  Query: SELECT * FROM items ORDER BY Name
  Leveldb key: {Name, <LOCAL KEY>}

#### GROUP BY

ORDER BY is executed *after* GROUP BY, which means that all rows have
to be grouped before an ORDER BY key is created.  The temp tables do
not do group by on their own; instead, grouping is done in the
`qry_worker` and then put in the temporary table only if there is an
ORDER BY clause.


### Diagnostics

Proper diagnostics will be done for:

* queries resulting in accumulation of excessive amounts of data per
  synchronous request, at any step in the pipeline (such as, a
  synchronous query without LIMIT clause and with excessively large
  WHERE range, or one with a LIMIT clause similarly too big);
* streaming queries having an ORDER BY clause;
* streaming queries having a LIMIT clause.


### Equivalent SQL statements

Assuming the following statement has been executed to create a table:

```
CREATE TABLE t (
a VARCHAR NOT NULL,
b VARCHAR NOT NULL,
c SINT64 NOT NULL,
ts TIMESTAMP NOT NULL,
PRIMARY KEY (a, b, QUANTUM(ts, 1, d)))
```

Execution of a comprehensive query including both GROUP BY and ORDER
BY as well as LIMIT clauses such as:

```
$query =
  SELECT * FROM t
  WHERE a = bish AND b = bosh AND ts > $ts_min AND ts < $ts_max
  GROUP BY b
  ORDER BY a
.  LIMIT 10 OFFSET $offset
```

will be equivalent to the following SQL statements (in pseudo-pythonic
pseudocode):

```
# A query hash will be unique for any SELECT queries
# which only differ in LIMIT and/or OFFSET clause.
$query_hash = make_query_hash($query)
$snapshot = "snapshot." + str($query_hash)
#
if not query_hash_exist($query_hash):
    CREATE TABLE $snapshot (
    a VARCHAR NOT NULL,
    b VARCHAR NOT NULL,
    c SINT64 NOT NULL,
    ts TIMESTAMP NOT NULL,
    # Note the primary key has the field mentioned
    # in the GROUP BY clause ('b') coming first.
    # This ensures the proper grouping in the snapshot table.
    PRIMARY KEY (b, a, c, ts));
    # The coordinator dispatches subqueries to all vnodes to fetch
    # all quanta.
    for $quantum in $all_quanta:
        $tmp =
          SELECT a, b, c, ts FROM $quantum
          WHERE a = 'bish' and b = 'bosh'
            AND ts > $ts_min AND ts < $ts_max
          # grouping (but not sorting) is done by query workers
          GROUP BY b
        #
        # sort the fetched chunk by the ORDER BY field,
        # possibly in reversed order
        $tmp = sort_by_field('a')
        if is_query_order_descending($query):
            $tmp = reverse($tmp)
        # as inserted into the snapshot, the records will be iterable
        # as required by the GROUP BY and ORDER BY clauses
        $insert =
          INSERT INTO $snapshot VALUES $tmp
SELECT a, b, c, ts FROM $snapshot
# 1. There is no WHERE clause here because the snapshot already has the
#    right records pre-selected (and only those records);
# 2. Likewise, the GROUP BY and ORDER BY clauses are omitted
#    as the correct order is ensured at snapshot creation and
#    on insertion of individual chunks.
LIMIT 10 OFFSET $offset
#
# If the query has the ONLY keyword, drop the snapshot now
if query_is_final($query):
    DROP TABLE $snapshot
else:
    update_snapshot_access_time($snapshot)
# Reaping expired snapshots is done in a separate thread
```
