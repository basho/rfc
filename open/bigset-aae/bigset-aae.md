# RFC: Bigset AAE Protocol

### Abstract

The purpose of this RFC is to document, review, and poke holes with how we are
intending to implement [AAE][riak-aae] for the Bigset work *in Riak*.

We need AAE because read-repair is only a best effort mechanism, especially
considering how random it can be [Riak][riak-rr-roll], Plus, Bigsets allows for
partial reads on sets via subset/range queries, meaning that part of
a set may *never* be read.

Additionally, why not treat every element in the set as a separate key
(e.g. associated w/ a set-id) and reuse riak_kv's hashtree
idx-hashtree-procs/manager/exchange-fsm or at least its trees?

Many customers turn off AAE for KV due to varying reasons, including
heightened KV-related latency, increasing disk space, and increasing
memory-consumption/CPU-usage, which all tend to be more blatent when many
repairs start happening or during larger during tree rebuilds.

We *really* want AAE *on* for Bigsets, and when sets get *big*
(e.g. 100 million keys) the cost of many repairs or full rebuilds of all the
keys could become a real bottleneck.

So, the goal is implement a simpler model around detecting divergence, using
the set clock/dot information we have, while sending only what's needed over the
network for repair&mdash;when we need it. Additionally, we want to support KV
and Bigsets in a cluster, and it'd be nice to have separate control over which
AAE(s) are on/off.

### Background

You can learn more about the bigset work by reading RDB's fantastic
[docs][bigset] (*highly recommended*), [paper][bs-paper], or watching
his [presentation][bs-pres]. This RFC only concerns AAE for bigsets, btw.

#### Prior and/or Related Work

##### AAE in Riak

Though we've more recently fixed some issues around our Merkle tree
[implementation][hashtree-erl] wrt restarts and the handling of bucket
iteration and cleanup, the general design is still best expressed in jtuple's
[video][jtuple-aae]. If you want to dig into the implementation itself, check
out the index_hashtree/exchange/entropy_mgr modules in either KV or Yokozuna.

At the core, data-structure wise, is the [Merkle tree][merkle-tree]:

![init hashtree][hashtree-img]

*Inserting into the tree*

![insert into hashtree][insert+dirty-img]

*(Snapshoittng and then) Updating the tree*

![update hashtree][update-hashtree-img]

*Comparing separate trees*

![compare hashtree][compare-hashtree-img]

I won't go into all the details regarding how we build/update/exchange across
trees in KV because this a specific RFC. Nonetheless, some key
[tunables/facets][manage-aae] are...

- insertion/deletion via a key into the tree, associated w/ a riak object hash
in the KV-case
- triggers read-repair for each key missing
- exchanges can *maybe* occur at a scheduled tick (15s by default) and happens
across all partitions...and per-partition.
- throttles based on mailbox-message size
- expires once a week by default
- how many cross-node exchanges and/or builds can happen concurrently
(default is 2)
- AAE detection only happens between **primary** nodes in a preflist

##### ServerWideClocks Anti-Entropy

The *[Server Wide Clocks][swc-paper]* paper mentions that many existing Merkle
tree implementations use an

> expensive mechanism, in both space and time, that requires frequent updates of
> an hash tree and presents a trade-off between hash tree size and risk of false
> positives... and doesn't leverage versioning information

Our decomposed+deltas implementation doesn't operate with causal node clocks
like in the SWC paper, but there's some overlap with our proposal to send clocks
first (more below).

SWC operates w/ a log of keys from the locally coordinated updates, and
then cleans up said-log after keys have been *seen* and subsumed by the
node clock.

##### Scuttlebutt Reconciliation

![scuttle demo][scuttle-demo-img]

If you're not familiar with **Scuttlebutt Reconciliation**, now may be a good
time to take a gander at this neat interactive [scuttlebutt-js
demo][scuttle-demo], using vector clocks.

The *[Efficient Reconciliation and Flow Control for Anti-Entropy
Protocols][flowgossip-paper]* is a classic & fantastic read, though more focused
on anti-entropy and gossip protocols, and I'll talk more specifically about
**flow control** and **scuttle-depth** later.

**Scuttlebutt Reconciliation**, if you squint in some ways, looks a lot like
the *digest* concept I'll explain further in the [Proposal](#proposal), or maybe
our idea looks more like it, and though it doesn't speak of *CRDTs* or
*join semilattices*, it does uses monotonic version numbers and an ordering
constraint for deltas.

