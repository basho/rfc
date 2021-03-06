# RFC: Inverse distribution functions for Riak TS (PERCENTILE, MEDIAN, etc)

## Abstract

Riak TS needs to support *inverse distribution functions*, at least including `PERCENTILE_DISC`, `PERCENTILE_CONT`, `MEDIAN` and `MODE`.  This RFC details how this can be implemented using *query buffers*.

## Background

Inverse distribution functions, like window aggregation functions, produce a single row.  They, however, are different in that they require the entire WHERE range to be available before they can be computed, and they cannot be computed incrementally.

## Proposal

Query buffers provide an infrastructure to safely collect rows, in substantial amount and sorted by certain fields, which we can leverage to enable inverse distribution functions.

### Parser support

Inverse distribution functions are parsed to produce a tagged lexeme by the same function (`riak_ql_parser:get_func_type`) which produces the lexemes for the windows aggregation function class.

### Transform queries with inverse distrib functions of `x` into a regular query with `ORDER BV x`

1. At the query compilation stage, in `riak_kv_qry_compiler:compile_select_col`, we convert select columns parsed as `ColSpec = {{inverse_distrib_fn, FnName}, [{identifier, [<<"x">>]}|_] FnArgs}` into the plain column *as if* they were given as `ColSpec = {identifier, [<<"x">>]}`.  We also extract the bits needed to identify the function and its arguments and convert them into a term `Funcall = {ok, {FnName::atom(), ColumnArg::binary(), OtherArgs::[ldbvalue()]}}`.  Thus, `"PERCENTILE_CONT(x, 0.33)"` will be converted into `{ok, {'PERCENTILE_DISC', <<"x">>, [0.33]}}`.

2. Using functions exported from `riak_ql_inverse_distrib_fns`, the `Funcall` spec is *validated* wrt the arity, types of static parameters, the presence of the column argument (the `0.33` and `x` in the example above), and the presence of so named column in the DDL.  If validation fails, `Funcall` gets assigned a value of `{error, {DescriptiveAtom, DisplayedString}}`.

    It is then passed to the AST folding function.  As a list, the totality of inverse distribution functions present in the SELECT clause is delivered to `riak_kv_qry_compiler:compile_order_by`, where it is ensured that multiple calls, if any, all refer to the same column.

3. In `riak_kv_compiler:compile_invdist_funcall`, we populate `ORDER BY`, `LIMIT` and `OFFSET` of the `#riak_select_v3{}` record returned by `riak_kv_compiler:compile`, as follows:

    - Each `Funcall` is used to construct a function, which accepts `TotalNumberOfRows` as its sole argument and produces the virtual offset.  It is appended to a list in `'OFFSET'`.

    - The `ColumnArg` is used to construct a virtual ORDER BY spec of the form `{ColumnArg, asc, nulls_last}`.  It becomes a single element in the list term assigned to `ORDER BY`.

    - `LIMIT` is assigned a same-length list of `1`s.

4. Existing `WHERE` clause is ANDed with `ColumnArg is not null`.

5. Finally, multiple columns in `'SELECT'` will be collapsed into a single column.  Thus, for functions in `riak_kv_qry_worker`, `SELECT PERCENTILE_CONT(x, 0.33), MEDIAN(x)` will become `SELECT x`.

### Collect rows into a query buffer

The presence of `ORDER BY` will direct `riak_kv_qry_worker` to use query buffers for the query with inverse distribution functions.

By way of illustration:

```
     select median(bob) from mytable where id = 1 and time > 1 and time < 4000;




        ◀ ─ Erlang Coordinator─ ─▶
                                                                                             ◀─ ─ ─ ─ ─ ─ Network  ─ ─ ─ ▶
                                                              Table on coordinator
                                                            ◀ ─ EITHER in memory  ─ ─▶                                     ◀─ ─ ─ ─ ─ ─ LevelDB ─ ─ ─ ─ ─ ─ ─ ▶
                                                                   OR leveldb

                                                                                                                          ◆  FROM     table mytable on X
                                                                                                                          │
                                                                                                                          │
                                                                                                                          │  SELECT   *
                                                                                                                          │
                                                                                                                          │
   ◆  FROM    ◀═════════════════════════════════════════   ◆  FROM    ◀════════════════════════╦══════════════════════════│  GROUP BY [ ]
   │                                                       │                                   ║                          │
   │                                                       │                                   ║                          │
   │  SELECT   [ median(bob) ]                             │  SELECT   [ bob AS median(bob) ]  ║                          │  ORDER BY [ ]
   │                                                       │                                   ║                          │
   │                                                       │                                   ║                          │
   │  GROUP BY [ ]                                         │  GROUP BY [ ]                     ║                          │  LIMIT    [ ]
   │                                                       │                                   ║                          │
   │                                                       │                                   ║                          │
   │  ORDER BY [ ]                                         │  ORDER BY [ bob ASC ]             ║                          │  OFFSET   [ ]
   │                                                       │                                   ║                          │
   │                                                       │                                   ║                          │
   │  LIMIT    [ 1 ] (*)                                   │  LIMIT    [ ]                     ║                          ◆  WHERE     ◆ Start key = 1
   │                                                       │                                   ║                                       │ End key   = 2000
   │                                                       │                                   ║                                       │ id = 1
   │  OFFSET   [ 'MEDIAN'([], RowsTotal, ValueAtF) ] (*)   │  OFFSET   [ ]                     ║                                       ◆ bob != NULL
   │                                                       │                                   ║
   │                                                       │                                   ║
   ◆  WHERE    [ ]                                         ◆  WHERE    [ ]                     ║
                                                                                               ║
                                                                                               ║
                                                                                               ║
                                                                                               ║                          ◆  FROM     table mytable on Y
                                                                                               ║                          │
                                                                                               ║                          │
                                                                                               ║                          │  SELECT   *
                                                                                               ║                          │
                                                                                               ║                          │
                                                                                               ╚══════════════════════════│  GROUP BY [ ]
                                                                                                                          │
                                                                                                                          │
                                                                                                                          │  ORDER BY [ ]
                                                                                                                          │
                                                                                                                          │
                                                                                                                          │  LIMIT    [ ]
                                                                                                                          │
                                                                                                                          │
                                                                                                                          │  OFFSET   [ ]
                                                                                                                          │
                                                                                                                          │
                                                                                                                          ◆  WHERE     ◆ Start key = 2001
                                                                                                                                       │ End key   = 4000
                                                                                                                                       │ id = 1
                                                                                                                                       ◆ bob != NULL

(*) each entry in the list corresponds to the relevant element in
    the a function call in the SELECT clause.  In total, there will be
    as many entries in these lists as there are function calls.
```

Notes:

1. The substitution of `TotalRows` in OFFSET happens when the collection of selection rows is completed in the query buffers manager.

2. At compile time, `#riak_select_v3.'OFFSET'` will be set up with a list of functional objects, each taking as arguments `TotalRows`, `AdditionalParams` (such as the percentile value to be obtained) and `ValueAtF` (a function that returns the cell value at a given row).  This function will return the effective OFFSET value, for every inverse distribution function appearing in the query.

3. Actual code for the inversse distribution functions exists in `riak_ql_inverse_distrib_fns.erl`.  More functions can be implemented as long as they implement the same interface.

### Compute offsets at fetch time

On successful collection of all records, in `riak_kv_qry_buffers:fetch_limit`, we check whether the `Offset` parameter is a list of functions.  If it is, each function is called with the total number of rows as an argument, yielding the effective offset.  For each offset `N`, we extract the `N`th record from the buffer (either in-memory buffer or leveldb-backed one).  The values fetched are then placed on a list, and that list becomes the single row returned by `fetch_limit`.

## Limitations

1. Due to the need to construct the (single) local key for the temp table to ensure the proper ordering of rows, we cannot support multiple inverse distribution functions with different column arguments in the same SELECT query.

### References

- [https://github.com/basho/riak_kv/pull/1624](riak_kv PR)
- [https://github.com/basho/riak_ql/pull/167](riak_ql PR)
- [https://github.com/basho/riak_test/pull/1270](riak_test PR)
- [https://en.wikipedia.org/wiki/Percentile](Wikipedia article)
