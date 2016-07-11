# RFC: Clients Integration Tests

2016/07/11 First Draft

### Abstract

This document outlines the requirements for testing Riak Client libraries.

### Requirements

* Libraries must be tested against all officially supported versions of Riak. As of this writing, that is `2.0.7 KV`, `2.1.4 KV` and `1.3.0 TS`
* Riak must be installed from official packages
* Riak will be 100% fresh and sparkly new on every test run
* There will be at least a three-node cluster for tests
* All branches will be tested, and all commits will be part of a test.
* Test runs should wait a period of time to "batch" commits. Right now buildbot is set to five minutes.

### Nice-to-have

* The versions of Riak being tested should automatically upgrade when new releases are published
* Adventurous users should be able to clone the client library repository, run `make test`, and run the test suite in a local environment that matches what is tested internally. Requirements should be minimal, and `make test` will alert the user to any missing requirements
* Using a local devrel for testing should be easy as well (for testing against experimental Riak versions, or for people like Luke who don't want to futz with VMs, Docker, etc etc)

### Implementation ideas

* Docker for Riak cluster nodes
* Ansible / `riak-client-tools` for node configuration
