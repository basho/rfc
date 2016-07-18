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

We propose to provide a script (`riak-search-upgrade.sh`, or equivalent), which may be optionally be run manually on each Riak node, in a manner described below.  This script may only be run manually by the operator -- there is no support for automating the execution of this script -- and only while the Riak server is not running.  The expectation is that this upgrade script may be run in a "rolling" fashion, first on one node, and then on the next, and so forth.  To eliminate downtime for query, all Yokozuna AAE repair should complete on each node before proceeding to the next node.

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
* Restart Riak
* Monitor AAE to reindex all Solr cores

Under this option, all (or a subset of) indices are upgraded to 4.10.4, and the customer may make use of index and query features of Solr 4.10.4.

#### End-user downgrade procedure

All downgrade procedures are manual.  No scripting support is provided.

If the user chooses Option 1 for upgrade, then:

* Stop Riak
* For each index created after the upgrade:
    * Revert the `luceneMatchVersion` in the `solrconfig.xml` for that index to its previous version
    * Delete any previously indexed Solr data
* Restart Riak
* Monitor AAE to reindex all Solr cores

If the user chooses Option 2 for upgrade, then the same procedure is required for downgrade as Option 1, except the changes must be made for _all_ Solr indices that have been upgraded, as well as any indices that were created after the upgrade.

> Note.  As part of corrections to inconsistent hashing of metadata in Riak Objects (https://bashoeng.atlassian.net/browse/RIAK-2193), all Yokozuna data will need to be re-indexed as part of either an upgrade or downgrade, anyway, so it's arguable that all indices should be automatically upgraded.  However, we still encourage users to maintain previous `luceneMatchVersion` entries unless specifically needed by the customer, so as to reduce administrative complexity associated with upgrade and downgrade.

#### Riak test

The following Riak Test (`yz_solr_upgrade_downgrade`) will be implemented as part of this work:

1. Start a single Riak devrel using prev (or specifically 2.0.6 or 2.0.7)
1. Create a Solr index (index-a)
1. Populate the index with data
1. (optional) Verify the data can be effectively queried
1. Create another Solr index (index-b)
1. Populate the index with data
1. (optional) Verify the data can be effectively queried
1. Upgrade the node to current (specifically, using Solr 4.10)
1. Verify that the same data can be queried in index-a and index-b
1. Verify that new data can be added and queried to both indices
1. Upgrade the index-b `solrconfig.xml` to use the `luceneMatchVersion` that corresponds to Solr 4.10.4
1. Verify that the same data can be queried in index-b
1. Verify that new data can be added and queried to index-b
1. Create a new Solr index (index-c)
1. Popular index-c with data, and verify query
1. Downgrade Riak back to previous
1. Verify that index-a is fully functional; specifically, that it can load, be queried against, and can be written to
1. Verify that index-b (upgraded) and index-c (new) cannot be loaded
1. Stop Riak
1. Revert the `luceneMatchVersion` for index-b and index-c
1. Delete any previously indexed data
1. Restart Riak, and wait for AAE to reindex all data
1. Verify expected results.

### References

- [Current Github 4.10.4 upgrade branch](https://github.com/basho/yokozuna/tree/fd-solr-4.10)
- ["SOLR Update to 4.10.4 and Batch Fixes" JIRA Epic](https://bashoeng.atlassian.net/browse/RIAK-2660)
- [`lucene-solr-user` mailing list thread](https://mail-archives.apache.org/mod_mbox/lucene-solr-user/201212.mbox/%3C50D41898.2040701@elyograg.org%3E)