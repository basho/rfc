# RFC: Solr 4.10 Upgrade/Downgrade

Discussion: https://github.com/basho/rfc/pull/14

### Abstract

Riak 2.2 includes an upgrade of the underlying Solr server runtime from version 4.7 (with which Riak 2.0 originally shipped) to version 4.10.4.  Upgrade of Solr 4.10.4 has implications for Riak Search 2.0 indices that have were created before the upgrade.  Specifically, if customers want to exploit indexing and search features in Solr 4.10.4 that are not in Solr 4.7 (at present no such features are known to the engineering team), then existing indices will need to be reconfigured and any data stored in these indices will need to be reindexed.  As part of the upgrade process, unmodified solr core configurations will be automatically upgraded by Yokozuna, in a manner described below.  Downgrade is complicated by the fact that any changes to existing indices made spcifically for Solr 4.10.4 are not backwards-compatible with Solr 4.7.  So any indices that have been modified or created after the upgrade will need to be reconfigured and any associated data will need to be reindexed.

### Background

Riak Search leverages Apache Solr to provide indexing and query functionality for Riak K/V.  Since version 2.0, Riak has shipped with Solr version 4.7.0, which is quite out of date.  As part of Riak 2.2, we would like to upgrade Solr to the latest 4-series version, which at the time of writing is 4.10.4.

Solr uses Lucene under the hood to provide indexing and query functionality.  Lucene is a popular indexing library written in Java, and Solr is in some ways simply a web container, providing an HTTP API into the Lucene indexing system.  When Riak creates a search index, this triggers Solr to create a Solr "core", or lucene index.  When a core is created, Riak provides a set of configuration files on each Riak node, including a Solr index and a Solr configuration file, which reside on disk and is used by Solr to control indexing and query behavior.

One of the required fields in the Solr configuration file for each index (`solrconfig.xml`) is the `luceneMatchVersion`.  This element specifies which version of Lucene to use for indexing and query.  In general, the `luceneMatchVersion` should correspond with the Solr version for new indices.  Solr and Lucene are designed to be forwards compatible with subsequent versions of the same major version.  In particular, indices created using Solr 4.7 (viz., all indices created to date in Riak Search) are compatible with Solr 4.10.4 and function without modification.  If the customer wants to make use of indexing and query features in Solr 4.10.4, however, the `luceneMatchVersion` needs to be incremented, accordingly, and any data in the Solr core needs to be reindexed.  In the general case this can be a costly operation.

If the `luceneMatchVersion` is incremented to match Solr version 4.10.4, the Solr index will not load using Solr 4.7, and it is possible that data indexed with Solr 4.10.4 will not be queryable with a correct result set using 4.7.0, even if the `luceneMatchVersion` is reverted to its original state.  Downgrade requires reverting the `luceneMatchVersion` and reindexing data.

### Proposal

As part of the upgrade process, Yokozuna will attempt to automatically upgrade exisitng `solrconfig.xml` files, for each existing index.  Upgrades can automatically happen if the existing `solrconfig.xml` is an unmodified verson of the previous version of this file.  We have verified that at the time of writing, this file has only had one version since the release of Riak Search 2.0.  If the current version of this file is not up to date but has been modified by the user, then Yokozuna will warn the user that this `solrconfig.xml` file is out of date, and should be updated.

This upgrade process will run as part of the Yokozuna start procedure, on versions going forward, until versions prior to 2.2 are EOL'd (unless a new upgrade procedure is required).

We propose the following workflow for the upgrade process, which is applied to each existing index while the Yokozuna application starts:

    +-----------------\                  +-----------------\
    | New solrconfig   +                 | user's existing  +
    | template         |                 | solrconfig       |
    +------------------+                 +------------------+
              |                                     |
              +------>   +-----------------+ <------+
                         | compare files   |
                         +-----------------+
                                  |
                                  v
                             +------------+
                             | same hash? |--- yes ------------------------------+
                             +------------+                                      |
                                  |                                              |
                                  no                                             |
                                  |                                              |
                                  v                                              |
                             +-------------+           +--------------+          |
                             | known hash? |--- no --->| version old? |--- no ---+
                             +-------------+           +--------------+          |
                                  |                           |                  |
                                  yes                        yes                 |
                                  |                           |                  |
                                  v                           v                  |
                              +---------------+       +------------+             |
                              | upgrade to    |       | warn user  |             |
                              | new solrconfg |       +------------+             |
                              +---------------+             |                    v
                                  |                         |                 +----------+
                                  +-------------------------+---------------> | continue |
                                                                              +----------+


Upgrades of the `solrconfig.xml` file to use the updated `luceneMatchVersion` should ideally be accomanpied by reindexing all previously index data.  As part of the changes to AAE hashing also being added to Riak 2.2, all Yokozuna data will be automatically reindex, as the Riak/KV hashes will all change, and hence the changes to hashing will result in a cascade of YZ AAE repair.  Upgrade, therefore, will entail reindexing all Yokozuna data under the latest lucene version, for all indices that are automatically upgraded.  For the small percentage of users who have manually modified the `solrconfig.xml` files, we will document the procedure for manually upgrading the `luceneMatchVersion` as part of the upgrade process.

To eliminate downtime for query across the cluster, we add both a configuration setting (`cuttlefish`) and riak-admin command (`clique`) to temporarily disable the node from any coverage plans while the upgrade is in progress.  Once the upgrade is complete (and all searchable Riak buckets have been reindexed), the node may be then re-entered back into the set of nodes that can be part of a cover plan.  The oeprator can then proceed to upgrade the next node, if desired.

