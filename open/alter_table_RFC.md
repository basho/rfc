Alter Table RFC
---------------

This is an RFC for alter table operations:
* adding a column
* removing a column
* setting and changing the default value for a column

Purpose
-------

The purpose of this RFC is to layout the technical options for altering table definitions that have been created by a `CREATE TABLE` command in riak TS.

This is to be the smallest RFC that will inform the product team of the options for the customer facing work - it is not the definitive design document.

Scope
-----

The schematic process for the altering of a table definition is shown below:
```
                                                    riak_core MetaData
   SQL Command    lex/parse          new               distribution             compile to
  (CREATE TABLE)────────────▶  #ddl_VX{} record  ─────────────────────────▶ DDL helper module

                                       ▲
                                       │
    SQL Commands                       │
    (ADD COLUMN)       lex/parse       │
   (DELETE COLUMN) ──────────────┬─────┘
  (CHANGE DEFAULT)               │
                                 │
                                 │

                               old
                         #ddl_VX{} record
```

There is a lexer/parser chain which takes the existing `CREATE TABLE` commands and outputs a `#ddl_vX{}` record. When alter table is implemented there will be set of as yet unspecified commands which are shown here as `ADD COLUMN`, `DELETE COLUMN` and `CHANGE DEFAULT` which will also go through that lexer/parser pipeline resulting in outputs which, when combined with the previous version of the DDL record, will result in a new DDL. That aspect of the pipeline is **NOT IN SCOPE** for this RFC. This will be the subject of a Product Specification in the fullness of time.

That new DDL record is distributed around the ring using the riak_core metadata distribution mechanism - that mechanism and its amendment is **NOT IN SCOPE** for this RFC. This will be the subject of a Technical Design document at an appropriate juncture.

The scope of this RFC is what happens once multiple DDL definitions for a table are available on a particular node - how the compiler handles that - how the DDL helper module differs - and the options for data storage on disk.

Proposal - DDL Helper Module
----------------------------

The DDL compiler will consume the 'highest' version of the DDL and create a module that has the API as currently implemented. See the DDL documentation:
https://github.com/basho/riak_ql/blob/develop/docs/ddl_compiler.md

The exported API is:
```
-export([validate_obj/1, add_column_info/1,
         get_field_type/1, is_field_valid/1, extract/2,
         get_ddl/0]).
```

In this proposal the DDL compiler would also ingest the previous versions of the DDL and generate additional upgrade functions.

The actual implementation of the API will be up to the developer who implements the code - but the behaviour is rigidly specified.

Consider a DDL version 1 that has 3 fields:
* `mykey`
* `mytimestamp`
* `mypressure`

The first two fields are used to construct the partition and local keys as usual.

The version 2 adds a field `mytemperature` which is an optional field.

This means that the version 2 DDL would have an additional exported function:
```
-export([upgrade/3]).

upgrade(From, To, {MyKey, MyTimestamp, MyPressure}) when From = v1 andalso
	                                                     To   = v2 -> 
	{MyKey, MyTimestamp, MyPressure, []}.
```

An obvious extention would be to allow the user to specify that the column inserted has a default value. This would result in a function like:
```
upgrade(From, To, {MyKey, MyTimestamp, MyPressure}) when From = v1 andalso
	                                                     To   = v2 -> 
	{MyKey, MyTimestamp, MyPressure, 0.0}.
```
Where `0.0` is the default value specified for MyPressure which is a `double`. At the moment fields can only be defined as `NOT NULL` - using default values for upgrades should probably lead to an extension of default values for non-specified values at initial creation of the DDL. This is properly a question for the Product Team.

Deletion is the reverse process. Consider the v2 DDL we now wish to delete the column `MyPressure`. The DDL helper function would than have an upgrade function like:
```
upgrade(From, To, {MyKey, MyTimestamp, _MyPressure, MyTemperature}) when From = v2 andalso
	                                                                     To   = v3 -> 
	{MyKey, MyTimestamp, MyTemperature}.
```

To make defaults work an additional function will need to be added to the DDL helper module that replaces null values with a default.

If it is possible to change the defaults on a column (and the absence of `NOT NULL` indicates a default of `NULL` in this context) then that would appear as a change to the (new, unwritten) add defaults function - the upgrade function would then be an identity function:
```
upgrade(From, To, Tuple) when From = v3 andalso
	                          To   = v4 -> 
	Tuple.
```

It may be necessary to provide downgrade functions to cope with upgrade/downgrade - that will be determined when assessing the full technical design.

If you wish to convert the type of a column there are two options:
* it is a `DELETE COLUMN` followed by an `ADD COLUMN` in which case the old data would 'disappear'
* we allow type changes in situ and there are casting rules in place

In the second case consider if we change the value of `mytemperature` from a `double` to a `sint64`: the upgrade function would be:

