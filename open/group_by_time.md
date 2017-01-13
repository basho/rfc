# RFC: `GROUP BY` time

### Abstract

Allow rows to be grouped by time.

```sql
SELECT COUNT(*)
FROM mytable
WHERE ts > 213423424 AND ts < 234234234
GROUP BY time(ts, 1d);

+------------------------+--------+
|          time          |COUNT(*)|
+------------------------+--------+
|2016-12-22T00:00:00.000Z|   3    |
|2016-12-23T00:00:00.000Z|   45   |
|2016-12-24T00:00:00.000Z|   332  |
|2016-12-25T00:00:00.000Z|  10023 |
+------------------------+--------+
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

For each time function in the `GROUP BY` clause, a column will be added with the timestamp value for the quantum of that group. The column will always be called `time` and the type is `timestamp`. Without this column, it would not be possible to see which time, the group values were for. Behaviour agreed with Pavel, based on InfluxDB behaviour.

If a time point in the quanta does not have any rows then it will **not** produce a row in the grouped query results. For example if a query grouped on days then the groups might be 1,2,3,7,8 days, and have gaps in the data. Behaviour agreed with Pavel.

Queries using `GROUP BY` clauses do not guarantee the order that results are returned in. This also applies to queries grouping by time. This will be supported in the future using `GROUP BY/ORDER BY`. Behaviour agreed with Pavel.

### References

- [https://bashoeng.atlassian.net/browse/RTS-1689](JIRA RTS-1689)
- [xxx](No product description yet.)