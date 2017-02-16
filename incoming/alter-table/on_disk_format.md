# On Disk Format

## Introduction

This document is part of the ALTER TABLE RFC

Please read the overview material in [Main RFC](./README.md)

## Background

The ALTER TABLE change is entangled with three proposals to have more aggressive compression of data in on disk formats:
* moving the schema data out of the record and into a header record
* moving away from storing `NULL`s for sparce data

It is also entangled with a proposal to improve data filtering which will be described here.

## Current Format

Consider a TS table created with the following SQL statement:
```
CREATE TABLE Geo
(
  region       VARCHAR   NOT NULL,
  state        VARCHAR   NOT NULL,
  time         TIMESTAMP NOT NULL,
  weather      VARCHAR,
  temp         DOUBLE,
  PRIMARY KEY (
    (region, state, QUANTUM(time, 15, 'm')),
    region, state, time
  )
);
```

Let us insert some records with sparse data (not that sparse, but sparse enough for our purposes):
```SQL
INSERT INTO Geo (region, state, time, weather, temp) VALUES ('South', 'FL', 401, 'hot', 23.5);
INSERT INTO Geo (region, state, time, weather)       VALUES ('South', 'FL', 402, 'warm');
INSERT INTO Geo (region, state, time, temp)          VALUES ('South', 'FL', 403, 22.5);
INSERT INTO Geo (region, state, time, weather, temp) VALUES ('South', 'FL', 404, 'warm', 22.5);
INSERT INTO Geo (region, state, time, weather, temp) VALUES ('South', 'FL', 405, 'hot', 25.0);
```

This is how the data is written on disk - in KV format:
```
                Key                                                      Value
---------------------------------  ------------------------------------------------------------------------------------------
{o, {Geo, Geo}, {South, FL, 400}}, riak_obj{null, {{region, South}, {state, FL}, {time, 401}, {weather, hot},  {temp, 23.5}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{null, {{region, South}, {state, FL}, {time, 402}, {weather, warm}, {temp, null}}
{o, {Geo, Geo}, {South, FL, 402}}, riak_obj{null, {{region, South}, {state, FL}, {time, 403}, {weather, null}, {temp, 22.5}}}
{o, {Geo, Geo}, {South, FL, 403}}, riak_obj{null, {{region, South}, {state, FL}, {time, 404}, {weather, warm}, {temp, 22.5}}}
{o, {Geo, Geo}, {South, FL, 404}}, riak_obj{null, {{region, South}, {state, FL}, {time, 405}, {weather, hot},  {temp, 25.0}}}
```

**NOTE**: A riak object contains metadata and I am ignoring all of this except a putative 'table version' - which currently doesn't exist which is why it is shown as `null`.

Currently the TS query system works by creating a table key scan which runs on the key space and then a query filter which is applied to the values.

Consider the query `SELECT * FROM Geo WHERE region = 'South', state = 'FL', time > 400 and time < 404 and temp > 20;`

This would generate the following query structure:
```
[
    {startkey, {o, {Geo, Geo}, {South, FL, 401}}},
    {endkey,   {o, {Geo, Geo}, {South, FL, 404}}},
    {startkey, not_inclusive}
    {filter, [{'>', temp, 20}
]
```
**NOTE**: this pseudo-code is a slightly simplified version of the output

The filter is applied inside the leveldb C++ code

## Future Format 1

The first proposal for a compressed format extracts the column names out of the data and into a seperate defintition record, here shown as a `b` class key:

```
                Key                                                      Value
---------------------------------  ------------------------------------------------------------------------------------------
{b, {Geo, Geo}, v2},               {region, {VARCHAR, NOT NULL}}, {state, {VARCHAR, NOT NULL}, {time, {timestamp, NOT NULL}},
                                   {weather, {VARCHAR}},  {temp, {double}}}
{o, {Geo, Geo}, {South, FL, 400}}, riak_obj{v2, {South, FL, 401, hot,  23.5}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {South, FL, 402, warm, null}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {South, FL, 403, null, 22.5}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {South, FL, 404, warm, 22.5}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {South, FL, 405, hot,  25.0}}
```

The rational for selecting `b` as a key prefix is that all the existing table scan code scans to the first `i` or `o` record and works from there so won't need to be changed.

**NOTES**: 
* the structure of the `b` value is indicative only
* the `riak_object` now carries a non-null value for the table schema in the `riak_object` metadata as shown. That key is used to look up the schema from the `b` record
* more work/thought needs to be done on hand-off, AAE, how we would move `b` keys about the ring as required and any changes to the test suite needed to ensure this is fully tested.
* work will need to be done on filtering to ensure that the filters continue to work

## Future Format 2

This is the same as **Future Format 1** except that non-quantised elements of the key are dropped from the stored value:
```
                Key                                                      Value
---------------------------------  ------------------------------------------------------------------------------------------
{b, {Geo, Geo}, v2},               {region, {VARCHAR, NOT NULL}}, {state, {VARCHAR, NOT NULL}, {time, {timestamp, NOT NULL}},
                                   {weather, {VARCHAR}},  {temp, {double}}}
{o, {Geo, Geo}, {South, FL, 400}}, riak_obj{v2, {401, hot,  23.5}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {402, warm, null}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {403, null, 22.5}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {404, warm, 22.5}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {405, hot,  25.0}}
```

## Future Format 3

