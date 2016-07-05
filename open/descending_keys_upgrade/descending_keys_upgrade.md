# RFC: Upgrade/Downdrade for Descending Keys

### Abstract

Supporting upgrade and downgrade in Riak TS in cases when the schema for data structures such as the DDLs change over versions, making them incompatible with what is stored in the types dets table, the metadata and what is sent and received from other nodes.

This proposal meets the requirements for upgrade and downgrade for descending keys but is intended to be a general mechanism.

### Glossary

* **DDL**, Data Definition Language. The data structure used by Riak TS to describe a table.

### Proposal

A node will internally support one version for all records, it will have one version of the table helper module, QL compiler and other components.

The node may need to upgrade or downgrade messages at the system edge as they are received or just before they are sent, based on the cluster capabilites.

##### DDL Version Capability

A riak_core capability will store the maximum DDL version that the cluster will support.

The DDL version is part of the record name as well e.g. `#ddl_v1{ }`.

##### Events on Capability Changes

When a node is downgraded, tables need to be disabled if they are not supported by the whole cluster. With descending keys, the table must be disabled because 

##### DDL Upgrade Function

Each change to the DDL in a release will require a DDL upgrade and downgrade function.  The upgrade function is used when a lower version of the DDL is received than what the receiving node can handle.

##### DDL Downgrade Function

The downgrade function is required when a node receives a DDL but the cluster capability is lower than what the compiler parses the SQL `CREATE TABLE` statement to.

1. `CREATE TABLE` request is received, the parser is version 2 so parses it to a `#ddl_v2` record.
2. The `ddl_version` cluster capability is 1 so the DDL is downgraded to version and stored in the metadata.
3. Locally, the `#ddl_v2` record is used.

##### On Node Upgrade

When a node is upgraded, it must use the upgade function to upgrade the DDL compiled dets table (`riak_kv_compile_tab`). Transforms are made one version at a time so upgrades from 1 to 3 will involve two upgrades.

Each version will be stored in the in the compiled table to be used in the case of downgrade.  This means that tables created in a higher version cannot be downgraded.

The DDL transform will be made on the DDL in the dets table. The DDL in the metadata should not be modified, setting it would propogate store events around the cluster.

##### On Node Downgrade

On a downgrade, the node should get the DDL from the compiled dets table for the version it is currently, that was compiled by the previous version of the node. Using the DDL it must delete the old helper module beams, purge them from the virtual machine, and recompile the DDL and load the new module.

If a DDL does not exist for the current version then the table is disabled and cannot be written to. To disable the table a special helper module with one function, `is_disabled/0` will be generated where the result is false. Tables that are enabled will also have the function which returns true. The function must be the first function that is called before requests are executed for the table in `riak_kv_ts_svc` and `riak_kv_vnode`.

This means that tables that were created on a higher version node cannot be used on a downgrade, even if the downgraded node supports them. When a table is created, should downgraded versions also be created so they can be used in this case? (discussion|downsides).

Downgrading fails when the DDL contains values which do not exist in the older version that are different from the default values. For example, the default ordering for descending keys fields is ascending. If `ASC` is explicitly specified in the `CREATE TABLE` statement then it can be safely downgraded, because it is equivalent to the default. If `DESC` was specified then the record could not be safely downgraded without losing data in the DDL.

On a node downgrade, the node must use DDLs with the version that it was compiled with. It will not be able to downgrade DDLs with a higher version because it does not understand the later record structures than it's own version.

### Scenarios

For descending keys upgrade, the version of the client isn't relevant because `CREATE TABLE` and `SELECT` both uses standard querying APIs which have not changed. Client version is not included.

##### Scenario 1

In this scenario a client talks to a new node in a mixed cluster.



### References

