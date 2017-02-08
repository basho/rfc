Riak TS Pipeline Library RFC
----------------------------

It is clear that the old idea of implementing pipeline operations written in C inside the leveldb layer and as a NIF at the coordinator is a non-starter. Operations-in-place on binaries will likely impact the VM in unpredictable ways.

Purpose
-------

This RFC is the architecture of a pipeline library to process SQL queries.

Scope
-----

The scope of this RFC is:
* pure functions that operate on vectors of column names and vectors containing rows of TS data
* the unit tests that verify that

The functional scope is in two parts.

Part 1 - Query operations that we currently do:
* `SELECT` - including windows aggregation functions and arithmetic
* `WHERE` - generalised where clauses - bear in mind that 'key-covering' relates to the dispatch of queries, not their execution
* `GROUP BY`
* `ORDER BY`
* `LIMIT`

Part 2 - identified future query operations
* `DISTINCT`
* `AS`
* `HAVING`

The following are out of scope:
* the distribution of work tasks around the cluster
* the management of side-effects - including communicating back to the user
* the compilation of queries at any stage in the query pipeline

Related Documents
-----------------
The following RFCs are companions to this one:
* Riak Pipe for TS Query Distribution RFC
* Query Access Paths RFC

The relationship between these documents is explained in:
* The 3 TS 1.5 RFCs - Their Relationship

Quality Statement
-----------------

This document outlines a production quality library - the outputs will be:
* a development plan for the library - agreed with the Product Team
* production quality code
* a technical document set
* a full set of unit tests - including EQC tests based on a model

This library is not-customer facing - there is no requirement for user-facing documents.

This library has some limited functional requirements - SQL features on the roadmap that have been identified but not implemented.

It has strong non-functional requirements around performance - the faster the better. These do not require specific enumeration **unless** during the testing of the library it transpires there are trade-offs to be made. Those trade offs will be made by the Product Team.

Background
----------

If we are not able to use C code to do the biz, we will need to use Erlang.

We will need to fall back to the old approach of:
* pushing the WHERE clauses down into the leveldb - perhaps with the addition of the SELECT clause
* performing SQL operations on the raw data returned from leveldb at the vnode in Erlang
* performing SQL operations at the coordinator in Erlang

As described in the riak_ql documentation we can consider individual components of SQL operations as actions that operate on a vector of column names and a matrix of rows/columns

```
 Table In Shell                           Data On Disk

+-------+-------+                  +-------+-------+-------+
| ColX  | ColY  |                  | Col1  | Col2  | Col3  |
| Type1 | Type2 |                  | Type1 | Type2 | Type3 |
+-------+-------+    SQL Query     +-------+-------+-------+
                  <--------------+
+-------+-------+                  +-------+-------+-------+
| Val1X | Val1Y |                  | Val1a | Val1b | Val1c |
+---------------+                  +-----------------------+
| Val2X | Val2Y |                  | Val2a | Val2b | Val2c |
+-------+-------+                  +-----------------------+
                                   | Val3a | Val3b | Val3c |
                                   +-------+-------+-------+
```

`WHERE`, `ORDER BY`, `GROUP BY`, `DISTINCT` and `LIMIT` are all row operations:

```
+-------+-------+-------+                 +-------+-------+-------+
| Col1  | Col2  | Col3  |                 | Col1  | Col2  | Col3  |
| Type1 | Type2 | Type3 |                 | Type1 | Type2 | Type3 |
+-------+-------+-------+    Operation    +-------+-------+-------+
                          <-------------+
+-------+-------+-------+                 +-------+-------+-------+
| Val1a | Val1b | Val1c |     WHERE       | Val1a | Val1b | Val1c |
+-----------------------+    GROUP BY     +-----------------------+
| Val3a | Val3b | Val3c |    ORDER BY     | Val2a | Val2b | Val2c |
+-----------------------+     LIMIT       +-----------------------+
| Val6a | Val6b | Val6c |    DISTINCT     | Val3a | Val3b | Val3c |
+-----------------------+     HAVING      +-----------------------+
| Val5a | Val5b | Val5c |                 | Val4a | Val4b | Val4c |
+-------+-------+-------+                 +-----------------------+
                                          | Val5a | Val5b | Val5c |
                                          +-----------------------+
                                          | Val6a | Val6b | Val6c |
                                          +-------+-------+-------+
```

Row operations preserve **column names** and **column types**.

`SELECT` is **both** a column operator and a row operator:

```
+-------+-------+                 +-------+-------+-------+
| ColX  | ColY  |                 | Col1  | Col2  | Col3  |
| Type1 | Type2 |                 | Type1 | Type2 | Type3 |
+-------+-------+    Operation    +-------+-------+-------+
                  <-------------+
+-------+-------+                 +-------+-------+-------+
| Val1X | Val1Y |     SELECT      | Val1a | Val1b | Val1c |
+---------------+                 +-----------------------+
| Val2X | Val2Y |                 | Val2a | Val2b | Val2c |
+-------+-------+                 +-----------------------+
                                  | Val3a | Val3b | Val3c |
                                  +-------+-------+-------+
```

`SELECT` can transform both **column names** and **column types**.

You can see how and why this happens if you consider:

