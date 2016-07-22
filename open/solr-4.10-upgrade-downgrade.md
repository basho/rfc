# RFC: Solr 4.10 Upgrade/Downgrade

### Abstract

Riak 2.2 includes an upgrade of the underlying Solr server runtime from version 4.7 (with which Riak 2.0 originally shipped) to version 4.10.4.  Upgrade of Solr 4.10.4 has implications for Riak Search 2.0 indices that have were created before the upgrade.  Specifically, if customers want to exploit indexing and search features in Solr 4.10.4 that are not in Solr 4.7 (at present no such features are known to the engineering team), then existing indices will need to be reconfigured and any data stored in these indices will need to be reindexed; otherwise, customers can continue to use their existing indices unmodified.  Downgrade is complicated by the fact that any changes to existing indices made spcifically for Solr 4.10.4 are not backwards-compatible with Solr 4.7.  So any indices that have been modified or created after the upgrade will need to be reconfigured and any associated data will need to be reindexed.

### Background

Riak Search leverages Apache Solr to provide indexing and query functionality for Riak K/V.  Since version 2.0, Riak has shipped with Solr version 4.7.0, which is quite out of date.  As part of Riak 2.2, we would like to upgrade Solr to the latest 4-series version, which at the time of writing is 4.10.4.

Solr uses Lucene under the hood to provide indexing and query functionality.  Lucene is a popular indexing library written in Java, and Solr is in some ways simply a web container, providing an HTTP API into the Lucene indexing system.  When Riak creates a search index, this triggers Solr to create a Solr "core", or lucene index.  When a core is created, Riak provides a set of configuration files on each Riak node, including a Solr index and a Solr configuration file, which reside on disk and is used by Solr to control indexing and query behavior.

One of the required fields in the Solr configuration file for each index (`solrconfig.xml`) is the `luceneMatchVersion`.  This element specifies which version of Lucene to use for indexing and query.  In general, the `luceneMatchVersion` should correspond with the Solr version for new indices.  Solr and Lucene are designed to be forwards compatible with subsequent versions of the same major version.  In particular, indices created using Solr 4.7 (viz., all indices created to date in Riak Search) are compatible with Solr 4.10.4 and function without modification.  If the customer wants to make use of indexing and query features in Solr 4.10.4, however, the `luceneMatchVersion` needs to be incremented, accordingly, and any data in the Solr core needs to be reindexed.  In the general case this can be a costly operation.

If the `luceneMatchVersion` is incremented to match Solr version 4.10.4, the Solr index will not load using Solr 4.7, and it is possible that data indexed with Solr 4.10.4 will not be queryable with a correct result set using 4.7.0, even if the `luceneMatchVersion` is reverted to its original state.  Downgrade requires reverting the `luceneMatchVersion` and reindexing data.

### Proposal

We propose that for upgrade, no existing Solr indices (i.e., indices created with previous versions of Riak) be automatically upgraded.  Specifically, any existing indices will continue to operate with the `luceneMatchVersion` that corresponds to Solr 4.7.0, if no action is taken by the user.  Any indices created after the upgrade, in contrast, will use the `luceneMatchVersion` that is compatible with Solr 4.10.4.

We propose to provide a script (`riak-search-upgrade.sh`, or equivalent), which may be optionally be run manually on each Riak node, in a manner described below.  This script may only be run manually by the operator -- there is no support for automating the execution of this script -- and only while the Riak server is not running.  The expectation is that this upgrade script may be run in a "rolling" fashion, first on one node, and then on the next, and so forth.  To eliminate downtime for query, we propose adding both a configuration setting (`cuttlefish`) and riak-admin command (`clique`) to temporarily disable the node from any coverage plans while the upgrade is in progress.  Once the upgrade is complete (and all searchable Riak buckets have been reindexed), the node may be then re-entered back into the set of nodes that can be part of a cover plan.  The oeprator can then proceed to upgrade the next node, if desired.

The proposed cuttlefish config is:

    {mapping, "search.dist_query.disable", "yokozuna.disable_dist_query", [
        {default, off},
        {datatype, flag},
        hidden
    ]}.

When `search.dist_query.disable` is set to `true`, then the node is marked as unavailable for distributed query, and will not show up in the cover plan for any query.

The following commands will be added to the `clique` options for the `riak-admin` `search` command:

    shell$ riak-admin search dist_query enable      # disable distributed query for this node
    shell$ riak-admin search dist_query disable     # enable distributed query for this node
    shell$ riak-admin search dist_query status      # get the status of distributed query for this node

