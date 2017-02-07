# Query Access Paths RFC

## Introduction

This RFC address access paths for the query system - it arises from discussions and musings at the Query Team Meetup Ukraine.

## Requested Reviewers

* [ ] [Russell Brown](@russelldb)
* [ ] [John Daily](@mactintux)
* [ ] [Pavel Hardak](@ph07)
* [ ] [Brett Hazen](@javajolt)
* [ ] [Torben Hoffman](@lehoff)
* [ ] [Sean Jensen-Gray](@seanjensengray)
* [ ] [Zeeshan Lakhani](@zeeshanlakhani)
* [ ] [Doug Roher](@jeetkundoug)
* [ ] [Andy Till](@andytill)
* [ ] [Charlie Voiselle](@andgrycub)
* [ ] [Matthew Von-Maszewski](@matthewvon)
* [ ] [Andrei Zavada](@hmmrr)

## Purpose

To provide an analytical framework for discussion of access paths. The query rewriter is about to start being a real, complex CS thing. Time to go full Wayne Gretzky - skate to where the puck is going to be...

This RFC MUST enable members of the:
* TS team to contribute to discussions, architecture, design and implementation of new query paths
* KV and Big Sets teams to contribute to discussions, research, architecture, design and implementation of post-merge query paths
* Product team to identify new ways to use existing infrastructure more optimally and take query options out to customers and prioritise the roadmap

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
* queries requiring temporary or snapshot tables
* full cluster scan (needed for proper GROUP BY)
* 2i index paths for Time Series

Outstanding TS issues:
* read-repair/anti-entropy

Speculative future queries:
* BigSets/BigMaps/Afrika queries
* eventually consistent indexes
* eventually consistent joins
* key-inversion MDC query setups

In this context 2i indices - which are written under a transaction on the same vnode as the key they refer to are regarded as consistent indexes - eventually consistent indexes would be ones where the index->key lookup is stored on a seperate vnode to the key.

Capturing statistics about data cardinality etc, to drive heuristic determination of query plans.

**NOTE** Coverage Plans typically 'loop around themselves' covering all keyspaces for all vnodes *except for the last one* to which filters are applied. Where ever this document talks about at-vnode access patterns for query paths that use coverage plans they discuss the *normal case* and elide the special 'last vnode' filtered case for ease of exposition.

## Relationship To Other Documents

The following RFCs are companions to this one:
* Riak TS Pipeline Library RFC
* Riak Pipe For TS Query Distribution RFC

The relationship between these documents is explained in:
* The 3 TS 1.5 RFCs - Their Relationship
 
## Quality Statement

This document should be comprehensive yet simple enough that:
* the engineering team working on queries can have a common language and reference to discuss access paths at both the vnode and ring level
* that members of the product team can get a feel for the likely performance heuristics of requested SQL features (when those features are expressed as ring access paths)
* CSE/SAs can understand map new proposed query paths onto their support model by making analogies to other pre-existing query mechanisms with similar ring/vnode access paths

## Colophon

All diagrams are drawn with a Mac OS X application called Monodraw (which I always read as Moondraw, lolol).

---

## Sections

Because of limitations on diff sizes in GitHub this RFC is split into a number of sections:
* [Background](./query_access_paths_RFC_background.md)
* [TS queries](./query_access_paths_RFC_TS_queries.md)
* [Future TS queries](./query_access_paths_RFC_future_TS_queries.md)
* [Future BigSets/Afrika and statistics](./query_access_paths_RFC_future_big_sets_afrika.md)

---

Fin