Quoting some paper-specifics

> When p and q start gossiping, they first **exchange digests**
> {(r, max(µp(r))) | r ∈ P} and {(r,max(µq(r))) | r ∈ P} resp. 1 On receipt,
> p sends to q ∆p→q scuttle = {(r, k,v,n) | µp(r)(k) = (v,n) ∧ n > max(µq(r))}
> while q sends to p a similar set ∆q→p scuttle.

> A gossiper never transmits updates that were already known at the receiver. If
> gossip messages were unlimited in size, then the sets contains the exact
> differences, just like with precise reconciliation.

The discussion in the paper about deltas with higher ranks plays more to
peer-to-peer systems, focusing on anti-entropy across a large network of nodes;
we usually don't have large *N* values, but we can't say for sure.
So, it's worth a read, but I won't cover it deeply here. Nonetheless, the
paper's discussion on digests, deltas, and ordering to preserve invariance
is inspiring. We'll come back to it below.

##### Sequence of Deltas & Ack Map

One of the papers we looked at as a possible alternate solution to our
version of delta-state-driven anti-entropy is
*[Delta State Replicated Data Types][deltastaterep-paper]*, in which each local
node keeps a contiguous sequence of deltas in a map (ints -> deltas) and a
*ack-map* (acknowledgement-map). The sequence number of deltas is determined
from a counter that is incremented once the delta has been merged with the local
state. When the local node, *i* attempts to exchange with a remote *neighbor*
node, *j*, sending a delta-interval (message), its local *ack-map* gets updated
once the receiving node, *j* has joined that delta into its local state and
sends an *ack* (acknowledge) message back to *i*. *i* knows which deltas to send
to *j* because it can use the counter sequence to determine what j has or has
not received.

The approach described in the paper utilizes garbage collection to clean-up old
deltas in the deltas-map once deltas have been acknowledged by *all* specified
neighbors. Both maps (deltas & ack) sit in memory, as they can be rebuilt after
crashes. Nonetheless, with necessary cleanup and increasing metadata and checks,
this approach probably wouldn't work best in Riak.

### Proposal

##### Not using AAE as we know it today in KV