```sql
SELECT COUNT(myintegerfield)/SUM(myintegerfield) FROM mytable;
```

 `SELECT` can also alter rows if it includes a `JOIN' which is not on the TS roadmap but does appear in Afrika.

`AS` operates on column names only:

```
+-------+-------+-------+                 +-------+-------+-------+
| ColX  | ColY  | ColZ  |                 | Col1  | Col2  | Col3  |
| Type1 | Type2 | Type3 |                 | Type1 | Type2 | Type3 |
+-------+-------+-------+    Operation    +-------+-------+-------+
                          <-------------+
+-------+-------+-------+                 +-------+-------+-------+
| Val1a | Val1b | Val1c |       AS        | Val1a | Val1b | Val1c |
+-----------------------+                 +-----------------------+
| Val2a | Val2b | Val2c |                 | Val2a | Val2b | Val2c |
+-----------------------+                 +-----------------------+
| Val3a | Val3b | Val3c |                 | Val3a | Val3b | Val3c |
+-----------------------+                 +-----------------------+
| Val4a | Val4b | Val4c |                 | Val4a | Val4b | Val4c |
+-------+-------+-------+                 +-----------------------+
                                     
```

These operations are distributed around the cluster by the query rewriter which unrolls an SQL query and passes the parts around:

```
<----Erlang Coordinator----->        <--eLeveldDB-->   <----------------levelDB--------------------->

                          <---Network--->

+ FROM     <----------------+        + FROM     <-----+ WHERE + start_key = {myfamily, myseries, 1233}
                            |        |                        | end_key   = {myfamily, myseries, 4000}
                            |        |                        + temp      > 18
|                           |        |
| SELECT   *                |        | SELECT   device, temp
|                           |        |
| GROUP BY []               +--------+ GROUP BY []
|                           |        |
| ORDER BY []               |        | ORDER BY []
|                           |        |
+ WHERE    []               |        + WHERE    []
                            |
                            |
                            |        + FROM     <-----+ WHERE + start_key = {myfamily, myseries, 4001}
                            |        |                        | end_key   = {myfamily, myseries, 6789}
                            |        |                        + temp      > 18
                            |        |
                            |        | SELECT   device, temp
                            |        |
                            +--------+ GROUP BY []
                                     |
                                     | ORDER BY []
                                     |
                                     + WHERE    []
```
**Note**: on first blush the `WHERE` clause can only be executed inside leveldb - and so would appear out of scope for this library. But the `HAVING` clause can and will be transformed into a `WHERE` clause in the query rewriter.

It is also important to note that the various operations that occur on the matrices of values are incremental - the pipeline can and does operate not on full datasets but on chunks of data sets:

```
+-------+-------+                  +-------+-------+-------+
| ColX  | ColY  |                  | Col1  | Col2  | Col3  |
| Type1 | Type2 |                  | Type1 | Type2 | Type3 |
+-------+-------+    SQL Query     +-------+-------+-------+
                  <-----+
+-------+-------+       |          +-------+-------+-------+
| Val1X | Val1Y |       |          | Val1a | Val1b | Val1c |
+---------------+       | Chunk1   +-----------------------+
| Val4X | Val4Y |       +----------+ Val2a | Val2b | Val2c |
+-------+-------+       |          +-----------------------+
                        |          | Val3a | Val3b | Val3c |
                        |          +-------+-------+-------+
                        |
                        |
                        |          +-------+-------+-------+
                        |          | Val4a | Val4b | Val4c |
                        | Chunk2   +-----------------------+
                        +----------+ Val5a | Val5b | Val5c |
                        |          +-----------------------+
                        |          | Val6a | Val6b | Val6c |
                        |          +-------+-------+-------+
                        |
                        |
                        |          +-------+-------+-------+
                        |          | Val7a | Val7b | Val7c |
                        | Chunk3   +-----------------------+
                        +----------+ Val8a | Val8b | Val8c |
                                   +-----------------------+
                                   | Val9a | Val9b | Val0c |
                                   +-------+-------+-------+
```

Library Specification
---------------------

The Library should be an extracted and expanded version of the code that runs in the coordinator at the moment to do Windows Aggregate Functions (`COUNT`, `MAX`, `AVG` and so on and so forth).

The pseudo code for the API looks something like this:
```
-type qry()           :: #riak_select_vX{} | or some other data structure? with order?
-type continuation()  :: term().
-type columnname()    :: binary().
-type columnnames()   :: [columnname()].
-type columntype()    :: [varchar | sint64 | double | timestamp | boolean].
-type datarow()       :: [columntypes()].
-type datarows()      :: [datarow()].
-type chunk_options() :: [max_size | ????]

-spec initialise(qry()) -> continuation().
initialise(Qry) ->
  ....
  Continuation.

-spec consume_chunk(columnnames(), datarows(), qry(), continuation())
consume_chunk(ColsReceived, RowsReceived, Qry, Continuation) ->
   ...
   NewContinuation.

-spec stream_chunk(qry(), continuation(), chunk_options()) -> {continuation(), columnnames(), datarows()}.
stream_chunk(Qry, Continuation, Opts) ->
    ...
    {NewContinuation, ColumnNamesToStream, RowsToStream}.

-spec finalise(qry(), continuation()) -> {columnnames(), datarows()}.
finalise(Qry, Continutation) ->
	...
	{ColumnNames, Rows}.
```

Non-Functional Requirements
---------------------------

There needs to be a quick check library that can generate:
* data sets
* queries
* the results of applying those queries

That quick check library needs to be reusable for testing:
* a query rewriter that takes a query and compiles it into a pipeline - the pipeline when executed against the dataset should return the results set
* full blown riak tests where the dataset is written through the front-end and then queried
