# Query Access Paths RFC

## Introduction

This is a part of [an overarching RFC](./query_access_paths_RFC.md)

## Time Series SQL SELECT Queries

There is only one query path implemented in time series - the multi-quanta sub-query where the WHERE clause fully covers the primary key.

TS's principle innovation is that related data is co-located - so that data with times that fall into the same quanta is written to the same vnode. The vnode access path therefore contains another layer of nesting:

```
                                                             Vnode 1
                                                                   │
     Request    ════════════════╗                     KV and TS    │
                                ║                             │    │
  ┌────────────────────────┐    ║                 Bucket 1    │    │
  │ The request goes to a  │    ║                        │    │    │
  │particular quantum in a │    ║           Quantum 1    │    │    │
  │particular bucket in the│    ╚═══════════════║   │    │    │    │
  │  TS bit of the chosen  │                    ║   │    │    │    │
  │    vnode - and then    │                    ║   │    │    │    │
  └────────────────────────┘                    ║   │    │    │    │
                                                ▼   ▼    │    │    │
                                                         │    │    │
                                            Quantum 2    │    │    │
                                                    │    │    │    │
                                                    │    │    │    │
                                                    │    │    │    │
                                                    │    │    │    │
                                                    ▼    │    │    │
                                                         │    │    │
                                            Quantum 3    │    │    │
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

Fin
