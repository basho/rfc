# RFC: Query buffers Optimisations: a pool of pre-opened leveldb instances

### Abstract

Query buffers in 1.5.0 involve `eleveldb:open`, which can be done asynchronously, in advance.

### Background

In the baseline implementation, query buffers use per-query leveldb instances where a new natural sorting order is imposed according to ORDER BY clause.  This enables arbitrarily big WHERE ranges to be served without running into OOM conditions, but comes at the expense of increased latencies due to IO operations incurred by `eleveldb:open`, `:put` and `:get`.

### Proposal

It will make sense to maintain a (small) pool of pre-opened, empty leveldb instances.  Whenever the query buffer manager decides an instance is needed, one is taken from the pool and associated with a query.  The query buffer can then immediately proceed to add rows to that instance.  A new instance is added to the pool asynchronously, in a separate process, without delaying the serving of the queries.

One side effect of the proposed change is that leveldb instances will no longer have descriptive names as they will have to be opened with a directory name (passed as a parameter to `eleveldb:open`) that cannot include the descriptive elements because the table name is not yet known.  It is really a non-issue because those names were not user-facing.

### References

(PRs to be opened)
