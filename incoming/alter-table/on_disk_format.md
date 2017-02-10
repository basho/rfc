# On Disk Format

## Introduction

This document is part of the ALTER TABLE RFC

Please read the overview material in [Main RFC](./README.md)

## Background

The ALTER TABLE change is entangled with two proposals to have more aggressive compression of data in on disk formats:
* moving the schema data out of the record and into a header record
* moving away from storing `NULL`s for sparce data

It is also entangled with a proposal to improve data filtering which will be described here.

# Current Format

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
    	} 