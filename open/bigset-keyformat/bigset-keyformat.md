# RFC: Bigset Key Format (On Disk)

### Abstract

[Bigsets][bigset] depends on the sort order of elements. Sext encoding
the keys to maintain sort order on disk has been shown to impact read
performance disastrously. The Bigset prototype encodes keys into
erlang binaries and uses a custom C++ comparator to maintain order on
disk. We would like to avoid sext encoding in production with Bigset
code merged into Riak. This means coming up with a production ready
key-scheme that "plays nice" with existing data.

### Background

See the [bigset design doc][bigset] for background and details. For
example the _element_ keys in the prototype follow this scheme:

    <<SetNameLen:32/integer,
      SetName:SetNameLen/binary,
      ElementLen:32/integer,
      Element:ElementLen/binary,
      ActorLen:32/integer,
      Actor:ActorLen/binary,
      Cnt:64/integer>>

The reason we encode like this is that it makes reads so much
faster. Benchmarked reads with sext encoded keys were considerably
slower than binary encoded keys. Clock keys are similar, as are
tombstone, and end-keys for the set. We depend on leveldb's common key
prefix compression magic to make this repetitive key format
acceptable.

In the prototype there is _only_ bigset data. When merged with Riak
there will be riak_object data, riak index data, and TS data.

Riak Keys, TS keys, and Index keys are all sext encoded. As TS data is
riak_object data, at this point I will stop distinguishing between the
two and just use "RO keys".

Part of the way bigset reads work is to fold over all the keys in a
set. We seek to a set's first key (the clock) and we fold until it's
last key (a special terminating `end_key`.) We don't want to have to
code logic that checks each key for format/type. We want to correctly
assume all the keys for a set are logically contiguous with no
interstitial RO/Index keys. We would like to ensure this in Riak KV.

The aim then is to have bigset data separate from RO/Index keys. The
aim is also to have bigset data stored in such a way that we can
evolve it over time.

### Proposal

Update the key format to:

- include a special byte that distinguishes the bigset keys as bigset
    keys, this should sort lower than legacy riak data.
- include a version signifier for the key format/data
- drop the need for a comparator by using NULL terminated strings
  (thanks to MvM!)

For example:

    <<MagicBigsetByte:1/binary,
      VersionByte:8/big-unsigned-integer,
      SetName/binary,
      $\0,
      %% one of $c, $d, $e, $z
      %% for clock, tombstone, element, and end key
      TypeByte:1/binary,
      Element/binary,
      $\0,
      Actor/binary,
      $\0,
      Cnt:64/big-unsigned-integer>>`

The aim here is to allow bigset data to be stored in the same backend
as existing Riak datatypes, but to be logically separated by leveldb.

Each "field" of the key is separated by a null byte. Where a field is
absent (for example, clocks don't have elements, and end_keys don't
have actors) they are simply ommitted but the terminating null byte
remains.

If the bigset data is separate then all existing riak code should work
as though it were not there. Hand off folding, key listing, 2i folding
all start with the first `{o, B, K}` or `{i, B, I, T, K}` key. If we
sort bigset data _LOWER_ than existing data, it will not be touched by
existing folds. The existing sext encoded keys all seem to start with
the byte `<<16>>`. We should avoid that byte and above.

Further, individual bigset element keys will not be accessible by the
KV get/put/delete path (a free bonus.)

We would need to "teach" Riak's folds (for hand-off, MDC etc) about
bigset data.

#### Code location

Currently the `riak_kv_vnode` asks a backend module that conforms to
`riak_kv_backend` to store a key/value with a call to `put/5`. The
backend decides how to encode the key/value data. With Bigset the
_application_ decides how to encode the data. We would have the codec
code in a bigset specific module (imagine other future types with
custom encoding also) and add either a flag, or new function to
`riak_kv_backend` that means "store raw, do not encode."

Bigset is only supported in leveldb, I suggest we add a new function
rather than parameterise the existing one. New code paths are cleaner
and easier to reason about.

We can add notification of the support to the `Mod:capabilities/2`
call, and use the result to decide which function to call when storing
a key. Likewise for folding/queries/reads.

However, since bigset reads will certainly not use any existing read
FSM, and the writes are unlikley to use the existing write paths, new
commands can be added to `riak_kv_vnode` just for handling bigset
data, which makes the backend call simpler to plumb in.

#### Downgrades?

What happens to this bigset data on disk when a leveldb node is
downgraded? I suggest we test, but it will sort in such a way that it
does not become "intertwingled" with RO and Index data. Must bigset
data be deleted before downgrades? Or will sorting "out of the way"
mean it is just left on disk?

Some operations carry a "no downgrades" warning (bucket types for
example) so there is precedence for that.

### References

See the existing [bigset][bigset] design document (due a re-touch.)

[bigset]: https://github.com/basho-bin/bigsets/blob/master/doc/bigsets-design.md "The original design doc"
