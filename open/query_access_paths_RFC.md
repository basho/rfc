# Query Access Paths RFC

## Introduction

This RFC address access paths for the query system - it arises from discussions and musings at the Query Team Meetup Ukraine.

## Purpose

To provide an analytical framework for discussion of access paths. The query rewriter is about to start being a real, complex CS thing. Time to go full Wayne Gretzky - skate to where the puck is going to be...

This RFC MUST enable:
* members of the TS team to contribute to discussions, architecture, design and implementation of new query paths
* members of the KV team to contribute to discussions, research, architecture, design and implementation of post-merge query paths
* members of the product team to identify new ways to use existing infrastructure more optimaly and take query options out to customers and prioritise the roadmap

## Scope

The scope of this RFC is split in 3:
* a review of current Riak's query access paths for both KV and Time Series
* an overview of the query access paths on the immediate road map for Time Series
* some speculative future query access paths on the other side of TS/KV merge, BigSets/BigMaps/Afrika...

Current Riak query access paths:
* current KV queries
* current Time Series queries

The current KV queries are all multi-key access paths
* 2i
* list keys
* list buckets
* map reduce

The current TS Queries are:
* SQL SELECTs - multiple quanta-spanning sub-queries
* single key gets

Roadmap overview for TS:
* streaming queries
* coverage plan queries
* queries requiring temporary or snapshot śtables
* full cluster scan (needed for proper GROUP BY)
* 2i index paths for Time Series

Speculative future queries:
* BigSets/BigMaps/Afrika queries
* eventually consistent indexes
* eventually consistent joins
* key-inversion MDC query setups

Capturing statistics about data cardinality etc, to drive heuristic determination of query plans.

**NOTE** Coverage Plans typically 'loop around themselves' covering all keyspaces for all vnodes *except for the last one* to which filters are applied. Where ever this document talks about at-vnode access patterns for query paths that use coverage plans they discuss the *normal case* and elide the special 'last vnode' filtered case for ease of exposition.

## Quality Statement

This document should be comprehensive yet simple enough that:
* the engineering team working on queries can have a common language and reference to discuss access paths at both the vnode and ring level
* that members of the product team can get a feel for the likely performance heuristics of requested SQL features (when those features are expressed as ring access paths)
* CSE/SAs can understand map new proposed query paths onto their support model by making analogies to other pre-existing query mechanisms with similar ring/vnode access paths

## Colophon

All diagrams are drawn with a Mac OS X application called Monodraw (which I always read as Moondraw, lolol).

---

## Background and current Riak query access paths

Lets us first classify the data access patterns for each type of query. These diagrams assume a single read of each bit of data. This is not how riak works - but the diagrams otherwise get very complex. The point is to focus on the data access patterns of each type of access.

There are two aspects to the access pattern:
* getting the point in leveldb where the data resides - and reading either K-V pair or a range of K-V pairs
* accessing a number of such points across the rings

### Simple KV GET/PUT

The leveldb access pattern is:

```
                                                         Vnode 1
                                                               │
                                                   KV and TS   │
                                                          │    │
                                              Bucket 1    │    │
                                                     │    │    │
                                                     │    │    │
                                       Keyspace 1    │    │    │
                                                │    │    │    │
     Request    ═══════════════╗                │    │    │    │
                               ║                │    │    │    │
  ┌────────────────────────┐   ║                │    │    │    │
  │ The request goes to a  │   ║                ▼    │    │    │
  │particular keyspace in a│   ║       Keyspace 2    │    │    │
  │particular bucket in the│   ║                │    │    │    │
  │  KV bit of the chosen  │   ║                │    │    │    │
  │         vnode          │   ╚══════════════▶ │    │    │    │
  └────────────────────────┘                    │    │    │    │
                                                ▼    │    │    │
                                       Keyspace 3    │    │    │
                                                │    │    │    │
                                                │    │    │    │
                                                │    │    │    │
                                                │    │    │    │
                                                ▼    ▼    │    │
                                                          │    │
                                              Bucket 2    │    │
                                                     │    │    │
                                                          │    │
                                                     │    │    │
                                                          │    │
                                                     ▼    │    │
                                                          │    │
                                              Bucket 3    │    │
                                                     │    │    │
                                                          │    │
                                                     │    │    │
                                                          │    │
                                                     ▼    ▼    │
                                                               │
                                                 2i Indices    │
                                                          │    │
                                                               │
                                                          │    │
                                                               │
                                                          ▼    ▼
```

Lets understand this diagram in more detail. Each vnode contains three sorts of data:
* normal KV data and Time Series data - prefix `o`
* 2i index data - prefix `i`

**NOTE** there was a long discussion about prefix TS data with a `c` for composite key - but at decision was taken to just stick with `o`. We are trying to reconstruct the rationale for that and think it might have been that TS and KV were to be seperate products. We need to revist this decision as a matter of urgency in the great merge discussion.

Each of these areas is divided into buckets. 2i indices are only used with KV buckets, so the 2i buckets correspond to the KV buckets for which data has been written with a 2i index.

Each of the buckets is then logically broken into keyspaces.

If there is a KV bucket with an n_val of 4 (and lots of data has been written to that bucket) then there will be 4 keyspaces - because the 2i index space only pertains to KV - there will be up to 4 keyspaces in that as well (provided data is written with secondary indexes).

If there has been a TS bucket created with an n_val of 5 - there will be up to 5 keyspaces in the vnode TS portion.

In this diagram we have only expanded the first bucket of the KV and TS section - and we have collapsed the 2i portions - they will be expanded as appropriately later in the document.

The ring access pattern is:

```
  ┌─────────┐                                                             ┌─────────┐
  │         │                                                             │         │
  │Vnode 14 │          Request    ══╦═════════════╦══════════════╗        │ Vnode 1 │
  │         │       ┌─────────────┐ ║             ║              ║        │         │
  └─────────┘       │Read or write│ ║             ║              ║        └─────────┘
                    │   n_val=3   │ ║             ║              ║
  ┌─────────┐       │   copies    │ ║             ║              ║        ┌─────────┐
  │         │       └─────────────┘ ║             ║              ║        │         │
  │Vnode 13 │                       ║             ║              ║        │ Vnode 2 │
  │         │                       ║             ║              ║        │         │
  └─────────┘                       ║             ║              ║        └─────────┘
                                    ║             ║              ║
  ┌─────────┐                       ║             ║              ║        ┌─────────┐
  │         │                       ║             ║              ║        │         │
  │Vnode 12 │                       ║             ║              ║        │ Vnode 3 │
  │         │                       ║             ║              ║        │         │
  └─────────┘                       ║             ║              ║        └─────────┘
                                    ║             ║              ║
  ┌─────────┐                       ║             ║              ║        ┌─────────┐
  │         │                       ║             ║              ║        │         │
  │Vnode 11 │                       ║             ║              ║        │ Vnode 4 │
  │         │                       ║             ║              ║        │         │
  └─────────┘                       ║             ║              ║        └─────────┘
                                    ▼             ▼              ▼
  ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐
  │         │   │         │    │         │   │         │    │         │   │         │
  │Vnode 10 │   │ Vnode 9 │    │ Vnode 8 │   │ Vnode 7 │    │ Vnode 6 │   │ Vnode 5 │
  │         │   │         │    │         │   │         │    │         │   │         │
  └─────────┘   └─────────┘    └─────────┘   └─────────┘    └─────────┘   └─────────┘
```

Data is written to or read from n_val vnodes - 3 shown. 

### 2i Indices

The write to a 2i index is done as a transaction under levelDB - let us refer to this sort of index as a 'consistent index':

```
                                                         Vnode 1
                                                               │
  ┌────────────────────────┐                      KV and TS    │
  │Atomic write to a key in│                              │    │
  │   the KV space for a   │                 Bucket 1     │    │
  │     bucket and the     │                        │     │    │
  │ corresponding 2i index │                        │     │    │
  │    for that bucket     │         Keyspace 1     │     │    │
  └────────────────────────┘                  │     │     │    │
   PUT Request  ══════════════╗               │     │     │    │
                              ╠═════════════▶ │     │     │    │
                              ║               │     │     │    │
                              ║               ▼     │     │    │
                              ║      Keyspace 2     │     │    │
                              ║               │     │     │    │
                              ║               │     │     │    │
                              ║               │     │     │    │
                              ║               │     │     │    │
                              ║               ▼     │     │    │
                              ║      Keyspace 3     │     │    │
                              ║               │     │     │    │
                              ║               │     │     │    │
                              ║               │     │     │    │
                              ║               │     │     │    │
                              ║               ▼     ▼     │    │
                              ║                           │    │
                              ║              Bucket 2     │    │
                              ║                     │     │    │
                              ║                           │    │
                              ║                     │     │    │
                              ║                           │    │
                              ║                     ▼     │    │
                              ║                           │    │
                              ║              Bucket 3     │    │
                              ║                     │     │    │
                              ║                           │    │
                              ║                     │     │    │
                              ║                           │    │
                              ║                     ▼     ▼    │
                              ║                                │
                              ║                  2i Indices    │
                              ║                           │    │
                              ║               Bucket 1    │    │
                              ║                      │    │    │
                              ║                      │    │    │
                              ║       Keyspace 1     │    │    │
                              ║                │     │    │    │
                              ║                │     │    │    │
                              ║                │     │    │    │
                              ║                │     │    │    │
                              ║                ▼     │    │    │
                              ║       Keyspace 2     │    │    │
                              ║                │     │    │    │
                              ║                │     │    │    │
                              ║                │     │    │    │
                              ╚══════════════▶ │     │    │    │
                                               ▼     │    │    │
                                      Keyspace 3     │    │    │
                                               │     │    │    │
                                               │     │    │    │
                                               │     │    │    │
                                               │     │    │    │
                                               ▼     ▼    │    │
                                                          │    │
                                              Bucket 2    │    │
                                                     │    │    │
                                                          │    │
                                                     │    │    │
                                                          │    │
                                                     ▼    │    │
                                                          │    │
                                              Bucket 3    │    │
                                                     │    │    │
                                                          │    │
                                                     │    │    │
                                                          │    │
                                                     ▼    ▼    ▼
```

The write is done across the n_vals:

```
  ┌─────────┐                                                             ┌─────────┐
  │         │                                                             │         │
  │Vnode 14 │          Request    ══╦═════════════╦══════════════╗        │ Vnode 1 │
  │         │       ┌────────────┐  ║             ║              ║        │         │
  └─────────┘       │   Write    │  ║             ║              ║        └─────────┘
                    │  n_val=3   │  ║             ║              ║
  ┌─────────┐       │   copies   │  ║             ║              ║        ┌─────────┐
  │         │       └────────────┘  ║             ║              ║        │         │
  │Vnode 13 │                       ║             ║              ║        │ Vnode 2 │
  │         │                       ║             ║              ║        │         │
  └─────────┘                       ║             ║              ║        └─────────┘
                                    ║             ║              ║
  ┌─────────┐                       ║             ║              ║        ┌─────────┐
  │         │                       ║             ║              ║        │         │
  │Vnode 12 │                       ║             ║              ║        │ Vnode 3 │
  │         │                       ║             ║              ║        │         │
  └─────────┘                       ║             ║              ║        └─────────┘
                                    ║             ║              ║
  ┌─────────┐                       ║             ║              ║        ┌─────────┐
  │         │                       ║             ║              ║        │         │
  │Vnode 11 │                       ║             ║              ║        │ Vnode 4 │
  │         │                       ║             ║              ║        │         │
  └─────────┘                       ║             ║              ║        └─────────┘
                                    ▼             ▼              ▼
  ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐
  │         │   │         │    │         │   │         │    │         │   │         │
  │Vnode 10 │   │ Vnode 9 │    │ Vnode 8 │   │ Vnode 7 │    │ Vnode 6 │   │ Vnode 5 │
  │         │   │         │    │         │   │         │    │         │   │         │
  └─────────┘   └─────────┘    └─────────┘   └─────────┘    └─────────┘   └─────────┘
```

Now let us look at an index GET:

```
                                                         Vnode 1
                                                               │
                                                   KV and TS   │
                                                          │    │
                                                               │
                                                          │    │
                                                               │
                                                          ▼    │
                                                 2i Indices    │
   Read Request ═════════════╗                            │    │
                             ║                Bucket 1    │    │
  ┌────────────────────────┐ ║                       │    │    │
  │ The request goes to a  │ ║        Keyspace 1     │    │    │
  │    particular index    │ ║                 │     │    │    │
  │    pertaining to a     │ ║                 │     │    │    │
  │ particular bucket in a │ ║                 │     │    │    │
  │ particular keyspace on │ ║                 │     │    │    │
  │    the chosen vnode    │ ║                 ▼     │    │    │
  └────────────────────────┘ ║        Keyspace 2     │    │    │
                             ║                 │     │    │    │
                             ║                 │     │    │    │
                             ╚════════════▶    │     │    │    │
                                               │     │    │    │
                                               ▼     │    │    │
                                      Keyspace 3     │    │    │
                                               │     │    │    │
                                               │     │    │    │
                                               │     │    │    │
                                               │     │    │    │
                                               ▼     ▼    │    │
                                                          │    │
                                              Bucket 2    │    │
                                                     │    │    │
                                                          │    │
                                                     │    │    │
                                                          │    │
                                                     ▼    │    │
                                                          │    │
                                              Bucket 3    │    │
                                                     │    │    │
                                                          │    │
                                                     │    │    │
                                                          │    │
                                                     ▼    ▼    ▼
```

In order to reconstruct a key list of all entries that are in the index - every keyspace must be consulted - via a coverage plan. This is because the 2i index is written local to the key on the same vnode/keyspace.

However the read is done with r = 1 - meaning that if the ring is in handoff you will not get consistent results:

```

  ┌─────────┐      ┌──────────────────┐                                   ┌─────────┐
  │         │      │ Read 1 copy - if │                                   │         │
  │Vnode 12 │      │  the ring is in  │               ╔══════════════════▶│ Vnode 1 │
  │         │      │ handoff may not  │               ║                   │         │
  └─────────┘      │ get complete set │               ║                   └─────────┘
                   └──────────────────┘               ║
  ┌─────────┐                                         ║                   ┌─────────┐
  │         │    ╔════   Request    ══════════════════╣                   │         │
  │ Vnode11 │    ║                                    ║                   │ Vnode 2 │
  │         │    ║           ║                        ║                   │         │
  └─────────┘    ║           ║                        ║                   └─────────┘
                 ║           ║                        ║
  ┌─────────┐    ║           ║                        ║                   ┌─────────┐
  │         │    ║           ║                        ║                   │         │
  │Vnode 10 │◀═══╝           ║                        ║                   │ Vnode 3 │
  │         │                ║                        ║                   │         │
  └─────────┘                ╚═════╗                  ║                   └─────────┘
                                   ║                  ║
  ┌─────────┐                      ║                  ║                   ┌─────────┐
  │         │                      ║                  ║                   │         │
  │ Vnode 9 │                      ║                  ╚══════════════════▶│ Vnode 4 │
  │         │                      ║                                      │         │
  └─────────┘                      ║                                      └─────────┘
                                   ▼
                ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐
                │         │   │         │    │         │   │         │
                │ Vnode 8 │   │ Vnode 7 │    │ Vnode 6 │   │ Vnode 5 │
                │         │   │         │    │         │   │         │
                └─────────┘   └─────────┘    └─────────┘   └─────────┘
```

### List keys

List keys comes in 2 versions - one which lists keys for KV and one for TS - only the KV version is show here - the TS one simply traverses a the bucket space in TS not KV.

```
                                                         Vnode 1
                                                               │
                                                  KV and TS    │
                                                          │    │
                                              Bucket 1    │    │
                                                     │    │    │
                                       Keyspace 1    │    │    │
                                                │    │    │    │
                         ╔════════║             │    │    │    │
     Request    ═════════╝        ║             │    │    │    │
                                  ║             │    │    │    │
  ┌────────────────────────┐      ║             ▼    │    │    │
  │ The request goes to a  │      ║    Keyspace 2    │    │    │
  │particular bucket (in KV│      ║             │    │    │    │
  │or TS as appropriate) on│      ║             │    │    │    │
  │  the chosen vnode and  │      ║             │    │    │    │
  │ then executes a range  │      ║             │    │    │    │
  │ scan across keyspaces  │      ║             ▼    │    │    │
  └────────────────────────┘      ║    Keyspace 3    │    │    │
                                  ║             │    │    │    │
                                  ║             │    │    │    │
                                  ║             │    │    │    │
                                  ║             │    │    │    │
                                  ║             ▼    ▼    │    │
                                  ▼                       │    │
                                              Bucket 2    │    │
                                                     │    │    │
                                                          │    │
                                                     │    │    │
                                                          │    │
                                                     ▼    │    │
                                                          │    │
                                              Bucket 3    │    │
                                                     │    │    │
                                                          │    │
                                                     │    │    │
                                                          │    │
                                                     ▼    ▼    │
                                                               │
                                                 2i Indices    │
                                                          │    │
                                                               │
                                                          │    │
                                                               │
                                                          ▼    ▼
```

The read is a read of 1 only - so there will be gaps if the ring is in handoff - but it goes to a coverage plan:

```

  ┌─────────┐       ┌──────────────────┐                                  ┌─────────┐
  │         │       │Coverage plan hits│                                  │         │
  │Vnode 14 │       │ about 1/3 vnodes │             ╔═══════════════════▶│ Vnode 1 │
  │         │       │  for n_val of 3  │             ║                    │         │
  └─────────┘       └──────────────────┘             ║                    └─────────┘
                                                     ║
  ┌─────────┐   ╔═══   Request    ═══════════════════╣                    ┌─────────┐
  │         │   ║                                    ║                    │         │
  │Vnode 13 │◀══╣          ║                         ║                    │ Vnode 2 │
  │         │   ║          ║                         ║                    │         │
  └─────────┘   ║          ║                         ║                    └─────────┘
                ║          ║                         ║
  ┌─────────┐   ║          ║                         ║                    ┌─────────┐
  │         │   ║          ║                         ║                    │         │
  │Vnode 12 │   ║          ║                         ║                    │ Vnode 3 │
  │         │   ║          ║                         ║                    │         │
  └─────────┘   ║          ║                         ║                    └─────────┘
                ║          ╚══════════════════════╗  ║
  ┌─────────┐   ║                                 ║  ║                    ┌─────────┐
  │         │   ║                                 ║  ║                    │         │
  │Vnode 11 │   ║                                 ║  ╚═══════════════════▶│ Vnode 4 │
  │         │   ║                                 ║                       │         │
  └─────────┘   ║                                 ║                       └─────────┘
                ║                                 ║
  ┌─────────┐   ║                                 ║                       ┌─────────┐
  │         │   ║                                 ║                       │         │
  │Vnode 10 │ ◀═╝                                 ║                       │ Vnode 5 │
  │         │                                     ▼                       │         │
  └─────────┘   ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    └─────────┘
                │         │   │         │    │         │   │         │
                │ Vnode 9 │   │ Vnode 8 │    │ Vnode 7 │   │ Vnode 6 │
                │         │   │         │    │         │   │         │
                └─────────┘   └─────────┘    └─────────┘   └─────────┘
```

**NOTE**: because of the coverage plan and bucket scan - this query is not approved for production because it will kill the cluster.

### List Buckets

List buckets is even more intrusive than list keys:

```
                                                         Vnode 1
                                                               │
                                                  KV and TS    │
                                                          │    │
                                              Bucket 1    │    │
                                                     │    │    │
                                       Keyspace 1    │    │    │
                                                │    │    │    │
                         ╔════════╦             │    │    │    │
     Request    ═════════╝        ║             │    │    │    │
                                  ║             │    │    │    │
  ┌────────────────────────┐      ║             ▼    │    │    │
  │The request goes to the │      ║    Keyspace 2    │    │    │
  │ start of the KV and TS │      ║             │    │    │    │
  │ space, scans down all  │      ║             │    │    │    │
  │the entries for all the │      ║             │    │    │    │
  │        buckets         │      ║             │    │    │    │
  └────────────────────────┘      ║             ▼    │    │    │
                                  ║    Keyspace 3    │    │    │
                                  ║             │    │    │    │
                                  ║             │    │    │    │
                                  ║             │    │    │    │
                                  ║             │    │    │    │
                                  ║             ▼    ▼    │    │
                                  ║                       │    │
                                  ║           Bucket 2    │    │
                                  ║                  │    │    │
                                  ║                       │    │
                                  ║                  │    │    │
                                  ║                       │    │
                                  ║                  ▼    │    │
                                  ║                       │    │
                                  ║           Bucket 3    │    │
                                  ║                  │    │    │
                                  ║                       │    │
                                  ║                  │    │    │
                                  ║                       │    │
                                  ▼                  ▼    ▼    │
                                                               │
                                                 2i Indices    │
                                                          │    │
                                                               │
                                                          │    │
                                                               │
                                                          ▼    ▼
```

List buckets uses a coverage plan of some sort - not sure how it can do that effectively - perhaps it assumes a default n_val of 3, or perhaps it just has an 'all vnodes' coverage plan (it hardly seems worth while to spend a lot of time spelunking it because it is **sooooo** not production):

