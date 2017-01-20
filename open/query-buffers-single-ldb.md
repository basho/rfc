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
      <<"expire-me">>/binary,
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

### Deleting query buffers

Another challenge with single-instance implementation is, how to delete the records after query buffers are no longer needed and reclaim disk space.  Leveldb has an automatic bucket expiry feature, currently (as of 2017-01-20) in development, which we can use for this purpose.

Because buckets will need to be deleted after the last `put` and subsequent `get`, setting a fixed bucket expiry time is not suitable.  A better solution would be to communicate to leveldb expiry module a list of buckets we want to drop.  The expiry module will then work asynchronously to delete the discardable buckets and reclaim disk space.

### References

https://github.com/basho/riak_kv/pull/1601
