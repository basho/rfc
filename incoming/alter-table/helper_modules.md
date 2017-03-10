# Helper Modules

## Introduction

This document is part of the ALTER TABLE RFC

Please read the overview material in [Main RFC](./README.md)

This section of the RFC covers the changes to the helper modules

## Background

The helper modules are generated on a per-table basis and encapsulate the structured nature of TS data.

This is the current functionality they expose:
```erlang
    %%% Generated Module, DO NOT EDIT
    %%% 
    %%% Validates the DDL
    %%% 
    %%% Table         : timeseries_filter_test
    %%% Fields        : [{riak_field_v1,<<"geohash">>,1,varchar,false},
    %%%                  {riak_field_v1,<<"user">>,2,varchar,false},
    %%%                  {riak_field_v1,<<"time">>,3,timestamp,false},
    %%%                  {riak_field_v1,<<"weather">>,4,varchar,false},
    %%%                  {riak_field_v1,<<"temperature">>,5,varchar,true}]
    %%% Partition_Key : {key_v1,[{hash_fn_v1,riak_ql_quanta,quantum,
    %%%                                      [{param_v1,[<<"time">>]},15,s],
    %%%                                      undefined}]}
    %%% Local_Key     : {key_v1,[{param_v1,[<<"time">>]},{param_v1,[<<"user">>]}]}
    %%% 
    %%% 
    -module('riak_ql_table_timeseries_filter_test$1').
    
    -export([validate_obj/1, add_column_info/1,
    	 get_field_type/1, is_field_valid/1, extract/2,
    	 get_ddl/0]).
    
    validate_obj({Var1_geohash, Var2_user, Var3_time,
    	      Var4_weather, Var5_temperature})
        when Var5_temperature =:= [] orelse
    	   is_binary(Var5_temperature),
    	 is_binary(Var4_weather),
    	 is_integer(Var3_time) andalso Var3_time > 0,
    	 is_binary(Var2_user), is_binary(Var1_geohash) ->
        true;
    validate_obj(_) -> false.
    
    add_column_info({Var1_geohash, Var2_user, Var3_time,
    		 Var4_weather, Var5_temperature}) ->
        [{<<"geohash">>, Var1_geohash}, {<<"user">>, Var2_user},
         {<<"time">>, Var3_time}, {<<"weather">>, Var4_weather},
         {<<"temperature">>, Var5_temperature}].
    
    extract(Obj, [<<"geohash">>]) when is_tuple(Obj) ->
        element(1, Obj);
    extract(Obj, [<<"user">>]) when is_tuple(Obj) ->
        element(2, Obj);
    extract(Obj, [<<"time">>]) when is_tuple(Obj) ->
        element(3, Obj);
    extract(Obj, [<<"weather">>]) when is_tuple(Obj) ->
        element(4, Obj);
    extract(Obj, [<<"temperature">>]) when is_tuple(Obj) ->
        element(5, Obj).
    
    get_field_type([<<"geohash">>]) -> varchar;
    get_field_type([<<"user">>]) -> varchar;
    get_field_type([<<"time">>]) -> timestamp;
    get_field_type([<<"weather">>]) -> varchar;
    get_field_type([<<"temperature">>]) -> varchar.
    
    is_field_valid([<<"geohash">>]) -> true;
    is_field_valid([<<"user">>]) -> true;
    is_field_valid([<<"time">>]) -> true;
    is_field_valid([<<"weather">>]) -> true;
    is_field_valid([<<"temperature">>]) -> true;
    is_field_valid([<<"*">>]) -> true;
    is_field_valid(_) -> false.
    
    get_ddl() ->
        {ddl_v1, <<"timeseries_filter_test">>,
         [{riak_field_v1, <<"geohash">>, 1, varchar, false},
          {riak_field_v1, <<"user">>, 2, varchar, false},
          {riak_field_v1, <<"time">>, 3, timestamp, false},
          {riak_field_v1, <<"weather">>, 4, varchar, false},
          {riak_field_v1, <<"temperature">>, 5, varchar, true}],
         {key_v1,
          [{hash_fn_v1, riak_ql_quanta, quantum,
    	[{param_v1, [<<"time">>]}, 15, s], undefined}]},
         {key_v1,
          [{param_v1, [<<"time">>]}, {param_v1, [<<"user">>]}]}}.
    
```

