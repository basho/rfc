# Query Access Paths RFC

## Introduction

This RFC address access paths for the query system - it arises from discussions and musings at the Query Team Meetup Ukraine.

## Purpose

To provide an analytical framework for discussion access paths for the query rewriter.

## Scope

The scope of this RFC is split in 3:
* a review of current Riak's query access paths for both KV and Time Series
* an overview of the query access paths on the immediate road map for Time Series
* some speculative future query access paths on the other side of TS/KV merge, BigSets/BigMaps/Afrika...

Current Riak query access paths:
* current KV Queries
  - all multi-key access paths
    * 2i
    * list keys
    * list buckets
    * map reduce
* current Time Series queries
  - 5 quanta-spanning sub-queries

Roadmap overview for TS:
* streaming queries
* coverage plan queries
* full cluster scan (needed for proper GROUP BY)
* 2i index paths for Time Series

Speculative future queries:
* BigSets/BigMaps/Afrika queries
* key-inversion MDC query setups

**NOTE** Coverage Plans typically 'loop around themselves' covering all keyspaces for all vnodes *except for the last one* to which filters are applied. Where ever this document talks about at-vnode access patterns for query paths that use coverage plans they discuss the *normal case* and elide the special 'last vnode' filtered case for ease of exposition.

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

The write to a 2i index is done as a transaction:

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

The read is only done from a single vnode - meaning that if the ring is in handoff you will not get consistent results:

```
  ┌─────────┐                                                             ┌─────────┐
  │         │                                                             │         │
  │Vnode 14 │          Request    ════════════════╗                       │ Vnode 1 │
  │         │       ┌──────────────────┐          ║                       │         │
  └─────────┘       │ Read 1 copy - if │          ║                       └─────────┘
                    │  the ring is in  │          ║
  ┌─────────┐       │ handoff may not  │          ║                       ┌─────────┐
  │         │       │ get complete set │          ║                       │         │
  │Vnode 13 │       └──────────────────┘          ║                       │ Vnode 2 │
  │         │                                     ║                       │         │
  └─────────┘                                     ║                       └─────────┘
                                                  ║
  ┌─────────┐                                     ║                       ┌─────────┐
  │         │                                     ║                       │         │
  │Vnode 12 │                                     ║                       │ Vnode 3 │
  │         │                                     ║                       │         │
  └─────────┘                                     ║                       └─────────┘
                                                  ║
  ┌─────────┐                                     ║                       ┌─────────┐
  │         │                                     ║                       │         │
  │Vnode 11 │                                     ║                       │ Vnode 4 │
  │         │                                     ║                       │         │
  └─────────┘                                     ║                       └─────────┘
                                                  ▼
  ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐    ┌─────────┐   ┌─────────┐
  │         │   │         │    │         │   │         │    │         │   │         │
  │Vnode 10 │   │ Vnode 9 │    │ Vnode 8 │   │ Vnode 7 │    │ Vnode 6 │   │ Vnode 5 │
  │         │   │         │    │         │   │         │    │         │   │         │
  └─────────┘   └─────────┘    └─────────┘   └─────────┘    └─────────┘   └─────────┘
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

## Time Series queries

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
                                                ▼   │     │     │    │    │
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
                                                                     ▼    
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



---

## Future Queries

Conventional RDBS's have a limited number of data access modes from which queries are composed:

