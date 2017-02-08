# RFC: Last Write Wins Registers

Discussion: https://github.com/basho/rfc/pull/41

### Abstract

Last Write Wins (hereafter LWW) or Write Once (also First Write Wins,
hereafter w1c or FWW will be interchangeable and mean the same thing)
require a read-before-write (rb4w) in order to be correct in Riak, as
the timestamp is embedded in the object metadata. Riak has always
taken the approach that some data loss in LWW is "OK", and may
yolo-write older data over newer. If we embed the timestamp in the
key, we can still "write fast" (i.e. without rb4w), and avoid the edge
cases where an older timestamp overwrites a new one. There maybe some
added penalty in reading and compaction of redundant data.

### Background

When one says Last Write Wins, or Write Once there is a very specific
behaviour expected. LWW says if there are multiple, conflicting writes
to the same key, the one with the highest timestamp wins (regardless
of how that timestamp is derived.) A max-timestamp register. W1C, or
FWW means that once some value has been written for a key, ever after
that will be the value. Maybe it is a leap to say that the first write
is the one with the lowest timestamp, but it gives us a simple,
understandable semantic in a system where concurrent writes are
possible. A min-timestamp register.

Riak's LWW (and W1C) have always been broken. W1C in no way enforces
that the datum is written only once. If there are conflicting writes
to the same key W1C picks a random winner by hashing the value. I
think this is actually a punitive measure for those abusing the "write
once" feature. The RFC proposes we pick the lowest timestamp.

Riak's LWW is a best effort at picking the Last Write. Due to the
complexities of Riak's write path, read-repair, and
handoff/replication, there is no guarantee that the last value a vnode
writes for a key does in fact have the highest timestamp. The reason
for this is that on some (not all paths) the vnode will overwrite the
existing data for a LWW key with the last object it receives for that
key. It does this without checking the timestamps of either the object
on disk or the incoming object. It is possible that the incoming
object has a lower timestamp but gets written anyway. For example:

- Write K with T1 P1
- Write K with T2 P2
- Read K || Write K with T3 at P1
- Read Repair P1 with K at T2

`||` means "concurrently with".

For Riak to handle the above scenario (there are others like it)
correctly it must read K from disk before writing the incoming
read-repair object in order to correctly discover that what is on disk
was in fact written "last." The same is true for FWW or W1C. Although
W1C uses a hash to decide a winner, it does not apply that logic on
write, instead it always chooses the "last received" object.

LWW and FWW(W1C) are sources of non-determinism in Riak. Or put
another way, data loss. Databases that may lose data are objectively
bad.

#### Time series considerations

This may seem moot for timeseries as they have neither read repair,
nor quorum reads. Yet.

### Proposal

FWW is a `min-integer-register`, LWW a `max-integer-register`. A
`max-integer-register` can be implemented as a `min-integer-register` if
you multiply the integer by -1. If Riak has a correct
`min-integer-register` then it can support deterministic LWW and
FWW(W1C). A `min-integer-register` is a register that given any pair of conflicting values always returns the one with the lowest integer.

    min(A, B) -> A.

We can make a `min-integer-register` by embedding the timestamp
metadata as an integer in the object's key. Where before the key is
`<<K>>` it could be `<<K, $0, I>>` where `I` is an integer that
represents either `Timestamp` for FWW or `-1 * Timestamp` for LWW. The
integer after the null is the metadata.

Using this key scheme leveldb would sort the keys so that a seek to
`<<K, $0>>` would arrive at the Key with the smallest integer
value. In the case of FWW this would always be the lowest timestamp,
even if the same key is written again and again and again. Each
subsequent write would have a different timestamp. For LWW this would
be the largest timestamp. Even if the vnode where to receive a key
from an earlier time (as in the example above.)

This scheme does involve writing multiple objects for the same
key. Each write to the key with a different timestamp results in a new
`<<K, $0, I>> -> Value` pair being written, with only the lowest
sorting one being of interest.

Leveldb does this already. When level writes a key, it actually writes
the user key and some [metadata][level] including a counter that is
used to differentiate an overwrite of some key (including deletes,
deletes are writes.) Leveldb compacts out redundant, overwritten
keys. The compaction algorithm could be taught to compact out all but
the lowest `min-integer-register` key for a given user key.

Reads for a single key would be replaced by an iterator with one seek
that returns the first result, though leveldb could encapsulate this
kind of "Top-Key-Fold."

Folds over many keys, as per timeseries queries would simply need to
skip over redundant keys by taking only the first encountered entry of
a given `K`.

Timeseries is the ideal place to implement this scheme
first. Timeseries has no quorum reads, and all queries are folds,
meaning the implementation is as simple as appending the metadata to
the key, and updating the per-vnode fold logic to skip redundant
data. Timeseries has no read-repair: even less code to change.

The major outstanding issue, as is always the case for changes of this
type in Riak, is what to do about data on disk already. Suggestion
being simply to fall back to the implemented LWW/FWW method for data
without the timestamp in the key.

### References

- Leveldb Key Format - [https://github.com/basho/leveldb/wiki/key-format][level]

[level]: https://github.com/basho/leveldb/wiki/key-format "Leveldb Key Format"
