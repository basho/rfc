# Query Access Paths RFC - Background

## Introduction

This is a part of [an overarching RFC](./query_access_paths_RFC.md)

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
                                                     │    │    │
                                                     │    │    │
     Request    ════════════════╗                    ▼    │    │
                                ║                         │    │
  ┌────────────────────────┐    ║             Bucket 2    │    │
  │ The request goes to a  │    ║                    │    │    │
  │particular keyspace in a│    ║                    │    │    │
  │particular bucket in the│    ╚════════════════▶   │    │    │
  │  KV bit of the chosen  │                         │    │    │
  │         vnode          │                         ▼    │    │
  └────────────────────────┘                              │    │
                                              Bucket 3    │    │
                                                     │    │    │
                                                     │    │    │
                                                     │    │    │
                                                     │    │    │
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

**NOTE** there was a long discussion about prefix TS data with a `c` for composite key - but at decision was taken to just stick with `o`. We are trying to reconstruct the rationale for that and think it might have been that TS and KV were to be separate products. We need to revisit this decision as a matter of urgency in the great merge discussion.

Each of these areas is divided into buckets. 2i indices are only used with KV buckets, so the 2i buckets correspond to the KV buckets for which data has been written with a 2i index.

If there is a KV bucket with an n_val of 4 (and lots of data has been written to that bucket) then data that hashes to 4 vnodes will be intermingled.
Because the 2i index space only pertains to KV - there will data hashed to 4 vnodes in that as well (provided data is written with secondary indexes).

If there has been a TS bucket created with an n_val of 5 - there will be data hashed to up to 5 vnodes intermingled in the vnode TS portion.

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
  │    for that bucket     │                        │     │    │
  └────────────────────────┘                        │     │    │
   PUT Request  ══════════════╗                     ▼     │    │
                              ║                           │    │
                              ║              Bucket 2     │    │
                              ║                     │     │    │
                              ║                     │     │    │
                              ║                     │     │    │
                              ╠══════════════▶      │     │    │
                              ║                     ▼     │    │
                              ║                           │    │
                              ║              Bucket 3     │    │
                              ║                     │     │    │
                              ║                     │     │    │
                              ║                     │     │    │
                              ║                     │     │    │
                              ║                     ▼     │    │
                              ║                           ▼    │
                              ║                  2i Indices    │
                              ║                                │
                              ║               Bucket 1    │    │
                              ║                      │    │    │
                              ║                      │    │    │
                              ║                      │    │    │
                              ║                      │    │    │
                              ║                      ▼    │    │
                              ║                           │    │
                              ║               Bucket 2    │    │
                              ║                      │    │    │
                              ║                      │    │    │
                              ╚══════════════▶       │    │    │
                                                     │    │    │
                                                     ▼    │    │
                                                          │    │
                                              Bucket 3    │    │
                                                     │    │    │
                                                     │    │    │
                                                     │    │    │
                                                     │    │    │
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
   Read Request ═══════════════╗                          │    │
                               ║              Bucket 1    │    │
  ┌────────────────────────┐   ║                     │    │    │
  │ The request goes to a  │   ║                     │    │    │
  │    particular index    │   ║                     │    │    │
  │    pertaining to a     │   ║                     │    │    │
  │ particular bucket in a │   ║                     ▼    │    │
  │ particular keyspace on │   ║                          │    │
  │    the chosen vnode    │   ║              Bucket 2    │    │
  └────────────────────────┘   ║                     │    │    │
                               ║                     │    │    │
                               ║                     │    │    │
                               ╚═══════════════▶     │    │    │
                                                     ▼    │    │
                                                          │    │
                                              Bucket 3    │    │
                                                     │    │    │
                                                     │    │    │
                                                     │    │    │
                                                     │    │    │
                                                     ▼    ▼    ▼
