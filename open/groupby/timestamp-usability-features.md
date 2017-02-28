# RFC: Timestamp Usability Features

### Abstract

In Riak TS 1.4 character timestamps improved timestamp usability. These changes intend to improve this trend by making timestamp generation and time ranges easier.

### Background

##### `now()` Function

The `now()` functions return the node's local UTC time in milliseconds. It will be usable in `SELECT` statements' `WHERE` clause.

```sql
SELECT * FROM mytable
WHERE mytime = now();
```

Calls to `now()` will be resolved as part of the riak_kv_qry_compiler.

If the `now()` function is used more than once in the same SQL statement then all calls will return the same value. The result of the first call will be cached and reused for subsequent calls. This is to give the function consistent behaviour. For example in `ts >= now()-10s and ts <= now()` the user would expect both calls to have the same value, so that the range is 10 seconds. In the case of a garbage collection or process de-schedule in-between calls the result might actually be milliseconds apart, and even affect the number of quanta that the query spans.

The issues around inconsistent wall clock times are well documented by Basho. Since Riak TS requires wall clock time for quanta anyway, this decision needs to be made somewhere. A user has reported that they are more able to keep clocks consistent on their database nodes than they are on their service nodes (Pavel).

##### `TIMESTAMP` Arithmetic

Simple arithmetic on dates to query a time range.

```sql
-- query rows in the last 10 minutes
SELECT * FROM mytable
WHERE mytime >= now()-10m AND mytime <= now(); 


-- query rows between the node's current time and
-- 10 minutes into the future
SELECT * FROM mytable
WHERE mytime >= now() AND mytime <= now()+10m; 
```

Supported operators will be '+', '-', '*' and '/' on data types `sint64`, `double` and `timestamp`.

Arithmetic will use functions in the `riak_ql_window_agg_fns` module, used in the `SELECT` clause and so share `NULL` handling behaviour. The differences are:
* `double` values that are the result of an arithmetic operation on an `sint64` or `timestamp` column will be rounded to the nearest integer.

Arithmetic will only be allowed on the results of functions e.g. `now()`, or literal values. Arithmetic will not be allowed on column values. Supporting this would require support in LevelDB for arithmetic AST that it would applies to the row values. At least for this initial version, it will not be supported.  
```sql
--- this will produce an error
WHERE (mynumber + 1) = 10;
```

### Proposal

The plan for this work is to implement it in separate pieces, first timestamp arithmetic and then the now function according to project priorities.

The two features have been included in one RFC because of how closely they interact when building time range filters.

### References

- [JIRA RTS-1496](https://bashoeng.atlassian.net/browse/RTS-1496)