# RFC: Query buffers Optimisations: in-memory data collection

### Abstract

IO-opearations make query buffers in 1.5.0 (very) slow. One way to deal with this is to avoid (or defer) eleveldb operations as much as possible. The present RFC outlines two optimisations towards solving this problem.

### Background

In the baseline implementation, query buffers use per-query leveldb instances where a new natural sorting order is imposed according to ORDER BY clause.  This enables arbitrarily big WHERE ranges to be served without running into OOM conditions, but comes at the expense of increased latencies due to IO operations incurred by `eleveldb:open`, `:put` and `:get`.

### Proposal

Queries small enough to fit in memory need not have their results written to disk.  Chunks collected from vnodes at the coordinator should be kept in memory as long as there is free memory on the VM heap.

We propose two solutions:

- one which does not engage the query buffers at all;

- one which _defers_ leveldb creation until a certain, configurable limit is reached, falling back to leveldb-backed temp tables if needed, and _avoids_ it completely if the limit is not reached.

#### Specific case of LIMIT without ORDER BY

Chunks are accumulated at the coordinator node, in the worker process; new chunks are appended as they arrive; when done, the standard `lists:sort` is applied on the resulting total, and `lists:sublist(Results, Offset, Limit)` extracts the records that get sent to the client.

Because there is no ORDER BY clause, records are sent to the client in the table natural order.

Existing overload protection mechanism applies, limiting the `Results` term size to the maximum specified in riak.conf (key `riak_kv.query.timeseries.max_returned_data_size`), per worker process.  Queries projected to accumulate greater than `max_returned_data_size` are cancelled.  Theoretically, because there can be up to `riak_kv.query.concurrent_queries` workers in operation at any time, total VM heap usage can be up to `max_returned_data_size * concurrent_queries`.

#### General case

Chunks are sent to the query buffers manager, where they are kept in memory.  Unlike the Specific case, records will be indexed by the artificially constructed key, per ORDER BY specifications.  When, and if, the total amount of accumulated data (i.e., from all queries currently being served) reaches a preconfigured limit (riak.conf key `riak_kv.query.timeseries.qbuf_inmem_max`), the query buffer manager sets up a leveldb instance, dumps the accumulated records and, from this point onward, continues to write any remaining chunks to it.

In conditions where the total size of records from all queries currently being processed, does not exceed the configured limit, nothing gets written to disk and no leveldb instance is ever created.

The overload protection mechanism applies; the memory usage at coordinator is limited by `qbuf_inmem_max`, and queries with WHERE range projected to be greater than `max_returned_data_size` can be served provided LIMIT is small enough.

### References

- [https://github.com/basho/riak_kv/pull/1589](In-Mem LIMIT without ORDER BY)
- [https://github.com/basho/riak_kv/pull/1587](In-Mem LIMIT with ORDER BY)
