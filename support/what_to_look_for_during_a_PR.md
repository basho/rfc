# What To Look For During A PR Review

## Introduction

This is a checklist for doing a proper PR review

## Purpose

The only way to improve a process is to:
* document it
* use it
* review the results of using it

This is the start of such a process for PR reviews in TS

## Scope

The scope of this doco is the code review of a PR

## Relationship to other documents

This is the 'other side' of:
https://github.com/basho/internal_wiki/wiki/How-to-do-PRs-that-are-gud

## Process

* Read the PR
  * looking for a set of related PRs and build instructions for the branch
  * are there any odd cross-dependencies
  * is the title/description gud?

* Basic hygeine
  * do the unit tests run?
  * does xref run?
  * do the riak_tests written for this change run?

**Notes**
* we should be checking test runs of riak_test now for regression
* how do we get tests to run on PR branches, is this doable?

* review the tests
  * do the tests correspond to all the use cases in the Business Spec (including error cases)?
  * ditto Tech RFC?
  * do the tests include upgrade/downgrade and cluster testing etc?
  * are the tests readable and extendable?
  * are there regression tests? do they run?

For library modules:
  * are there unit tests?
  * what is the coverage like?
  * do they use EQC? if not, should they?

For concurrent sub-systems (ie gen_x's):
  * what system tests exist
  * do they use EQC? if not, should they?
  * can they be considered 'complete'?

**Notes**
* should be we checking code coverage of unit tests, and if so how

* read the code general
  * what is the supervision tree
  * is the code clean and clear
  * how are errors handled

* read the hrl files/includes
  * are any of these passed around?
  * do we need upgrade/downgrade?
    * review against the upgrade/downgrade document: https://github.com/basho/rfc/blob/master/support/upgrade_downgrade_review_proforma.md
  * are we macro-ising them as per standard?

* is the feature additive or extensive?
  * are we generalising existing code paths?
  * or are we adding new ones in parallel?
  * is there a reimplementation of an existing feature?