> Note.  YZ AAE throttling is targeted for Riak 2.2 (https://bashoeng.atlassian.net/browse/RIAK-2626), so operators may optionally control the rate at which Yokozuna AAE repair proceeds.

#### End-user upgrade procedure

End-users have two options for upgrade.

##### Option 1 (recommended)

Simply upgrade Riak to version 2.2; continue to use existing Solr cores unchanged.

* Upgrade Riak on the local node to version 2.2

Indices created prior to the upgrade will continue to function under the Solr 4.10.4 runtime.  There is no need to upgrade indices, unless the customer decides there are indexing or query features that Solr 4.10.4 provides that Solr 4.7 does not.

##### Option 2

* Upgrade Riak on the local node to version 2.2
* Stop Riak
* Run the Riak Search upgrade script (optionally per core), which will:
    * Upgrade `luceneMatchVersion` to the corresponding Solr 4.10 version
    * Back up (or optionally delete) any previously indexed Solr data
* Disable the node from cover plans in `riak.conf`
* Restart Riak
* Monitor AAE to reindex all Solr cores
* Re-enable the node from cover plan via `riak-admin`
* Re-enable the node from cover plans in `riak.conf` (for subsequent reboots)

Under this option, all (or a subset of) indices are upgraded to 4.10.4, and the customer may make use of index and query features of Solr 4.10.4.

#### End-user downgrade procedure

All downgrade procedures are manual.  No scripting support is provided.

If the user chooses Option 1 for upgrade, then:

* Stop Riak
* For each index created after the upgrade:
    * Revert the `luceneMatchVersion` in the `solrconfig.xml` for that index to its previous version
    * Delete any previously indexed Solr data
    * Optionally, revert any previously backed-up Solr data
* Restart Riak
* Monitor AAE to reindex all Solr cores

> Note.  During dowgrade, the node will still be available for query, and inconistent search results will occur.

If the user chooses Option 2 for upgrade, then the same procedure is required for downgrade as Option 1, except the changes must be made for _all_ Solr indices that have been upgraded, as well as any indices that were created after the upgrade.

> Note.  As part of corrections to inconsistent hashing of metadata in Riak Objects (https://bashoeng.atlassian.net/browse/RIAK-2193), all Yokozuna data will need to be re-indexed as part of either an upgrade or downgrade, anyway, so it's arguable that all indices should be automatically upgraded.  However, we still encourage users to maintain previous `luceneMatchVersion` entries unless specifically needed by the customer, so as to reduce administrative complexity associated with upgrade and downgrade.

#### Riak test

The following Riak Test (`yz_solr_upgrade_downgrade`) will be implemented as part of this work:

1. Start a multi-node Riak devrel using prev (or specifically 2.0.6 or 2.0.7), such that each node contains a replica of any given key/value (e.g., 2 node cluster, ring size of 8, `n_val` of 2)
1. Create a Solr index (index-a)
1. Populate the index with data
1. Verify the data can be effectively queried
1. Create Solr indices: index-b1, index-b2, index-b3
1. Populate these indices with data
1. Verify the data can be effectively queried
1. Upgrade the node to current (specifically, using Solr 4.10).  As part of the upgrade process:
     * change all index-b* index `solrconfig.xml`s to use the `luceneMatchVersion` that corresponds to Solr 4.10.4
     * Configure the node so that it is not part of a cover plan (unavailable for query)
     * Leave index-b1 data in place
     * Backup/move index-b2 data somewhere
     * Delete index-b3 data
1. Verify query works as expected on {Cluster - Node}
1. Wait for a full AAE round
1. Add the node back to the cover plan
1. Verify that the same data can be queried in index-a and index-b*
1. Verify that new data can be added to and queried from all indices
1. Create a new Solr index (index-c)
1. Populate index-c with data, and verify query
1. Downgrade Riak back to previous
1. Verify that index-a is fully functional; specifically, that it can load, be queried against, and can be written to
1. Verify that index-b (upgraded) and index-c (new) cannot be loaded
1. Stop Riak
1. Revert the `luceneMatchVersion` for index-b* and index-c.  In addition:
    * Delete any previously indexed data for `index-b1` and `index-b3`
    * Restore backed-up data for `index-b2`
1. Restart Riak, and wait for AAE to reindex all data
1. Verify _all_ previously written data (including data written after the upgrade) is avaialble in all indices.

### References

- [Current Github 4.10.4 upgrade branch](https://github.com/basho/yokozuna/tree/fd-solr-4.10)
- ["SOLR Update to 4.10.4 and Batch Fixes" JIRA Epic](https://bashoeng.atlassian.net/browse/RIAK-2660)
- [`lucene-solr-user` mailing list thread](https://mail-archives.apache.org/mod_mbox/lucene-solr-user/201212.mbox/%3C50D41898.2040701@elyograg.org%3E)