```
  ┌─────────┐       ┌──────────────────┐                                  ┌─────────┐
  │         │       │Coverage plan hits│                                  │         │
  │Vnode 12 │◀══╗   │    all vnodes    │             ╔═══════════════════▶│ Vnode 1 │
  │         │   ║   │    (mebbies?)    │             ║                    │         │
  └─────────┘   ║   └──────────────────┘             ║                    └─────────┘
                ║                                    ║
  ┌─────────┐   ╠═══   Request    ═══════════════════╣                    ┌─────────┐
  │         │   ║                                    ║                    │         │
  │Vnode 11 │◀══╣          ║                         ╠═══════════════════▶│ Vnode 2 │
  │         │   ║          ║                         ║                    │         │
  └─────────┘   ║          ║                         ║                    └─────────┘
                ║          ║                         ║
  ┌─────────┐   ║          ║                         ║                    ┌─────────┐
  │         │   ║          ║                         ║                    │         │
  │Vnode 10 │◀══╣          ║                         ╠═══════════════════▶│ Vnode 3 │
  │         │   ║    ╔═════╩════════╦═════════════╦══╬═══════════╗        │         │
  └─────────┘   ║    ║              ║             ║  ║           ║        └─────────┘
                ║    ║              ║             ║  ║           ║
  ┌─────────┐   ║    ║              ║             ║  ║           ║        ┌─────────┐
  │         │   ║    ║              ║             ║  ║           ║        │         │
  │ Vnode 9 │◀══╝    ║              ║             ║  ╚═══════════╬═══════▶│ Vnode 4 │
  │         │        ║              ║             ║              ║        │         │
  └─────────┘        ║              ║             ║              ║        └─────────┘
                     ▼              ▼             ▼              ▼
                ┌─────────┐    ┌─────────┐   ┌─────────┐    ┌─────────┐
                │         │    │         │   │         │    │         │
                │ Vnode 8 │    │ Vnode 7 │   │ Vnode 6 │    │ Vnode 5 │
                │         │    │         │   │         │    │         │
                └─────────┘    └─────────┘   └─────────┘    └─────────┘
```

### Map Reduce

Map Reduce is a complex beast with 3 distinct modes at the vnode and 2 at that the ring.

### Per Key Map Reduce

In this mode each vnode is supplied a set of keys and the map reduce job retrieves and processes them as a set.

```
                                                         Vnode 1
                                                               │
                                                  KV and TS    │
                                                          │    │
                                              Bucket 1    │    │
                                                          │    │
                                       Keyspace 1    │    │    │
                                                │    │    │    │
                                                │    │    │    │
     Request    ═══════════════╗                │    │    │    │
                               ╠══════════════▶ │    │    │    │
  ┌────────────────────────┐   ║                ▼    │    │    │
  │  A set of keys spread  │   ║       Keyspace 2    │    │    │
  │ across key spaces in a │   ║                │    │    │    │
  │  particular bucket is  │   ║                │    │    │    │
  │  passed to the vnode   │   ║                │    │    │    │
  └────────────────────────┘   ╠══════════════▶ │    │    │    │
                               ║                ▼    │    │    │
                               ║       Keyspace 3    │    │    │
                               ║                │    │    │    │
                               ║                │    │    │    │
                               ║                │    │    │    │
                               ╚══════════════▶ │    │    │    │
                                                ▼    ▼    │    │
                                                          │    │
                                              Bucket 2    │    │
                                                          │    │
                                                     │    │    │
                                                          │    │
                                                     │    │    │
                                                          │    │
                                                     ▼    │    │
                                                          │    │
                                              Bucket 3    │    │
                                                     │    │    │
                                                          │    │
                                                     │    │    │
                                                          │    │
                                                          ▼    │
                                                 2i Indices    │
                                                          │    │
                                                               │
                                                          │    │
                                                               │
                                                          ▼    ▼
``` 


At the ring the access path is 'bundled up' from the keys in a sorta coverage plan:

```
  ┌─────────┐       ┌──────────────────┐                                  ┌─────────┐
  │         │       │Coverage plan hits│                                  │         │
  │Vnode 12 │◀══╗   │ all vnodes that  │             ╔═══════════════════▶│ Vnode 1 │
  │         │   ║   │cover list of keys│             ║                    │         │
  └─────────┘   ║   └──────────────────┘             ║                    └─────────┘
                ║                                    ║
  ┌─────────┐   ╠═══   Request    ═══════════════════╣                    ┌─────────┐
  │         │   ║                                    ║                    │         │
  │Vnode 11 │   ║          ║                         ║                    │ Vnode 2 │
  │         │   ║          ║                         ║                    │         │
  └─────────┘   ║          ║                         ║                    └─────────┘
                ║          ║                         ║
  ┌─────────┐   ║          ║                         ║                    ┌─────────┐
  │         │   ║          ║                         ║                    │         │
  │Vnode 10 │◀══╣          ║                         ╠═══════════════════▶│ Vnode 3 │
  │         │   ║    ╔═════╩══════════════════════╗  ║                    │         │
  └─────────┘   ║    ║                            ║  ║                    └─────────┘
                ║    ║                            ║  ║
  ┌─────────┐   ║    ║                            ║  ║                    ┌─────────┐
  │         │   ║    ║                            ║  ║                    │         │
  │ Vnode 9 │◀══╝    ║                            ║  ╚═══════════════════▶│ Vnode 4 │
  │         │        ║                            ║                       │         │
  └─────────┘        ║                            ║                       └─────────┘
                     ▼                            ▼
                ┌─────────┐    ┌─────────┐   ┌─────────┐    ┌─────────┐
                │         │    │         │   │         │    │         │
                │ Vnode 8 │    │ Vnode 7 │   │ Vnode 6 │    │ Vnode 5 │
                │         │    │         │   │         │    │         │
                └─────────┘    └─────────┘   └─────────┘    └─────────┘
```

### Per Bucket Map Reduce

Per bucket map reduce scans all the keys in a particular bucket and operates on all records in them:

```
                                                         Vnode 1
                                                               │
                                                  KV and TS    │
                                                          │    │
                                              Bucket 1    │    │
                                                     │    │    │
                                       Keyspace 1    │    │    │
                         ╔═════════║            │    │    │    │
                         ║         ║            │    │    │    │
     Request    ═════════╝         ║            │    │    │    │
                                   ║            │    │    │    │
  ┌────────────────────────┐       ║            ▼    │    │    │
  │All the keys in all the │       ║   Keyspace 2    │    │    │
  │    keyspaces for a     │       ║            │    │    │    │
  │particular KV bucket are│       ║            │    │    │    │
  │        scanned         │       ║            │    │    │    │
  └────────────────────────┘       ║            │    │    │    │
                                   ║            ▼    │    │    │
                                   ║   Keyspace 3    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ▼            ▼    ▼    │    │
                                                          │    │
                                              Bucket 2    │    │
                                                     │    │    │
                                                          │    │
                                                     │    │    │
                                                          │    │
                                                     ▼    │    │
                                                          │    │
                                              Bucket 3    │    │
                                                     │    │    │
                                                          │    │
                                                     │    │    │
                                                          │    │
                                                     ▼    ▼    │
                                                               │
                                                 2i Indices    │
                                                          │    │
                                                               │
                                                          │    │
                                                               │
                                                          ▼    ▼
```

The behaviour of the query at the ring is a coverage plan as per list keys. The coverage plan is created with an R = 1 so data will be missed if the ring is in handoff. This is to reduce load.

```

  ┌─────────┐       ┌──────────────────┐                                  ┌─────────┐
  │         │       │Coverage plan hits│                                  │         │
  │Vnode 14 │       │ about 1/3 vnodes │             ╔═══════════════════▶│ Vnode 1 │
  │         │       │  for n_val of 3  │             ║                    │         │
  └─────────┘       └──────────────────┘             ║                    └─────────┘
                                                     ║
  ┌─────────┐   ╔═══   Request    ═══════════════════╣                    ┌─────────┐
  │         │   ║                                    ║                    │         │
  │Vnode 13 │◀══╣          ║                         ║                    │ Vnode 2 │
  │         │   ║          ║                         ║                    │         │
  └─────────┘   ║          ║                         ║                    └─────────┘
                ║          ║                         ║
  ┌─────────┐   ║          ║                         ║                    ┌─────────┐
  │         │   ║          ║                         ║                    │         │
  │Vnode 12 │   ║          ║                         ║                    │ Vnode 3 │
  │         │   ║          ║                         ║                    │         │
  └─────────┘   ║          ║                         ║                    └─────────┘
                ║          ╚══════════════════════╗  ║
  ┌─────────┐   ║                                 ║  ║                    ┌─────────┐
  │         │   ║                                 ║  ║                    │         │
  │Vnode 11 │   ║                                 ║  ╚═══════════════════▶│ Vnode 4 │
  │         │   ║                                 ║                       │         │
  └─────────┘   ║                                 ║                       └─────────┘
                ║                                 ║
  ┌─────────┐   ║                                 ║                       ┌─────────┐
  │         │   ║                                 ║                       │         │
  │Vnode 10 │ ◀═╝                                 ║                       │ Vnode 5 │
  │         │                                     ▼                       │         │
  └─────────┘   ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    └─────────┘
                │         │   │         │    │         │   │         │
                │ Vnode 9 │   │ Vnode 8 │    │ Vnode 7 │   │ Vnode 6 │
                │         │   │         │    │         │   │         │
                └─────────┘   └─────────┘    └─────────┘   └─────────┘
```

**NOTE** that is type of query is no encouraged for use with KV - and if it must be used it is recommended that the jobs only run on non-production clusters - that is there is one cluster for normal KV ops and a second cluster for map reduce.

### All-Buckets Map Reduce

The all-buckets map reduce runs over all the buckets in the KV space of the vnode:

```
                                                         Vnode 1
                                                               │
                                                  KV and TS    │
                                                          │    │
                                              Bucket 1    │    │
                                                     │    │    │
                                   ║   Keyspace 1    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
     Request    ═══════════════════║            │    │    │    │
                                   ║            │    │    │    │
  ┌────────────────────────┐       ║            ▼    │    │    │
  │All the keys in all the │       ║   Keyspace 2    │    │    │
  │  keyspaces for all KV  │       ║            │    │    │    │
  │  buckets are scanned   │       ║            │    │    │    │
  └────────────────────────┘       ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            ▼    │    │    │
                                   ║   Keyspace 3    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            ▼    ▼    │    │
                                   ║                      │    │
                                   ║          Bucket 2    │    │
                                   ║                 │    │    │
                                   ║   Keyspace 1    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            ▼    │    │    │
                                   ║   Keyspace 2    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            ▼    │    │    │
                                   ║   Keyspace 3    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            │    │    │    │
                                   ║            ▼    ▼    │    │
                                   ║                      │    │
                                   ║          Bucket 3    │    │
                                   ║                 │    │    │
                                   ║                      │    │
                                   ║                 │    │    │
                                   ║                      │    │
                                   ▼                 ▼    ▼    │
                                                               │
                                                 2i Indices    │
                                                          │    │
                                                               │
                                                          │    │
                                                               │
                                                          ▼    ▼
```

