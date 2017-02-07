# RFC: GRafana integration for Riak TS (GRiTS) Working Around the Gap

### Abstract
Assuming that all gap in functionality exposed by Riak TS and necessary for
developing a Grafana Datasource for Riak TS, the project may not only begin
unblocked, but also allow for Riak TS to continue development addressing issues
and feature requests in the priority-order driven by customer demand.

From the perspective of the Grafana integration project, which is a relatively
small effort with large expected returns, working around the gap is more than
not ideal, but is a larger effort than the actual project, yielding no code
reuse for related and future developments within Riak TS. Determining
workarounds that are less subject to breakage due to Riak TS developments over
time is also more difficult to perform outside of the scope of the Riak TS team.

For clarity, this RFC and the underlying gap analysis uses Riak TS 1.4 as the
dependency version.

### Background
Beyond the engineering product of exposing Riak TS as a Grafana Datasource,
professional services and engineering have each made forays into this space.

#### Professional Services - Riak TS as a Grafana Datasource
John Glick developed a project "riak-aws-benchmark" to spinup a Riak cluster,
perform a benchmark, recording metrics in InfluxDB, then teardown the benchmark
test lab. While developing this project, being able to use Riak TS instead of
InfluxDB as the metric datasource was desired, so John performed gap analysis
and implemented several workarounds in an attempt to deliver the minimum viable
product _for this project only_. The workarounds employed require the following
less desireable outcomes:

* Riak Search must be enabled and drawing values out of Riak TS to support the
list of distinct values for a field for a table.
  * Solr is a fine solution for indexing outside of the database.
  * Riak Search's mean time to consistency with Riak KV, and presumably Riak TS,
  is greater in duration than desireable within a general solution, but is
  likely sufficient for supporting the requirement for exposing distinct values.
* In order to deliver on other required features, this solution placed itself in
the write path.
  * Being in the write path provides for stream processing techniques like
  updating aggregates, but should NOT be considered as an option for a
  workaround. Clients can and will issue write requests to Riak TS, thus
  breaking the workaround.

#### Engineering - Stop Using InfluxDB within Benchmarking
Bill Soudan developed the project "basho-perf" which serves a similar use to the
work performed by John Glick, spinup of a Riak cluster, perform a benchmark,
recording metrics in InfluxDB, then teardown the benchmark test lab. The
similarity between these two projects also includes the desire to use Riak TS as
the metric store. The product of this desire to use Riak TS as a metric source
is gap analysis with no attempts at implementing or planning workarounds.

### Proposal
#### Show Tables
Using a listing of Riak TS's 'data/ddl_ebin' directory, the list of tables can be projected by removing the leading 'riak_ql_table_' and trailing version and file extension. This workaround requires directory access to the Riak TS deployment, so constrains the solution to being deployed on a server hosting Riak TS.

#### Distinct Values for Fields
Streaming over List Keys for a table yields (in an EC manner) all of the key fields without querying the whole row. Counts of each value for each field can thus be aggregated. Similarly, standard aggregation functions may be applied in a streaming manner, yielding results such as the MIN, MAX, AVERAGE, STDEV. Even at workaround level, these aggregates should be cached.

##### Distributed Scheduler
This workaround does NOT require a schedule service such as cron, but does
require a coordinated scheduler. Using Javascript's setInterval() is sufficient
to schedule the work, but a distributed synchronization token is additionally
required to reduce the List Keys operations performed against Riak TS.

#### Select Extremeties
Store the extremity values for each table in Riak TS in a row with the key being held at an arbitrary time, effectively latest. The arbitrary value for 'latest' creates the same features of a Riak KV key, including the ability to increase the w value for more redundant storage, holding the r value low enough to meet the required fault tolerance on read while minimizing intra-node traffic for reaching consensus. As the remainder of the solution is Riak TS focused, this alternative is preferred.

#### Quantum Within Describe Table
The quantum information may be parsed from the riak-admin describe table output. The output is in Erlang format, but can be parsed relatively easily. This method could be used in a production setting as the clique interface is less costly on the Riak TS side than the proposed solution accessed via the protobuf interface. This, however, would unecessarily constrain the deployment scenarios for the Riak TS Grafana Datasource to necessarily being deployed on a server hosting Riak TS.

#### Query Spanning Arbitrary Quanta
As with the Spark Riak Connector, discretize the query spanning more than the Riak TS imposed quanta limit with the scattered queries operating on the maximum number of quanta, gathering the results into a single result set.

This workaround depends upon "Quantum Within Describe Table".

#### Quanta Aggregates
While extracting other aggregate values, compute and store the quantum aggregates.

This workaround depends upon "Distinct Values for Fields".

### References
#### Product Definition
[https://docs.google.com/document/d/1_FGSZdDhLRt5dh5hPmjla9EWW6cmKwuEtYdlMg7mxnc/edit#](https://docs.google.com/document/d/1_FGSZdDhLRt5dh5hPmjla9EWW6cmKwuEtYdlMg7mxnc/edit#)

#### Product Exploratory Artifacts
[https://drive.google.com/drive/u/0/folders/0B2davw-jnwkGQ1ZVRC00VDN6Yzg](https://drive.google.com/drive/u/0/folders/0B2davw-jnwkGQ1ZVRC00VDN6Yzg)

#### Gap Analysis
[./src/doc/gap_riak_ts_1_4.md](./src/doc/gap_riak_ts_1_4.md)

Source code is included to "show your work", but is not specifically necessary
to be read to perform the review. The gap analysis should be written at a level
that is clear to developers within the Riak TS team as well as architects who
have a higher level understanding of the project. 

#### Bill Soudan's Notes for Riak TS as a Replacement for InfluxDB / Graphite
[https://docs.google.com/document/d/1E58bhuf_-1HSjKfMwVij93VJCb80-6JT7B6RB_lCDW8/edit](https://docs.google.com/document/d/1E58bhuf_-1HSjKfMwVij93VJCb80-6JT7B6RB_lCDW8/edit)

#### Jonh Glick's Work Referenced Within Riak TS as Storage Component in Grafana and Graphite Metrics Stacks
[https://docs.google.com/document/d/1jqh2ZT7z3ljTemOiHiCZdiPjRdashlMA5pKzaSCPrhY/edit#heading=h.6dvm766205l3](https://docs.google.com/document/d/1jqh2ZT7z3ljTemOiHiCZdiPjRdashlMA5pKzaSCPrhY/edit#heading=h.6dvm766205l3)

#### Extending DESCRIBE (Table) in Riak TS 1.4
[https://docs.google.com/document/d/1Wb73_SZMNeK6-7bjlEvHJz_-U8wY3ew3Z-vJ6yDGS2Q/edit#heading=h.2cqs4steqws8](https://docs.google.com/document/d/1Wb73_SZMNeK6-7bjlEvHJz_-U8wY3ew3Z-vJ6yDGS2Q/edit#heading=h.2cqs4steqws8)

#### Grafana Datasource Plugins
Grafana datasource plugins, for comparison, if needed, are at the following:
[https://github.com/grafana/grafana-plugins/tree/master/datasources](https://github.com/grafana/grafana-plugins/tree/master/datasources)