```
upgrade(From, To, {MyKey, MyTimestamp, MyPressure, MyTemperature}) when From = v4 andalso
	                                                                    To   = v5 -> 
	{MyKey, MyTimestamp, MyPressure, float_to_integer(MyTemperature)}.
```

There would need to be a casting table along the lines of:
```
          │ boolean  │  sint64  │  double  │timestamp │ varchar  
──────────┼──────────┼──────────┼──────────┼──────────┼──────────
 boolean  │          │    X     │    X     │          │          
──────────┼──────────┼──────────┼──────────┼──────────┼──────────
  sint64  │    X     │          │    X     │    X     │          
──────────┼──────────┼──────────┼──────────┼──────────┼──────────
  double  │    X     │    X     │          │    X     │          
──────────┼──────────┼──────────┼──────────┼──────────┼──────────
timestamp │          │    X     │    X     │          │          
──────────┼──────────┼──────────┼──────────┼──────────┼──────────
 varchar  │          │          │          │          │          
```

These proposals assume that the data written to disk 'knows' what version of the table definition they were written with - either by having that written into each riak object - or using Matthew Von-Maszewski's proposal for tombstones in leveldb.

Proposal - Storage Compression
------------------------------

At the moment we store very prolix data on disk for Time Series:

We store the key as per a normal KV key - just extended with extra fields:
```
{BucketName, Family, Series, Timestamp}
```
But in the value (which is itself wrapped in a riak object) we store the column names alongside the values - and also store the elements that we know from the key
```
{{family, Family}, {series, Series}, {timestamp, Timestamp}, {field1, SomeVal}, {field2, AnotherVal}}
```

Removing the key positions and the column names to a lookup-table inside leveldb has been proposed by Matthew Von-Maszewski as this would reduce the amount of data on disk - and improve read and write performance as appropriate.

**Historical Note**: we were having the *store-column-names-with-data* **VS** *store-them-separately* debate when Engel Sanchez was leading the backend team - he was firmly a store-wither and when he buggered off I (knowing hee-haw about it) simply locked down all the decisions to stop us sinking into quicksand on the principle that you should never open a can of sleeping dogs...

Appendix - text of Matthew Von-Maszewski's email about `DROP TABLE` and `ALTER TABLE`
-------------------------------------------------------------------------------------

I have a proposal for implementing Drop Table, Truncate Table, and non-key related Alter Table operations.  The proposal is based upon recent code for expiry.  Specifically, expiry supports placing a timestamp within the record's key [1].  This timestamp within the key allows the new expiry module to compare bucket/bucket type properties relating to expiry policy to each key during Get, Iterate, and compaction operations and create a "dynamic, logical delete".  A TS based module using the same API could readily support Drop/Truncate/Alter operations with some Riak support.

The first concern with generating time stamps for the keys is clock skew.  A given vnode's data could end up via handoff on another server that has a skewed clock.  The vnode's data could be replicated to another data center's server that has a skewed clock.  The simplest solution is to write "master tombstones" that apply to the entire bucket/bucket type into every vnode.  The "master tombstones" would then have timestamps in their keys that are relative to the data of that vnode.  If the data moves to a different server, the activation time of the "master tombstone" stays relative to all the existing data of the same bucket/bucket type.

The new TS expiry module will keep a cache of "master tombstones" for recent buckets/bucket types requested.  Each Get, Iterate, and compaction operation will first validate that the record should be seen by the user before returning it.  The use of time stamps within the keys allows user to Create Table, Drop Table, Create Table, Drop Table, etc. repeatedly with intervening data operations and have zero wait time since the Drop Table is logical, not physical.

Alter Table is a bigger project, but highly necessary.  Today every TS record contains the schema of the data.  A sample 100 bytes of user data exploded to 300 bytes of data and schema written to leveldb.  Snappy compression within leveldb was able to reduce the 300 bytes to 98.  But still, this design has zero compression benefit to the end user.  My understanding is that the current design was a selected in a panic over how to keep multiple version of the schema and how to ship something yesterday.

The Alter Table proposal is to write a schema record at the time of each Create Table and Alter Table.  Again the record keys contain time stamp of when the schema record occurred.  All data records then have the implied schema of the most recent schema record that preceded the data record's write.  Again, caching of the schema records for Get and Iterate operations is implied.

(Unsaid, but related.  The new leveldb time stamp metadata in the keys is available at eleveldb, but not currently passed to or from Riak.  Therefore handoff and replication do not just magically work today.  Code is needed at the eleveldb layer to receive existing key stamps from Riak object properties, and conversely to populate Riak object properties as data moves out of eleveldb.  Just a simply matter of programming.)


Thoughts/questions/issues?


[1]  https://github.com/basho/leveldb/wiki/key-format