The third proposal for a compressed format builds on the Future Format 1 - it drops null values and uses an internal index to indicate what data is being used.
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

**NOTES**:
* this mechanism requires **more** storage for non-sparse data - the benefit really comes with very sparse data - so there is a question as to wether there ought to be a `sparse data` table attribute that determines if this compression is on
* the `index` here is shown schematically as `meta data` of the `riak_object` like the version number but that is up for discussion. The index **MUST** be available without unencoding the whole object because it would be more efficient for a filter to have a preliminary pass against the field index (`field6 = "bob"` can never match if the `index` doesn't contain `6` etc, etc)
* the removal of non-quantised key terms as per Future Format 2 can also be effected here if appropriate

## Leveldb and `ALTER TABLE`

Let us discuss the seperation of concerns with regard to `Erlang` and `leveldb` for `ALTER TABLE`.

Consider the case where a table schema has been altered. In this case an additional field has been added, something like:

```sql
ALTER TABLE Geo ADD COLUMN humidity DOUBLE DEFAULT NULL;
```

**NOTE**: this is a pseudo command for exposition only - the syntax is yet to be determined

After this the the data on disk would look like:
```
                Key                                                      Value
---------------------------------  ------------------------------------------------------------------------------------------
{b, {Geo, Geo}, v2},               {region, {VARCHAR, NOT NULL}}, {state, {VARCHAR, NOT NULL}, {time, {timestamp, NOT NULL}},
                                   {weather, {VARCHAR}},  {temp, {double}, {humidity, double DEFAULT NULL}}}
{o, {Geo, Geo}, {South, FL, 400}}, riak_obj{null, {{region, South}, {state, FL}, {time, 401}, {weather, hot},  {temp, 23.5}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{null, {{region, South}, {state, FL}, {time, 402}, {weather, warm}, {temp, null}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {South, FL, 403, null, 22.5, 65.2}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {South, FL, 404, warm, 22.5, 55.3}}
{o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {South, FL, 405, hot,  25.0, 59.4}}
```

**NOTE**: this example uses future format 1, but the discussion is germane for future formats 2 or 3 as well.


      SELECT * FROM Geo WHERE region = 'South',
     state = 'FL', time > 400 and time < 404 and
                     temp > 20;

                          │
                          ▼

                    Lexer/Parser

                          │
                          ▼

                   Query Rewriter

                          │
                          ▼

                      index fsm

                          │
                          ▼

               Rewrite the SQL inside    [
               the vnode in Erlang to        {startkey, {o, {Geo, Geo}, {South, FL, 401}}},
                 get the appropriate         {endkey,   {o, {Geo, Geo}, {South, FL, 404}}},
                       filters               {startkey, not_inclusive}
                                             {filter, [{'>', temp, 20}
                          │              ]
                          │
                          ▼

               Pass filters etc, into
                       leveldb

                          │
                          │                              Key                                                      Value
                          │              ---------------------------------  ------------------------------------------------------------------------------------------
                          ▼              {b, {Geo, Geo}, v2},               {region, {VARCHAR, NOT NULL}}, {state, {VARCHAR, NOT NULL}, {time, {timestamp, NOT NULL}},
                                                                            {weather, {VARCHAR}},  {temp, {double}, {humidity, double DEFAULT NULL}}}
                Run filters over the     {o, {Geo, Geo}, {South, FL, 400}}, riak_obj{null, {{region, South}, {state, FL}, {time, 401}, {weather, hot},  {temp, 23.5}}
                    on-disk data         {o, {Geo, Geo}, {South, FL, 401}}, riak_obj{null, {{region, South}, {state, FL}, {time, 402}, {weather, warm}, {temp, null}}
                                         {o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {South, FL, 403, null, 22.5, 65.2}}
                          │              {o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {South, FL, 404, warm, 22.5, 55.3}}
                          │              {o, {Geo, Geo}, {South, FL, 401}}, riak_obj{v2, {South, FL, 405, hot,  25.0, 59.4}}
                          │
                          │
                          │
                          │
                          ▼              {v1, {South, FL, 401, hot,  23.5}
                                         {v1, {South, FL, 402, warm, null}
                  Post-process data      {v2, {South, FL, 403, null, 22.5, 65.2}}
                                         {v2, {South, FL, 404, warm, 22.5, 55.3}}
                          │              {v2, {South, FL, 405, hot,  25.0, 59.4}}
                          │
                          │
                          │
                          ▼

              Pass the data back to the
                    vnode/Erlang

                          │
                          │
                          │
                          ▼               {South, FL, 401, hot,  23.5, null}
               Call a function on the     {South, FL, 402, warm, null, null}
              DDL helper module on the    {South, FL, 403, null, 22.5, 65.2}
                    data returned         {South, FL, 404, warm, 22.5, 55.3}
                                          {South, FL, 405, hot,  25.0, 59.4}
                          │
                          │
                          ▼

                Pass data back to the
              query system for further
                     processing

                          │
                          │
                          │
                          ▼
      {{region, varchar}, {state, varchar},
       {time, timestamp}, {weather, varchar},
       {temp, double},    {humidity, double}}

      {South, FL, 401, hot,  23.5, null}
      {South, FL, 402, warm, null, null}
      {South, FL, 403, null, 22.5, 65.2}
      {South, FL, 404, warm, 22.5, 55.3}
      {South, FL, 405, hot,  25.0, 59.4}