The coverage plan is like the per-bucket one with the same caveats. All-buckets map reduce is not recommended for production (ever more strongly not recommended than per-bucket)

---

## Time Series SQL SELECT Queries

There is only one query path implemented in time series - the multi-quanta sub-query where the WHERE clause fully covers the primary key.

TS's principle innovation is that related data is co-located - so that data with times that fall into the same quanta is written to the same vnode. The vnode access path therefore contains another layer of nesting:

```
                                                                    Vnode 1
                                                                          │
     Request    ════════════════╗                            KV and TS    │
                                ║                                    │    │
  ┌────────────────────────┐    ║                        Bucket 1    │    │
  │ The request goes to a  │    ║                               │    │    │
  │particular quantum in a │    ║                Keyspace 1     │    │    │
  │particular keyspace in a│    ║                         │     │    │    │
  │particular bucket in the│    ║           Quantum 1     │     │    │    │
  │  TS bit of the chosen  │    ╚═══════════════║   │     │     │    │    │
  └────────────────────────┘                    ║   │     │     │    │    │
                                                ║   │     │     │    │    │
                                                ║   │     │     │    │    │
                                                ▼   ▼     │     │    │    │
                                                          │     │    │    │
                                            Quantum 2     │     │    │    │
                                                    │     │     │    │    │
                                                    │     │     │    │    │
                                                    │     │     │    │    │
                                                    │     │     │    │    │
                                                    ▼     │     │    │    │
                                                          │     │    │    │
                                            Quantum 3     │     │    │    │
                                                    │     │     │    │    │
                                                    │     │     │    │    │
                                                    │     │     │    │    │
                                                    │     │     │    │    │
                                                    ▼     ▼     │    │    │
                                                                │    │    │
                                                 Keyspace 2     │    │    │
                                                          │     │    │    │
                                                                │    │    │
                                                          │     │    │    │
                                                                │    │    │
                                                          ▼     │    │    │
                                                 Keyspace 3     │    │    │
                                                          │     │    │    │
                                                                │    │    │
                                                          │     │    │    │
                                                                │    │    │
                                                          ▼     ▼    │    │
                                                                     │    │
                                                         Bucket 2    │    │
                                                                │    │    │
                                                                     │    │
                                                                │    │    │
                                                                     │    │
                                                                ▼    │    │
                                                                     │    │
                                                         Bucket 3    │    │
                                                                │    │    │
                                                                     │    │
                                                                │    │    │
                                                                     │    │
                                                                ▼    ▼    │
                                                                          │
                                                            2i Indices    │
                                                                          │
                                                                     │    │
                                                                          │
                                                                     │    │
                                                                          │
                                                                     ▼    ▼
```
 
 A TS Query is converted into a set of sub-queries - up to the max_quanta setting and these are simultaneously executed on n_val vnodes. The default settings are max_quanta = 5 and n_val = 3 so up to 15 ranges scans will be executing simultaneously. These may be distributed around the physical cluster unevenly. The diagram shows 2 sub-queries and n_val of 3.

 ```

  ┌─────────┐       ┌──────────────────────┐                              ┌─────────┐
  │         │       │  Coverage plan hits  │                              │         │
  │Vnode 14 │       │  no_quanta * n_val   │         ╔═════Quanta 1══════▶│ Vnode 1 │
  │         │       │For 2 quanta query as │         ║                    │         │
  └─────────┘       │    shown 6 vnodes    │         ║                    └─────────┘
                    └──────────────────────┘         ║
  ┌─────────┐          Request    ═══════════════════╣                    ┌─────────┐
  │         │                                        ║                    │         │
  │Vnode 13 │              ║                         ╠═════Quanta 1══════▶│ Vnode 2 │
  │         │              ║                         ║                    │         │
  └─────────┘              ║                         ║                    └─────────┘
                           ║                         ║
  ┌─────────┐              ║                         ║                    ┌─────────┐
  │         │              ║                         ║                    │         │
  │Vnode 12 │              ║                         ╚═════Quanta 1══════▶│ Vnode 3 │
  │         │              ║                                              │         │
  └─────────┘              ║                                              └─────────┘
                     ╔═════╩═══════╦══════════════╗
  ┌─────────┐        ║             ║              ║                       ┌─────────┐
  │         │        ║             ║              ║                       │         │
  │Vnode 11 │        ║             ║              ║                       │ Vnode 4 │
  │         │    Quanta 2      Quanta 2       Quanta 2                    │         │
  └─────────┘        ║             ║              ║                       └─────────┘
                     ║             ║              ║
  ┌─────────┐        ║             ║              ║                       ┌─────────┐
  │         │        ║             ║              ║                       │         │
  │Vnode 10 │        ║             ║              ║                       │ Vnode 5 │
  │         │        ▼             ▼              ▼                       │         │
  └─────────┘   ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    └─────────┘
                │         │   │         │    │         │   │         │
                │ Vnode 9 │   │ Vnode 8 │    │ Vnode 7 │   │ Vnode 6 │
                │         │   │         │    │         │   │         │
                └─────────┘   └─────────┘    └─────────┘   └─────────┘

 ```

There are ways to trade-off these approaches - make the Quanta longer - more data in each range scan - for less quanta, or increase the max quanta size and create more requests flying around the ring.

Overload protection is very primitive - the defaults are that each node on the cluster will run 3 simultaneous queries, with a max quanta of 5 and an n_val of 3 - so on a five node cluster there might be 75 simultaneous leveldb range scans happening.

---

## TS Roadmap overview

This section describes work that is on the roadmap. The purpose of this RFC really is to look at the performance implications of going down various of these options **in light of our operation experience with existing query options***.

### Future TS Streaming Queries

Streaming queries have the same on-vnode characteristics as existing queries, how they differ is that the sub-queries are executed sequentially and not simultaneously.

```

  ┌─────────┐                                                             ┌─────────┐
  │         │                                                             │         │
  │Vnode 14 │      ┌───────────────┐                 ╔═════Quanta 1══════▶│ Vnode 1 │
  │         │      │ First set of  │                 ║                    │         │
  └─────────┘      │sub-queries run│                 ║                    └─────────┘
                   └───────────────┘                 ║
  ┌─────────┐          Request    ═══════════════════╣                    ┌─────────┐
  │         │                                        ║                    │         │
  │Vnode 13 │                                        ╠═════Quanta 1══════▶│ Vnode 2 │
  │         │                                        ║                    │         │
  └─────────┘                                        ║                    └─────────┘
                                                     ║
  ┌─────────┐                                        ║                    ┌─────────┐
  │         │                                        ║                    │         │
  │Vnode 12 │                                        ╚═════Quanta 1══════▶│ Vnode 3 │
  │         │                                                             │         │
  └─────────┘                                                             └─────────┘

  ┌─────────┐                                                             ┌─────────┐
  │         │                                                             │         │
  │Vnode 11 │                                                             │ Vnode 4 │
  │         │                                                             │         │
  └─────────┘                                                             └─────────┘

  ┌─────────┐                                                             ┌─────────┐
  │         │                                                             │         │
  │Vnode 10 │                                                             │ Vnode 5 │
  │         │                                                             │         │
  └─────────┘   ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    └─────────┘
                │         │   │         │    │         │   │         │
                │ Vnode 9 │   │ Vnode 8 │    │ Vnode 7 │   │ Vnode 6 │
                │         │   │         │    │         │   │         │
                └─────────┘   └─────────┘    └─────────┘   └─────────┘

                                      ...
                         after the first set finishes
                                      ...
  ┌─────────┐                                                             ┌─────────┐
  │         │                                                             │         │
  │Vnode 14 │       ┌───────────────┐                                     │ Vnode 1 │
  │         │       │ Second set of │                                     │         │
  └─────────┘       │sub-queries run│                                     └─────────┘
                    └───────────────┘
  ┌─────────┐          Request                                            ┌─────────┐
  │         │                                                             │         │
  │Vnode 13 │              ║                                              │ Vnode 2 │
  │         │              ║                                              │         │
  └─────────┘              ║                                              └─────────┘
                           ║
  ┌─────────┐              ║                                              ┌─────────┐
  │         │              ║                                              │         │
  │Vnode 12 │              ║                                              │ Vnode 3 │
  │         │              ║                                              │         │
  └─────────┘              ║                                              └─────────┘
                     ╔═════╩═══════╦══════════════╗
  ┌─────────┐        ║             ║              ║                       ┌─────────┐
  │         │        ║             ║              ║                       │         │
  │Vnode 11 │        ║             ║              ║                       │ Vnode 4 │
  │         │    Quanta 2      Quanta 2       Quanta 2                    │         │
  └─────────┘        ║             ║              ║                       └─────────┘
                     ║             ║              ║
  ┌─────────┐        ║             ║              ║                       ┌─────────┐
  │         │        ║             ║              ║                       │         │
  │Vnode 10 │        ║             ║              ║                       │ Vnode 5 │
  │         │        ▼             ▼              ▼                       │         │
  └─────────┘   ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    └─────────┘
                │         │   │         │    │         │   │         │
                │ Vnode 9 │   │ Vnode 8 │    │ Vnode 7 │   │ Vnode 6 │
                │         │   │         │    │         │   │         │
                └─────────┘   └─────────┘    └─────────┘   └─────────┘
```

These queries can be safely executed with indefinite size. If the query has no order processing then the results can be streamed back in natural order - including with ASCENDING or DESCENDING keys as appropriate. If there is some other other processing the results will be spilled to disk at the coordinator and a new sorted result set can be streamed to the client after query finalisation has occurred.

### Future TS Coverage Plan Queries

Coverage plan queries would bundle up the visits to a particular vnode with a coverage plan and be executed sequentially like streaming queries - they would reduce the number of discrete queries - but violate the normal key order of results return:

