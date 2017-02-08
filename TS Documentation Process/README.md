# Introduction To The Documentation Process

Discussion: https://github.com/basho/rfc/pull/29

This document describes:
* which documents should be completed
* the order in which they should be done

---

# Purpose

The purpose of this document is to layout the process whereby we create the various documents in order to:
* have a common shared understanding of the process
* make the process reviewable and improvable
* detail the dependences - and implicitly the quality constraints - on each document

---

# Scope

The scope of this document is:
* TS SQL features
* other TS features

It **could** be used by other teams if they wish to adopt it.

The documents are:
* Product Spec described in [Simplified Documentation](https://github.com/basho/rfc/blob/master/support/simplified_documentation.md)
* Technical RFC (technical spec) described in [Simplified Documentation](https://github.com/basho/rfc/blob/master/support/simplified_documentation.md)
* Tests
* [Documentation](https://docs.basho.com)
* Training Documents

It also references the [Upgrade/downgrade Review Proforma](https://github.com/basho/rfc/blob/master/support/upgrade_downgrade_review_proforma.md)

Product Specs are in a [Google Docs directory](https://drive.google.com/drive/folders/0B2davw-jnwkGdzhZQkVwNEFmc0U).

Technical RFCS are in a [github repo](https://github.com/basho/rfc).

It is expected that the Product Spec, Tech RFC and appropriate JIRA Epic will have the same name - and the JIRA ticket will contain links to them.

---

# Two Process Flows

There are two process flows:
* features that are expressible in SQL
* features that are not expressible in SQL

---

# Features Expressible In SQL I

The first document to be created is the Product Spec which is described in [Simplified Documentation](https://github.com/basho/rfc/blob/master/support/simplified_documentation.md)

    ╔═════════════════════╗
    ║                     ║
    ║    Product Spec     ║
    ║                     ║
    ║  ┌───────────────┐  ║
    ║  │   Customer    │  ║
    ║  │ Requirements  │  ║
    ║  └───────────────┘  ║
    ║                     ║
    ║  ┌───────────────┐  ║
    ║  │SQL            │  ║
    ║  │CREATE TABLE   │  ║
    ║  │INSERT INTO    │  ║
    ║  │SELECT FROM    │  ║
    ║  │Results        │  ║
    ║  │Errors         │  ║
    ║  └───────────────┘  ║
    ║                     ║
    ╚═════════════════════╝

**Note**: this doc spec is to be reviewed in light of the work that the Docs Team have done on documentation proformas to improve the documentation.

---

# Features Expressible In SQL II

The quality statement for this is:

The product spec MUST be of a quality to be used:

* in documentation
* to write **some** test suites
* to be used in training
* to design the technical implementation

**WRITE ONCE** is the watchword

---

# Features Expressible In SQL III

Everybody can now get to work. The Tech RFC/Spec is described in [Simplified Documentation](https://github.com/basho/rfc/blob/master/support/simplified_documentation.md)


    ╔═════════════════════╗                   ╔═════════════════════╗
    ║                     ║                   ║                     ║
    ║    Product Spec     ║                   ║      Tech RFC       ║
    ║                     ║                   ║                     ║
    ║  ┌───────────────┐  ║                   ║  ┌───────────────┐  ║              ╔═════════════════════╗
    ║  │   Customer    │  ║          Create   ║  │SQL            │  ║              ║  Upgrade/Downgrade  ║
    ║  │ Requirements  │  ║         ┌────────▶║  │Validation     │  ║◀─────────────║   Review Proforma   ║
    ║  └───────────────┘  ║         │         ║  │Steps          │  ║      Review  ╚═════════════════════╝
    ║                     ║         │         ║  │Query Rewriter │  ║ (if appropriate)
    ║  ┌───────────────┐  ║─────────┤         ║  │Query Runtime  │  ║
    ║  │SQL            │  ║         │         ║  │Explain output │  ║
    ║  │CREATE TABLE   │  ║         │         ║  └───────────────┘  ║
    ║  │INSERT INTO    │  ║         │         ╚═════════════════════╝
    ║  │SELECT FROM    │  ║         │         ╔═════════════════════╗
    ║  │Results        │  ║         ├────────▶║     Some Tests      ║
    ║  │Errors         │  ║         │         ╚═════════════════════╝
    ║  └───────────────┘  ║         │         ╔═════════════════════╗
    ║                     ║         ├────────▶║        Docs         ║
    ╚═════════════════════╝         │         ╚═════════════════════╝
                                    │         ╔═════════════════════╗
                                    └────────▶║    Training Docs    ║
                                              ╚═════════════════════╝

The tests are the basic:
* `CREATE` this `TABLE`
* `INSERT` this data `INTO`
* run this `SELECT`
* get these Results

The rationale is that we can check that the **code** matches the **spec** and the **documentation** easily **by inspection**

Because the feature is defined in SQL these tests can be written before or in parallel with the code - likewise the documentation.

What you might call **proper** tests (EQC, failure tests, etc) will need to be developed separately.

Where the SQL is non-standard it **must** be reviewed by a Product Team member or CSE for usability/sanity

---

# Features Expressible In SQL IV

The Technical RFC is cut over into the docs dir of the repo:

    ╔═════════════════════╗
    ║                     ║
    ║      Tech RFC       ║
    ║                     ║
    ║  ┌───────────────┐  ║
    ║  │SQL            │  ║     Cut-over
    ║  │Validation     │  ║──────────────────▶ http://github.com/basho/repo/docs/feature_doc.md
    ║  │Steps          │  ║
    ║  │Query Rewriter │  ║
    ║  │Query Runtime  │  ║
    ║  │Explain output │  ║
    ║  └───────────────┘  ║
    ╚═════════════════════╝

Typically RFCs might contain multi-delivery phase information - but the expectation should be that the bulk can be cut out and copied over to the docs.

---

# Features *NOT* Expressible In SQL I

This process is different because the Product Spec is partly written first:

    ╔═════════════════════╗
    ║                     ║
    ║    Product Spec     ║
    ║                     ║
    ║  ┌───────────────┐  ║
    ║  │   Customer    │  ║
    ║  │ Requirements  │  ║
    ║  └───────────────┘  ║
    ║                     ║
    ║  ┌───────────────┐  ║
    ║  │               │  ║
    ║  │               │  ║
    ║  │               │  ║
    ║  │               │  ║
    ║  │               │  ║
    ║  │               │  ║
    ║  └───────────────┘  ║
    ║                     ║
    ╚═════════════════════╝

---

# Features *NOT* Expressible In SQL II

Then the technical RFC can be done - with review if appropriate:

    ╔═════════════════════╗                  ╔═════════════════════╗
    ║                     ║                  ║                     ║
    ║    Product Spec     ║                  ║       Tech RFC      ║
    ║                     ║                  ║                     ║
    ║  ┌───────────────┐  ║                  ║  ┌───────────────┐  ║               ╔═════════════════════╗
    ║  │   Customer    │  ║        Create    ║  │               │  ║               ║  Upgrade/Downgrade  ║
    ║  │ Requirements  │  ║        ┌────────▶║  │               │  ║◀──────────────║   Review Proforma   ║
    ║  └───────────────┘  ║        │         ║  │Appropriate    │  ║       Review  ╚═════════════════════╝
    ║                     ║        │         ║  │content        │  ║  (if appropriate)
    ║  ┌───────────────┐  ║────────┘         ║  │               │  ║
    ║  │               │  ║                  ║  │               │  ║
    ║  │               │  ║                  ║  └───────────────┘  ║
    ║  │               │  ║                  ╚═════════════════════╝
    ║  │               │  ║
    ║  │               │  ║
    ║  │               │  ║
    ║  └───────────────┘  ║
    ║                     ║
    ╚═════════════════════╝

---

# Features *NOT* Expressible In SQL III

Finally the customer-facing elements (UX/GUI/app.conf/riak-admin etc) can be designed. These **MUST** be reviewed by CSE or client-facing staff before being signed-off - we do not do *engineering guis* - engineers can design and build customer-facing elements but **they cannot review and approve them** #hashtag nothing personal.

    ╔═════════════════════╗                  ╔═════════════════════╗
    ║                     ║                  ║                     ║
    ║    Product Spec     ║                  ║       Tech RFC      ║
    ║                     ║                  ║                     ║
    ║  ┌───────────────┐  ║                  ║  ┌───────────────┐  ║
    ║  │   Customer    │  ║        Create    ║  │               │  ║
    ║  │ Requirements  │  ║       ┌──────────║  │               │  ║
    ║  └───────────────┘  ║       │          ║  │Appropriate    │  ║
    ║                     ║       │          ║  │content        │  ║
    ║  ┌───────────────┐  ║       │          ║  │               │  ║
    ║  │               │  ║       │          ║  │               │  ║
    ║  │               │  ║       │          ║  └───────────────┘  ║
    ║  │GUI/UX/app.conf│  ║       │          ╚═════════════════════╝
    ║  │Design         │◀─╬───────┘
    ║  │               │  ║
    ║  │               │  ║
    ║  └───────────────┘  ║
    ║          ▲          ║
    ╚══════════╬══════════╝
               │
               │
          CSE Review

---

# Features *NOT* Expressible In SQL IV

Finally the docs/tests/training docs can be done (and implementation of the UI/UX etc, etc):

    ╔═════════════════════╗
    ║                     ║
    ║    Product Spec     ║
    ║                     ║
    ║  ┌───────────────┐  ║
    ║  │   Customer    │  ║
    ║  │ Requirements  │  ║
    ║  └───────────────┘  ║
    ║                     ║
    ║  ┌───────────────┐  ║         Create    ╔═════════════════════╗
    ║  │               │  ║       ┌──────────▶║        Tests        ║
    ║  │               │  ║       │           ╚═════════════════════╝
    ║  │GUI/UX/app.conf│  ║       │           ╔═════════════════════╗
    ║  │Design         │──╬───────┼──────────▶║        Docs         ║
    ║  │               │  ║       │           ╚═════════════════════╝
    ║  │               │  ║       │           ╔═════════════════════╗
    ║  └───────────────┘  ║       └──────────▶║    Training Docs    ║
    ║                     ║                   ╚═════════════════════╝
    ╚═════════════════════╝

---

# Features *NOT* Expressible In SQL V

The Technical RFC is cut over into the docs dir of the repo:

    ╔═════════════════════╗
    ║                     ║
    ║       Tech RFC      ║
    ║                     ║
    ║  ┌───────────────┐  ║
    ║  │               │  ║    Cut-over
    ║  │               │  ║─────────────────▶ http://github.com/basho/repo/docs/feature_doc.md
    ║  │Appropriate    │  ║
    ║  │content        │  ║
    ║  │               │  ║
    ║  │               │  ║
    ║  └───────────────┘  ║
    ╚═════════════════════╝

Typically RFCs might contain multi-delivery phase information - but the expectation should be that the bulk can be cut out and copied over to the docs.

---

# Fin
