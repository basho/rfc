# RFC: TTL API Changes

### Abstract

We have two different methods for Global Expiry / TTL in upcoming KV and TS releases.
We should combine or clarify the settings if possible, before we confuse customers and ourselves.

### Background

In the upcoming releases of KV and TS we have different data expiry features being added, whose APIs could be improved.

##### 1\. Riak KV Sweeper Expiry

With the upcoming Sweeper changes to Riak KV 2.5, a user can set a per-object TTL through object or bucket properties. Sweeper's expiry module can then check for expired data, and delete the objects whenever sweeps are done.  How often sweeps are done is controlled by the `obj_ttl.sweep_interval` riak.conf/cuttlefish property.

When data is deleted, it will leave a tombstone in the AAE hashtree so that the expired data isn't resurrected. The tombstones is swept away at a later date when next hashtree rebuild occurs. This two stage expiry process helps to avoid resurrected objects while Riak interacts with AAE.

The [TTL property](https://github.com/basho/riak_pb/blob/develop/src/riak_kv.proto#L237) on each object is an unsigned 32-bit integer that represents **seconds**, and it's value can range from **0** (immediate expiry) to **2^32**.


##### 2\. LevelDB "Bucket" Expiry (KV EE and TS EE)

Another upcoming change is "LevelDB Bucket Expiry" in Riak KV EE and Riak TS EE.
It can be used to set a TTL and expire data in Riak TS Tables, Riak KV Bucket Types/Buckets that exist on LevelDB backends.

An operator can set global TTL properties in a node's `riak.conf` file, and also set/override them for specific bucket types & buckets with corresponding bucket type & bucket properties:

<table>
  <tr><th>Bucket Properties</th><th>Values</th></tr>
  <tr><td>expiration</td><td>enabled / disabled</td></tr>
  <tr><td>default_time_to_live</td><td>"unlimited" or a duration string</td></tr>
  <tr><td>expiration_mode</td><td>"use_global_config" / "per_item" / "whole_file"</td></tr>
</table>

>A duration string consists of series of one or more number/suffix combinations.  Example: "2d7h32m" is two days, 7 hours, and 32 minutes.  The code converts that example string to 3,332 minutes.  The number must be a whole number, no decimal fractions.  The valid suffixes are "f" (fortnight), "w" (week), "d" (day), "h" (hour), and "m" minute.

Notes:
 - The `expiration` property can only be changed through a  `riak.conf` file change, and it is a read-only bucket property.
 - The `expiration_mode` property can override the default value in the `riak.conf` file.
 - Setting `expiration_mode` to `whole_file` will let LevelDB remove entire files of expired records without compaction.
 - Setting `expiration_mode` to `per_item` will require LevelDB to do a compaction on the data file to remove expired records.


While Sweeper operates using scheduled folds across the data, TS's Expiry uses LevelDB to do expiry. Tombstoning happens whenever someone requests expired data via Get or Query operations, and deletion occurs during regular compactions.

LevelDB can also expire/delete data at either an object, or a whole LevelDB file level depending on the settings.

The [current LevelDB expiry implementation and bucket type proposal](https://github.com/basho/leveldb/wiki/mv-bucket-expiry2#three-properties-three-names-each) uses different values and periods for the TTL on the object, and the TTL for the bucket property.  The object TTL uses a `uint64` that represents **milliseconds**, and the bucket property TTL uses a `string` that represents a shorthand time string. There is another intermediary setting that is for the `leveldb::ExpiryModuleOS` that uses minutes for it's ttl setting, the aptly named `expiry_minutes`.  

### Proposal

Although the two Expiry strategies have the same end-goals, the process by which they do it is different. They overlap in the KV + LevelDB + EE configuration space, but elsewhere they are independent of each other.

###### Option 1 - Differentiate and regulate
My minimum recommendation is to rename the bucket properties as following to avoid confusion, and to change the TTL's "type" in the API to a `uint32` type that represents  **seconds** for API consistency:

| Product | Current Bucket Property Name | Proposed Bucket Property Name | Current Type | Proposed Type | Current Quantum | Proposed Quantum |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Sweeper | `ttl` | `sweeper_ttl` | uint32 | uint64 | minutes | **seconds** |
| LevelDB | `expiration` | `leveldb_expiration` | boolean | boolean | | |
| LevelDB | `default_time_to_live` | `leveldb_ttl` | string | **uint32** | milliseconds | **seconds** |
| LevelDB | `expiration_mode` | `leveldb_expiration_mode` | enum | enum | | | |

| Product | riak.conf Property Name | Current Type | Proposed Type |
| ---- | ---- | ---- | ---- |
| LevelDB | `leveldb.expiration` | ??? | **uint32 representing seconds** |

There may be riak.conf changes for sweeper configuration, but I could not find any documentation.
<br>
<br>

###### Option 2 - Combine
Another (harder) option would be to combine the APIs, but this would necessitate rework on both ends.  A combined bucket properties API would then look like:

| Product | Current Property Name | Combined Property Name |
| ---- | ---- | ---- |
| Sweeper | `ttl` | `ttl` |
| LevelDB | `expiration` | `expiration` |
| LevelDB | `default_time_to_live` | `ttl` |
| LevelDB | `expiration_mode` | `expiration_mode` |

Notes:
 - LevelDB's TTL time period setting changes from a string to an integer, which would change that setting in the other locations for LevelDB (see [LevelDB Expiry API](https://github.com/basho/leveldb/wiki/mv-bucket-expiry2#three-properties-three-names-each)). A value of `0` could be the new `unlimited`.  
 - We would need a new `sweeper` value for the existing LevelDB `expiration_mode` enum for the overlap case. Sweeper would then need to check for this and for the `expiration` boolean before sweeping.
 - We would also need to change the type of the TTL property on both ends to `uint64`.

This second case is harder to do with the looming releases of KV and TS, but does result in a more straightforward and global API for global expiry.


### Performance Considerations

Sweeper would need to also lookup the mode for a bucket/object when sweeping for expired data. Unknown impact.

### References

<Links to existing projects or source code; external references>

- [Sweeper Bucket Property TTL](https://github.com/basho/riak_pb/blob/develop/src/riak.proto#L151-L152)
- [Sweeper RiakObject's Content TTL](https://github.com/basho/riak_pb/blob/develop/src/riak_kv.proto#L237)
- [TS LevelDB Expiry API](https://github.com/basho/leveldb/wiki/mv-bucket-expiry2#three-properties-three-names-each)
