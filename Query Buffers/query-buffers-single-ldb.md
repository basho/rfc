# RFC: Query buffers Optimisations: single-instance leveldb backend

This RFC supersedes the RFC proposing [a pool of pre-opened leveldb instances](query-buffers-ldb-pool.md)

## Abstract

Query buffers in 1.5.0 involve `eleveldb:open` and `:close`, which can be avoided if we keep a single leveldb instance for all query buffers.

## Background

In the baseline implementation, query buffers use per-query leveldb instances where a new natural sorting order is imposed according to ORDER BY clause.  This enables arbitrarily big WHERE ranges to be served without running into OOM conditions, but comes at the expense of increased latencies due to IO operations incurred by `eleveldb:open`, `:put` and `:get`.

## Proposal

### Separate keyspaces

Rather than keeping each query buffer in its own instance of leveldb, we can keep them all in a single instancce instead, which will be opened once at applications start.

In this arrangement, keys belonging to separate query buffers will need to be differentiated from each other.  This can be accomplished by putting keys in separate buckets, similar to how this is done in `riak_kv_eleveldb_backend.erl`:

```
key_prefix(Bucket, Key) ->
    KeyPrefix = sext:prefix(Key),
    EncodedBucket = sext:encode(Bucket),
    <<16,0,0,0,3,  %% hand-written bits to avoid sext:encode'ing constant parts
      12,183,128,8,
      16,0,0,0,2,
      <<"$qbuf">>/binary,      %% bucket type reserved for query buffers
      EncodedBucket/binary,
      KeyPrefix/binary>>.
```
and
```
    eleveldb:put(
        LdbRef,
        key_prefix(Bucket, Key),
        sext:encode(Value), []).

```

### Query buffer lifecycle



### Deleting query buffers

Another challenge with single-instance implementation is, how to delete the records after query buffers are no longer needed and reclaim disk space.  Leveldb has an *automatic bucket expiry* feature, currently (as of 2017-01-20) in development, which we can use for this purpose.

The expiry module *asynchronously queries* the Erlang code for expiry details of the buckets it sees appearing in the database (via `eleveldb:callback_router`), which it reads from bucket properties `expiry_enabled` and `expiry_minutes`.  It then proceeds to delete the discardable buckets and reclaim disk space.

The query buffers manager will provide expiry details for the buckets it owns, to the expiry module.  For buckets it no longer needs, the properties will be `[{expiry_enabled, true}, {expory_minutes, 0}]`; for active buffers, it will be `[{expiry_enabled, false}]`.

### Query buffer lifecycle

Internally, query buffer manager keeps a list of query buffers.  Each record contains the unique query_id of the query it was created for, and a status field denoting the current stage in the lifecycle:

* `collecting_chunks`: collection of data is in progress.
* `serving_fetches`: all chunks collected, buffer becomes available to serve fetches (normally, there is one fetch operation to be served as buffers are not reusable at the moment (as of 1.5.x).  Expiry countdown starts.
* `expiring`: buffer has expired and is no longer available for fetches.  Query buffer manager awaits a leveldb expiry request on this buffer.
* `expired`: leveldb expiry module has been notified about this buffer expiring, and will work asynchronously to delete it at its earliest convenince.  Query buffer manager removes the qbuf record from the internal list on the next tick.

### References

https://github.com/basho/riak_kv/pull/1601
