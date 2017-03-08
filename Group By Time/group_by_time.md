# RFC: `GROUP BY` time

### Abstract

Allow rows to be grouped by time.

```sql
CREATE TABLE GeoCheckin (
region VARCHAR NOT NULL,
state VARCHAR NOT NULL,
time TIMESTAMP NOT NULL,
weather VARCHAR NOT NULL,
temperature DOUBLE,
PRIMARY KEY ((region, state, QUANTUM(time, 15, 'm')), region, state, time)
);

INSERT INTO GeoCheckin VALUES
    ('South Atlantic', 'South Carolina', '2017-03-12 08:05:51', 'hot', 70.2),
    ('South Atlantic', 'South Carolina', '2017-03-12 08:05:52', 'hot', 70.2),
    ('South Atlantic', 'South Carolina', '2017-03-12 08:05:53', 'hot', 70.2),
    ('South Atlantic', 'South Carolina', '2017-03-12 08:05:54', 'hot', 70.2),
    ('South Atlantic', 'South Carolina', '2017-03-12 08:05:55', 'hot', 70.2);

SELECT time(time, 1s), count(*) FROM GeoCheckin
WHERE region = 'South Atlantic' AND state = 'South Carolina'
AND time >= '2017-03-12 08:05:51' AND time <= '2017-03-12 08:05:55'
GROUP BY time(time, 1s);

+--------------------+--------+
|  TIME(time, 1000)  |COUNT(*)|
+--------------------+--------+
|2017-03-12T08:05:54Z|   1    |
|2017-03-12T08:05:51Z|   1    |
|2017-03-12T08:05:55Z|   1    |
|2017-03-12T08:05:52Z|   1    |
|2017-03-12T08:05:53Z|   1    |
+--------------------+--------+
```

### Background

Grouping by time is essential to build dashboards and analyze data inserted in Riak TS. Also useful for telemetry purposes along with Grafana style applications.

Prompted by customer request (ser [https://bashoeng.atlassian.net/browse/RTS-1689](JIRA) for links).

### Proposal

Support for function call with signature `time(<identifier>, <integer>)` in the `GROUP BY` clause is added to the parser. This creates a fun that calls the quantum function. The following function calls are equivalent.

```
time(a, 1d)
QUANTUM(a, 1, 'd')
```

Each group in the query results of a query eith a `GROUP BY` clause has it's own key. Each key is a unique combination of values for the columns, and now quanta in the `GROUP BY` clause.

Rows are still grouped on the coordinator.

To allow the user to see the starting timestamp for the group, the `time/2` function will be supported in the select clause.

```sql
SELECT time(myts,1m), COUNT(*) FROM mytable
GROUP BY time(myts, 1m);
```

The arguments must be the same as to a call to the function in the group by clause. If the arguments to the time function do not match to a call in the group by clause an error is returned. This is because having different arguments may result in multiple values for the same group, which cannot be represented by a row.

Multiple calls to the time function are allowed in the select clause, as long as they map to a call in the group by clause.

If there is no group by clause, the time function may have any arguments, as long as the arguments meet the type signature, and the column exists.

If a time point in the quanta does not have any rows then it will **not** produce a row in the grouped query results. For example if a query grouped on days then the groups might be 1,2,3,7,8 days, and have gaps in the data. Behaviour agreed with Pavel.

Queries using `GROUP BY` clauses do not guarantee the order that results are returned in. This also applies to queries grouping by time. This will be supported in the future using `GROUP BY/ORDER BY`. Behaviour agreed with Pavel.

### References

- [https://bashoeng.atlassian.net/browse/RTS-1689](JIRA RTS-1689)
- [xxx](No product description yet.)