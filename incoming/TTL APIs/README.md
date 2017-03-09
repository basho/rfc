# RFC: Combined TTL

### Abstract

We have two different methods for Global Expiry / TTL in upcoming KV and TS releases.
We should combine or clarify the settings if possible, before we confuse customers and ourselves.

### Background

In the upcoming releases of KV and TS we have different data expiry features being added, whose APIs could be improved.

##### 1\. Riak KV Sweeper Expiry

With the upcoming Sweeper changes to Riak KV 2.5, a user can set a per-object TTL through object or bucket properties. Sweeper's expiry module can then check for expired data, and delete the objects whenever sweeps are done (once a week usually).

When data is deleted, it will leave a tombstone in the AAE hashtree so that the expired data isn't resurrected. The tombstones is swept away at a later date once all replicas have been deleted and tombstoned.

The [TTL property](https://github.com/basho/riak_pb/blob/develop/src/riak_kv.proto#L237) on each object is an unsigned 32-bit integer that represents **seconds**, and it's value can range from **X** to **Y**.


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


While Sweeper operates using scheduled folds across the data, TS's Expiry uses LevelDB to do expiry.
LevelDB can expire/delete data at either an object, or whole LevelDB file level depending on the settings.

** MVM -  What triggers deletion? **


### Proposal

Although the two Expiry strategies have the same end-goals, the process by which they do it is different. They overlap in the KV + LevelDB + EE configuration space, but elsewhere they are independent of each other.

My minimum recommendation is to rename the bucket properties as such to avoid confusion:

| Product | Current Property Name | Proposed Property Name |
| - | - | - |
| Sweeper | `ttl` | `sweeper_ttl` |
| LevelDB | `expiration` | `leveldb_expiration` |
| LevelDB | `default_time_to_live` | `leveldb_ttl` |
| LevelDB | `expiration_mode` | `leveldb_expiration_mode` |

Another (harder) option would be to combine the APIs, but this would necessitate rework on both ends.  A combined bucket properties API would then look like:

| Product | Current Property Name | Combined Property Name |
| - | - | - |
| Sweeper | `ttl` | `ttl` |
| LevelDB | `expiration` | `expiration` |
| LevelDB | `default_time_to_live` | `ttl` |
| LevelDB | `expiration_mode` | `expiration_mode` |

Notes:
 - LevelDB's TTL time period setting changes from a string to an integer, which would change that setting in the other locations for LevelDB (see [LevelDB Expiry API](https://github.com/basho/leveldb/wiki/mv-bucket-expiry2#three-properties-three-names-each)). A value of `0` could be the new `unlimited`.  
 - We would need a new `sweeper` setting for the existing LevelDB `expiration_mode` enum for the overlap case. Sweeper would then need to check for this while sweeping.

This second case is harder to do with the looming releases of KV and TS, but does result in a more straightforward and global API for global expiry.


### Performance Considerations

Sweeper would need to also lookup the mode for a bucket/object when sweeping for expired data. Unknown impact.

### References

<Links to existing projects or source code; external references>

- [Sweeper Bucket Property TTL](https://github.com/basho/riak_pb/blob/develop/src/riak.proto#L151-L152)
- [Sweeper RiakObject's Content TTL](https://github.com/basho/riak_pb/blob/develop/src/riak_kv.proto#L237)
- [TS LevelDB Expiry API](https://github.com/basho/leveldb/wiki/mv-bucket-expiry2#three-properties-three-names-each)