```

In order to reconstruct a key list of all entries that are in the index - every keyspace must be consulted - via a coverage plan. This is because the 2i index is written local to the key on the same vnode/keyspace.

With an n_val of three a coverage plan **approximates** to every third vnode.

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
  │Vnode 11 │    ║                                    ║                   │ Vnode 2 │
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
                                                     │    │    │
                                                     │    │    │
                                                     │    │    │
     Request    ════════════╗                        ▼    │    │
                            ║                             │    │
  ┌────────────────────────┐║                 Bucket 2    │    │
  │ The request goes to a  │╚═══════════▶║           │    │    │
  │particular bucket (in KV│             ║           │    │    │
  │or TS as appropriate) on│             ║           │    │    │
  │  the chosen vnode and  │             ║           │    │    │
  │ then executes a range  │             ▼           ▼    │    │
  │ scan across keyspaces  │                              │    │
  └────────────────────────┘                  Bucket 3    │    │
                                                     │    │    │
                                                     │    │    │
                                                     │    │    │
                                                     │    │    │
                                                     ▼    ▼    │
                                                               │
                                                 2i Indices    │
                                                          │    │
                                                          │    │
                                                          │    │
                                                          │    │
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
                            ╔═══════════▶║           │    │    │
                            ║            ║           │    │    │
                            ║            ║           │    │    │
                            ║            ║           │    │    │
     Request    ════════════╝            ║           ▼    │    │
                                         ║                │    │
  ┌────────────────────────┐             ║    Bucket 2    │    │
  │The request goes to the │             ║           │    │    │
  │ start of the KV and TS │             ║           │    │    │
  │ space, scans down all  │             ║           │    │    │
  │the entries for all the │             ║           │    │    │
  │        buckets         │             ║           ▼    │    │
  └────────────────────────┘             ║                │    │
                                         ║    Bucket 3    │    │
                                         ║           │    │    │
                                         ║           │    │    │
                                         ║           │    │    │
                                         ║           │    │    │
                                         ▼           ▼    ▼    │
                                                               │
                                                 2i Indices    │
                                                          │    │
                                                          │    │
                                                          │    │
                                                          │    │
                                                          ▼    ▼
```

List buckets uses a coverage plan of some sort - not sure how it can do that effectively - perhaps it assumes a default n_val of 3, or perhaps it just has an 'all vnodes' coverage plan (it hardly seems worthwhile to spend a lot of time spelunking it because it is **sooooo** not production):

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
                                                     │    │    │
                                 ╔═════════════════▶ │    │    │
                                 ║                   │    │    │
     Request    ═════════════════╣                   │    │    │
                                 ║                   │    │    │
  ┌────────────────────────┐     ║                   │    │    │
  │   A set of keys in a   │     ║                   │    │    │
  │  particular bucket is  │     ║                   │    │    │
  │  passed to the vnode   │     ║                   │    │    │
  │                        │     ║                   │    │    │
  └────────────────────────┘     ╠════════════════▶  │    │    │
                                 ║                   │    │    │
                                 ║                   │    │    │
                                 ║                   │    │    │
                                 ║                   │    │    │
                                 ║                   │    │    │
                                 ╚════════════════▶  │    │    │
                                                     ▼    │    │
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
                               ╔══════════════▶ ║    │    │    │
                               ║                ║    │    │    │
                               ║                ║    │    │    │
                               ║                ║    │    │    │
     Request    ═══════════════╝                ║    │    │    │
                                                ║    │    │    │
  ┌────────────────────────┐                    ║    │    │    │
  │   All the keys for a   │                    ║    │    │    │
  │particular KV bucket are│                    ║    │    │    │
  │        scanned         │                    ║    │    │    │
  │                        │                    ║    │    │    │
  └────────────────────────┘                    ║    │    │    │
                                                ║    │    │    │
                                                ║    │    │    │
                                                ║    │    │    │
                                                ║    │    │    │
                                                ║    │    │    │
                                                ║    │    │    │
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
                            ╔════════════▶║          │    │    │
                            ║             ║          │    │    │
                            ║             ║          │    │    │
                            ║             ║          │    │    │
     Request    ════════════╝             ║          ▼    │    │
                                          ║               │    │
  ┌────────────────────────┐              ║   Bucket 2    │    │
  │All the keys for all KV │              ║          │    │    │
  │  buckets are scanned   │              ║          │    │    │
  │                        │              ║          │    │    │
  └────────────────────────┘              ║          │    │    │
                                          ║          ▼    │    │
                                          ║               │    │
                                          ║   Bucket 3    │    │
                                          ║          │    │    │
                                          ║          │    │    │
                                          ║          │    │    │
                                          ▼          │    │    │
                                                     ▼    ▼    │
                                                               │
                                                 2i Indices    │
                                                          │    │
                                                          │    │
                                                          │    │
                                                          │    │
                                                          ▼    ▼
```

The coverage plan is like the per-bucket one with the same caveats. All-buckets map reduce is not recommended for production (ever more strongly not recommended than per-bucket).

---

Fin