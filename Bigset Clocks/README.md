# RFC: Bigset Clock Format

### Abstract

The purpose of this RFC is to inspire some bright spark(s) to invent
an efficient way to represent [bigset-clocks] [bs-clock].

[Bigsets][bigset] replicates [deltas][delta-paper]. This means that the
bigset logical clocks allow [gaps][winfs-paper]. In the current
[implementation][bs-clock] we use a base version vector from
[riak_dt][riak-dt-vv] and a dictionary of `actor->dot_list` mappings,
where an `actor` is a `<<_:24/binary>>`, and a dot list is
`[pos_integer()]`. In some cases (see below) I doubt that this naive
format is good enough. I'd like input on possible better ways to "do"
bigset clocks.

### Background

You can learn more about the bigset work by reading the
[docs][bigset], [paper][bs-paper], or watching the
[presentation][bs-pres]. This RFC only really concerns the logical
clocks in bigsets, though, so you can skip all that and read on!

As outlined above we have a naive implementation of the logical clock
using a base version vector and a dictionary of `actor->dot_list`
mappings for the gapped events. We call this dictionary the
`dot-cloud`, why? That's what Carlos called it in his reference
implementation of [delta-CRDTs][carlos-delta]. We store these clocks
using `erlang:term_to_binary(Clock)` at present.

All contiguous events to the base end up in the base, but as soon as
some event is missed, a gap is created. If you are more visually
inclined [here][clock-slides] are some slides cut from a talk on bigsets
that show how gaps occur.

Imagine a case were some replica `A` misses event `1` from `B` but
sees the next one-million events. The clock on `A` would be:

    {[], %% empty base
     [{b, [2...1000000]}] %% That's a big dot cloud
    }

Imagine that replica `A` has the same base and dot-cloud for replicas
`C`, `D`, `E`, and `F`.

I'm fairly sure there are other "worst case" dot-clouds we can think
up.

#### Requirements - Clocks Are Just Sets!

Remember, these logical clocks are just summaries of sets of
events. Base (or compact) version vectors are very compact summaries
of a set of events, they contain only the top event for each actor;
the [downset][wikipedia-upperset] can be compactly represented. Our
clocks have gaps, the maximum event does not always denote a closed
downard set. We need an efficient way to store and manipulate these
sets, that still allows us to perform calculations with them.

We read and write this clock for every operation on a bigset. The
smaller it is the better.

We need to merge pairs of these clocks. The quicker we can do that,
the better.

We need to perform basic causality operations, like
[seen][bs-clock-seen] and [add-dot][bs-clock-add]. The quicker the
better.

We need to be able to do some "set math" operations, like
[intersection][bs-clock-intersect] and
[complement][bs-clock-complement]. The more efficient the better.

#### Super Naive

This section is just to aid understanding.

For quickchecking, we simply ["explode"][bs-clock-to-set] any bigset
clock into a set of dots. We can then use the usual set operators, and
when done we ["compact"][bs-set-to-clock] down into a bigset clock
again. I doubt that is OK for a clock with 30 actors each having
performed millions of events.

#### Prior Work

What follows is more a brain dump than anything else.

##### Bitmapped Version Vector (BVV)

One proposal for this kind of clock is something called a Bitmapped
Version Vector, described in [Server Wide Clocks][swc-paper] and
implemented [here][swc-repo] (On a side note, can we hire Ricardo
already?). Here an integer is used to represent the dot-cloud for an
actor. Roughly, imagine the binary representation of some integer. Say
`22` in binary is `10110`. Then `10110` represents the
dot-cloud. Imagine a base VV for this actor of `[{b, 4}]`. Starting
from the least significant bit this dot-cloud shows that event `{b,5}`
is missing, `{b,6}` and `{b,7}` are present, `{b,8`} is missing, and
`{b,9}` is present. A present event or dot is denoted by a `1`, and
absent event, or gap, by a `0`.

This is not so good for our "worst case" clock above. Such a clock
would need ~1million bits to represent it. We can use compression, so
that "runs" of zeroes and ones are compact (even
[RLE][https://en.wikipedia.org/wiki/Run-length_encoding] is good
enough), but we need a way to calculate still, which would mean
decompressing (does it?).

##### Bitmap Indexes

I know, I know, not the same thing, but
[bitmap indexes][wiki-bm-index] are sets. Things like
[Bit-Arrays][wiki-bit-array] lead one to [sparse bitmaps][lemire-sparse]
and [sparse
bitsets][sparse-set]. Promising?

The base portion of the version vector seems fine, so maybe focussing
on effecient representation of the dot-cloud is the way to go, and
maybe things like bitsets are the starting point.

### Proposal

- Research needed
  - Come up with some competing options
  - Benchmark options
    - Generate some "worst case" clocks for benching

This is really a nice open problem for someone who is interested. It's
in a nice open space at the confluence of databases, causality,
performance and low-level techniques. It feels like as a company, as a
team, we have the expertise for this. I'm asking around as this looks
like the kind of problem that has been solved for a different use case
many times.

### References


- [Concise Version Vectors in WinFS] [winfs-paper] Ask me if you want
  a copy of this, used to be unpaywalled on MS-research and I have a
  copy.
- [Delta CRDTs] [delta-paper]
- [Global Logical Clocks] [swc-paper]
- [Bit Arrays] [wiki-bit-array]
- [Bitmap Indexes] [wiki-bm-index]
- [Bitmap Index "myth"](http://lemire.me/blog/2008/08/20/the-mythical-bitmap-index/)

[bs-clock]:  https://github.com/basho-bin/bigsets/blob/master/src/bigset_clock.erl "Bigset Clock"
[delta-paper]: https://arxiv.org/abs/1410.2803 "Delta CRDTs"
[winfs-paper]: http://dx.doi.org/10.1007/11561927_25 "Concise Version Vectors in WinFS"
[riak-dt-vv]: https://github.com/basho/riak_dt/blob/develop/src/riak_dt_vclock.erl "Riak DT Vclock"
[clock-slides]: bigset-clocks.pdf "Bigset Clock Slides PDF"
[wikipedia-upperset]: https://en.wikipedia.org/wiki/Upper_set "Upper Set on Wikipedia"
[bs-clock-seen]: https://github.com/basho-bin/bigsets/blob/master/src/bigset_clock.erl#L110 "Implementation of Seen in bigset_clock"
[bs-clock-add]: https://github.com/basho-bin/bigsets/blob/master/src/bigset_clock.erl#L78 "Implementation of add-dot in bigset_clock"
[bs-clock-intersect]: https://github.com/basho-bin/bigsets/blob/master/src/bigset_clock.erl#L246 "Intersection implementation"
[bs-clock-complement]: https://github.com/basho-bin/bigsets/blob/master/src/bigset_clock.erl#L265 "Complement implementation"
[bs-clock-to-set]: https://github.com/basho-bin/bigsets/blob/master/src/bigset_clock.erl#L489 "Naive clock-to-set"
[bs-set-to-clock]: https://github.com/basho-bin/bigsets/blob/master/src/bigset_clock.erl#L493 "Naive set-to-clock"
[swc-paper]: http://haslab.uminho.pt/tome/files/global_logical_clocks.pdf "Global Logical Clocks"
[swc-repo]: https://github.com/ricardobcl/ServerWideClocks "SWC Repo"
[wiki-bm-index]: https://en.wikipedia.org/wiki/Bitmap_index "Bit Mapped Indexes"
[wiki-bit-array]: https://en.wikipedia.org/wiki/Bit_array "Bit array/Bit set etc"
[lemire-sparse]: http://lemire.me/blog/2012/10/23/when-is-a-bitmap-faster-than-an-integer-list/ "Blog post by Danial Lemire on lists of ints vs. bitmaps"
[sparse-set]: http://blog.presidentbeef.com/blog/2013/09/02/fast-compact-sparse-bitsets/ "Blog post on a sparse set in Ruby"
[carlos-delta]: https://github.com/CBaquero/delta-enabled-crdts "CBaquero's reference implementation of delta CRDTs"
[bigset]: https://github.com/basho-bin/bigsets/blob/master/doc/bigsets-design.md "The original design doc"
[bs-paper]: https://dl.acm.org/citation.cfm?id=2911156 "Some BS paper"
[bs-pres]: https://drive.google.com/a/basho.com/file/d/0B-IsB8-rthy7VThhVVJqYUJRZkk/view?pli=1 "Some BS talk"
