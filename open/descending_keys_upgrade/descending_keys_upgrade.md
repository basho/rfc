# RFC: Upgrade/Downdrade for Descending Keys

### Abstract

Supporting upgrade and downgrade in Riak TS in cases when the schema for data structures such as the DDLs change over versions, making them incompatible with what is stored in the types dets table, the metadata and what is sent and received from other nodes.

This proposal meets the requirements for upgrade and downgrade for descending keys but is intended to be a general mechanism.

### Glossary

* **DDL**, Data Definition Language. The data structure used by Riak TS to describe a table.

### Proposal

A node will internally support one version for all records, it will have one version of the table helper module, QL compiler and other components.

The node may need to upgrade or downgrade messages at the system edge as they are received or just before they are sent, based on the cluster capabilites.

### Supporting Infrastructure

##### Check cluster supports ops on tables

DDL helper modules need a minimum capability, capability is checked against this values before operations are allowed.

Tables cannot be created if it requires features that is not supported by the capability of the cluster.

This must be checked for protobuff, term to binary and HTTP APIs.

##### DDL Upgrade Function

Each change to the DDL in a release will require a DDL upgrade and downgrade function.  The upgrade function is used when a lower version of the DDL is stored in the ring metadata than what the receiving node can handle.

This can happen when the cluster is running in a mixed version mode and a table is created in a lower version.

##### DDL Version Capability

A riak_core capability named `{riak_kv, riak_ql_ddl_rec_version}` will store the maximum DDL version that the cluster will support.

The DDL minimum version can be found by checking the DDL for the features that it uses. In the case of descending keys the key parameter records will be checked if the order is descending then the minimum version is `v2` because descending order cannot be represented in `v1`. If the order is ascending then the minimum version is `v1` because the default order is ascending so no data is lost.

##### DDL Downgrade Function

The downgrade function is required when a node receives a DDL in the ring metadata but the cluster capability is lower than what the compiler parses the SQL `CREATE TABLE` statement to.

1. `CREATE TABLE` request is received, the parser is version 2 so parses it to a `#ddl_v2` record.
2. The `ddl_version` cluster capability is 1 so the DDL is downgraded to version and stored in the metadata.
3. Locally, the `#ddl_v2` record is used.

##### DDL Compiler Versions

In Riak TS 1.4 there is a compiler version capability, the intention is that whenever a change is made to the compiler that this is incremented (the value is an integer).

In Riak TS 1.5 this is no longer used. The compiler version is taken from the `riak_ql_ddl_compiler` module's `vsn` attribute which is a MD5 checksum of the module. This version number appears in the module name for the table helper modules.

### On Node Upgrade

When a node is upgraded, it must use the upgrade function to upgrade the DDL in the `riak_kv_compile_tab` dets table. Transforms are made one version at a time so upgrades from v1 to v3 will involve two DDL upgrades.

Each version of the DDL that is upgraded e.g. v2 and v3 will be stored in the `riak_kv_compile_tab` dets table. This means that if a node needs to downgrade from v3 to v2 without ever having run this version before, the DDL is available and a table helper module can be created from it.

The DDL in the metadata should not be modified, modifying it would propogate store events around the cluster.

For Riak TS version 1.5, the `riak_kv_compile_tab` dets table schema changes, so a new dets table is created alongside the current one.  When a new DDL is stored then an attempt is made to downgrade the DDL to v1 and store it in the old table so that if a node downgrades to 1.4 from 1.5, tables created under 1.5 will still be available. When the 1.4 node is started it will see that DDLs exist in the table but compiled helper modules do not exist and will recompile them.

**WARNING:** this is not quite true!  Riak TS 1.4 will use the DDL from the ring metadata which will be a `ddl_v2{}` record for tables created under 1.5, and cannot be understood by 1.4.  A 1.4.1 patch may need to be released that uses the DDL from the compile dets table. When downgrading from 1.5 the customer downgrades to 1.4.1 even if they ran 1.4.0 before 1.5.

### On Node Downgrade

On a downgrade, the node should get the DDL from the compiled dets table for the version it is currently, that was compiled by the previous version of the node. Using the DDL it must delete the old helper module beams, purge them from the virtual machine, and recompile the DDL and load the new module.

If a DDL does not exist for the current version then the table is disabled and cannot be written to. To disable the table a special helper module with one function, `is_disabled/0` will be generated where the result is false. Tables that are enabled will also have the function which returns true. The function must be the first function that is called before requests are executed for the table in `riak_kv_ts_svc` and `riak_kv_vnode`.

This means that tables that were created on a higher version node cannot be used on a downgrade, even if the downgraded node supports them. When a table is created, should downgraded versions also be created so they can be used in this case? (discussion|downsides).

Downgrading fails when the DDL contains values which do not exist in the older version that are different from the default values. For example, the default ordering for descending keys fields is ascending. If `ASC` is explicitly specified in the `CREATE TABLE` statement then it can be safely downgraded, because it is equivalent to the default. If `DESC` was specified then the record could not be safely downgraded without losing data in the DDL.

On a node downgrade, the node must use DDLs with the version that it was compiled with. It will not be able to downgrade DDLs with a higher version because it does not understand the later record structures than it's own version.

### Scenarios

For descending keys upgrade, the version of the client isn't relevant because `CREATE TABLE` and `SELECT` both uses standard querying APIs which have not changed. Client version is not included.

