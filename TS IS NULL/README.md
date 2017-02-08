# RFC: Riak TS SQL "WHERE _field_ IS NULL" Optimizations

Discussion: https://github.com/basho/rfc/pull/33

### Abstract
Several query optimization opportunities are identified within the SQL spec.
This RFC targets two such optimizations and query normalization steps for
predicates involving NULL as the right-hand-side value of a _null predicate_.

This RFC also identifies related optimizations that should _not_ be in the
scope of change, but should be considered for future work.

### Background
While implementing SQL "WHERE _field_ IS [NOT] NULL", several query
optimizations related to the _null predicate_ were found within the SQL spec.
The optimizations paraphrased follow:

1. When a _column reference_ is being tested for IS NULL and the column is known
   not to be nullable, the query can be short-circuited, yielding an empty set
   without execution against the underlying data store.
2. When a _column reference_ is being tested for IS NOT NULL and the column is
   known to be not nullable, the predicate can be safely removed.

The SQL spec likewise contains optimizations for values when they are the
left-hand-side value in a predicate, ie `1 = 1` or `NULL IS NULL`. While these
optimizations are highly related, the scope of Riak TS SQL coverage does not
include left-hand-side values in such a context yet, so should not be considered in scope.

The SQL spec also contains SQL "WHERE _field_ IS [NOT] TRUE|FALSE". This also
should be considered out of scope as Riak TS SQL coverage does not include IS
_TruthValue_, especially since the same semantic is accomplishable via equality
comparison operators.

#### SQL Spec
##### NOT _field_ IS NULL => _field_ IS NOT NULL
Within section 6.35 <boolean value expression>, within Syntax Rules 2)
(NOT (BP IS TV)) <=> (BP IS NOT NULL), iff TV is NULL, where:

* BP is Boolean Predicand
* TV is Truth Value, which contains { True, False, Unknown (NULL) }

The above query rewrite rule is also noted within section 8.8 as Note 266.

##### NOT _field_ IS NOT NULL => _field_ IS NULL
It stands to reason that we should see a similar query rewrite rule for
NOT _field_ IS NOT NULL -> _field_ IS NULL

Using the following table VT:

| Time | Value |
|------|-------|
|    1 | NULL  |
|    2 |     7 |
|    3 | NULL  |
|    4 |     8 |

The following queries for all possible combinations of [NOT] Value IS [NOT] NULL
yield results that validate the supposition that the NOT should be carried into
the IS NULL construct with double negation resulting in the cancelling out of
the negation:

| Query                                             | Result  |
|---------------------------------------------------|---------|
| SELECT Time FROM VT WHERE Value IS NULL           | 1,3     |
| SELECT Time FROM VT WHERE NOT Value IS NOT NULL   | 1,3     |
| SELECT Time FROM VT WHERE Value IS NOT NULL       | 2,4     |
| SELECT Time FROM VT WHERE NOT Value IS NULL       | 2,4     |

##### _field_ Known Not NULL, IS NULL Optimization
Within section 4.13, the case that a field may be known not nullable is
identified and deduction of the _search condition_ testing said field against
the null value "can never be True".

While not said directly, the query execution should immediately respond with an empty set if any part of a chain of _and_ predicates contains any predicate that can never by True.

##### _field_ Known Not NULL, IS NOT NULL Optimization
Within section 6.35, within Syntax Rules 3.a), for "BVE IS NOT NULL" where BVE is
readily known not to be NULL, ie for a non-nullable column, (the query execution) can drop the not null predicate, where:

* BVE is Boolean Value Expression

Within Syntax Rules 3.b), ditto for "Value IS NOT NULL", ie "7 IS NOT NULL".

Within Syntax Rules 4) query rewriting and recursion rules that lead back to 3
are identified and are simplified by the Riak TS scope of only supporting
_column reference_ as the left-hand-side of a _null predicate_ (technically
all _predicate_ types).

Within section 7.12 Query Specification, 20) A column C is readily known not
NULL if C is defined as not nullable.

Within 21) A _column reference_ is NOT known to be not nullable if (among other
conditions which are out of scope for Riak TS):

i) A _column reference_ for a column that is possibly nullable.

### Proposal
1. Rewrite NOT _field_ IS NULL as _field_ IS NOT NULL.
2. Rewrite NOT _field_ IS NOT NULL as _field_ IS NULL.
3. Rewrite _field_ IS NULL for a known not null field as false.
 1. Return an empty set when the predicate as a chain of _and_ predicates contains a predicate that is known to be false.
 2. Remove known false predicates otherwise, ie when in an _or_.
4. Remove the _null predicate_ when the predicate is IS NOT NULL and is applied to a field that is
   known not null.

### References
- [https://drive.google.com/file/d/0B-2H_9GJ40JpUXBMcnYzc2FMbVU](SQL spec, aka ISO/IEC 9075-2:2011(E))
