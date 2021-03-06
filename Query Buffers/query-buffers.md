Could the following people please review this document:
 - [ ] @gordonguthrie
 - [ ] @macintux
 - [ ] @javajolt
 - [ ] @lehoff
 - [ ] @russelldb
 - [ ] @paegun

# RFC: Query buffers, aka temporary tables

# Abstract

This is an RFC for the temporary tables, or **query buffers**, a means
to deal with arbitrarily big queries that would otherwise result in
OOM conditions on the query coordinator node.  It is also an
infrastructure layer underlying ORDER BY, LIMIT and OFFSET features.

## Background

In Riak TS 1.4, in order to avoid accumulating too much data on the
heap, the query engine in riak_kv (`riak_kv_qry_worker`) enforces
restrictions on query range, effectively limiting the range of the
WHERE clause to 5 quanta.  This is a sensible, if crude and not always
guaranteed to prevent OOM from happening, temporary measure.  The
original query is broken up into up to 5 subqueries, which are
dispatched in parallel to corresponding vnodes; upon reception of data
from all of them, records are repackaged, encoded, and sent to the
client.

To support LIMIT and ORDER BY clauses for queries with arbitrary WHERE
ranges, the coordinator needs to have the entire scan range-ful of
data in order to (a) sort the result by the field specified in the
ORDER BY clause, and only then (b) count the number of records as
specified by the LIMIT clause.

The LIMIT clause is about the **number** of records and their **position**
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

1. Query buffers will contain the rows selected by a SELECT query, in
   a temporary **disk-backed storage**.

2. Query buffers will be automatically enabled for queries having a
   LIMIT, OFFSET or ORDER BY clause.

2. Data are stored in a **separate, isolated instance of eleveldb**
   running **colocally with the coordinator**.

3. In order to support paging (with follow-up queries), the data in
   query buffers are **persisted across queries**.  Query buffers are
   automatically dropped after a certain, configurable, amount of time
   has elapsed since they were last accessed.

4. Records are inserted into query buffers such that the table
   **natural order** is consistent with the ORDER BY clause.

5. Operations on query buffers can be represented in equivalent
   **formal, standard SQL**.  Query buffer tables will have a **schema**.

6. Query buffers contain the data existing in the underlying table
   **at the moment of query execution**, and do not reflect any
   updates that the table may have received since.

7. Query buffers are **not specific to a connection or client** by which
   the original initial query has been received.

8. Query buffers are only accessible from the physical node they
   were created at, and further, only via the same API entry point.


### What query buffers are NOT

1. Although they have some aspects of cache semantics, query buffers
   should not be used as cache because there is no mechanism to
   propagate changes eventually done to the affected rows in the
   underlying table after the query buffers were created.  Similarly,
   no attempt is made to check that the data, once collected in query
   buffers, continue to exist in the underlying table.

2. Query buffers are not "materialized views", in that they cannot be
   accessed by arbitrary queries but only those which have the same
   query hash and thus qualify as "follow-up queries" (see below).
   Snapshots, on the other hand, offered for review as a separate RFC,
   will have this semantics.


### Initial and follow-up queries

1. Regular, non-streaming queries with an ORDER BY or LIMIT clause
   (referred to in this document as "eligible") will cause query
   buffers created for them.  In relation to subsequent queries, The
   query will be referred to as an **Initial query**.

2. **Follow-up queries** are those which (a) have SELECT, FROM, WHERE,
   and ORDER BY expressions identical with some previously issued
   query, and (b) have a matching query bufer ID in `qbuf_id` field
   of the `tsqueryreq` field.

3. A **query hash** can be computed for a query, which shall be the same
   for any two queries related to each other as initial and follow-up,
   and unique otherwise.


### Changes to external API

**Note:** Described changes are to be implemented in version 1.6.  In
  version 1.5, the behaviour is as if `qbuf_id` is always undefined.

1. The `#tsqueryresp` message will have a new field, `qbuf_id`,
   an 8-byte binary uniquely identifying the query buffer associated
   with the original eligible query.

2. The `#tsqueryreq` message will have the same, optional field
   `qbuf_id`, which if not undefined, will direct the query buffer
   manager to check for an existing query buffer before engaging
   coordinator.  If such query buffer exists (has not expired) and the
   query hash of its original query matches that of the current query,
   then the query buffer manager proceeds to fetch the records from
   it, skipping the full cycle of query execution involving
   coordinator and vnodes.  If `qbuf_id` is undefined, every query will
   get a separate query buffer exclusively associated with that query
   only.


