# RFC: SQL `IN` Keyword

### Abstract

`IN` predicates allow a column to be matched against one or more literal values.

```sql
SELECT * FROM mytable
WHERE myval IN ('a', 'b', 'c', 'd');
```

This query will return rows where `myval` matches any of `a`, `b`, `c`, or `d`.

### Background

The `IN` Predicate is described in section 8.4 of the SQL foundation document.

### Proposal

`IN` predicates allow a column to be matched against one or more literal values.

At the parser level, the `IN` predicate will be rewritten to multiple `OR` predicates.

This query:

```sql
SELECT * FROM mytable
WHERE mykey = 1 AND myval IN ('a', 'b', 'c', 'd');
```

Will be rewritten to:

```sql
SELECT * FROM mytable
WHERE mykey = 1 AND (myval = 'a' OR myval = 'b' OR myval = 'c' OR myval = 'd');
```

Only value literals will be allowed, for example numbers, varchars, booleans etc. Sub queries will not be supported.

`IN` has the same limitations as the rewritten query, filters using `OR` cannot be used on partition key columns.

### Performance Considerations

This change will make it easy to create a very large number of filters, AFAIK we do not encourage use of large numbers of filters. A customer using large numbers of filters was discussed in slack.

https://basho.slack.com/archives/eng_time-series/p1482848919003847

Large numbers of filters may need to be performance tested, or we could put an advisory that it is not recommended until we know how the system behaves with such queries.

### References

No references.