```
                                                                    Vnode 1
                                                                          │
     Request    ═══════════════╦╗                            KV and TS    │
                               ║║                                    │    │
  ┌────────────────────────┐   ║║                        Bucket 1    │    │
  │A list of quantums to be│   ║║                               │    │    │
  │scanned for a particular│   ║║                Keyspace 1     │    │    │
  │ bucket is passed to a  │   ║║                         │     │    │    │
  │vnode - they may be from│   ║║           Quantum 1     │     │    │    │
  │     many keyspaces     │   ║╚═══════════════║   │     │     │    │    │
  └────────────────────────┘   ║                ║   │     │     │    │    │
                               ║                ║   │     │     │    │    │
                               ║                ║   │     │     │    │    │
                               ║                ▼   ▼     │     │    │    │
                               ║                          │     │    │    │
                               ║            Quantum 2     │     │    │    │
                               ║                    │     │     │    │    │
                               ║                    │     │     │    │    │
                               ║                    │     │     │    │    │
                               ║                    │     │     │    │    │
                               ║                    ▼     │     │    │    │
                               ║                          │     │    │    │
                               ║            Quantum 3     │     │    │    │
                               ║                    │     │     │    │    │
                               ║                    │     │     │    │    │
                               ║                    │     │     │    │    │
                               ║                    │     │     │    │    │
                               ║                    ▼     ▼     │    │    │
                               ║                                │    │    │
                               ║                 Keyspace 2     │    │    │
                               ║                                │    │    │
                               ║            Quantum 4     │     │    │    │
                               ║                    │     │     │    │    │
                               ║                    │     │     │    │    │
                               ║                    │     │     │    │    │
                               ║                    │     │     │    │    │
                               ║                    ▼     │     │    │    │
                               ║                          │     │    │    │
                               ║            Quantum 5     │     │    │    │
                               ╠═══════════════║    │     │     │    │    │
                               ║               ║    │     │     │    │    │
                               ║               ║    │     │     │    │    │
                               ║               ║    │     │     │    │    │
                               ║               ▼    ▼     │     │    │    │
                               ║                          │     │    │    │
                               ║            Quantum 6     │     │    │    │
                               ╚═══════════════║    │     │     │    │    │
                                               ║    │     │     │    │    │
                                               ║    │     │     │    │    │
                                               ║    │     │     │    │    │
                                               ▼    ▼     ▼     │    │    │
                                                                │    │    │
                                                 Keyspace 3     │    │    │
                                                          │     │    │    │
                                                                │    │    │
                                                          │     │    │    │
                                                                │    │    │
                                                          ▼     ▼    │    │
                                                                     │    │
                                                         Bucket 2    │    │
                                                                │    │    │
                                                                     │    │
                                                                │    │    │
                                                                     │    │
                                                                ▼    │    │
                                                                     │    │
                                                         Bucket 3    │    │
                                                                │    │    │
                                                                     │    │
                                                                │    │    │
                                                                     │    │
                                                                ▼    ▼    │
                                                                          │
                                                            2i Indices    │
                                                                          │
                                                                     │    │
                                                                          │
                                                                     │    │
                                                                          │
                                                                     ▼    ▼
```

The query plan that is created depends on how many quanta the query spans - but it tends asymptotically to a full coverage plan as the number of quanta spanned increases:

```

  ┌─────────┐   ┌────────────────────────────────┐                        ┌─────────┐
  │         │   │      Coverage plan tends       │                        │         │
  │Vnode 14 │   │  asymptotically to about 1/3   │   ╔═══════════════════▶│ Vnode 1 │
  │         │   │  vnodes for n_val of 3 as the  │   ║                    │         │
  └─────────┘   │    number of quanta spanned    │   ║                    └─────────┘
                │           increases            │   ║
  ┌─────────┐   └────────────────────────────────┘   ║                    ┌─────────┐
  │         │                                        ║                    │         │
  │Vnode 13 │   ╔═══   Request    ═══════════════════╣                    │ Vnode 2 │
  │         │   ║                                    ║                    │         │
  └─────────┘   ║          ║                         ║                    └─────────┘
                ║          ║                         ║
  ┌─────────┐   ║          ║                         ║                    ┌─────────┐
  │         │   ║          ║                         ║                    │         │
  │Vnode 12 │   ║          ║                         ║                    │ Vnode 3 │
  │         │   ║          ║                         ║                    │         │
  └─────────┘   ║          ║                         ║                    └─────────┘
                ║          ║                         ║
  ┌─────────┐   ║          ╚══════════════════════╗  ║                    ┌─────────┐
  │         │   ║                                 ║  ║                    │         │
  │Vnode 11 │   ║                                 ║  ╚═══════════════════▶│ Vnode 4 │
  │         │   ║                                 ║                       │         │
  └─────────┘   ║                                 ║                       └─────────┘
                ║                                 ║
  ┌─────────┐   ║                                 ║                       ┌─────────┐
  │         │   ║                                 ║                       │         │
  │Vnode 10 │ ◀═╝                                 ║                       │ Vnode 5 │
  │         │                                     ▼                       │         │
  └─────────┘   ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    └─────────┘
                │         │   │         │    │         │   │         │
                │ Vnode 9 │   │ Vnode 8 │    │ Vnode 7 │   │ Vnode 6 │
                │         │   │         │    │         │   │         │
                └─────────┘   └─────────┘    └─────────┘   └─────────┘
```

It remains a moot point whether this type of query would be executed sequentially (like a streaming TS query) or via a full coverage plan.

Choosing between the two execution modes (Streaming Vs Coverage Plan) might depend on a number of factors:
* performance heuristics of both approaches
* if the requirement for returning results in natural key order is a hard requirement
* there are query processing optimisations that could be performed if natural sort order was to be maintained

### Future TS Queries That Require Temporary And Snapshot Tables

There is a requirement in TS for some sort of memory-to-disk spill to cope with queries whose execution path cannot be done in constrained memory.

An example of this is a query containing an ORDER BY clause - the data returned from all the vnodes must be subject to a final sort in a co-ordinating node - so there is no streaming execution path. The no of records of the dataset to be returned tends asymptotically to the number of records in the bucket as the cardinality of the field on which the GROUP BY is being executed increases.

This type of memory-to-disk-spill shall be refered to as a **temporary table** - an on-disk data structure which is not queryable directly by the end user - it is merely an artifact used in the fulfillment of a pre-existing query.

The existance of such a facility however, opens up the possibility of such a table which is queryable - this shall be refered to as a **snapshot table**.

Temporary and snapshot tables work by creating a leveldb table on a single physical riak node - the same node as the query coordinator process, and persisting interim data into that whilst the query executes - and then applying a finalise query to that table to return the relevant results to the end-user:

First up a query is run and the result set is persisted locally:

```
  ┌─────────┐       ┌─────────┐                                           ┌─────────┐
  │         │       │  Local  │             ┌────────────────────┐        │         │
  │Vnode 14 │       │ leveldb │             │Execute an arbitrary│        │ Vnode 1 │
  │         │       │  Table  │             │ query at the ring  │        │         │
  └─────────┘       └─────────┘             │  and persist the   │        └─────────┘
                         ▲                  │  results locally   │
  ┌─────────┐                               └────────────────────┘        ┌─────────┐
  │         │            │                                                │         │
  │Vnode 13 │        Persist                                              │ Vnode 2 │
  │         │         Result                                              │         │
  └─────────┘          Set                                                └─────────┘
                         │
  ┌─────────┐                                                             ┌─────────┐
  │         │            │                                                │         │
  │Vnode 12 │                                                             │ Vnode 3 │
  │         │            │                                                │         │
  └─────────┘                                                             └─────────┘
                     Request    ════╦═════════════╦══════════════╗
  ┌─────────┐                       ║             ║              ║        ┌─────────┐
  │         │                       ║             ║              ║        │         │
  │ Vnode11 │                       ║             ║              ║        │ Vnode 4 │
  │         │                       ║             ║              ║        │         │
  └─────────┘                       ║             ║              ║        └─────────┘
                                    ▼             ▼              ▼
  ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐
  │         │   │         │    │         │   │         │    │         │   │         │
  │Vnode 10 │   │ Vnode 9 │    │ Vnode 8 │   │ Vnode 7 │    │ Vnode 6 │   │ Vnode 5 │
  │         │   │         │    │         │   │         │    │         │   │         │
  └─────────┘   └─────────┘    └─────────┘   └─────────┘    └─────────┘   └─────────┘
```

Then a finalise query is run on the locally persisted data and the results of that are returned to the end-user:

```
  ┌─────────┐      ┌─────────┐              ┌────────────────────┐        ┌─────────┐
  │         │      │  Local  │              │ Execute a finalise │        │         │
  │Vnode 14 │      │ leveldb │              │    query on the    │        │ Vnode 1 │
  │         │      │  Table  │              │    temporary or    │        │         │
  └─────────┘      └─────────┘              │   snapshot table   │        └─────────┘
                        ▲                   └────────────────────┘
  ┌─────────┐           ║                                                 ┌─────────┐
  │         │           ║                                                 │         │
  │Vnode 13 │         Run                                                 │ Vnode 2 │
  │         │       Finalise                                              │         │
  └─────────┘        Query                                                └─────────┘
                        ║
  ┌─────────┐           ║                                                 ┌─────────┐
  │         │           ║                                                 │         │
  │Vnode 12 │           ║                                                 │ Vnode 3 │
  │         │           ║                                                 │         │
  └─────────┘                                                             └─────────┘
                    Request
  ┌─────────┐                                                             ┌─────────┐
  │         │                                                             │         │
  │ Vnode11 │                                                             │ Vnode 4 │
  │         │                                                             │         │
  └─────────┘                                                             └─────────┘

  ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐
  │         │   │         │    │         │   │         │    │         │   │         │
  │Vnode 10 │   │ Vnode 9 │    │ Vnode 8 │   │ Vnode 7 │    │ Vnode 6 │   │ Vnode 5 │
  │         │   │         │    │         │   │         │    │         │   │         │
  └─────────┘   └─────────┘    └─────────┘   └─────────┘    └─────────┘   └─────────┘
```

### Future TS Full Cluster Scans

For queries which cannot be mapped to quanta - that is to say SQL queries where the WHERE clause does not fully cover the primary key - it is not possible to execute them except by a coverage plan with a full bucket scan.

```
                                                                    Vnode 1
                                                                          │
     Request    ════════════╗                              Time Series    │
                            ║                                        │    │
  ┌────────────────────┐    ║                            Bucket 1    │    │
  │  A full bucket is  │    ║                                   │    │    │
  │   scanned across   │    ║                    Keyspace 1     │    │    │
  │ multiple keyspaces │    ║                             │     │    │    │
  └────────────────────┘    ║               Quantum 1     │     │    │    │
                            ╚═══════════║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║                 │     │    │    │
                                        ║   Quantum 2     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           ▼     │     │    │    │
                                        ║                 │     │    │    │
                                        ║   Quantum 3     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           ▼     ▼     │    │    │
                                        ║                       │    │    │
                                        ║        Keyspace 2     │    │    │
                                        ║                 │     │    │    │
                                        ║   Quantum 4     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║                 │     │    │    │
                                        ║   Quantum 5     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           ▼     │     │    │    │
                                        ║                 │     │    │    │
                                        ║   Quantum 6     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           │     │     │    │    │
                                        ║           ▼     ▼     │    │    │
                                        ║                       │    │    │
                                        ║        Keyspace 3     │    │    │
                                        ║                 │     │    │    │
                                        ║                       │    │    │
                                        ║                 │     │    │    │
                                        ║                       │    │    │
                                        ▼                 ▼     ▼    │    │
                                                                     │    │
                                                         Bucket 2    │    │
                                                                │    │    │
                                                                     │    │
                                                                │    │    │
                                                                     │    │
                                                                ▼    │    │
                                                                     │    │
                                                         Bucket 3    │    │
                                                                │    │    │
                                                                     │    │
                                                                │    │    │
                                                                     │    │
                                                                ▼    ▼    │
                                                                          │
                                                            2i Indices    │
                                                                          │
                                                                     │    │
                                                                          │
                                                                     │    │
                                                                          │
                                                                     ▼    ▼
```

