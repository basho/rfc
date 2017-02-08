# RFC: Merging KV with TS

2016/08/24 1st Draft - Brett Hazen

Discussion: https://github.com/basho/rfc/pull/20

### Abstract

Since Time Series was forked from mainstream Riak KV in 2015, development has diverged
between the two products.  That means plenty of duplication and potential conflicts between
the two groups both in development and testing.

Riak TS 1.4 was released at the end of August 2016 and Riak KV 2.2 will be released in
early September 2016.  This seems like a reasonable time to work on 
a unified code base going forward, if not yet a single product.

### Purpose
The purpose of this document is to outline the steps necessary to make this merge happen.
Topics considered:

- Current differences between the two products
- Logistics of merging the two branches
- List of Forked Repos
- Upgrade/Downgrade Issues
- Integration Testing
- Smoke Testing of Packages
- Performance Testing
- Issues of KV and TS on a single cluster

# The Great Merge of 2016

### Product Differences

In no particular order, here are features in Riak TS 1.4 (not in KV):

1. Time Series functionality
1. Additions to Write Once path for TS
1. Only supported backend is LevelDB 
1. Addition of Term-to-Binary encoding (TTB)

And these are features in Riak KV 2.2 (not in TS):

1. Read repair
1. AAE
1. Riak Search (YZ) and decoupling of Solr
1. Addition of HyperLogLog

### Logistics of merging the TS and KV

The most painless way forward seems to be merging Riak KV changes onto Riak TS
simply because there are more breaking changes on the TS branches.  Merging back from
TS to KV is possible, but more difficult.

The safest approach would be to create a separate `riak_ts-merge` branch on each of
the differing [repos](#list-of-forked-repos)
and test from there.

The current proposal is that first the code bases are merged as cleanly as possible
and tested.
Once that hurdle has been passed, then we can look at factoring out some of the TS
functionality into separate modules where it makes sense.

### List of Forked Repos

Here are the repos which differ between KV and TS.  Starred (☆) repos need no changes.
Outlined are some major differences.  This is **not** an exhaustive list.

- `eleveldb`
  - Field and message buffer code that should be a different module (per mvm)
  - TS version has streaming stuff that should probably go into both products
- `jam` ☆
  - TS-specific 
- `leveldb` ☆
  - Pulled in via eleveldb
  - Currently at 2.0.26 in TS and 2.0.27 in KV
  - Same for both TS and KV (per mvm)
- `riak_api`
  - Dependencies on `riak_core` and `riak_pb`
  - TTB changes
- `riak_control`
  - Dependency on `riak_core`
- **`riak_core`**
  - Dependencies on `jam`, `eleveldb`, `riak_ensemble` 
  - Capabilities changes
  - TS Coverage changes
  - Additions to bucket properties, claimant and metadata
  - Handoff changes on KV side
  - Hashtree changes on KV side
- `riak_ensemble`
  - Dependency on `eleveldb`
- `riak_jmx`
  - Dependency on `riak_kv`
- **`riak_kv`**
  - Dependencies on `riak_pipe`, `riak_api`, `riak_ql` and `jam`
  - Capability changes
  - Config changes
  - TS additional functionality
  - Changes to Write Once path
  - Added hooks
- `riak_pipe`
  - Dependency on `riak_core`
  - Minor coverage change
- `riak_ql` ☆
  - TS-specific
- `riak_repl`
  - Dependencies on `riak_kv` and `riak_repl_pb_api`
  - Support for TS replication
- `riak_repl_pb_api`
  - Dependency on `riak_pb`
- `riak_search`
  - Dependency on `riak_kv`
- `riak_shell` ☆
  - TS-specifc
- `riak_test`
  - YZ tests are way out of sync
- `riak-erlang-http-client`
  - Addition of HLL
  - Should not impact TS
- `yokozuna`
  - Dependency on `riak_kv`
  - Major reworking on KV side
  - Addition of new tests on the KV side

### Upgrade/Downgrade Issues
There are tests from KV to KV clusters and from TS to TS clusters but no specific KV to TS
and TS to KV tests.  These will either need to be written or configured.  Some tests may need
to be adjust to accommodate a merged Riak version.

### Regression Testing
A nice-to-have feature would be to increase the number of platforms covered in GiddyUp automated
testing. However both Riak KV and Riak TS are only currently tested on CentOS 6.  The TS
riak_tests are a superset of the KV tests, so simply need to be adjusted to allow different
back ends.

Flappy tests will continue to be a problem, but hopefully multiple runs and comparisons to
historical results will prove to be sufficient for this purpose.

### Smoke Testing
This step has meant installing final packages and running some basic regressions on them.
Assuming we have similar tests for KV, simply running existing test suites should be sufficient
for confidence in a merged version of Riak.  Currently TS uses Terraform to test out final
packages, but KV could be used just as easily.  There might need to be new tests added to
that, however.  Longer term we hope to automate this, but that is beyond the scope of this
integration.

### Performance Testing

The performance team has extensive tests for Time Series.  It sounds like these tests were
based on existing KV infrastructure so hopefully could reasonably easily adapt to a KV-only
configuration.

In theory there should be negligible difference after the merge.

### Cohabitation

There are some constraints placed on Riak TS which are not in Riak KV,
the largest of which is probably the requirement of only a levelDB backend.
This might be worked around by specifying multiple back ends.  This configuration has
not been thoroughly tested yet, however.  [PR to change backend](https://github.com/basho/riak_kv/pull/1240)

Also data is written to specific vnodes, in particular data is physically grouped together
on disk in such a way to allow for faster reads and writes.  This means that AAE, which can
rearrange data on disk might not be compatible with TS.  This again needs to be tested.

Since TS uses the Write Once path, this functionality also needs to be tested when used with KV.
Current riak_tests are failing for this feature under TS.


