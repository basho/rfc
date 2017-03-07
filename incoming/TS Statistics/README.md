# Riak TS Statistics
_Draft_

## Abstract
As Riak TS (TS) is based on Riak KV (KV), KV statistics (stats) should remain
accurate and, like Riak CRDT (DT) which has additional stats, TS-specific stats,
such as per-table total size on disk and min/max/mean/stddev record size and
count of records, .... A sample of key use cases for TS stats, list of KV stats
and their applicability in TS, list of TS-specific stats as well as the storage
and means of collecting and processing and reporting the TS-specific stats will
be explored herein. External storage, reporting, and alerting based on stats
from Riak TS is briefly explored as an alternative, though some form of Riak TS
internal storage and reporting of stats is required even in this case. Concerns
wrt the performance implications of exometer, the stats application used w/i
Riak KV, both at development time and runtime combined with the increased
familiarity w/ leveldb by the Riak TS team calls for a spike to evaluate an
alternative means of collecting and reporting stats. The comparison should
include performance metrics for equivalent workloads for each alternative under
consideration, so exometer and a new leveldb-backed application.

## Background
### Use Cases
The following uses of stats by TS operators should be considered:
1. Assure Sufficient Computing Resource Allocation
  1. retrieve the total used/addressable memory of the cluster as well as
     individual nodes.
  1. retrieve the count of records per table w/ and w/o a WHERE predicate.
    1. predicates that include only key fields (timestamp typically being a key
       field) may align w/ quantum boundaries.
    1. projecting growth typically draws upon the growth curve over time, i.e.
       next month's disk space usage ~= this month's disk space usage + projected
       monthly disk space usage growth, where monthly growth may be simple
       subtraction or a function that includes a larger range of the series
       of months (or days or smaller range).
  1. retrieve the min/max/mean/stddev of individual record (on-disk) size per
     table w/ and w/o a WHERE predicate.

The following uses of stats by TS developers should be considered:
1. Automate Operations
  1. retrieve stats via clients (and therefore the PB and HTTP APIs) to allow
     for DIY automation as well as integration w/ existing monitoring, alerting,
     and remediation services.
     1. while Basho may provide some integrations, empowering developers and
        operators to self-serve such integrations is FME a small marginal cost w/
        the benefit of such openness reducing prospects' and customers' being
        blocked or needing to use inferior tooling than they otherwise have
        available.
  1. retrieve the cardinality and mean, max, and stddev of record sizes for a
     query to be better informed in the approach taken to optimize queries,
     including redesigning tables involved in views and processes.
  1. store stats to extend the scope of information for all other use cases.
    1. while useful, the Riak TS stats discussed herein are limited to system
       stats, those gathered and reported by Riak TS.

The following uses of stats by TS contributors should be considered:
1. w/i query optimization, stats should be used to determine (when indexes are
   a feature) whether an index or the primary table should be seeked or scanned.
1. w/i resource utilization, stats should be used to "pin" small, frequently-
   read tables where pin means hold in memory as well as disk (application cache).

## Stats
### KV Stats
See http://docs.basho.com/riak/kv/latest/using/reference/statistics-monitoring/
for the full range of stats available. A sample of stats, selected to cover
the range of use cases.

#### Throughput Metrics

| Metric            | Description |
|-------------------|-------------|
| node_gets         | Reads coordinated by this node |
| node_puts         | Writes coordinated by this node |
| vnode_index_reads | Number of local replicas participating in 2i reads |

#### Latency Metrics

| Metric            | Description |
|-------------------|-------------|
| node_get_fsm_time_mean | Time between receipt of client read request and the corresponding service response |
| node_put_fsm_time_mean | Time between receipt of client write request and the corresponding service response |

#### Resource Utilization

| Metric            | Description |
|-------------------|-------------|
| sys_process_count | Number of Erlang processes currently running |
| memory_processes  | Total amount of memory allocated for Erlang processes |
| memory_processes_used | Total amount of memory used by Erlang processes |

#### General Load / Health

| Metric            | Description |
|-------------------|-------------|
| node_get_fsm_objsize_mean | Object size encountered by this node |
| read_repairs      | Number of read repair operations this node has coordinated |
| node_get_fsm_rejected | Number of GET FSMs actively rejected by Sidejob's overload protection |
| node_put_fsm_rejected | Number of PUT FSMs actively rejected by Sidejob's overload protection |

