# RFC: Hex Literal Support in Riak TS SQL

As of Riak TS 1.4, users could only query `varchar` columns using printable, utf-8 textual data.

```sql
SELECT * FROM mytab
WHERE mycol = 'hello'
```

Using hex literals, users will be able to query non-text data from `VARCHAR` columns.

```sql
SELECT * FROM mytab
WHERE mycol = 0xDEADBEEF;
```

Hex literals can also be used to `INSERT` data from `VARCHAR` columns.

```sql
INSERT INTO mytab VALUES (0x0123456789ABCDEF);
```

Two hex characters hold the value for one byte of data, an error is returned if an odd number of characters is specified.