## Structure Of This Document

First up the document will discuss the experimental results on raising the no of columns in a table.


Then this document discusses each of the function commands in order. The first function to be discussed (`validate_obj`) will be discussed in the most detail - as the implications from it flow through to the rest.

Finally it makes suggestions on how the UX can be aligned with the technical issues to ensure that a performant and usable system can be designed.

## Limitations On Column Numbers

There are two bottlenecks:
* guards on function heads
* `erl_lint`

### Guards On Function Heads

The number of guards that a function head can have currently limits the size of the table.

This is easily remedied.

The problem is with clauses like this as the number of guards increases:
```erlang
validate_obj({Var1_geohash, Var2_user, Var3_time,
              Var4_weather, Var5_temperature})
        when Var5_temperature =:= [] orelse
           is_binary(Var5_temperature),
         is_binary(Var4_weather),
         is_integer(Var3_time) andalso Var3_time > 0,
         is_binary(Var2_user), is_binary(Var1_geohash) ->
        true;
    validate_obj(_) -> false.
```
By converting the `tuple` to a list and then matching the first 400 columns, before calling a `validate_obj2` on the `Rest` and recursing down in chuncks of 400 the limit can be lifted.

### `erl_lint`

Examination of the code that creates the helper module and simple instrumenting shows where the problem lies:

```erlang
compile(?DDL{ table = Table, fields = Fields } = DDL) ->
    {ModName, Attrs,   LineNo} = make_attrs(Table, ?LINENOSTART),
    {VFns,             LineNo2}  = build_validn_fns(Fields,    LineNo),
    {ACFns,            LineNo3}  = build_add_cols_fns(Fields,  LineNo2),
    {ExtractFn,        LineNo4}  = build_extract_fn(DDL,       LineNo3),
    {GetTypeFn,        LineNo5}  = build_get_type_fn([Fields], LineNo4, []),
    {GetPosnFn,        LineNo6}  = build_get_posn_fn(Fields,   LineNo5, []),
    {GetPosnsFn,       LineNo7}  = build_get_posns_fn(Fields,  LineNo6, []),
    {IsValidFn,        LineNo8}  = build_is_valid_fn(Fields,   LineNo7),
    {DDLVersionFn,     LineNo9}  = build_get_ddl_compiler_version_fn(LineNo8),
    {GetDDLFn,         LineNo10} = build_get_ddl_fn(DDL,        LineNo9, []),
    {HashFns,          LineNo11} = build_identity_hash_fns(DDL, LineNo10),
    {FieldOrdersFn,    LineNo12} = build_field_orders_fn(DDL,   LineNo11),
    {RevertOrderingFn, LineNo13} = build_revert_ordering_on_local_key_fn(DDL, LineNo12),
    {MinDDLCapFn,      LineNo14} = build_min_ddl_version_fn(DDL, LineNo13),
    {DeleteKeyFn,      LineNo15} = build_delete_key_fn(DDL, LineNo14, []),
    {AdditionalLocalKeyFn, LineNo16} = build_additional_local_key_fields_fn(DDL, LineNo15),
    AST = Attrs
        ++ VFns
        ++ ACFns
        ++ [ExtractFn, GetTypeFn, GetPosnFn, GetPosnsFn, IsValidFn, DDLVersionFn,
            GetDDLFn, FieldOrdersFn, RevertOrderingFn, MinDDLCapFn, DeleteKeyFn,
            AdditionalLocalKeyFn]
        ++ HashFns
        ++ [{eof, LineNo16}],
    case erl_lint:module(AST) of
        {ok, []} ->
            {ModName, AST};
        Other ->
            exit(Other)
    end.
```

