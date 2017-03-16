# RFC: TTL API Changes

### Abstract

We have two different methods for Global Expiry / TTL in upcoming KV and TS releases.
We should combine or clarify the settings if possible, before we confuse customers and ourselves.

### Background

In the upcoming releases of KV and TS we have different data expiry features being added, whose APIs could be improved.

##### 1\. Riak KV Sweeper Expiry

With the upcoming Sweeper changes to Riak KV 2.5, a user can set a per-object TTL through object or bucket properties. Whenever sweeps are done, an expiry module for Sweeper can check and expire objects.

###### Configuration
How often Sweeper sweeps are run is controlled by the `obj_ttl.sweep_interval` riak.conf/cuttlefish property, which is a cuttlefish duration string.

>A cuttlefish duration string consists of series of one or more number/suffix combinations.  Example: "2d7h32m" is two days, 7 hours, and 32 minutes.  The code converts that example string to 3,332 minutes.  The number must be a whole number, no decimal fractions.  The valid suffixes are "f" (fortnight), "w" (week), "d" (day), "h" (hour), and "m" minute.

TTL can be set via a [Bucket Type / Bucket property](https://github.com/basho/riak_pb/blob/develop/src/riak.proto#L151-L152) named `ttl`.
TTL can also be set per-object via a [RiakObject::Content:ttl property](https://github.com/basho/riak_pb/blob/develop/src/riak_kv.proto#L237).  Both of these properties represent **seconds** of time, and their values can range from **0** (immediate expiry) to **2^32**.

Hierarchy - A `ttl` property on an individual object will override one in any parent bucket or bucket type properties. Similarly a `ttl` bucket property will override any `ttl` on it's parent bucket type properties.


###### Expiry Method
When a sweep is done, sweeper's expiry module will check to see if an object's `last_modified` time + `ttl` time is in the past, and therefore expired. If it is, Riak will do a local vnode delete of the data, and will also leave a special AAE Tombstone in the AAE hashtree so that the expired data isn't resurrected. The tombstones are swept away at a later date when next hashtree rebuild occurs. This two stage expiry process helps to avoid resurrected objects while Riak interacts with AAE and MDC.


##### 2\. LevelDB Global Expiry (KV EE and TS EE)

Another upcoming change is "LevelDB Global Expiry" (**LGE**) in Riak KV EE and Riak TS EE.
It can be used to set a TTL and expire data in Riak TS Tables, Riak KV Bucket Types/Buckets that exist on LevelDB backends.

###### Configuration
LGE has three control properties available within Riak's `riak.conf` file:

<table>
  <tr><th>Property name</th><th>Default</th><th>Usage</th></tr>
  <tr><td>leveldb.expiration</td><td>off</td><td>"on" to enable expiry subsystem, <br>"off" to disable</td></tr>
  <tr><td>leveldb.expiration.retention_time</td><td>0 (zero)</td><td>0 to disable expiry based upon how long since last written, <br>or duration from write time to expiration, <br> or "unlimited" to mark records with expiry information but no time limit</td></tr>
  <tr><td>leveldb.expiration.mode</td><td>whole_file</td><td>"whole_file" to enable leveldb to removed entire files of expired records without compaction, <br>"normal" to require compaction processing to remove expired records</td></tr>
</table>

**Note:**  The leveldb.expiration property within riak.conf is a "master switch".  It must be "on" to enable any bucket specific properties. Leveldb ignores all bucket specific expiry properties if leveldb.expiration is set to "off" within riak.conf.


LGE also exposes these expiry properties on Bucket Type and Bucket properties for more fine grain control:

<table>
  <tr><th>Bucket Type / Bucket Properties</th><th>Values</th></tr>
  <tr><td>expiration</td><td>enabled / disabled</td></tr>
  <tr><td>default_time_to_live</td><td>"unlimited" or a cuttlefish duration string</td></tr>
  <tr><td>expiration_mode</td><td>"use_global_config" / "per_item" / "whole_file"</td></tr>
</table>

Notes:
 - The top level `expiration` flag can only be changed through a  `riak.conf` file change, and it is a read-only bucket property. It is a master switch that turns LevelDB's expiry on or off, and overrules any bucket type / bucket property settings.
 - The `expiration_mode` property can override the default value in the `riak.conf` file.
 - Setting `expiration_mode` to `whole_file` will let LevelDB remove entire files of expired records without compaction.
 - Setting `expiration_mode` to `per_item` will require LevelDB to do a compaction on the data file to remove expired records.

###### Expiry Method

While Sweeper operates using scheduled folds across the data, TS's Expiry uses LevelDB to perform the expiry. Whenever someone requests an expired object via Get or Query operations, LevelDB will check the expiration date, and treat the object as a "virtual" LevelDB tombstone if it's past that date. Deletion of the object then occurs during regular compactions.

LevelDB can also expire/delete data at either an object, or a whole LevelDB file level depending on the settings.

The [current LevelDB expiry implementation and bucket type proposal](https://github.com/basho/leveldb/wiki/mv-bucket-expiry2#three-properties-three-names-each) uses different values and periods for the TTL on the LevelDB object, and the TTL for the bucket property.  The LevelDB object TTL uses a `uint64` that represents **milliseconds**, and the bucket property TTL uses a `string` that represents a shorthand [cuttlefish "duration" time string](https://github.com/basho/cuttlefish/blob/develop/src/cuttlefish_duration.hrl). There is another intermediary setting that is for the `leveldb::ExpiryModuleOS` that uses minutes for it's ttl setting, the aptly named `expiry_minutes`.  

### Proposal

Although the two Expiry strategies have the same end-goals, the process by which they do it is different.
They overlap in the KV + LevelDB + EE configuration space, but elsewhere they are independent of each other.

###### Option 1 - Differentiate and regulate
My minimum recommendation is to rename the bucket properties as following to avoid confusion,
and to change the TTL's "type" in the bucket type / bucket properties and the `riak.conf` file
to a "cuttlefish duration" string for API consistency.

Under the covers, the Riak objects or LevelDB objects can use either "seconds" or "milliseconds" resolution for storing any TTL data, whichever each currently uses.  

| Product | Current Bucket Property Name | Proposed Bucket Property Name    | Current Type               | Proposed Type |
| ----    | ----                         | ----                             | ----                       | ---- |
| Sweeper | `ttl`                        | **sweeper_default_time_to_live** | uint32                     | **cuttlefish_duration string** |
| LevelDB | `expiration`                 | **leveldb_expiration**           | boolean                    | boolean |
| LevelDB | `default_time_to_live`       | **leveldb_default_time_to_live** | cuttlefish_duration string | cuttlefish_duration string |
| LevelDB | `expiration_mode`            | **leveldb_expiration_mode**      | enum                       | enum |

| Product | Current riak.conf Property Name | Proposed riak.conf Property Name | Current Type |
| ---- | ---- | ---- | ---- |
| Sweeper | `obj_ttl.sweep_interval`            | `obj_ttl.sweep_interval` | cuttlefish_duration string |
| LevelDB | `leveldb.expiration.retention_time` | **leveldb.expiration.default_time_to_live** | cuttlefish_duration string |


<br>
<br>


###### Option 2 - Combine
Another (harder) option would be to combine the APIs, but this would necessitate rework on both ends.  A combined bucket properties API would then look like:

| Product | Current Property Name | Combined Property Name | Current Type               | Proposed Type |
| ---- | ---- | ---- | ---- | ---- |
| Sweeper | `ttl`                  | **default_time_to_live** | uint32                     | **cuttlefish_duration string** |
| LevelDB | `expiration`           | **expiration**           | boolean                    | boolean |
| LevelDB | `default_time_to_live` | **default_time_to_live** | cuttlefish_duration string | cuttlefish_duration string |
| Both?   | `expiration_mode`      | **expiration_mode**      | enum                       | enum |


| Product | Current riak.conf Property Name | Proposed riak.conf Property Name | Current Type |
| ---- | ---- | ---- | ---- |
| Sweeper | `obj_ttl.sweep_interval`            | `obj_ttl.sweep_interval` | cuttlefish_duration string |
| LevelDB | `leveldb.expiration.retention_time` | **leveldb.expiration.default_time_to_live** | cuttlefish_duration string |

Notes:
  - This is very similar to Option 1's properties, but we have a combined `default_time_to_live` property, and a shared `expiration_mode` property.
  - We would need to merge the codebases together, or at least code them in tandem to make this option happen.
  - We would need a new `sweeper` value for the existing LevelDB `expiration_mode` enum for the overlap case. Sweeper would then need to check for this and for the `expiration` boolean before sweeping.
  - We would also need to change the type of the TTL property on both ends to `cuttlefish_duration string`.

This second case is harder to do with the looming releases of KV and TS, but does result in a more straightforward and global API for global expiry.


###### Open Questions
1. What happens if the two expiry methods are both enabled in the overlap case of Riak KV EE/ LevelDB-backed bucket-type?

> Doug: To be clear, if the bucket is stored in a leveldb backend and has leveldb expiry turned on, it should (perhaps) not expire the object... this again argues for making sure we understand the different use cases and making sure that an end-user can use one, or both, of the expiration options depending on their particular needs. I could imagine using Sweeper expiry in cases were MDC was used, but also using LevelDB expiry as a "fallback" mechanism (or to eliminate the need for the tombstone reaper part of Sweeper - simply write the tombstone with a leveldb expiry of the tombstone grace period and let Level compact it away when it's supposed to go away, for example).

> Alex: We could add a `Sweeper` option to the `expiration_mode` bucket-type/bucket property in the case of overlap, but we'd still need to define a *clear default*.  Unlike our write-once path with it's random "write-twice if the 2nd object's hash it bigger", I don't want random expiry.  


### Performance Considerations

Sweeper would need to also lookup the mode for a bucket/object when sweeping for expired data. Minimum impact.

### References

<Links to existing projects or source code; external references>

- [Sweeper Bucket Property TTL](https://github.com/basho/riak_pb/blob/develop/src/riak.proto#L151-L152)
- [Sweeper RiakObject's Content TTL](https://github.com/basho/riak_pb/blob/develop/src/riak_kv.proto#L237)
- [TS LevelDB Expiry API](https://github.com/basho/leveldb/wiki/mv-bucket-expiry2#three-properties-three-names-each)
- [Cuttlefish Duration Format](https://github.com/basho/cuttlefish/blob/develop/src/cuttlefish_duration.hrl)