These queries requires a full bucket scan on all vnodes - so are distributed by a full coverage plan:

```
  ┌─────────┐       ┌──────────────────┐                                  ┌─────────┐
  │         │       │Coverage plan hits│                                  │         │
  │Vnode 14 │       │ about 1/3 vnodes │             ╔═══════════════════▶│ Vnode 1 │
  │         │       │  for n_val of 3  │             ║                    │         │
  └─────────┘       └──────────────────┘             ║                    └─────────┘
                                                     ║
  ┌─────────┐   ╔═══   Request    ═══════════════════╣                    ┌─────────┐
  │         │   ║                                    ║                    │         │
  │Vnode 13 │◀══╣          ║                         ║                    │ Vnode 2 │
  │         │   ║          ║                         ║                    │         │
  └─────────┘   ║          ║                         ║                    └─────────┘
                ║          ║                         ║
  ┌─────────┐   ║          ║                         ║                    ┌─────────┐
  │         │   ║          ║                         ║                    │         │
  │Vnode 12 │   ║          ║                         ║                    │ Vnode 3 │
  │         │   ║          ║                         ║                    │         │
  └─────────┘   ║          ║                         ║                    └─────────┘
                ║          ╚══════════════════════╗  ║
  ┌─────────┐   ║                                 ║  ║                    ┌─────────┐
  │         │   ║                                 ║  ║                    │         │
  │Vnode 11 │   ║                                 ║  ╚═══════════════════▶│ Vnode 4 │
  │         │   ║                                 ║                       │         │
  └─────────┘   ║                                 ║                       └─────────┘
                ║                                 ║
  ┌─────────┐   ║                                 ║                       ┌─────────┐
  │         │   ║                                 ║                       │         │
  │Vnode 10 │ ◀═╝                                 ║                       │ Vnode 5 │
  │         │                                     ▼                       │         │
  └─────────┘   ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    └─────────┘
                │         │   │         │    │         │   │         │
                │ Vnode 9 │   │ Vnode 8 │    │ Vnode 7 │   │ Vnode 6 │
                │         │   │         │    │         │   │         │
                └─────────┘   └─────────┘    └─────────┘   └─────────┘
```

The major red flag is that we have a TS roadmap product process that keeps pushing us towards full-coverage cluster scan queries - even though we know that all the other full-coverage cluster-scan access paths are explicity ruled out for production clusters.

Following our existing deployment guidelines a these queries should only be run on a non-production cluster on the other side of an MDC link. Should we not change our product/pricing processes WRT to TS to accomodate this?


### Future TS 2i Index Queries

Another option is to add 2i indices to TS queries. The index would be marked something like this:

```sql
CREATE TABLE mytable (
    family      SINT64    NOT NULL, 
    series      SINT64    NOT NULL,
    time        TIMESTAMP NOT NULL,
    temperature SINT64    NOT NULL,
    weather     VARCHAR   NOT NULL INDEX,
    PRIMARY KEY  ((family, series, quantum(time, 1, 's')), family, series, time))
```

**NOTE**: this syntax is an undesigned example of how you **might* do it, not a statement of design.

The PUT would be the same as a standard KV PUT with 2i.

An index read would be a 2-part

First GET would be a coverage plan to read the indices - the same as a distribution of queries on the ring as a Full Cluster read - except instead of scanning the key space it would return a list of keys that match the index.

The second GET would be a set of individual queries to the appropriate vnodes (bundled up?). Because the key set returned by the index read contains the natural sort order - these queries **COULD** be executed in natural sort order: that would require multiple visits to a single vnode however - which is likely to be inefficient. A simpler mechanism my query the vnodes and get all matches per vnode - these result sets could be combined in a local temporary table to create the natural sort order.

Some class of heuristics might choose between these execution paths...

```
  ┌─────────┐ ┌───────────────────────────────────┐                       ┌─────────┐
  │         │ │ Coverage plan hits returns a list │                       │         │
  │Vnode 12 │ │  of keys that match a particular  │  ╔═══════════════════▶│ Vnode 1 │
  │         │ │   index value (or set of index    │  ║                    │         │
  └─────────┘ │              values)              │  ║                    └─────────┘
              └───────────────────────────────────┘  ║
  ┌─────────┐                                        ║                    ┌─────────┐
  │         │   ╔═══   Request    ═══════════════════╣                    │         │
  │Vnode 11 │   ║                                    ║                    │ Vnode 2 │
  │         │   ║          ║                         ║                    │         │
  └─────────┘   ║          ║                         ║                    └─────────┘
                ║          ║                         ║
  ┌─────────┐   ║          ║                         ║                    ┌─────────┐
  │         │   ║          ║                         ║                    │         │
  │Vnode 10 │◀══╝          ║                         ║                    │ Vnode 3 │
  │         │              ║                         ║                    │         │
  └─────────┘              ╚════════╗                ║                    └─────────┘
                                    ║                ║
  ┌─────────┐                       ║                ║                    ┌─────────┐
  │         │                       ║                ║                    │         │
  │ Vnode 9 │                       ║                ╚═══════════════════▶│ Vnode 4 │
  │         │                       ║                                     │         │
  └─────────┘                       ║                                     └─────────┘
                                    ▼
                ┌─────────┐    ┌─────────┐   ┌─────────┐    ┌─────────┐
                │         │    │         │   │         │    │         │
                │ Vnode 8 │    │ Vnode 7 │   │ Vnode 6 │    │ Vnode 5 │
                │         │    │         │   │         │    │         │
                └─────────┘    └─────────┘   └─────────┘    └─────────┘


  ┌─────────┐                                                             ┌─────────┐
  │         │ ┌────────────────────────────────────┐                      │         │
  │Vnode 12 │ │A list of keys is used to generate a│ ╔═══════════════════▶│ Vnode 1 │
  │         │ │        coverage plan (which        │ ║                    │         │
  └─────────┘ │  asymptomatically tends to a full  │ ║                    └─────────┘
              │     coverage plan as the index     │ ║
  ┌─────────┐ └────────────────────────────────────┘ ║                    ┌─────────┐
  │         │                                        ║                    │         │
  │Vnode 11 │   ╔═══   Request    ═══════════════════╣                    │ Vnode 2 │
  │         │   ║                                    ║                    │         │
  └─────────┘   ║          ║                         ║                    └─────────┘
                ║          ║                         ║
  ┌─────────┐   ║          ║                         ║                    ┌─────────┐
  │         │   ║          ║                         ║                    │         │
  │Vnode 10 │◀══╝          ║                         ║                    │ Vnode 3 │
  │         │              ║                         ║                    │         │
  └─────────┘              ╚════════╗                ║                    └─────────┘
                                    ║                ║
  ┌─────────┐                       ║                ║                    ┌─────────┐
  │         │                       ║                ║                    │         │
  │ Vnode 9 │                       ║                ╚═══════════════════▶│ Vnode 4 │
  │         │                       ║                                     │         │
  └─────────┘                       ║                                     └─────────┘
                                    ▼
                ┌─────────┐    ┌─────────┐   ┌─────────┐    ┌─────────┐
                │         │    │         │   │         │    │         │
                │ Vnode 8 │    │ Vnode 7 │   │ Vnode 6 │    │ Vnode 5 │
                │         │    │         │   │         │    │         │
                └─────────┘    └─────────┘   └─────────┘    └─────────┘
```

**NOTE** it is not clear to me how indexes are actually written - and what the cost of them is. Is a 2i index just a key consisting of the index value and a value being a list of all keys that contain that value? What are the relevent costs of adding an entry to an index or removing it?

---

## Future BigSet/BitMap Queries

The background to future queries is the integration of KV an TS - in particular the integration of Delta-Ops BigSet and BigMap CRDTs in KV and TS.

### BigSets/BigMaps Overview

At a high enough level, TS and BigSets have conceptual similarities - both pertain to the collocation of data on the ring. A BigSet can be considered as a lot of individual data items which, instead of being smeared around the ring are collected and written with a local key - in other words the equivalent of a TS/SQL table definition:

```
CREATE TABLE crdt_big_set (
  setid  VARCHAR notnull,
  itemid VARCHAR notnull,
  value  VARCHAR)
  PRIMARY KEY((setid), setid, itemid)
```

This pseudo-keying can be logically extended as shown in the Afrika prototype.

The partition key `setid` points to the set on the ring and the local key `{setid, itemid}` is used to identify a particular item of the set - whose value is stored in `value`.

**NOTE**: this is a **logical** picture - the actual physical implementation is *slightly* more complex.

We can generically consider that BigSets/BigMaps have at-vnode access patterns similar to TS:

```
                                                                    Vnode 1
                                                                          │
     Request    ════════════════╗                          BigSet/BigMap  │
                                ║                                    │    │
  ┌───────────────────────────┐ ║                        Bucket 1    │    │
  │   The request goes to a   │ ║                               │    │    │
  │  particular quantum in a  │ ║                Keyspace 1     │    │    │
  │ particular keyspace in a  │ ║                         │     │    │    │
  │ particular bucket in the  │ ║                CRDT     │     │    │    │
  │ BigSet/BigMap bit of the  │ ╚═══════════════║   │     │     │    │    │
  │  chosen vnode - and then  │                 ║   │     │     │    │    │
  │ performs range operations │                 ║   │     │     │    │    │
  │     within that vnode     │                 ║   │     │     │    │    │
  └───────────────────────────┘                 ▼   ▼     │     │    │    │
                                                          │     │    │    │
                                                 CRDT     │     │    │    │
                                                    │     │     │    │    │
                                                    │     │     │    │    │
                                                    │     │     │    │    │
                                                    │     │     │    │    │
                                                    ▼     │     │    │    │
                                                          │     │    │    │
                                                 CRDT     │     │    │    │
                                                    │     │     │    │    │
                                                    │     │     │    │    │
                                                    │     │     │    │    │
                                                    │     │     │    │    │
                                                    ▼     ▼     │    │    │
                                                                │    │    │
                                                 Keyspace 2     │    │    │
                                                          │     │    │    │
                                                                │    │    │
                                                          │     │    │    │
                                                                │    │    │
                                                          ▼     │    │    │
                                                 Keyspace 3     │    │    │
                                                          │     │    │    │
                                                                │    │    │
                                                          │     │    │    │
                                                                │    │    │
                                                          ▼     ▼    │    │
                                                                     │    │
                                                         Bucket 2    │    │
                                                                │    │    │
                                                                     │    │
                                                                │    │    │
                                                                     │    │
                                                                ▼    │    │
                                                                     │    │
                                                         Bucket 3    │    │
                                                                │    │    │
                                                                     │    │
                                                                │    │    │
                                                                     │    │
                                                                ▼    ▼    │
                                                                          │
                                                             KV and TS    │
                                                                     │    │
                                                                          │
                                                                     │    │
                                                                          │
                                                                     │    │
                                                                     ▼    │
                                                                          │
                                                            2i Indices    │
                                                                     │    │
                                                                          │
                                                                     │    │
                                                                          │
                                                                     ▼    ▼s
```