The proposed cuttlefish config is:

    {mapping, "search.dist_query", "yokozuna.disable_dist_query", [
        {default, off},
        {datatype, flag},
        hidden
    ]}.

When `search.dist_query` is set to `off`, then the node is marked as unavailable for distributed query, and will not show up in the cover plan for any query.

> Note.  If distributed query is disabled on a node, it can still be used as a query endpoint (via protobuf and HTTP).  If it is so used, the node through which the query is executed simply won't be part of the coverage plan, and only the nodes in the rest of the cluster will be used (assuming distribited query is not also disabled on them.)

The following commands will be added to the `clique` options for the `riak-admin` command:

    shell$ riak-admin set search.dist_query=off     # disable distributed query for this node
    shell$ riak-admin set search.dist_query=on      # enable distributed query for this node
    shell$ riak-admin show search.dist_query        # get the status of distributed query for this node

> Note.  YZ AAE throttling is targeted for Riak 2.2 (https://bashoeng.atlassian.net/browse/RIAK-2626), so operators may optionally control the rate at which Yokozuna AAE repair proceeds.

#### End-user upgrade procedure

In most cases, the operator will only need to follow the upgrade procedure documented in the Riak documentation.

We will supplement the exisitng documentation to include recommendations about how to remove a node from cover plans while reindexing takes place.

The documentation will also contain instructions for how to upgrade manually ff a user has made changes to any `solrconfig.xml` file.

The upgrade instructions take the form:

* Stop Riak
* Run the upgrade (RPM, debian, etc)
* If the user has manually modified the `solrconfig.xml` file for any index, then manually edit each such file that has been edited so that the `luceneMatchVersion` tag has the value "4.10.4".
* Disable the node from cover plans in `riak.conf`
* Restart Riak
* Monitor AAE to reindex all Solr cores
* Re-enable the node from cover plan via `riak-admin`
* Re-enable the node from cover plans in `riak.conf` (for subsequent reboots)

Under this option, all (or a subset of) indices are upgraded to 4.10.4, and the customer may make use of index and query features of Solr 4.10.4.

If a user has modified the solrconfig.xml file in a Solr index on a node, then a warning is issued to the console log on every reboot until the `luceneMatchVersion` is upgraded to "4.10.4"

> Note.  As part of modifications to hashing of Riak Objects (https://bashoeng.atlassian.net/browse/RIAK-2193), all Yokozuna data will be automatically re-indexed as part of either an upgrade or downgrade.  If a user has made a modification to a `solrconfig.xml` file and has not manually updated the `luceneMatchVersion` as described in the upgrade instructions, then that user will need to manually re-index their data after upgrade.

#### End-user downgrade procedure

All downgrade procedures are manual.  No automation is provided, and a full reindex of data is required.

If the user chooses Option 1 for upgrade, then:

* Stop Riak
* For each index that was upgraded:
    * Revert the `luceneMatchVersion` in the `solrconfig.xml` for that index to its previous version
    * Delete any previously indexed Solr data
    * Optionally, revert any previously backed-up Solr data
* Restart Riak
* Monitor AAE to reindex all Solr cores

> Note.  During downgrade, the node will still be available for query, and inconistent search results will occur.

#### Riak test

The following Riak Test (`yz_solr_upgrade_downgrade`) will be implemented as part of this work:

1. Start a multi-node Riak devrel using prev (or specifically 2.0.6 or 2.0.7), such that each node contains a replica of any given key/value (e.g., 2 node cluster, ring size of 8, `n_val` of 2)
1. Create Solr indices index-a1 and index-a2
1. Populate these indices with data and verify the data can be effectively queried
1. Create Solr indices: index-b1, index-b2, index-b3
1. Populate these indices with data and verify the data can be effectively queried
1. Upgrade dev1 to current (specifically, using Solr 4.10).  As part of the upgrade process:
     * Configure the node so that it is not part of a cover plan (unavailable for query)
     * Make a trivial Modification to index-a* `solrconfig.xml` file (e.g., add a trailing comment)
        * (Doing so will prevent index-a* from being upgraded)
     * Leave index-b1 data in place
     * Backup/move index-b2 data somewhere
     * Delete index-b3 data
1. Restart dev1
1. Verify that the solrconfig.xml files associated with index-b* have been upgraded, but that those associated with index-a* have not been.
1. Verify query works as expected on {Cluster - Node}
1. Wait for a full AAE round
1. Add the dev1 back to the cover plan
1. Verify that the same data can be queried in index-a* and index-b*
1. Verify that new data can be added to and queried from all indices except index-a1 -- specifically, leave index-a1 unmodified
1. Create a new Solr index (index-c)
1. Populate index-c with data, and verify query
1. Downgrade Riak back to previous
1. Verify that index-a1 is fully functional; specifically, that it can load, be queried against, and can be written to
1. Verify that index-a2 and index-b* (upgraded) and index-c (new) cannot be loaded
1. Stop Riak
1. Revert the `luceneMatchVersion` for index-b* and index-c.  In addition:
    * Delete any previously indexed data for `index-a2`, `index-b1` and `index-b3`
    * Restore backed-up data for `index-b2`
1. Restart Riak, and wait for AAE to reindex all data
1. Verify _all_ previously written data (including data written after the upgrade) is avaialble in all indices.

### References

- [Current Github 4.10.4 upgrade branch](https://github.com/basho/yokozuna/tree/fd-solr-4.10)
- ["SOLR Update to 4.10.4 and Batch Fixes" JIRA Epic](https://bashoeng.atlassian.net/browse/RIAK-2660)
- [`lucene-solr-user` mailing list thread](https://mail-archives.apache.org/mod_mbox/lucene-solr-user/201212.mbox/%3C50D41898.2040701@elyograg.org%3E)
