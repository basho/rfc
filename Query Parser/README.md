# Query Parser: Evolving the user experience

Discussion: https://github.com/basho/rfc/pull/37

Date         | Log
-------------|------------------------
`2016-10-13` | Initial Draft

## Abstract

SQL is not perfect but is a standard that has survived decades as the primary way of communiticating with databases. The most likely reason for this is the low barrier of entry due to its english like structure. Its easy to remember making it easier to learn, allowing people to get started with basic interactions very quickly at all experience levels.

## Proposal

I propose that we evolve Riak KV & TS to have a single query parser that uses a SQL'ish structure that supports all operations. All requests against Riak would be passed as queries from all interfaces.

### Example Queries

```SQL
# CREATE BUCKET-TYPE WITH DEFINED PROPERTIES
CREATE BUCKET-TYPE pageviews (datatype 'counter');

# ALTER BUCKET-TYPE PROPERTIES
ALTER BUCKET-TYPE pageviews SET datatype 'counter';

# DESCRIBE BUCKET-TYPE, returning BUCKET-TYPE PROPERTIES
DESC BUCKET-TYPE pageviews;

# DESCRIBE BUCKET, returning BUCKET PROPERTIES
DESC BUCKET 'account' FROM pageviews;

# INSERT NEW OBJECT WITHOUT KEY -> GENERATED KEY
INSERT INTO pageviews (bucket, increment) VALUES ('account', 1);

# UPDATE EXISTING OBJECT WITH KEY
UPDATE pageviews SET increment = 1 WHERE bucket = 'account' AND key = '{mykey}';

# CSV PROPERTIES
CREATE BUCKET-TYPE users (allow_mult true, backend 'bitcask');
ALTER BUCKET-TYPE users SET backend 'leveldb';

# INSERT WITH KEY
INSERT INTO users (bucket, key, data) VALUES ('subscription', '{USER_ID}', '{SERIALIZED_SUBSCRIPTION_DATA}');

# UPDATE KV DATA
UPDATE users SET data = '{SERIALIZED_SUBSCRIPTION_DATA}', vclock = '{VCLOCK}' WHERE bucket = 'subscription' AND key = '{USER_ID}';

SELECT * FROM users WHERE bucket = 'subscription' AND key = '{USER_ID}';
SELECT vclock,last_modified FROM users WHERE bucket = 'subscription' AND key = '{USER_ID}';
SELECT preflist FROM users WHERE bucket = 'subscription';

# SELECT more than one key
SELECT * FROM users WHERE bucket = 'subscription' AND key IN ('{USER_ID}','{USER_ID2}','{USER_ID3}');

# COUNT siblings
SELECT COUNT(*) FROM users WHERE bucket = 'subscription' AND key = '{USER_ID}';

# COUNT objects in a bucket
SELECT COUNT(*) FROM users WHERE bucket = 'subscription';

# MAX last_modified time of all siblings
SELECT MAX(last_modified) FROM users WHERE bucket = 'subscription' AND key = '{USER_ID}';

# SELECT all keys of bucket ordered by siblings descending
SELECT keys, COUNT(DISTINCT etag) as siblings FROM users WHERE bucket = 'subscription' ORDER BY siblings desc;

# DELETE object
DELETE FROM users WHERE bucket = 'subscription' AND key = '{USER_ID}';
```

### Benefits

- A simplified and consistent user experience across all interfaces
- HTTP, PB, and TTB interfaces are reduced to merely being a relay to the query parser eliminating the need to update all of the interfaces for new features
- Offer direct feedback to users on query performance via EXPLAIN plan
- Client libraries can be simplified to only have a few types of requests sent to Riak
- Libraries like PHP's PDO can be extended to support Riak, allowing us to gain the benefits of parameter interpolation without all the extra work
- Potentially reduce the development time of new features

### Timing

I think it would be best to target a built in query parser for Riak v4. V3 is the Great Merge, after we have KV & TS merged, we will already have the foundation for a query parser. We would just need to work towards expanding its capabilities for KV and routing all operations through it.