You will see that we call `erl_lint:module(AST)` on the generated AST file - this checks that the compilation process has generated a valid Erlang programme (well a valid Abstract Syntax Tree, but "You get the picture? yes we see" https://open.spotify.com/track/3GmQBCSYmD0Bh4O0mky3gD).

This is a moderately tenditious function call - effectively a test that we run in production code. Turns out that `erl_lint:module` behaves badly as you create more and more monstrous function calls with inhuman quantities of guards and stuff. Now in theory we could simply remove that line and get better performance of the DDL compiler - the test suite is pretty good - simple call.

I haven't investigated the `erl_lint` module but I am betting that the the problem is down to multi-pass traverses of deeply nested data structures - this might be a problem that is simply fixed and results in a PR to upstream.

As we drive into the realm of modules that could not, nor ever will be written manually by developers it behooves me to point out that, as the medieval mapmaker put it, *in his locis scorpiones nascuntur* - in this place scorpions are born - the behaviour of the Erlang compiler is likely to be tested in ways as yet unknown.

There is another unexpected consquence. We can generate an `AST` which we can compile into `op codes` and a `beam`, and then load and execute that `beam`. Tickety-boo! But if we take that `AST` and convert it into Erlang code the module will not compile (because the compiler uses `erl_lint:module` or another function that has the same performance characteristics is the current working assumption).

## The `validate_obj` Function

There are two paths to go down with the function depending on the on-disk format:
 * current data format (and future formats 1 and 2)
 * future format 3

### Using The Current Data Format

This case also covers Future Formats 3 in the on-disk section of this RFC:
[On Disk Format](./on_disk_format.md/#)

Let us start from the assumption that this helper function represents V1 of the table definition. The SQL representation of the table is:
```sql
CREATE TABLE timeseries_filter_test
(
	geohash     VARCHAR   NOT NULL,
	user        VARCHAR   NOT NULL,	
	time        TIMESTAMP NOT NULL,
	weather     VARCHAR   NOT NULL,	
	temperature VARCHAR,
	PRIMARY KEY (
		(quantum(time, 15, 's'),
		time, user)
	)
);
```

Let us image that for V2 we add a field called `humidity` as a `double` with a syntax like:
```sql
ALTER TABLE timeseries_filter_test ADD COLUMN humidity DOUBLE;
```

This would result in the creation of a function on the helper module like this:
```erlang
%% Do nothing path
upgrade_downgrade(Version, Version, Obj) -> Obj;
%% upgrade path
upgrade_downgrade(From, To, Obj) where From = v1 and To = v2 ->
    erlang:insert_element(1, null, Obj);
%% downgrade path
upgrade_downgrade(From, To, Obj) where From = v2 and To = v1 ->
    list_to_tuple(tl(tuple_to_list)).
```

It follows from this that adding columns would prepend a new column (for convenience of working at the head) giving a new table definition of:
```sql
CREATE TABLE timeseries_filter_test
(
    humidity    DOUBLE,
    geohash     VARCHAR   NOT NULL,
    user        VARCHAR   NOT NULL, 
    time        TIMESTAMP NOT NULL,
    weather     VARCHAR   NOT NULL, 
    temperature VARCHAR,
    PRIMARY KEY (
        (quantum(time, 15, 's'),
        time, user)
    )
);
```

A corollary of this is that if you with a new column to be `NOT NULL` you need to supply a default value:
```sql
ALTER TABLE timeseries_filter_test ADD COLUMN humidity DOUBLE NOT NULL DEFAULT 22.0;
```

There need to be corresponding changes to the `CREATE TABLE` as well otherwise you will not be able to upgrade the record:
```sql
humidity DOUBLE NOT NULL DEFAULT 22.0,
```

The process of deleting a column will work similary, although the code to delete an interstitial value from a tuple will be appropriately complex:
```sql
ALTER TABLE timeseries_filter_test DELETE COLUMN time;
```

Leading to:
```erlang
%% Do nothing path
upgrade_downgrade(Version, Version, Obj) -> Obj;
%% upgrade path
upgrade_downgrade(From, To, Obj) where From = v1 and To = v2 ->
    erlang:insert_element(1, null, Obj);
upgrade_downgrade(From, To, Obj) where From = v2 and To = v3 ->
    Fields = tuple_to_list(Obj),
    {Head, Tail} = lists:split(4, Fields),
    list_to_tuple(Head ++ tl(Tail));
%% downgrade path
upgrade_downgrade(From, To, Obj) where From = v2 and To = v1 ->
    list_to_tuple(tl(tuple_to_list)).
upgrade_downgrade(From, To, Obj) where From = v3 and To = v2 ->
    list_to_tuple(tl(tuple_to_list)).
    Fields = tuple_to_list(Obj),
    {Head, Tail} = lists:split(3, Fields),
    list_to_tuple(lists:flatten([Head, [null], Tail));
```

This in turn leads to a problem as shown above. The downgrade from Version 3 to 2 requires the creation of a record with an additional value - which must be supplied. Here we add 'NULL' but the record definition states that `time` is `NOT NULL`.

There are two options to this:
* violate the `NOT NULL` constraint on downgrade after column deletion
* make `NOT NULL` columns undeletable

There are some problems with this approach. They relate to combinatorial explosion. If we do 'fast' transformations that is there is a upgrade/downgrade function for every transition - the number of function clauses in the upgrade/downgrade function goes as `2n(n - 1) + 1` where `n` is the number of versions.

However for each function head in `validate_obj` there is a corresponding function head in `validate_obj2` and `validate_obj3` - with a chunk size of 400, these functions would go all the way to `validate_obj7`

So for a 3,000 column table, if each column were added singly leading to 3,000 versions the function would have 143,952,008 function heads. There is a hard limit here - unquantified but real - that would kill this approach.

The other approach to take is the step-wise downgrade. So instead of converting:
```
v3012 -> v2887
```

we would do a series of stepwise transforms:
```
v3012 -> v3011 -> v3010 -> ... v2888 -> v2887
```

For a 'append columns to the front' approach this is actually quite an efficient method. However for `DELETE COLUMN` it would involve a partial list traverse for each delete - as shown by the `list:split` in the example code.

The function clauses would simple go as `2*N + 1` giving 6,001 for a 3,000 wide column - more managable, but still large.

A hybrid approach could be taken - effectively block partitioning the transform matrix. In this world the steps taken would be:
```
v3012 -> v3011 -> v3010 -> v3000 -> v2900 -> v2890 -> v2889 -> v2888 -> v2887
```

The 'big steps' could be optimised as appropriately. In this particular case 'big steps are 10 and 100, and the number of function cases would be expressed as `2*N + 2*trunc(N/10) + 2*trunc(N/100) + 1`. Again this would need a chunk-size calculation applied to it.

You could trade off speed of stepping Vs size of function heads.

The choice of a particular strategy is not fixed - it could be triggered by heuristics, a hint applied as a table property. These transforms are generated from an underlying data structure and can be regenerated at will with different seek and size characteristics.

In this implementation the chunking algo is homogenous - but it could be shaped, so if 99% of your data is between versions 2500 and 3000 you could use 1000 step chunks for versions lower than 2000, then 100 steps for v2000 to v2500 and so on and so forth.

### Using the Future Format 3 (from on disk)

If you use the Future Format 3 things are different:
[On Disk Format](./on_disk_format.md/#)

This is how it looks on disk:
```
                Key                                                      Value
---------------------------------  ------------------------------------------------------------------------------------------
{b, {Geo, Geo}, v2},               {region, {VARCHAR, NOT NULL}}, {state, {VARCHAR, NOT NULL}, {time, {timestamp, NOT NULL}},
                                   {weather, {VARCHAR}},  {temp, {double}}}
{o, {Geo, Geo}, {South, FL, 400}}, riak_obj{{v2, {1, 2, 3, 4, 5}, {South, FL, 401, hot,  23.5}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{{v2, {1, 2, 3, 4}},   {South, FL, 402, warm}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{{v2, {1, 2, 3, 5},    {South, FL, 403, 22.5}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{{v2, {1, 2, 3, 4, 5}, {South, FL, 404, warm, 22.5}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{{v2, {1, 2, 3, 4, 5}, {South, FL, 405, hot,  25.0}}
```
In this world the upgrade/downgrade function signatures and implementation are slightly different:
```
upgrade_downgrade(From, To, Index, Obj) where From = v1 and To = v2 ->
    {_NewIndex, _NewObj} = mutate_state(Index, Obj, [
                                                     {delete, 543},
                                                     {add,    {3001, null}},
                                                     {add,    {3002, 43.2}
                                                    ]);
```

This has the same function head explosion as the other approach and the same traverse the same list many times problem - with the same mitigation. However for very sparse data the list of possible fields might be 3,000 whilst the list of actual fields is 25 long. This looks the most promising approach.

But it needs to be noted that this on-disk format needs to be threaded through the entire system as this function is called far upstream from the vnode - object validation happens at the edge inside the connection with the client - so clients would need to emit data in this index format to riak, or the `INSERT INTO` SQL statement will have to emit this format.

## The `add_column_info` Function

For a Current/Future Format 1 & 2 this would need to become a versioned function - with one function head for each version.

For Future Format 3 it would become obsolete - the writing of the column data being taken from a different function (which remains to be written). That function would in its turn have one function head for each version.

## The `extract`, `get_field_type` And The `is_field_valid` Functions

All of these need to be versioned. But the change is trivial.

If we used numerical versions these functions become a lost easier. The expectation is that most columns would have an enduring existance leading to putative clauses like:
```erlang
extract(Version, Obj, [<<"myfieldname">>]) when Version > 135 and Version < 2500 ->
```

## Other Consolidation Mechanisms

We make the assumption earlier that there is 1 version for every `ALTER TABLE` command. I think that would be a mistake. I think that `ALTER TABLE` should use a traditional riak `PLAN -> COMMIT` model. Something like this:

```sql
CREATE TABLE timeseries_filter_test
(
    geohash     VARCHAR   NOT NULL,
    user        VARCHAR   NOT NULL, 
    time        TIMESTAMP NOT NULL,
    weather     VARCHAR   NOT NULL, 
    temperature VARCHAR,
    PRIMARY KEY (
        (quantum(time, 15, 's'),
        time, user)
    )
);
ALTER TABLE timeseries_filter_test ADD COLUMN humdiity DOUBLE; -- bollix, bollix spelling mistake
ALTER TABLE timeseries_filter_test CLEAR CHANGES;
ALTER TABLE timeseries_filter_test ADD COLUMN humidity DOUBLE;
ALTER TABLE timeseries_filter_test ADD COLUMN pressure DOUBLE;
ALTER TABLE timeseries_filter_test DELETE COLUMN temperature
ALTER TABLE timeseries_filter_test COMMIT;
```

This pseudo-code would prepare a change with a spelling mistake `humdiity`, clear it, and start again. Leading to the v1 -> v2 transtion being adding 2 columns and deleting 1.

This approach would also need inspections commands:
```sql
ALTER TABLE timeseries_filter_test SHOW STAGED CHANGES;
ALTER TABLE timeseries_filter_test CLEAR CHANGE 3;
```

etc, etc. In other words a designed set of commands to enable the creation, review and management of changesets.

This approach alone would be likely to reduce the phase space for `ALTER TABLE` considerably - it seems unlikely to me that a customer would move the schema from 1 to 3,000 pointwise.

The same points about version stepping, and changing upgrade/downgrade strategies dynamically pertain to this model.

## UX Notes

Given that data, once written, is never deleted, this provides a fork in the road for us. There are two sets of behaviours that we can choose from a UX perspective. Consider the following `ALTER TABLE` sequence:
```sql
ALTER TABLE timeseries_filter_test ADD COLUMN pressure DOUBLE;
...
INSERT INTO timeseries_filter_test ....;
...
ALTER TABLE timeseries_filter_test DELETE COLUMN pressure;
ALTER TABLE timeseries_filter_test ADD COLUMN pressure DOUBLE;
```

We have two choices here adding a delete table can:
* **resurrect** the old data
* **create** a new empty column with the same name

It might make sense to offer both these options with a command like
```sql
ALTER TABLE timeseries_filter_test RESURECT COLUMN pressure;
```