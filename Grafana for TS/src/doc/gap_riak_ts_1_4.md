# Riak TS 1.4 as a Grafana Datasource
## Gap Analysis
### Purpose
The purpose of this gap analysis is to identify the gap in functionality between
what is required to expose Riak TS as a Grafana Datasource and what
functionality is provided by Riak TS.

The result of gap analysis should include the following:

1. A brief scope of the system under gap analysis, ie Riak TS via the protobuf
and http interface.
2. A list of features missing from the underlying dependency.
2.a. The workarounds required to fill this gap within the dependent application
2.b. OR a statement that no workaround can be performed so the dependent is
blocked.
3. A brief writeup of how the gap analysis was performed.
3.a. Work demonstrating how the gap analysis was performed, to aid in review of
the statements to the effect.

### Missing Features
#### Show (List) Tables
In order to provide a query interface within Grafana, including selection of
the metric source (table), the list of tables should be queryable. Similar to
the protobuf-exposed Describe Table, which provides similar information to SQL
`DESCRIBE TABLE`, protobuf exposure of Show Tables would serve the need.
##### Workarounds
1. Using a listing of Riak TS's './data/ddl_ebin' directory, the list of tables
can be projected by removing the leading 'riak_ql_table_' and trailing version
and file extension. This workaround requires directory access to the Riak TS
deployment, so constrains the solution to being deployed on a server hosting
Riak TS.

#### Distinct Values for Key Fields
In order to provide a query interface within Grafana, including selection of
right-hand-side values for filters, the distinct list of values for key fields
is required. Ideally, the list of values should be queryable, thus supporting
ORDER BY count descending (default) or ascending.
##### Workarounds
1. Streaming over List Keys for a table yields (in an EC manner) all of the key
fields without querying the whole row. Counts of each value for each field can
thus be aggregated. Similarly, standard aggregation functions may be applied
in a streaming manner, yielding results such as the MIN, MAX, AVERAGE, STDEV.
Even at workaround level, these aggregates should be cached.

Since the process for computing the aggregates requires iterating the entire
set, read-through, calculating on first demand, can not be used. The latency
spike in such a case is unacceptable. Therefore, scheduling a process to
effectively take the first query hit and prepopulate cache should be employed.

Caching of aggregates effectively deals with a set of materialized values that
are related by the time at which those values where calculated. The following
means of storing this data follow:

1. Store in a Map CRDT with the key containing the table. Represent each
aggregate value with a Field of the Map, using Registers for strings, but more
prevalently Registers for counts since the aggregate is a number computed in
whole, from the entire set, as opposed to computed as a delta, from a bookmark.
This approach supports only the latest values, without history, without a
coherent session.
2. Store in a Riak TS table. Similar to storage in a Map CRDT, the related
fields can be held together via a structure, in this case a Riak TS row within
a table. The most-recent row is the current epoch with earlier rows remaining
valid for ongoing sessions.

#### Select Extremeties
In order to store metadata, such as distinct and aggregate values for a table,
selecting the extremity rows is necessary. For example, the following queries
would be used to determine the most recent run of the aggregation process
and the first set of aggregate values for a table:
* SELECT time FROM meta_metrics WHERE time = MAX(time)
* SELECT * FROM meta_metrics WHERE time = MIN(time) AND table_name='metrics'

The case for the most-recent (MAX) extremity is easily established. The case for
the oldest (MIN) extremity is less likely.

For either extreme, the quantum value is surely necessary, but addressed in
other functionality, such as Query Spanning Arbitrary Quanta. This gap is to
identify the desire to optimize for a very common case, selecting the
most-recent row without needing to either issue multiple, sequential queries or
to pipeline such a sequence of queries, sending the server something along the
lines of a stored procedure, which would be required since the scalar result of
the initial query would be used in the subsequent query.