### Execution steps

1. When an eligible query arrives, the query dispatcher
   (`riak_kv_qry`, in `do_select`) checks if `qbuf_id` is supplied in
   the original request, and if so, whether a previously created query
   buffer exists.  If not, it creates a new one, uniquely identified;
   otherwise, go to step 4.

2. The coordinator (`riak_kv_qry_worker`) proceeds to dispatch
   subqueries, collects and sends chunks to the query buffer manager
   (`riak_kv_qry_temptables`).

    * until it finishes collecting data for the query buffer, any new
      queries with the same query hash are blocked and queued;
    * once the query buffer is created, those queued queries are
      processed from step 1.

3. The query buffer manager creates a key for each record such that
   the direct SELECT on the query buffer table will fetch the records
   in the correct order, as specified by the ORDER BY clause.

4. The dispatcher rewrites the query to be executed against the query
   buffer table instead, and fetches LIMIT records at a given OFFSET.

5. The query buffer has its access time updated.


### Reuse of query buffers to enable paging

*Note:** Described semantics is to be implemented in version 1.6.  In
  version 1.5, the behaviour is as if `qbuf_id` is always undefined.

1. In this RFC, **paging** is understood and implemented as a series
   of SELECT queries (a) with the same FROM, WHERE and ORDER BY
   clauses and only differing in LIMIT and/or OFFSET clauses, and (b)
   each follow-up query having the same `qbuf_id` as returned in the
   `#tsqueryresp` from the original query.  Each query in this
   sequence will be directed to the query buffer set up for the
   original query.

2. When paging queries as described above, the records included in
   WHERE range are frozen for the duration of query buffer life cycle.
   The important implication is that concatenated result of `SELECT
   ... LIMIT 5 OFFSET 0` and `SELECT ... LIMIT 5 OFFSET 5` is
   guaranteed to be the same as `SELECT ... LIMIT 10 OFFSET 0`.

### Grouping and ordering

Ordering of grouped rows, such as those resulting from a query
containing GROUP BY clause and/or any of the aggregation functions, is
not supported.


### Diagnostics

Proper diagnostics will be done for:

* queries resulting in accumulation of excessive amounts of data per
  synchronous request, at any step in the pipeline (such as, a
  synchronous query without LIMIT clause and with excessively large
  WHERE range, or one with a LIMIT clause similarly too big);
* queries having both an aggregation function or a GROUP BY clause,
  and an ORDER BY clause.
* streaming queries having an ORDER BY clause.


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
  ORDER BY b
.  LIMIT 10 OFFSET $offset
```

will be equivalent to the following SQL statements (in pseudo-pythonic
pseudocode):

```
# A query hash will be unique for any SELECT queries
# which only differ in LIMIT and/or OFFSET clause.
$query_hash = make_query_hash($query)
$qry_buffer = "#" + str($query_hash)
#
# $qbuf_id is optionally supplied in the request
#
if not (query_buffer_exist($qbuf_id) and
        $query_hash == make_query_hash(get_orig_query($qbuf_id))):
    CREATE TABLE $qry_buffer (
      a VARCHAR NOT NULL,
      b VARCHAR NOT NULL,
      c SINT64 NOT NULL,
      ts TIMESTAMP NOT NULL,
      # Note the primary key has the field mentioned
      # in the ORDER BY clause ('b') coming first.
      # This ensures the proper grouping in the query buffer table.
      PRIMARY KEY (b, a, c, ts));
    #
    # The coordinator dispatches subqueries to all vnodes to fetch
    # all quanta:
    for $quantum in $all_quanta:
        $tmp =
          SELECT a, b, c, ts FROM $quantum
          WHERE a = 'bish' and b = 'bosh'
            AND ts > $ts_min AND ts < $ts_max
        # as inserted into the snapshot, the records will be iterable
        # as required by the ORDER BY clause
        $insert =
          INSERT INTO $qry_buffer VALUES $tmp
#
# Now we proceed with the SELECT proper, from the newly created query
# buffer:
SELECT a, b, c, ts FROM $qry_buffer
# 1. There is no WHERE clause here because the query buffer table
#    already has the right records pre-selected (and only those
#    records);
# 2. Likewise, the ORDER BY clause is omitted as the correct order is
#    ensured at query buffer creation.
LIMIT 10 OFFSET $offset
#
update_snapshot_access_time($qry_buffer)
#
# Reaping expired query buffers is done in a separate thread
```