The distribution of queries around the ring is slightly different as well. The write is sent to a vnode, which computes the Delta and sends that Delta on to the replicas:

```

  ┌─────────┐                                                             ┌─────────┐
  │         │                                       Write                 │         │
  │Vnode 14 │          Request    ═════════════════of new ═══════════════▶│ Vnode 1 │══╗
  │         │       ┌──────────────────────┐        value                 │         │  ║
  └─────────┘       │Write n_val=3 copies -│                              └─────────┘  ║
                    │ the write is sent to │                                        Delta
  ┌─────────┐       │   one Vnode, which   │                              ┌─────────┐  ║
  │         │       │ computes a Delta and │                              │         │  ║
  │Vnode 13 │       │sends that Delta on to│                              │ Vnode 2 │◀═╣
  │         │       │     the other 2      │                              │         │  ║
  └─────────┘       └──────────────────────┘                              └─────────┘  ║
                                                                                       ║
  ┌─────────┐                                                             ┌─────────┐  ║
  │         │                                                             │         │  ║
  │Vnode 12 │                                                             │ Vnode 3 │◀═╝
  │         │                                                             │         │
  └─────────┘                                                             └─────────┘

  ┌─────────┐                                                             ┌─────────┐
  │         │                                                             │         │
  │ Vnode11 │                                                             │ Vnode 4 │
  │         │                                                             │         │
  └─────────┘                                                             └─────────┘

  ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐
  │         │   │         │    │         │   │         │    │         │   │         │
  │Vnode 10 │   │ Vnode 9 │    │ Vnode 8 │   │ Vnode 7 │    │ Vnode 6 │   │ Vnode 5 │
  │         │   │         │    │         │   │         │    │         │   │         │
  └─────────┘   └─────────┘    └─────────┘   └─────────┘    └─────────┘   └─────────┘
```

**NOTE**: that BigSets/BigMaps data will be stored with a different prefix to either KV/TS `o` or 2i indices `i`.

### Afrika Recap

Afrika is about representing RDBMs joined tables as projected tables views on a common 'left hand key'. Consider the following set of three tables joined by 1-to-many relationships:

```
    ┌─────────────────────┐            ┌───────────────────────────────┐           ┌──────────────────────────────────┐
    │                     │           ╱│                               │          ╱│                                  │
    │       Table 1       │────────────│            Table 2            │───────────│             Table 3              │
    │                     │           ╲│                               │          ╲│                                  │
    └─────────────────────┘            └───────────────────────────────┘           └──────────────────────────────────┘

     Key1  ****************             Primary1 - Key1 ****************            NewP10 - Primary1 ****************
     Key2  ****************             Primary2 - Key1 ****************            NewP11 - Primary7 ****************
     Key3  ****************             Primary3 - Key3 ****************            NewP12 - Primary3 ****************
                                        Primary4 - Key2 ****************            NewP13 - Primary8 ****************
                                        Primary5 - Key2 ****************            NewP15 - Primary8 ****************
                                        Primary6 - Key1 ****************            NewP16 - Primary2 ****************
                                        Primary7 - Key3 ****************            NewP17 - Primary1 ****************
                                        Primary8 - Key1 ****************            NewP18 - Primary4 ****************
                                        Primary9 - Key2 ****************            NewP19 - Primary9 ****************
                                                                                    NewP20 - Primary9 ****************
                                                                                    NewP21 - Primary5 ****************
                                                                                    NewP22 - Primary6 ****************
                                                                                    NewP23 - Primary5 ****************
                                                                                    NewP24 - Primary9 ****************
                                                                                    NewP25 - Primary1 ****************
                                                                                    NewP26 - Primary7 ****************
                                                                                    NewP27 - Primary2 ****************
                                                                                    NewP28 - Primary8 ****************

```

Afrika projects out these joins and expresses them as CRDTs. We use Maps to implement tables (schemas that describe a `row` of data) and then represent the projection of a 1-2-many join by adding BigSet the BigMap - a set which we populate with BigMaps which conform to the next table Schema.

```
 ┌─────────────────────────────────────┐
 │ CRDT                                │
 │                                     │
 │ Key1                                │
 │ Primary1 - Key1    **************** │
 │ Primary2 - Key1    **************** │
 │ Primary6 - Key1    **************** │
 │ Primary8 - Key1    **************** │
 │ NewP10 - Primary1  **************** │
 │ NewP13 - Primary8  **************** │
 │ NewP15 - Primary8  **************** │
 │ NewP16 - Primary2  **************** │
 │ NewP17 - Primary1  **************** │
 │ NewP22 - Primary6  **************** │
 │ NewP25 - Primary1  **************** │
 │ NewP27 - Primary2  **************** │
 │ NewP28 - Primary8  **************** │
 └─────────────────────────────────────┘
 ┌─────────────────────────────────────┐
 │ CRDT                                │
 │                                     │
 │ Key2               **************** │
 │ Primary4 - Key2    **************** │
 │ Primary5 - Key2    **************** │
 │ Primary9 - Key2    **************** │
 │ NewP18 - Primary4  **************** │
 │ NewP19 - Primary9  **************** │
 │ NewP20 - Primary9  **************** │
 │ NewP21 - Primary5  **************** │
 │ NewP23 - Primary5  **************** │
 │ NewP24 - Primary9  **************** │
 └─────────────────────────────────────┘
 ┌─────────────────────────────────────┐
 │ CRDT                                │
 │                                     │
 │ Key3               **************** │
 │ Primary3 - Key3    **************** │
 │ Primary7 - Key3    **************** │
 │ NewP11 - Primary7  **************** │
 │ NewP12 - Primary3  **************** │
 │ NewP26 - Primary7  **************** │
 └─────────────────────────────────────┘

```

In nested BigMaps and BigSets the sets (which contain the table projections) are co-located on disk.

When joined tables are expressed as projections in BigSets/BigMaps - the joins are consistent.

### Afrika Queries

There is a working prototype that shows an implementation of table joins and projections for Afrika - that will be taken as a given and not re-iterated here.

The extension of the Time Series SQL query system to BigMaps/BigSets is just a simple matter of programming (famous last words).

There remains the, *ahem*, small task of designing, inventing, modeling, testing and implementing big maps, but after that we are golden...

### Eventually Consistent Indices

The current 2i index system is a double-coverage plan query:
* first request each keyspace return keys that match the index value or values from its index shard
* having assembled the full index in the client (in a query system it could be the coordinator) issues read requests to a keyspace set that asymptotically approaches a full set as the index cardinality gets smaller.

So the question is can we design eventually consistent indices which are expressed on disk as big sets:
* the key is composed of the bucket name and the value of the index
* the payload is a set containing keys of CRDTs that have the appropriate index value - and the paths within those CRDTs that point to the actual indexed field (because you should be able to index columns in projected tables to an arbitrary depth).

**NOTE** this proposal is based on the **assertion** that the causality information used to create a CRDT delta can be spliced and re-purposed to populate an index entry - which is a wholly derivative view of the CRDT. That assertion will require:
* an appropriate proof
* a design
* a model (and probably a PoC)

As always there is a trade-off for using an index - adding an item which is indexed requires an extra set of writes - updating an existing index doubles that up:

```
     ┌─────────┐                                                             ┌─────────┐
     │         │                                                             │         │
     │Vnode 14 │         Request    ══════════════Write═════════════╗        │ Vnode 1 │
     │         │                                                    ║        │         │
     └─────────┘      ┌─────────────┐                               ║        └─────────┘
                      │Write n_val=3│                               ║
     ┌─────────┐      │   copies    │                               ║        ┌─────────┐
     │         │      │             │                               ║        │         │
     │Vnode 13 │      └─────────────┘                               ║        │ Vnode 2 │
     │         │                                                    ║        │         │
     └─────────┘                                                    ║        └─────────┘
                                                                    ║
     ┌─────────┐                                                    ║        ┌─────────┐
     │         │                                                    ║        │         │
  ╔═▶│Vnode 12 │                                                    ║        │ Vnode 3 │
  ║  │         │                                                    ║        │         │
  ║  └─────────┘                                                    ║        └─────────┘
  ║                                                                 ║
  ║  ┌─────────┐                                                    ║        ┌─────────┐
  ║  │         │                                                    ║        │         │
  ╠═▶│Vnode 11 │                                                    ║        │ Vnode 4 │
  ║  │         │                       ╔═════Deltas══╦══════════════╣        │         │
  ║  └─────────┘                       ║             ║              ║        └─────────┘
  ║                                    ▼             ▼              ▼
  ║  ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐
  ║  │         │   │         │    │         │   │         │    │         │   │         │
  ╠═▶│Vnode 10 │   │ Vnode 9 │    │ Vnode 8 │   │ Vnode 7 │    │ Vnode 6 │   │ Vnode 5 │
  ║  │         │   │         │    │         │   │         │    │         │   │         │
  ║  └─────────┘   └─────────┘    └─────────┘   └─────────┘    └─────────┘   └─────────┘
  ║                                                                 ║
  ║                                      Add to Index               ║
  ╚══════════════════════════════════════(derived from ═════════════╝
                                            Delta)
```

Here we see a CRDT with a n_val of 3 - three copies are stored on disk - and then there is an index with an n_val of 3 and three new entries are dispatched to be included in that index.

Needless to say the n_val of the CRDT and that of the Index need not be the same - the Index contains no data that doesn't exist in the set of all CRDTs for that bucket.

There is a non-trivial matter of AAE for indexes, their building or rebuilding (ie must you create a table with indices or can you add indices to an existing table), etc, etc and further not inconsiderable etceteras...)

