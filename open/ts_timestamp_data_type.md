# RFC: Timestamp data type in Riak TS

### Abstract

Strict compliance with the SQL standard brings with it a suboptimal
interface for users and extra work for us. I propose that we go with a
more sensible alternative: support time zones in date strings,
always. Users would not have to specify a time zone, but would always
have the option of doing so.

### Out of scope for this document

* Date formats
* Conversion of stored timestamps on output
* Retrieval of time zone metadata by client libraries

### Default time zone

Vital preface to this discussion: all timestamps in the database are
integers assumed to be in UTC, at least until a future project to
allow zero points to be redefined. Everything in this document pertains
to the question of how to translate human-friendly strings into UTC
integers.

Any time string without an explicit time zone must be interpreted in
the context of *some* time zone.

Defaulting to the server's time zone is reasonable but risks data
safety if different servers are on different time zones, intentionally
or not.

The time zone should be selected from this list (expressed in order of
preference from most likely to be what the user intended to least likely):

1. Session-specific
    * See
[Oracle](https://docs.oracle.com/cd/B19306_01/server.102/b14200/functions143.htm)
for an example.
2. Table-specific
    * Either as a property tied to the bucket type in core metadata or
      as a new component of the DDL
3. Cluster-wide
    * It is straightforward to add a default time zone to core metadata.
4. Default time zone on coordinating node
    * (but see caveat above on data safety)
5. UTC
    * This is user-unfriendly for anyone not situated along the
      Greenwich Meridian who wishes to issue queries or inserts based
      on their local time.

It is impractical to implement all of the above immediately. My plan
is to implement #3 with #5 as fallback, with #1 and #2 left for future
projects.

### SQL data types

The SQL standard specifies 5 data types for dates and times:

* `timestamp with time zone`
* `timestamp without time zone`
* `time with time zone`
* `time without time zone`
* `date`

The `time` data types are for times with no dates, and the `date` data
type is for dates with no times. Since neither are useful for
partitioning based on quanta, an overriding concern in Riak TS,
neither are considered for implementation as part of this project.

(However, at some point we need to consider reserving these as
keywords, which may require escaping with double quotes any matching
field names. We don't use fields named `time`, do we?)

The key challenge we face with regards to SQL standard compliance is
that `timestamp without time zone`, which mandates that any time zone
information included in the string to be parsed be **ignored**, is the
default for any SQL timestamp. Thus all tables prior to Riak TS 1.4
have this as their implicit type, and there is no (compliant) way to
allow users to specify time zones in queries.

Our working assumption is that users do in fact want to be able to
specify time zones rather than have them silently or noisily ignored.

### Examples of new keywords, features

#### Table creation
```
create table ts1 ( event timestamp with time zone not null,
                   a varchar not null,
                   primary key ((a, quantum(time, 15, 's')), a, time));
create table ts2 ( event timestamp without time zone not null,
                   a varchar not null,
                   primary key ((a, quantum(time, 15, 's')), a, time));
```

Note that `with/without time zone` will not be required, but we must
choose a default for the basic `timestamp` type.

#### Queries

##### Explicit time zones

```
select * from ts1 where a = 'fizzbang'
                    and event > '2016-06-01T15:30:00+05'
                    and event < '2016-06-01T16:30:00+05';

select * from ts1 where a = 'fizzbang'
                    and event > timestamp '2016-06-01T15:30:00Z'
                    and event < timestamp '2016-06-01T16:30:00Z';
```

Using `timestamp` as an explicit type prefix in a query is supported
but not required, per my experimentation and reading, although I have
not seen the details explicitly referenced in the SQL standard.

Using `Z` at the end of a time/date string means this is UTC time (aka
a zero offset). `+00` (or `+00:00` or `+0000`) is equivalent, but
`-00` et al are not.

None of the above is allowed when the type is `timestamp without time
zone`. Postgres ignores the time zone indicator, while MySQL returns
an error.

##### Implicit time zone
```
select * from ts1 where a = 'fizzbang'
                    and event > '2016-06-01T15:30:00'
                    and event < '2016-06-01T16:30:00';

select * from ts1 where a = 'fizzbang'
                    and event > timestamp '2016-06-01T15:30:00'
                    and event < timestamp '2016-06-01T16:30:00';
```

With no time zone indicator, the default time zone is assumed.

### Proposal

If we can set aside our insistence on a "strict" SQL subset, we can
simplify the implementation and make users happier, assuming they want
the same thing we do, which is coherent time zone handling.

1. Define and implement mechanism for storing cluster-wide default
   time zone

2. Parse any binary that arrives in a timestamp field (determined by
   consulting the DDL).

3. Add keywords to lexer/parser
    * `timestamp` (when used in queries)
        * Probably silently discard when used outside table definition
    * `with time zone`
        * Only used in table definition. Discard.
    * `without time zone`
        * Return error

### Alternate plan (strict compliance)

1. Define and implement mechanism for storing cluster-wide default
   time zone

2. Parse any binary that arrives in a `timestamp` field (determined by
   consulting the DDL). Ignore any explicit time zone, assume default
   time. Convert to UTC for storage.
    * This by itself is a legitimate 1.4 release, albeit one that
      would annoy some users

3. Add keywords to lexer/parser
    * `timestamp` (when used in queries)
        * Probably silently discard when used outside table definition
    * `without time zone`
        * Only used in table definition
    * `with time zone`
        * Ditto

4. Do whatever is required to DDL to support new data type (`timestamp
   with time zone`)

5. Parse any binary that arrives in a `timestamp with time zone`
   field. Use default time zone if not specified. Convert to UTC.

### Upgrade/downgrade concerns

1. DDL changes for new data type
    * Unnecessary if we take the non-compliant approach
2. User experience if some nodes parse date strings and others don't

Capability addresses #2, probably #1 as well.

### References

- [PDF version of SQL standard.](https://www.dropbox.com/s/y55gz6060acd3qr/sql%20foundation.pdf?dl=0) Huge, download at your own risk.
- [Time date processing for riak_ts](https://github.com/basho/riak/wiki/Time-date-processing-for-riak_ts)
- [ISO 8601 (Wikipedia)](https://en.wikipedia.org/wiki/ISO_8601)
- [Session-specific time zones in Oracle](https://docs.oracle.com/cd/B19306_01/server.102/b14200/functions143.htm)
