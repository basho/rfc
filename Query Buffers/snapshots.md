Could the following people please review this document:
 - [ ] @gordonguthrie
 - [ ] @macintux
 - [ ] @javajolt
 - [ ] @lehoff
 - [ ] @russelldb
 - [ ] @paegun

# RDF: Snapshots

Discussion: https://github.com/basho/rfc/pull/13

# Abstract

This is an RFC for snapshots, or static views of a SELECT query, which
are, technically, named and non-expiring, node-local query buffers
(which have a dedicated RfC).

## Background

Building on query buffers, snapshots are a logical developent of the
concept of localized, volatile (gasp!) data in Riak TS.


## Proposal

### Overview

1. Snaphots are named and non-self-destructing query buffers.

2. Like query buffers, snapshots:

    * are only accessible from the physical node they were created at,
      and further, only via the same API entry point;

    * do not receive updates from the table from which they were
      created.

3. Unlike query buffers, snapshots:

    * are assigned an **identifier** by which they can be accessed by
      local clients via normal queries, just as normal TS tables
      are;

    * have no **expiry time** and are only dropped by an explicit DROP
      TABLE statement.

    * are created explicitly.

4. Snapshots cannot be implicitly selected to provide SELECT data for
   subsequent queries with matching query hash (no "follow-up queries").


### Changes to external API

1. Snapshots are created with statements combining INSERT and SELECT,
   as follows:

   ```
   INSERT iNTO $snapshot_name <select statement>
   ```

2. In a future release, existing snapshots may be made updateable from
   new SELECT queries as long as they have compatible schemas.


### Execution steps

Internally, creation of snapshots is identical to that of query
buffers (which see), except that:

* query hash is not computed and not compared to any preexisting
  snapshots or query buffers: a new snapshot is created
  unconditionally as long as no snapshot already exists with the same
  identifier;

* there is no expiry time set for snapshots;

* the keyword ONLY does not cause snapshot tables to be dropped.


### Diagnostics

Proper diagnostics will be done for:

* Attempts to create a snapshot when another already exists with the
  same identifier.


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
  LIMIT 10 OFFSET $offset
```

will be equivalent to the following SQL statements (in pseudo-pythonic
pseudocode):

```
if snapshot_exists($snapshot_name):
    report_error_and_bail_out("Snapshot $snapshot_name already exists")
#
CREATE TABLE $snapshot (
  a VARCHAR NOT NULL,
  b VARCHAR NOT NULL,
  c SINT64 NOT NULL,
  ts TIMESTAMP NOT NULL,
  # Note the primary key has the field mentioned
  # in the ORDER BY clause ('b') coming first.
  # This ensures the proper sorting in the snapshot table.
  PRIMARY KEY (b, a, c, ts));
#
# The coordinator dispatches subqueries to all vnodes to fetch
# all quanta.
for $quantum in $all_quanta:
    $tmp =
      SELECT a, b, c, ts FROM $quantum
      WHERE a = 'bish' and b = 'bosh'
        AND ts > $ts_min AND ts < $ts_max
    #
    # as inserted into the snapshot, the records will be iterable
    # as required by the ORDER BY clause
    $insert =
      INSERT INTO $snapshot VALUES $tmp
```

# Appendix: Indicative Road Map for temporary tables in Riak TS

This proposal under discussion has arisen from the design work for
adding the `LIMIT` and `ORDER BY` clauses to the query system.

The required work starts putting place infrastructure that will
potentially be useful for the query system in a number of ways.

## Background

Up til now the product process for TS has been uni-directional

```
Clients ----------> Product Team ----------> Engineering
         inchoate                priorities
          wishes
```

This product feature requires that feedback loop to close
```
Clients ----------> Product Team ----------> Engineering
         inchoate                priorities       |
          wishes                                  | new
                                                  | opportunities
                                                  |
Clients <---------- Product Team <----------------+
            seek                     tease out
          feedback
```

## The Engineering View

There is a ladder of potential opportunities now visible as a result
of this work. Not all the opportunities are currently realisable -
they would need:

* further thinking and prototyping
* training/reskilling due to recent loss of expertise
* etc, etc

This introduction will describe the 'opportunity ladder' on the basis
of Gall's Law

> Any sufficiently complex working system evolves from a simpler working system

### Step 1

Temporary tables are created for the lifetime of queries to do `LIMIT`
and `ORDER BY` operations - and `GROUP BY` as appropriate.

Temporary tables reside on the co-ordinating node, and have no
replicas, nor AAE or MDC or anything else.

The number of temporary tables is restricted per node, as is the total
disk storage all running queries can use.

The client's get the results of these queries streamed to them, when
the stream completes the temporary table for the query is dropped and
the space freed up.

### Step 2

Snapshot tables are created against which paged queries can be run. A
temporary snapshot tables is created when the paged query is first
run, and re-used on subsequent page requests.. These temporary tables
are `snapshot` tables - created at a point in time - and they do not
update.

The number of snapshot tables is restricted per node, as is the total
disk storage all running queries can use - this may be a single
restriction for temporary and snapshot tables, or they may have
separate limits.

The snapshot tables must be explicitly dropped for the
resources/diskspace to be released. The ONLY keyword will be part of
this process - and probably an explicit clean up command.

Snapshot tables reside on the co-ordinating node, and have no
replicas, nor AAE or MDC or anything else.

### Step 3

Temporary tables are created against which queries can be run using
the `INSERT INTO' SQL syntax. These temporary tables are explicitly
created and deleted. They are `snapshot` tables - created at a point
in time - and they do not update.

Users can write arbitrary queries against the snapshot tables and have
programmatic access to the table definitions.

The number of snapshot tables is restricted per node, as is the total
disk storage all running queries can use - this may be a single
restriction for temporary and snapshot tables, or they may have
separate limits.

The temporary tables must be explicitly dropped for the
resources/diskspace to be released.

Snapshot tables reside on the co-ordinating node, and have no
replicas, nor AAE or MDC or anything else.

### Step 4

At this point is all gets a bit fuzzier. A range of options (not all
necessarily compatible) become available.

Temporary tables become materialised views - when you write to the
main table the query view gets the data and updates itself as well.

Temporary tables stop being per-co-ordinating node and instead are
just normal TS tables...

Before we can even start thinking about Step 4 the TS team needs to
step up its Dist Sys game by an extensive training programme because
frankly we will be out of our depth in the design and architecture of
this as we currently stand.

## The Current Proposals

The current architectural proposals are at a Step 2 level.