I covered most of the reasons in the [Abstract](#abstract), and I think our
proposed solution is a nice, compromising approach.

##### Building and Exchanging Digests (+ bs-clock)

###### Let's first talk about BS Handoff

All in all, what we're looking to do, is somewhat akin to
[Bigset-handoff][bigset-handoff]. However, handoff is basically full-state
replication of a set's keys over from a sender to a receiver node.
We're focusing on an implementation that is more like **partial or
delta handoff**.

I recommend reading the handoff portion of the design doc or looking at the
[Bigset-handoff module][bs-handoff-mod], and especially the
[*end_key* tracker code/comments][bs-handoff-endkey]. Without going into full
detail, the in-memory *tracker* gets created per set on the receiver node, *j*,
and we're aware of some *sender*, *i's*, state, which *set name* we're sending,
and that set's *set-clock*.

For each set, we're basically updating a (full-set-state) *digest*, aka
*tracker*, in the receiver of every active dot from the sender
(as we're sending each and every element key over). As the docs mention,

> Per set received the receiver does the following: when it receives a clock key
> it sets the in memory tracker to a fresh clock. When it receives the sender's
> clock key it adds it to a local state sender_clock When it receives an element
> key, it reads the dot for the key into the tracker. When it receives an end
> key it generates a filter from the tracker and stores it, and clears in memory
> state.

> The tracker then is a clock containing all the events sent by the handing off
> vnode. It can be compared to the sender's clock and a set of events that the
> sender has removed can be deduced. We then take that set of "Removed events"
> and find the intersection with the receiver's clock. These are the keys
> that the receiver has seen but must remove (NOTE: the receiver may have
> already removed them.) This intersection of events is added to the
> set-tombstone.

Another key point mentioned is how we calculate the remote's, *j's*, *"Removed
Events"* for each set.

As documented in the code...

```erlang
end_key(Set, Sender, LocalClock, Tombstone, State) ->
    %% end of the set, generate the set tombstone to write, and clear
    %% the state
    #sender_state{clock=SenderClock,
                  tracker=Tracker,
                  set=Set} = get_sender_state(Sender, State),


    %% This section takes care of those keys that Receiver has seen,
    %% but Sender has removed. i.e. keys that are not handed off, but
    %% their absence means something, and we don't want to read the
    %% whole bigset at the Receiver to find that out.

    %% The events in the Sender's clock, not in Tracking Clock, that
    %% is all the dots that were not handed off by Sender, and
    %% therefore Sender saw but has removed
    DelDots = bigset_clock:complement(SenderClock, Tracker),

    %% All the dots that Receiver had seen before hand off, but which
    %% the handing off node has deleted
    ToRemove = bigset_clock:intersection(DelDots, LocalClock),

    TS2 = bigset_clock:merge(ToRemove, Tombstone),
    Clock2 = bigset_clock:merge(SenderClock, LocalClock),

    State2 = remove_sender(Sender, State),
    {Clock2, TS2, State2}.
```

... we get the **[set-complement][set-complement-wiki]** of *i's* set's sender
clock and the active-tracker created, which gives us *i's* set's
*removed events*. From this, we can then remove from *j's* version of set by
getting the **[set-intersection][set-intersection-wiki]** of it's local
set-clock and the complement produced. I'll skip over how the set-tombstone
works for now, but the comments and docs make it pretty apparent.

So, from *handoff*, we know what to remove, but we're also sending the full
state of each set over. For our approach to AAE, we can use something like this
*digest*, but we definitely have to do more. Plus, we don't want to send all
sets and elements over the network; we're talking about anti-entropy right?!

###### Back to (Active) Anti-Entropy

Looking at
*[Join Decompositions for Efficient Synchronization of CRDTs after a Network
Partition][joindecomposition-paper]*, it refers to efficient synchronization
approach using a *Digest Driven* technique, that *eventually* converges
if performed bidirectionally. As it states,

> With the Digest Driven approach we achieve the same results of State Driven
> but by exchanging less information.

For AAE, we should only exchange the elements we need to.

Our proposal wants to keep track of an *active-dot* **digest** per **set name**,
one which we could store on disk (and not in-memory), update as new elements are
added to the set while others are removed, and rebuild at some interval, like we
do with our Riak-key w/ object-based trees now.

Let's run through what the **exchange** flow will look like:

```
Legend
------

i - sender node
j - receiver node
v_i - current set (in exchange) on sender *i*
v_j - current set (in exchange) on receiver *j*
dv_i - digest (from sender)
```

- periodically pick another node from a preflist (nodes to be replicated to)
to compare/*possibly* exchange, per partition/vnode, with&mdash;sender *i*
initiates with in-preflist *j* for each set that is replicated within the
preflist
- detect/check-for divergence per-set **at the time of this periodic check**
  if digest is *built*
- if digests are divergent
    - send *compact* digest for *v_i*, called *dv_i*, over to *j*
      **along with** *v_i's* set-clock from *i*
    - Figure out *v_j's* removes like how we determined those in handoff and
      update *v_j's* **set-tombstone** accordingly (later to be compacted)
    - Figure out delta-set (partial-set) of what *v_j* needs to add/merge
      locally by finding the **set-complement** of what's in *dv_i*, and
      *v_j's* set-clock, giving us what's in the digest that *v_j* hasn't yet
      seen
    - Send a delta-dot/delta-interval to *i* in order to scan over *v_i*,
      pulling out the element-keys we need based on what's missing, sending
      those over in batches to *j* to complete the **repair**
    - Once complete, merge *v_i's* clock with *v_j's*
- else if not divergent, move on to the next node in the preflist

##### Separating Repair Detection from Actual Element Repair

The *flow* I worked through above allows us to first send a *digest*, and
then do dot(s)/clock comparsions, before we ever actually do element exchange
for what we need to repair. I like this for two main reasons:

* We can apply throttling and other forms of backpressure separately when
sending the digest+clock vs when sending over the element-keys
* More optimization opportunities for sending partials on larger sets

##### Store Digests via Merkle Tree - Divergence Detection

Just like with KV AAE, we should store these digests on disk so as to avoid
frequently rebuilding them or stuffing them in memory every time.

Much of the anti-entropy literature depends on a constant, periodic *round*, but
we also do not want to have to send digests around if we don't have to. So, why
not reuse our hashtree/Merkle-tree data structure&mdash;sounds good right?

In Riak, currently, we store a hashtree per *N* (for the primaries), a set of
hashtrees per index-hashtree gen_server process. We'd do the same thing for
our digests, but instead of inserting/updating *Key->Riak object hash*, we'd
store it as *Set Name->Digest hash*. Remember, ***Set Names* are unique**.

Storing them in the Merkle Tree gives us all the properties
[we know about](#aae-in-riak) for detecting divergence. **We'd trigger
checks per-partition, bigsets per-partition/vnode, as there would be
more than one, containing *Set Name*->*Digest hash* pairs**.

##### Throttling

For KV's AAE, we have [throttling for builds][riak-kv-build-throttle] based on a
*max bound byte-size*, where we can determine how much we build per
fold/traverse through objects based on the binary size of each object as we
accumulate through.

We also have throttling during repair-time for KV, inserting delays between
delay operations, depending on how [backed-up a vnode's mailbox
is][riak-kv-query-and-set-throttle]. We do this to handle *slow***er** nodes.

For this RFC's approach, we plan to incorporate both *kinds* of throttles.

Additionally after reading the [Bimodal Multicast][bimodalmc-paper], I was
thinking that we maybe should also apply bytes-per-message (sent over the wire)
throttling as well...

> **Round Retransmission Limit**.
> The maximum amount of data (in bytes) that a process will retransmit in one
> round is also limited. If more data are requested than this, then the process
> stops sending when it reaches this limit. This prevents processes that have
> fallen far behind the group from trying to catch up all at once. Instead,
> the retransmission can be carried out over several rounds with several
> different processes, spreading the overhead in space and time

... especially to help determine element-key-batched updates over the network.

##### When to Trigger Exchanges

For KV, we have a configuration for the **trigger interval**, set to *15s* by
default, which dictates when we look for AAE-related work to do, whether that
refers to building/expiring trees or triggering an exchange between nodes.

To begin *detecting divergence* or, at least, building for it in our
implementation, we'd still need some sort of predefined max-bound for when to do
AAE-related work. However, quick-trigger churn of building/exchanging/repair
can and has caused major issues for our customers. Can we do something better by
implementing some type of **[flow control][flowgossip-paper]**?

From the paper...

> The objective of a flow control mechanism for gossip is to determine,
> adaptively, the maximum rate at which a participant can submit updates
> without creating a backlog of up- dates. A flow control mechanism should be
> fair, and under high load afford each participant that wants to submit updates
> the same update rate. As there is no global oversight, the flow control
> mechanism has to be decentralized, where the desired behavior emerges from
> participants responding to local events.

> Local events that may be monitored are overflows of gossip messages.
> Occasional overflow is not problematic—all our reconciliation protocols can
> deal with this. But if there is a trend in which the overflow becomes
> increasingly worse, then a participant should back off generating updates.

The idea we have here is to update the **trigger interval**'s *timer* within
a max-bound (and maybe use a min-bound to act as the starting trigger time,
initially), especially once we have the digests/tree built by

* tracking the amount of divergence and number repairs in CMD(?) and use the
heuristic to trigger exchanges faster for nodes that tend to keep falling
behind, tracked per-preflist.
* *scuttle-depth*, mentioned in the [Scuttlebutt
section](#scuttlebutt-reconciliation) earlier, actually refers to an ordering
function in the paper, but has this neat characteristic: "*Instead of being fair
to all participants, it prioritizes updates for those who are most left behind.
That is, scuttle-depth prefers deltas of participants for which more deltas are
available over deltas of participants with few available deltas;*" so, can we
also track # of deltas in order to eventually either increase or decrease our
trigger interval, churning more/less in a less-strict approach.

### Open Questions / Issues

##### Resilience

- How do we enact anti-entropy for *silent* failures / *accidental* dataloss
  around losing element-keys on disk or valuable metadata? If some element-key
  goes missing, it's possible that it *going missing* will be treated as a
  remove elsewhere. How do we repair this correctly and rebuild digests
  correctly? Do we store a separate version of the digest outside of the
  hashtree as a checksum and have a form of repair between digest and what's
  *actually* on disk?

- How do we provide invariants for knowing that the stored digest is correct and
  not allowing for the propagation of the *wrong* events?

##### Monitoring AAE

What do we want beyond something like `riak-admin aae-status`?

##### Handling Continuous Updates to Digest

How best to do this in LevelDB?

### References

- [Bigsets Design Document][bigset-handoff]
- [Join Decompositions for Efficient Synchronization of CRDTs after a Network Partition][joindecomposition-paper]
- [Efficient Reconciliation and Flow Control for Anti-Entropy Protocols][flowgossip-paper]
- [Bimodal Multicast][bimodalmc-paper]
- [Delta State Replicated Data Types][deltastaterep-paper]
- [Concise Server-Wide Causality Management for Eventually Consistent Data Stores][swc-paper]

[joindecomposition-paper]: http://haslab.uminho.pt/cbm/files/pmldc-2016-join-decomposition.pdf "Join Decompositions for Efficient Synchronization of CRDTs after a Network Partition"
[deltastaterep-paper]: http://arxiv.org/abs/1603.01529 "Delta State Replicated Data Types"
[flowgossip-paper]: https://www.cs.cornell.edu/home/rvr/papers/flowgossip.pdf "Efficient Reconciliation and Flow Control for Anti-Entropy Protocols"
[bimodalmc-paper]: https://www.cs.cornell.edu/Courses/cs614/2003SP/papers/BHO99.pdf "Bimodal Multicast"
[delta-paper]: https://arxiv.org/abs/1410.2803 "Delta CRDTs"
[swc-paper]: http://haslab.uminho.pt/tome/files/global_logical_clocks.pdf "Concise Server-Wide Causality Management for Eventually Consistent Data Stores"
[jtuple-aae]:  http://share.basho.s3.amazonaws.com/talks/AAE-2014-05-08.m4v "Active Anti-Antropy - Joe Blomstedt"
[bigset]: https://github.com/basho-bin/bigsets/blob/master/doc/bigsets-design.md "The original design doc"
[bigset-handoff]: https://github.com/basho-bin/bigsets/blob/master/doc/bigsets-design.md#6103--hand-off "Bigset Hand Off doc part"
[bs-paper]: https://dl.acm.org/citation.cfm?id=2911156 "Some BS paper"
[bs-pres]: https://drive.google.com/a/basho.com/file/d/0B-IsB8-rthy7VThhVVJqYUJRZkk/view?pli=1 "Some BS talk"
[bs-clock-intersect]: https://github.com/basho-bin/bigsets/blob/master/src/bigset_clock.erl#L246 "Intersection implementation"
[bs-clock-complement]: https://github.com/basho-bin/bigsets/blob/master/src/bigset_clock.erl#L265 "Complement implementation"
[bs-handoff-mod]: https://github.com/basho-bin/bigsets/blob/master/src/bigset_handoff.erl "BS handoff module"
[bs-handoff-endkey]: https://github.com/basho-bin/bigsets/blob/master/src/bigset_handoff.erl#L52 "BS handoff end_key comments/fun"
[hashtree-erl]: https://github.com/basho/riak_core/blob/develop-2.2/src/hashtree.erl "Riak Core hashtree impl"
[riak-aae]: http://docs.basho.com/riak/kv/2.1.4/learn/concepts/active-anti-entropy/ "Riak AAE concept doc"
[manage-aae]: http://docs.basho.com/riak/kv/2.1.4/using/cluster-operations/active-anti-entropy/ "Riak AAE tunables"
[riak-rr-roll]: https://github.com/basho/riak_kv/blob/edce9a29ed31a6877c8a861ceea0fcb6d7d8832a/src/riak_kv_get_fsm.erl#L458 "Riak Read-Repair Dice"
[riak-kv-build-throttle]: https://github.com/basho/riak_kv/blob/edce9a29ed31a6877c8a861ceea0fcb6d7d8832a/src/riak_kv_index_hashtree.erl#L90 "DEFAULT_BUILD_THROTTLE"
[riak-kv-query-and-set-throttle]: https://github.com/basho/riak_kv/blob/edce9a29ed31a6877c8a861ceea0fcb6d7d8832a/src/riak_kv_entropy_manager.erl#L822 "query_and_set_aae_throttle3"
[merkle-tree]: https://en.wikipedia.org/wiki/Merkle_tree "Wiki Merkle tree"
[scuttle-demo]: http://awinterman.github.io/simple-scuttle/ "Scuttle Demo"
[set-complement-wiki]: https://en.wikipedia.org/wiki/Complement_(set_theory) "Complement (set theory)"
[set-intersection-wiki]: https://en.wikipedia.org/wiki/Intersection_(set_theory) "Intersection (set theory)"

[hashtree-img]: images/hashtree.jpg
[insert+dirty-img]: images/insert+dirty.jpg
[update-hashtree-img]: images/update-hashtree.jpg
[compare-hashtree-img]: images/compare-hashtree.jpg
[scuttle-demo-img]: images/scuttle-demo.png
