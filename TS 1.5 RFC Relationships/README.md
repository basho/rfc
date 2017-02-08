The 3 TS 1.5 RFCs - Their Relationship
--------------------------------------

Discussion: https://github.com/basho/rfc/pull/22

There are three separate RFCs making proposals for the Time Series query system post-1.5

The are:
* Query Access Paths RFC
* Riak Pipe for TS Query Distribution RFC
* Riak TS Pipeline Library RFC

Overview
--------

The **Query Access Path RFC** is about data modeling. We have a co-location data model where we put quantized data onto the riak ring for Time Series. The Afrika/Big Sets/Big Maps proposal is to add another form of co-location - one which enables a richer set of data models to be built.

Both of these proposal extend on the basic premise of a KV store:
* normal K-V - go to a place determined by this Key and get a Value
* Time Series - to to a place determined by a quantized view of the Key and perform an operation on the data you find there to return a set of Values
* Afrika - go to a location determined by a left hand key and perform an operation on this projected table-join data model and return a set of Values

The **Riak Pipe for TS Query Distribution RFC** is about how we distribute work items around the cluster. At the moment we use the 2i index FSMs and coverage plans - this RFC proposes a short PoC to see if we should instead use riak-pipe.

The **Riak TS Pipeline Library RFC** is about how we process vectors of column names and rows/columns of values. As the query rewriter becomes more sophisticated we will make different decisions about where and how to perform the various manipulation operations in the pipeline (`SELECT`, `WHERE`, `ORDER BY`, `GROUP BY`, `DISTINCT`, `AS` and `LIMIT`). At the moment we have a clear distinction between what we can do at the vnode and what we can do at the coordinator. Now that we know we cannot do these operations in C we need to pull out the work into a common Erlang library that can be used in either location.