### TS-specific Stats
TODO: Provide Product-defined listing of desired TS-specific stats.

## Focal Areas
### Distribution / Collaboration
For use cases requiring time ranges beyond those either considered relevant by
the system under monitoring or beyond the scope of allowable impact in terms
of storage and/or processing, external systems are often employed. An example
of such a distributed solution is the use of an agent such as collectd to
gather and store metrics into a time-series database such as Riak TS.

As it pertains to Riak TS system metrics, the implementation should take into
consideration that external systems may be (read: likely should be) employed.

Storing the total count of requests via the pb interface is a good example to
demonstrate why the internal stats application should not serve the entire time
range for such a metric. Counter overflow is a near certain occurrence and is an
"edge case" that is exhausting to test. Use case analysis of such a metric begs
for a focus on a hot look-back period, i.e. fifteen minutes, and relatively
ad hoc as well as vast time periods, i.e. month-over-month or year-over-year
trend analysis, though more leading towards external storage is the use of
such a metric timeline in the analysis of a degradation in performance. Neither
flying blind or banging on the system under excessive load in the event of such
a degradation in performance are a good experience or good separation of concerns.

If a Riak TS cluster itself is employed by a customer as the external system,
reads and writes for the purpose of collecting or reporting Riak TS system stats
would be counted unless the implementation uses queries that exclude such counts
or the user is comfortable w/ such over counting as the metric reads and writes
in their overall solution are trivial compared to the reads and writes of
user-space records.

### Data Quality
Operators of Riak expect, for the vast majority of system stats, for the nearest
to now time period, that the data is accurate and available in near real time.
This is to say that the delay in recording, analyzing, and subsequent reporting
is expected to be as near zero as possible. This is due to the use of such stats
in maintaining the uptime of the system under monitoring.

However, derived stats, including aggregation, downsampling, and trend analysis,
due to their use in projection, are expected to be accurate at the time of
reporting, but do not carry a near-real-time expectation. Additionally, derived
stats often involve time ranges beyond the scope of those used in maintaining
the uptime of the system under monitoring.

### Testability
By focusing on the collection and reporting of system stats within a quantized
period near now, i.e. current minute (now - 1m), the quality of the stats
application can be provenly accurate. Iff the current period is accurate, then
aggregate operations such as rollup to a broader time period (now - 15m), are
also accurate by induction as the unit and aggregate function are each accurate.

A challenge to the accuracy of stats would be delayed recording of an event.
When faced with a delayed recording, the current value of the stat as well as
the value(s) of derived stats, including rollups, may be both maintained as
accurate as follows:
* Ignore the delayed recording for the current period.
* Locate derived stats and reconcile w/ the delayed event included. This may be
  achieved by:
  * Invalidating the derived stat and recomputing immediately or on demand.
  * Incrementing the derived stat.
  * Ignoring the delayed event, iff it fails to match the predicate for the
    derived stat.

The level of difficulty in maintaining the accuracy of derived stats on delayed
event recording is increased when derived stats are managed by an arbitrary
external system. And the 

### Storage
Due to the access pattern of stats, stats should be stored in memory. However,
due to quality expectations, stats should be flushed to persistent storage as
well. The metric types exposed by exometer as well as folsom are explored both
to list the means that others have used to address the general stats use cases,
but also to get these types into the air for discussion wrt experiences using
these types. The wiki has some mentions of types that are problematic as well
as guidance for developers to use types already present in Riak. However, no
definitive list of metric types that should be used w/i Riak was found in the
exploration for this RFC.

### Exometer Metric Types
#### Gauge
A gauge is a point-in-time single-value metric, i.e. current KPH for a train.

#### Counter
A counter is a point-in-time single-value metric, i.e. total get requests.
Unlike a proper CRDT, the causal history on increments is not maintained, so
multiply-delivered or delayed-delivered messages are not guaranteed to provide
an accurate measure.

Counters may be reset and provide `ms_since_reset` to aid in reporting as well
as stats management processing, such as downsampling.

A Fast Counter type also exists, but differs in physical implementation which
are explicitly not guaranteed to function correctly when the system under
monitoring is subjected to tracing or debugging.

#### Histogram
A histogram maintains a log derived from all values received during a
configurable time span and provides min, max, median, mean, and percentile
analysis data points for the stored data.

Each histogram is divided into time slots where each slot spans a configurable
interval. All values received during a time slot are averaged into a single
value to be stored in the histogram's derived values once the time slot expires.
The averaging function may be user-defined.