Updating an index (ie changing the stored value would generate two sets of Index operations:

```
     ┌─────────┐                                                             ┌─────────┐
     │         │                                                             │         │
     │Vnode 14 │         Request    ══════════════Write═════════════╗        │ Vnode 1 │◀═╗
     │         │                                                    ║        │         │  ║
     └─────────┘      ┌─────────────┐                               ║        └─────────┘  ║
                      │Write n_val=3│                               ║                     ║
     ┌─────────┐      │   copies    │                               ║        ┌─────────┐  ║
     │         │      │             │                               ║        │         │  ║
     │Vnode 13 │      └─────────────┘                               ║        │ Vnode 2 │◀═╣
     │         │                                                    ║        │         │  ║
     └─────────┘                                                    ║        └─────────┘  ║
                                                                    ║                     ║
     ┌─────────┐                                                    ║        ┌─────────┐  ║
     │         │                                                    ║        │         │  ║
  ╔═▶│Vnode 12 │                                                    ║        │ Vnode 3 │◀═╣
  ║  │         │                                                    ║        │         │  ║
  ║  └─────────┘                                                    ║        └─────────┘  ║
  ║                                                                 ║                     ║
  ║  ┌─────────┐                                                    ║        ┌─────────┐  ║
  ║  │         │                                                    ║        │         │  ║
  ╠═▶│Vnode 11 │                                                    ║        │ Vnode 4 │  ║
  ║  │         │                       ╔═════Deltas══╦══════════════╣        │         │  ║
  ║  └─────────┘                       ║             ║              ║        └─────────┘  ║
  ║                                    ▼             ▼              ▼                     ║
  ║  ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐  ║
  ║  │         │   │         │    │         │   │         │    │         │   │         │  ║
  ╠═▶│Vnode 10 │   │ Vnode 9 │    │ Vnode 8 │   │ Vnode 7 │    │ Vnode 6 │   │ Vnode 5 │  ║
  ║  │         │   │         │    │         │   │         │    │         │   │         │  ║
  ║  └─────────┘   └─────────┘    └─────────┘   └─────────┘    └─────────┘   └─────────┘  ║
  ║                                                                 ║                     ║
  ║                                      Add to Index               ║  Remove from Index  ║
  ╚══════════════════════════════════════(derived from ═════════════╩════(derived from ═══╝
                                            Delta)                           Delta)
```

These sort of indexes have different ring distribution behaviours to 2i indices. The 2i index distribution to vnodes has the same characteristics as key distribution on the ring - the expectation is that all 2i index data sets on different vnodes should balance.

In normal usage an index has a cardinality very significantly lower than the no of records in a data set. An eventually consistent index with a cardinality some multiple of the ring size should be fairly smooth, if the distribution of values is also even - but it is possible to build hot-spot indexes quite easily.

It is obvious then that an eventually consistent index would have a different ring access pattern than a 2i index - a single read (possibly streaming if the index is large) - followed by a distribution of multi-key reads around the ring.

There remains not-inconsiderable problems in designing a query rewriter to handle index reads but that is a problem for another day.

### Eventually Consistent Joins

Consider the following data structure - a variant of a pig's ear:

```
             ┌────────────────────────────────┐
             │                                │
             │                                │
             │                             ╔════╦════════════════╗
             │       ┌────────────────────┼║    ║     Person     ║
             │       │                     ╠════╬════════════════╣
             │       │                     │Key1│****************│
             ┼       │                     ├────┼────────────────┤
            ╱│╲      │                     │Key2│****************│
 ╔═══════╦═══════╦═══════╗                 ├────┼────────────────┤
 ║Primary║ Liker ║ Likee ║                 │Key3│****************│
 ╠═══════╬═══════╬═══════╣                 ├────┼────────────────┤
 │  P1   │ Key3  │ Key7  │                 │Key4│****************│
 ├───────┼───────┼───────┤                 ├────┼────────────────┤
 │  P2   │ Key3  │ Key9  │                 │Key5│****************│
 ├───────┼───────┼───────┤                 ├────┼────────────────┤
 │  P3   │ Key4  │ Key3  │                 │Key6│****************│
 └───────┴───────┴───────┘                 ├────┼────────────────┤
                                           │Key7│****************│
                                           ├────┼────────────────┤
                                           │Key8│****************│
                                           ├────┼────────────────┤
                                           │Key9│****************│
                                           └────┴────────────────┘
```

This represents the paired relationships `alice likes bob` and `bob is liked by alice`.

This would look similar to an eventually consistent index at the ring:

```

     ┌─────────┐                                                             ┌─────────┐
     │         │                                                             │         │
     │Vnode 14 │         Request    ══════════════Write═════════════╗        │ Vnode 1 │
     │         │                                                    ║        │         │
     └─────────┘      ┌─────────────┐                               ║        └─────────┘
                      │             │                               ║
     ┌─────────┐      │Write n_val=3│                               ║        ┌─────────┐
     │         │      │   copies    │                               ║        │         │
     │Vnode 13 │      │             │                               ║        │ Vnode 2 │
     │         │      └─────────────┘                               ║        │         │
     └─────────┘                                                    ║        └─────────┘
                                                                    ║
     ┌─────────┐                                                    ║        ┌─────────┐
     │         │                                                    ║        │         │
  ╔═▶│Vnode 12 │                                                    ║        │ Vnode 3 │
  ║  │         │                                                    ║        │         │
  ║  └─────────┘                                                    ║        └─────────┘
  ║                                                                 ║
  ║  ┌─────────┐                                                    ║        ┌─────────┐
  ║  │         │                                                    ║        │         │
  ╠═▶│Vnode 11 │                                                    ║        │ Vnode 4 │
  ║  │         │                       ╔═══Deltas════╦══════════════╣        │         │
  ║  └─────────┘                       ║             ║              ║        └─────────┘
  ║                                    ▼             ▼              ▼
  ║  ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐
  ║  │         │   │         │    │         │   │         │    │         │   │         │
  ╠═▶│Vnode 10 │   │ Vnode 9 │    │ Vnode 8 │   │ Vnode 7 │    │ Vnode 6 │   │ Vnode 5 │
  ║  │         │   │         │    │         │   │         │    │         │   │         │
  ║  └─────────┘   └─────────┘    └─────────┘   └─────────┘    └─────────┘   └─────────┘
  ║                                                                 ║
  ║                                      Add Pigs Ear               ║
  ╚═════════════════════════════════════(derived from ══════════════╝
                                            Delta)
```

**NOTE** this proposal is based on the **assertion** that the causality information used to create a CRDT delta can be spliced and re-purposed to populate an pigs ear eventually consistent join - which is a wholly derivative view of the CRDT. That assertion will require:
* an appropriate proof
* a design
* a model (and probably a PoC)


There is a non-trivial matter of AAE for eventually consistent joins etc, etc and further not inconsiderable etceteras...)

### Key-Inversion MDC

In time series we can alter the natural sort order of queries by specifying keys as ASC (for ascending) or DESC (for descending). These determine the order which data is return to users (particularly if a LIMIT clause is used).

If we look at Afrika data partitioning we see that data is logically grouped on disk by the CRDT identifier. By applying key manipulation at the MDC layer it would be possible to create a cluster that had different data groupings on either side simply by reversing the order of components in a key:

```
 ┌──────────────────────────────────┐                        ┌──────────────────────────────────┐
 │      Transactional Cluster       │                        │        Reporting Cluster         │
 │           (OLTP-like)            │──────────MDC───────────│           (OLAP-like)            │
 │                                  │                        │                                  │
 └──────────────────────────────────┘                        └──────────────────────────────────┘
  Key1              ****************                          Key1  ****************
  Primary1 - Key1   ****************                          Key2  ****************
  Primary2 - Key1   ****************                          Key3  ****************
  Primary6 - Key1   ****************
  Primary8 - Key1   ****************                          Primary1 - Key1 ****************
  NewP10 - Primary1 ****************                          Primary2 - Key1 ****************
  NewP13 - Primary8 ****************                          Primary3 - Key3 ****************
  NewP15 - Primary8 ****************                          Primary4 - Key2 ****************
  NewP16 - Primary2 ****************                          Primary5 - Key2 ****************
  NewP17 - Primary1 ****************                          Primary6 - Key1 ****************
  NewP22 - Primary6 ****************                          Primary7 - Key3 ****************
  NewP25 - Primary1 ****************                          Primary8 - Key1 ****************
  NewP27 - Primary2 ****************                          Primary9 - Key2 ****************
  NewP28 - Primary8 ****************
                                                              NewP10 - Primary1 ****************
  Key2              ****************                          NewP11 - Primary7 ****************
  Primary4 - Key2   ****************                          NewP12 - Primary3 ****************
  Primary5 - Key2   ****************                          NewP13 - Primary8 ****************
  Primary9 - Key2   ****************                          NewP15 - Primary8 ****************
  NewP18 - Primary4 ****************                          NewP16 - Primary2 ****************
  NewP19 - Primary9 ****************                          NewP17 - Primary1 ****************
  NewP20 - Primary9 ****************                          NewP18 - Primary4 ****************
  NewP21 - Primary5 ****************                          NewP19 - Primary9 ****************
  NewP23 - Primary5 ****************                          NewP20 - Primary9 ****************
  NewP24 - Primary9 ****************                          NewP21 - Primary5 ****************
                                                              NewP22 - Primary6 ****************
  Key3               ****************                         NewP23 - Primary5 ****************
  Primary3 - Key3    ****************                         NewP24 - Primary9 ****************
  Primary7 - Key3    ****************                         NewP25 - Primary1 ****************
  NewP11 - Primary7  ****************                         NewP26 - Primary7 ****************
  NewP12 - Primary3  ****************                         NewP27 - Primary2 ****************
  NewP26 - Primary7  ****************                         NewP28 - Primary8 ****************
```

This would give us an obvious enterprise class product with a payment line - and one that fits in with how customers currently organise their infrastructure:

```

      Per-key read                                Table Scan
       and writes                                  queries
            │                                          │
            │                                          │
            │                                          │
            ▼                                          ▼
 ┌───┐ ┌───┐ ┌───┐ ┌───┐                    ┌───┐ ┌───┐ ┌───┐ ┌───┐
 │   │ │   │ │   │ │   │                    │   │ │   │ │   │ │   │
 └───┘ └───┘ └───┘ └───┘                    └───┘ └───┘ └───┘ └───┘
 ┌───┐             ┌───┐                    ┌───┐             ┌───┐
 │   │             │   │                    │   │             │   │
 └───┘             └───┘                    └───┘             └───┘
 ┌───┐             ┌───┐                    ┌───┐             ┌───┐
 │   │    OLTP     │   │────────MDC────────▶│   │     OLAP    │   │
 └───┘             └───┘                    └───┘             └───┘
 ┌───┐             ┌───┐                    ┌───┐             ┌───┐
 │   │             │   │                    │   │             │   │
 └───┘             └───┘                    └───┘             └───┘
 ┌───┐ ┌───┐ ┌───┐ ┌───┐                    ┌───┐ ┌───┐ ┌───┐ ┌───┐
 │   │ │   │ │   │ │   │                    │   │ │   │ │   │ │   │
 └───┘ └───┘ └───┘ └───┘                    └───┘ └───┘ └───┘ └───┘
```

### Statistics

Assessing the performance of a index queries, whether or not they hotspot the cluster and the most appropriate path for a query rewriter to emit all require knowledge of the data cardinality.

We need to asses how we assemble histograms to feed the query rewriter based on the data:
* on ingress - keep data histograms up to date
* in a map reduce job - build (and/or rebuild) the histograms
* some combination of the two - build a histogram state ab initio and then maintain it with ingress data

---

Fin
