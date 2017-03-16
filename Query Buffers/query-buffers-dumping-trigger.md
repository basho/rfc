# RFC: Query buffers Optimisations: Logic to trigger the dumping of query buffers to disk

## Abstract

Query buffers are designed to accumulate data in excess of available VM memory, by storing the data in the temp tables in leveldb.  It is important to have a mechanism in place to (1) dump the temp tables as soon as readily allocatable memory (that is, excluding swap) becomes close to exhausted, while at the same time (2) allow query buffers to grow as long as there is enough memory available.

## Background

In the baseline implementation, every time a new chunk is received, query buffer manager computes the amount of memory allocated in the process private heap and checks whether that amount is less than a user-configured limit, in this function in `riak_kv_qry_buffers`:

```
can_afford_inmem(Threshold) ->
    PInfo = process_info(self(), [heap_size, stack_size]),
    HeapSize = proplists:get_value(heap_size, PInfo),
    StackSize = proplists:get_value(stack_size, PInfo),
    Allocated = (HeapSize - StackSize) * erlang:system_info(wordsize),
    Allocated < Threshold.
```

This logic is simple enough to reason about, but it has some perceptible drawbacks:

* We simply shove the responsibility to set the optimal value for `riak_kv.query.timeseries.qbuf_inmem_max` to the user, which they most likely will not care to do;

* The static limit cannot adapt to variable (and varying) memory constrains the coordinator node may find itself running under;

* Binaries in the received chunks end up in different heaps depending on their size, which makes the calculations inaccurate.

It is worth re-stating the overarching problem: The purpose of the logic is to avoid OOM.

There are two ways to go about this problem.  We can trigger the dumping based on:

* estimated total size of the data received;

* observed amount of available memory.

### Estimating the size of in-mem data

The size of data held in memory can be computed as

* the sum of `erlang:external_size(Chunk)`, measured at reception.  Again, it is unclear how binaries of various sizes enclosed in individual records (fields of type `varchar`) contribute to the shared heap vs private process heap (and consequently, the extent to which chunks contributes to available memory depletion);

* the amount reported by `process_info`, as in the snippet above.  This assumes the data chunks are the single largest memory consumer, which will most likely be the case.

### Estimating available memory

* The use of `process_info` is suboptimal due to GC operations which can grow the heap (http://erlang.org/doc/efficiency_guide/processes.html).

* A more reliable estimate can be obtained with `memsup:get_system_memory_data`.

## Proposal

Leave the current naive implementation as is.  It will be difficult to work through all possible scenarios of running out of memory, due to high volume of incoming chunks or otherwise, or reliably estimate the memory constrains in the changing environment.