#### Uniform Sample
A sample maintains a pool of values of fixed size w/ new entries flushing out
existing entries selected at random. The uniform probe provides min, max,
median, mean, and percentile analysis data points for the stored data.

#### Spiral (Rolling Time Window)
A spiral maintains the total sum of all values stored in its histogram, where
the histogram has a configurable time span. The spiral provides the sum of
data points w/i the histogram's time span.

### Folsom Metric Types
As exometer obsoletes folsom, the metric types for folsom have some overlap and
differences in runtime characteristic which are IMHO not profitable to explore
again, so are listed here w/o further description. The folsom types follow:
* Gauge
* Counter
* Spiral
* Histogram
* Meter
* Meter Reader
* Duration
* History

### Annotations
None the metric types listed provide annotations, which are point-in-time
markers for events that are likely significant to the performance or data quality
of the system. Multiple annotations are typically used to delimit the time range
of an impactful operation, i.e. a leveldb compaction.

## Proposal
Due to existing use of exometer w/i Riak, exometer must be considered. However,
use of exometer by Riak contributors w/i and w/o Riak has lead to a belief that
exometer has more varying performance for various types of metrics. On the other
hand, re-canvasing the landscape and/or developing a home-grown, purpose-built
stats application (w/i or w/o Riak TS) are relatively speculative, each carrying
a level of reward/risk.

### Alternatives
#### Exometer
See https://github.com/Feuerlabs/exometer for additional information.
#### TS System Table(s)
#### Integration
The stats Application w/i Riak TS, similar to exometer should be an application
that provides a single point of interface for configuration of metrics, means
to write an event, and means to read the metrics' value(s).

#### Storage
Pre-allocated leveldb table(s) w/ expiry should likely be used as allocation of
tables is an expensive operation that will otherwise impact latency and early
throughput.

#### Backend Processing
Several metrics that serve projection use cases, such as total and per-table
disk usage should be implemented as background jobs as both the impact otherwise
on write operations (reminder: Riak TS is a write-heavy data store) will be
more significant than it needs to be and leveldb compaction, including expiry
occur w/o Riak knowledge of the leveldb activity.

Similarly, metrics such as count of tables, count of fields of <field_type> type,
and other such DDL-based metrics can be instrumented w/i the call path but
should be more than acceptable to be measured by a background job periodically.

### Methodology
1. Operations that span the range of metric use cases should be selected. The
   following metrics should cover the range:
   1. count of queries
   1. count of <query_type> queries
   1. histogram of SELECT result record count
   1. histogram of SELECT result record size
   1. histogram of SELECT request-processing (decode, lex, parse) execution time
   1. histogram of SELECT fetch execution time
   1. histogram of SELECT response-processing (encode) execution time
   1. histogram of INSERT values field count
   1. histogram of INSERT values record count
   1. histogram of INSERT request-processing (decode, lex, parse) execution time
   1. histogram of INSERT fetch execution time
   1. histogram of INSERT response-processing (encode) execution time
   1. histogram of record record size for all tables
   1. histogram of record record size per table
   1. count of total errors
   1. count of user errors
   1. count of system errors
   1. histogram of time-to-error
1. Identify basho_bench (b_b) coverage for the workloads required to trigger the
   stats. If there is any gap in coverage, close it by implementing the required
   Riak TS driver w/i b_b.
1. A pre-processor directive (or configuration key) should be created to enable
   Riak TS to be built w/ either alternative.
1. The home-built alternative stats application should be built and included
   in Riak TS, guarded by the pre-processor directive.
1. The execution paths for each metric should be identified and instrumented
   to use the home-built alternative stats application AND NOT to use exometer,
   again guarded by the pre-processor directive.
   1. w/o regard for the additional work to branch on pre-processor directive,
      gather thoughts, feelings, and otherwise qualitative measures for the
      exometer and home-built stats application to be included later in a report.
1. The alternative builds should be taken to the performance lab and b_b runs
   executed.
1. Adapt existing b_b graph generation or create new b_b graph generation bits
   to compare/contrast the results.
1. Document the findings.
1. Fire and forget (or Profit!)

### Expected Output
A write up of the comparative development and runtime characteristics of the
alternatives including benchmark graphs demonstrating the mean and tail
latencies should be posted for discussion of next steps, i.e. build or better
document the best use of exometer.
