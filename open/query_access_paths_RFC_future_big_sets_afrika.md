# Query Access Paths RFC

## Introduction

This is a part of [an overarching RFC](./query_access_paths_RFC.md)

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

**NOTE**: this is a **logical** picture - the actual physical implementation is *slightly* more complex ;-)

We can generically consider that BigSets/BigMaps have at-vnode access patterns similar to TS:

```

                                                               Vnode 1
                                                                     │
     Request    ════════════════╗                     BigSet/BigMap  │
                                ║                               │    │
  ┌───────────────────────────┐ ║                   Bucket 1    │    │
  │   The request goes to a   │ ╚═══════════════▶          │    │    │
  │  particular quantum in a  │                    CRDT    │    │    │
  │ particular bucket in the  │                   ║   │    │    │    │
  │ BigSet/BigMap bit of the  │                   ║   │    │    │    │
  │  chosen vnode - and then  │                   ║   │    │    │    │
  │ performs range operations │                   ║   │    │    │    │
  │     within that vnode     │                   ▼   ▼    │    │    │
  │                           │                            │    │    │
  └───────────────────────────┘                    CRDT    │    │    │
                                                      │    │    │    │
                                                      │    │    │    │
                                                      │    │    │    │
                                                      │    │    │    │
                                                      ▼    │    │    │
                                                           │    │    │
                                                   CRDT    │    │    │
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
                                                                ▼    ▼
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
* some combination of the two - build a histogram state *ab initio* and then maintain it with ingress data

TODO:
* understand Pavel Hardak and Sean Jensen-Gray's CRDT register of quanta's written - and understand how that could be used in a query engine

---

Fin
