# Query Access Paths RFC

## Introduction

This is a part of [an overarching RFC](./query_access_paths_RFC.md)

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
     Request    ═══════════════╗                     KV and TS    │
                               ║                             │    │
  ┌────────────────────────┐   ║                 Bucket 1    │    │
  │A list of quantums to be│   ║                        │    │    │
  │scanned for a particular│   ║            Quantum 1   │    │    │
  │ bucket is passed to a  │   ╠═══════════════▶║   │   │    │    │
  │         vnode          │   ║                ║   │   │    │    │
  │                        │   ║                ║   │   │    │    │
  └────────────────────────┘   ║                ║   │   │    │    │
                               ║                ▼   ▼   │    │    │
                               ║                        │    │    │
                               ║            Quantum 2   │    │    │
                               ║                    │   │    │    │
                               ║                    │   │    │    │
                               ║                    │   │    │    │
                               ║                    │   │    │    │
                               ║                    ▼   │    │    │
                               ║                        │    │    │
                               ║            Quantum 3   │    │    │
                               ║                    │   │    │    │
                               ║                    │   │    │    │
                               ║                    │   │    │    │
                               ║                    │   │    │    │
                               ║                    ▼   │    │    │
                               ║                        │    │    │
                               ║                        │    │    │
                               ║                        │    │    │
                               ║            Quantum 4   │    │    │
                               ║                    │   │    │    │
                               ║                    │   │    │    │
                               ║                    │   │    │    │
                               ║                    │   │    │    │
                               ║                    ▼   │    │    │
                               ║                        │    │    │
                               ║            Quantum 5   │    │    │
                               ╠══════════════▶║    │   │    │    │
                               ║               ║    │   │    │    │
                               ║               ║    │   │    │    │
                               ║               ║    │   │    │    │
                               ║               ▼    ▼   │    │    │
                               ║                        │    │    │
                               ║            Quantum 6   │    │    │
                               ╚══════════════▶║    │   │    │    │
                                               ║    │   │    │    │
                                               ║    │   │    │    │
                                               ║    │   │    │    │
                                               ▼    ▼   ▼    │    │
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

This type of memory-to-disk-spill shall be referred to as a **temporary table** - an on-disk data structure which is not queryable directly by the end user - it is merely an artifact used in the fulfillment of a pre-existing query.

The existence of such a facility however, opens up the possibility of such a table which is queryable - this shall be referred to as a **snapshot table**.

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
  │Vnode 11 │                                                             │ Vnode 4 │
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
     Request    ════════════╗                       Time Series    │
                            ║                                 │    │
  ┌────────────────────┐    ║                     Bucket 1    │    │
  │  A full bucket is  │    ║                            │    │    │
  │      scanned       │    ║               Quantum 1    │    │    │
  │                    │    ╚═══════════║           │    │    │    │
  └────────────────────┘                ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║                │    │    │
                                        ║   Quantum 2    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║           ▼    │    │    │
                                        ║                │    │    │
                                        ║   Quantum 3    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║           ▼    │    │    │
                                        ║                │    │    │
                                        ║                │    │    │
                                        ║                │    │    │
                                        ║   Quantum 4    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║                │    │    │
                                        ║   Quantum 5    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║           ▼    │    │    │
                                        ║                │    │    │
                                        ║   Quantum 6    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ║           │    │    │    │
                                        ▼           ▼    ▼    │    │
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

The major red flag is that we have a TS roadmap product process that keeps pushing us towards full-coverage cluster scan queries - even though we know that all the other full-coverage cluster-scan access paths are explicitly ruled out for production clusters.

Following our existing deployment guidelines a these queries should only be run on a non-production cluster on the other side of an MDC link. Should we not change our product/pricing processes WRT to TS to accommodate this?


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

**NOTE**: this syntax is an undesigned example of how you **might** do it, not a statement of design.

The PUT would be the same as a standard KV PUT with 2i.

An index read would be a 2-part

First GET would be a coverage plan to read the indices - the same as a distribution of queries on the ring as a Full Cluster read - except instead of scanning the key space it would return a list of keys that match the index.

The second GET would be a set of individual queries to the appropriate vnodes (bundled up?). Because the key set returned by the index read contains the natural sort order - these queries **COULD** be executed in natural sort order: that would require multiple visits to a single vnode however - which is likely to be inefficient. A simpler mechanism may query the vnodes and get all matches per vnode - these result sets could be combined in a local temporary table to create the natural sort order.

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

**NOTE** it is not clear to me how indexes are actually written - and what the cost of them is. Is a 2i index just a key consisting of the index value and a value being a list of all keys that contain that value? What are the relevant costs of adding an entry to an index or removing it?

---

## TS Read-repair, anti-entropy

Because TS queries don't return riak_objects, only matrices of rows with a column header vector - there is no read repair triggered. We request n_val sets of data and accept the first one.

We should consider building read-repair - perhaps checksumming chunks, and checking those first - triggering anti-entropy on any that are out of sync as part of the query process?

---

Fin
