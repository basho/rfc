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

### Background

The SQL standard specifies 5 data types for dates and times:

* `timestamp with time zone`
* `timestamp without time zone`
* `time with time zone`
* `time without time zone`
* `date`

The `time` data types are for times with no dates, and the `date` data
type is for dates with no times. Since neither are useful for
partitioning based on quanta, the key use for timestamps in Riak TS,
neither are considered relevant (yet).

The key challenge we face with regards to SQL standard compliance is
that `timestamp without time zone`, which mandates that any time zone
information included in the string to be parsed be **ignored**, is the
default for any SQL timestamp. Thus all tables prior to Riak TS 1.4
have this as their implicit type, and there is no (compliant) way to
allow users to specify time zones in queries.

Our working assumption is that users do in fact want to be able to
specify time zones rather than have them silently or noisily ignored.

### Proposal

If we can set aside our insistence on a "strict" SQL subset, we can
simplify the implementation and make users happier, assuming they want
the same thing we do, which is coherent time zone handling.

1. Parse any binary that arrives in a timestamp field (determined by
   consulting the DDL). Default to local time zone.

2. Add keywords to lexer/parser
    * `timestamp` (when used in queries)
        * Probably silently discard when used outside table definition
    * `with time zone`
        * Only used in table definition. Discard.
    * `without time zone`
        * Return error

### Alternate plan (strict compliance)

1. Parse any binary that arrives in a timestamp field (determined by
   consulting the DDL). Ignore any time zone, assume local
   time. Convert to UTC.
    * This by itself is a legitimate 1.4 release, albeit one that
      would annoy some users

2. Add keywords to lexer/parser
    * `timestamp` (when used in queries)
        * Probably silently discard when used outside table definition
    * `without time zone`
        * Only used in table definition
    * `with time zone`
        * Ditto

3. Do whatever is required to DDL to support new data type (`timestamp
   with time zone`)

4. Parse any binary that arrives in a timestamp with time zone
   field. Default to local time. Convert to UTC.

### Upgrade/downgrade concerns

1. DDL changes for new data type
    * Unnecessary if we take the non-compliant approach
2. User experience if some nodes parse date strings and others don't

Capability addresses #2, probably #1 as well.


### References

- [PDF version of SQL standard.](https://www.dropbox.com/s/y55gz6060acd3qr/sql%20foundation.pdf?dl=0) Huge, download at your own risk.
- [Time date processing for riak_ts](https://github.com/basho/riak/wiki/Time-date-processing-for-riak_ts)