##### Workarounds
1. Store the extremity values for each table in Riak KV in a simple opaque BLOB.
The single-writer constraint holds for all uses within this project, so this
storage is sufficient and efficient.
2. Store the extremity values for each table in Riak TS in a row with the key
being held at an arbitrary time, effectively latest. The arbitrary value for
'latest' creates the same features of a Riak KV key, including the ability to
increase the `w` value for more redundant storage, holding the `r` value low
enough to meet the required fault tolerance on read while minimizing intra-node
traffic for reaching consensus. As the remainder of the solution is Riak TS
focused, this alternative is preferred.

#### Distinct Values for Non-Key Fields
This feature is similar to "Distinct Values for Key Fields", but requires
further querying each row to obtain non-key fields since these fields are not
exposed via the List Keys operation.
##### Workarounds
1. For each resulting key, perform a single-row get.
2. Gather MIN and MAX timestamps for the table and query through all quanta
within that time window, reducing client-coordinatorNode communication.

#### Query Spanning Arbitrary Quanta
In order to provide a query interface within Grafana, including zoom-out of the
time window, but more prevalently specifying a time window supporting the
intuitive analysis of an event, queries spanning arbitrary quanta are necessary.
Since Riak TS imposes a 4-quanta (the specific number does not matter, just that
it is finite, so does not support arbitrary) limit for queries.

As an alternative to removing the quantum limit on queries, Riak TS could expose
a streaming interface, similar to List Keys, so the various client applications
can continue until the stream is exhausted.
##### Workarounds
1. As with the Spark Riak Connector, discretize the query spanning more than
the Riak TS imposed quanta limit with the scattered queries operating on the
maximum number of quanta, gathering the results into a single result set.

#### Quantum Aggregates
In order to workaround other gaps identified within this analysis, the MIN and
MAX quantum field are helpful. For instance, for queries spanning arbitrary
quanta, queries at the beginning of the client-specified range may be eliminated
if they are prior to the MIN quantum.
##### Workarounds
1. While extracting other aggregate values, compute and store the quantum
aggregates.

#### Quantum Within Describe Table
In order to perform a query spanning arbitrary quanta as well as to prompt for
time-based filter criteria, such as the date range for visualization, the time-
series table's quanta must be known, ideally returned with the other table
metadata created via Create Table, such as which fields are primary key fields,
what data type each field is, and whether the field is nullable.
##### Workarounds
1. The quantum information may be parsed from the riak-admin describe table
output. The output is in Erlang format, but can be parsed relatively easily.
This method could be used in a production setting as the clique interface is
less costly on the Riak TS side than the proposed solution accessed via the
protobuf interface. This, however, would unecessarily constrain the deployment
scenarios for the Riak TS Grafana Datasource to necessarily being deployed on a
server hosting Riak TS.

#### Annotations
(NOT a gap, just here stating the project understanding and intent)
Annotations are basically a parallel time series where the value is textual, ie
a note or comment, such as "benchmark test 'rts_1.4_rc6_100tg_5sut_ubuntu14.04'
start". 

### Process
Create facades that expose functions to perform the most core aspects of an
application that can perform every required activity within the solution under
analysis. Since the gap will naturally occur where functions are not present
within the dependency, driving through the how the facade would need to
implement the feature, this approaches the minimum effort, maximum assurance
method of identifying gap.

Several SDLC requirements are intentionally dropped in this process. The hacking
area need not provide module-level or method-level documentation, but if
necessary to explain the gap, must be clear.

Within this gap analysis, the facade intentionally separates Riak KV and Riak TS
functionality. Riak Admin, as in the CLI application, functionality is also
separated to highlight where calling out to the CLI is currently necessary.

Within this gap analysis, references to the code are believed to be not
necessary, but the code is provided to be clear about what functionality was
tested.

Also while performing this gap analysis, concurrently re-familiarizing myself
with node.js and setting up the test framework, including coverage were either
necessary or helpful in reducing the time to develop, so done.

If a specific item within this gap analysis requires more or clearer evidence,
the code, including related tests will likely be referenced to support the
statements.
