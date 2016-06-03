# Simplified Documentation
  
### Gordon Guthrie

**Note**: this is a presentation in markdown - if you wish to run it please go to:
![Remark Js](http://remarkjs.com/remarkise)
  
---
  
# People Rarely Fail
  
## Processes Often Fail
  
---
  
# Purpose
  
Our documentation is not fit for purpose on a number of levels:
* product specification is poor
* technical specification is scattered over many places - we (or me) use Google Drive to much
* we waste time finding agreement about what we mean
  
This slidedeck is how we will start to fix this
  
---
  
# Principles

Not many:
* write once (Death! To! Rewriting!)
* less tools
* version control (txt plz)
* moar clarity (reduce the noise)

---

# Product Process

TS at the moment is **an implementation of a known specification** the SQL standard.

* the product **is known**
* the programme **is not known**

---

# The Product

The product is the SQL Foundation Document
https://drive.google.com/drive/u/0/folders/0B-2H_9GJ40JpUGZld19GTHB3b2M

The job of Product Management is then **Programme Management**
* first this bit
* then that bit
* and then yon bittie there

###### this is only true of Product Management for Time Series not for other things like Big Sets or MDC etc, etc

---

# Product Spec

The client spec is written by the product team (Seema/Pavel):
* the `CREATE TABLE` statement
* the `INSERT INTO` to load the data
* the new `SELECT` statement
* the expected output

Plus the background, the customer stories, pricing markers, etc, etc...

This context will help the Eng team to suggest additional complimentary features that naturally extend the core proposition and **which are easy to add**

---

# Progress So Far

We are already halfway there - just need a final push

https://docs.google.com/document/d/1caZDamfKHDLMRMtqlBy6eLzwUMWJecneiHcjGveg7z4/edit?ts=5723acd5#heading=h.qonk8h9w9ndo
https://docs.google.com/document/d/1wkXdv2L9dMFp_YWf-C_MMMNhJZpScM9ud0AAUs4Oog0/edit?ts=5723a2c5#heading=h.qonk8h9w9ndo

---

# Quality Statement

RFC 2119
https://www.ietf.org/rfc/rfc2119.txt

This is a **documentation first** approach

The product spec MUST be of a quality to be used:
* in documentation
* to write test suites
* to be used in training
* to design the technical implementation

##### write once, _end the what's in-what's out dance_

---

# Worked Example

## from TS

---

# Section 1 - The `CREATE TABLE` Statement

```
CREATE TABLE GeoCheckin
  (
   region   VARCHAR NOT NULL,
   state    VARCHAR NOT NULL,
   time     TIMESTAMP NOT NULL,
   weather  VARCHAR NOT NULL,
   temp     DOUBLE,
  PRIMARY KEY ((region, state, QUANTUM(time, 15, 'm')), region, state, time));
```

---

# Section 2 - The INSERT INTO Statement

```
INSERT INTO GeoCheckin
    (region, state, time, weather, temp)
     VALUES ('South Atlantic','South Carolina',1420113600000,'snow',25.2);
```

---

# Section 3 - The new feature SQL Statement

```
SELECT time, weather, temp 
    FROM GeoCheckin
    WHERE region='South Atlantic' AND state='South Carolina' AND time > 0 AND time < 1000;
```

**Note** for some features like paging queries - this might be many statements

---

# Section 4 - the expected output

```
+----+--------------------+----------------------------+
|time|     weather        |         temp               |
+----+--------------------+----------------------------+
| 1  |     z«êPò¹         | 4.19111744258298777600e+18 |
| 2  |   ^OOgz^Blu7)      | 6.07861409217513676800e+18 |
| 3  |       ÔÖã          | 6.84034338181623808000e+17 |
| 4  |        ^G          |-5.55785206740398080000e+16 |
| 5  |    ¸LËäà«d         |-3.62555783091625574400e+18 |
| 6  |     ^AE^S¥­         | 1.11236574770119680000e+18 |
| 7  |     ïö?ï^Fv        | 5.51455556936744140800e+18 |
| 8  |  ^FtFVÅë=+#^Y5     | 2.44525777392835584000e+17 |
| 9  | ðÁÖ·©Ü^GV^^^DkU    | 6.90864738609726668800e+18 |
| 10 |  QÝZa^QËfQ         | 5.08590022245487001600e+18 |
+----+--------------------+----------------------------+
```

---

# EPIC FAIL!

**This worked example, of course, fails the quality statement**

#Why?

---

# Comic Aside

If you are thinking "he just copied that from the riak-shell docos"
* duh!
* duh!
* duh!
* duh!
* what bit of **documentation-first** didn't you understand ;-)

---

# Notes

The product spec should contain as many cases as possible:
* errors (but not technical restrictions like too many sub-queries)
* queries with no results
* etc, etc

There is a prejudice towards Postgres SQL so if the SQL is not precise enough its **do what Postgres does**

##Screenshots of the Postgres REPL are most welcome in this doco!

---

# Is It To Quality?

* can it be copied into documentation?
* are the results correct?
  - copy the SQL into riak-shell
  - log results
  - pile log into a riak-shell replay riak-test **it should work**

---

# Haud The Comments!

We will talk about formats and stuff once we have discussed the Technical Spec!

---

# Technical Spec

This will be written by the developer and contains:
* a link to the implementation section of the SQL Foundation Document
* the validation steps in the lexer/parser
* the output of the query rewriter
    + the query plan that `EXPLAIN` should emit
    + a list of SQL Statement in the query unrolling notation
    + with marks of where the various parts are executed
    + if it gets too big (as it will) you will need to write the individual components individually, name them, and build a right-to-left flow diagram with the names

---

# Quality Statement

RFC 2119
https://www.ietf.org/rfc/rfc2119.txt

The technical spec MUST be of a quality to:
* be reviewable against the product spec
* specify the design clearly
* be used in training for CSEs/SAs
* to be transitioned into product documentation when the feature is delivered

--- 

# Worked Example

from TS work-in-progress documentation

(written after the fact - should be before **documentation first**)

---

# Section 1 - SQL Foundation

The lexer/parser is a straight copy of the `yacc/lexx` structure in the Word Doco into `yecc/leex` - it is important to preserve that - see here:
https://github.com/basho/riak_ql/blob/develop/src/riak_ql_parser.yrl#L242

This section should contain an extract from that doco copy'pasta's so that `riak_ql_lexer.xrl` and `riak_ql_parser.yrl` can be reviewed against it.

This review will often turn up edge cases we haven't thought about

---

# Section 2 - Validation Steps

This section will outline what the validation steps for the query will now be.

It should correspond the errors/edge cases of the product spec (**spoiler alert** it won't - but the review process will flush out these issues early)

It will also highlight other related SQL keywords (eg `ONLY`)

---

# Section 3 - Query Rewriter - logical output

SQL in

```
SELECT time, weather, temperature 
    FROM GeoCheckin
    WHERE region='South Atlantic' AND state='South Carolina' AND time > 0 AND time < 1000;
```

Annotated SQL out

```
SELECT time, weather, temperature FROM {query on vnode1, query on vnode2};

runs on vnode1
 SELECT * 
    FROM GeoCheckin
    WHERE region='South Atlantic' AND state='South Carolina' AND time > 0 AND time < 500;

runs on vnode2
 SELECT * 
    FROM GeoCheckin
    WHERE region='South Atlantic' AND state='South Carolina' AND time > 500 AND time < 1000;
```

**This worked example, of course, fails the quality statement**

#Why?

---

# Section 3 - Query Rewriter - logical output (further notes)


**Remember** _semantics is always preserved_ is the key property of the query rewriter - so a notation where we can review that clearly in the documentation is **critical**

This is a `Query Plan` and why we need the `EXPLAIN` keyword on the Product Roadmap - it will return this as its value.

This sequence MAY contain pseudo-code for flow control. An example would be for a `LIMIT` query:
* **RUN** this subquery
* **IF** `LIMIT` is reached return to client
* **ELSE** run another sub-query

---

# Section 4 - Query Rewriter runtime output

Uses the notation developed in the Query Pipeline prezzo here:
https://drive.google.com/drive/u/0/folders/0B-2H_9GJ40JpZDdHLVhOaE1manM


```
<-------Erlang Coordinator------->               <-----LeveldDB C++ Code---->
                                 <----Network---->
+ FROM     <---------------------+               + FROM     mytable on vnode X
|                                |               |
| SELECT   time, weather, temp   |               | SELECT   *
|                                | Chunk1        |
| GROUP BY []                    +---------------+ GROUP BY []
|                                |               |
| ORDER BY []                    |               | ORDER BY []
|                                |               |
+ WHERE    []                    |               + WHERE + start_key = {'South Atlantic', 'South Carolina', 0}
                                 |                       | end_key   = {'South Atlantic', 'South Carolina', 500}
                                 |
                                 |               + FROM     mytable on vnode Y
                                 |               |
                                 |               | SELECT   *
                                 | Chunk2        |
                                 +---------------+ GROUP BY []
                                                 |
                                                 | ORDER BY []
                                                 |
                                                 + WHERE + start_key = {'South Atlantic', 'South Carolina', 501}
                                                         | end_key   = {'South Atlantic', 'South Carolina', 1000}
```

---

# Section 4 - Query Rewriter runtime output (moar)

This might be too prolix a notation - but you can break it out

```
Coordinator Query
+ FROM 
| 
| SELECT   time, weather, temp
|
| GROUP BY []
|
| ORDER BY []
|
+ WHERE    []
```

Vnode1 Query
```
+ FROM     mytable on vnode X
|
| SELECT   *
|
| GROUP BY []
|
| ORDER BY []
| 
+ WHERE + start_key = {'South Atlantic', 'South Carolina', 0}
        | end_key   = {'South Atlantic', 'South Carolina', 500}
```

etc

---

# Section 4 - Query Rewriter runtime output (moar)

```
<----Erlang------>                   <--LeveldDB C++ Code-->
                  <-----Network----->
Coordinator Query <---------+
                            |
                            | Chunk
                            +--------+ Vnode1 Query
                            |
                            | Chunk
                            +--------+ Vnode2 Query
```

---

# Section 5 - EXPLAIN output

Any new queries MUST have an EXPLAIN output that will return the query plan.

The constraints on the output are:
* it must be human readable
* it must be machine readable - and programmatic

These constraints are to be achieved by apply this restriction:
* it must be a table format

The EXPLAIN keyword is not a SQL standard but versions of it are implemented by Oracle and other large vendors (Not Postgres).

A suggestion has been made that we look at SOLR DEBUG output for a language that describes distributed queries.

---

# Section 6

Section 6 MUST outline:
* if upgrade/downgrade is required
* if it is, how it will be done

Please see the document:
[Upgrade/Downgrade](upgrade_downgrade_specs.md)

---

# How?

Some modest proposals

---

# Product Specs Now

Seema/Pavel write up a document, email it us and I throw onto a giant rummage pile

We need to have:
* an agreed location - where we can find everything - not searching email
* an agreed format (see previous)
* review tasks in JIRA

---

# Technical Documents now

Mostly Word or my beloved PowerPoint in Google Drive (in a semi-structured file system)

Not available to open source contributors

Need to:
* create a new feature branch
* add a `feature.RFC.md` under `/docs` - https://github.com/basho/riak_ql/tree/feature/gg/documents_and_architecture/doc
* write that in markdown
* add prezzos in markdown if appropriate
* transition to documentation during development and release
* manage under JIRA

---

# Fin

