# Introduction To The Documentation Process

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
* to write test suites
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
    ║  ┌───────────────┐  ║       Create      ║  ┌───────────────┐  ║              ╔═════════════════════╗
    ║  │   Customer    │  ║                   ║  │SQL            │  ║              ║  Upgrade/Downgrade  ║
    ║  │ Requirements  │  ║         ┌────────▶║  │Validation     │  ║◀─────────────║   Review Proforma   ║
    ║  └───────────────┘  ║         │         ║  │Steps          │  ║      Review  ╚═════════════════════╝
    ║                     ║         │         ║  │Query Rewriter │  ║ (if appropriate)
    ║  ┌───────────────┐  ║─────────┤         ║  │Query Runtime  │  ║
    ║  │SQL            │  ║         │         ║  │Explain output │  ║
    ║  │CREATE TABLE   │  ║         │         ║  └───────────────┘  ║
    ║  │INSERT INTO    │  ║         │         ╚═════════════════════╝
    ║  │SELECT FROM    │  ║         │         ╔═════════════════════╗
    ║  │Results        │  ║         ├────────▶║        Tests        ║
    ║  │Errors         │  ║         │         ╚═════════════════════╝
    ║  └───────────────┘  ║         │         ╔═════════════════════╗
    ║                     ║         ├────────▶║        Docs         ║
    ╚═════════════════════╝         │         ╚═════════════════════╝
                                    │         ╔═════════════════════╗
                                    └────────▶║    Training Docs    ║
                                              ╚═════════════════════╝

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
    ║  │   Customer    │  ║      Create      ║  │               │  ║               ║  Upgrade/Downgrade  ║
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

Finally the customer-facing elements (UX/GUI/app.conf/riak-admin etc) can be designed. These **MUST** be reviewed by CSE or client-facing staff before being signed-off - we do not do *engineering guis*.


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

# Fin
