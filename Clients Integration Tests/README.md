# RFC: Clients Integration Tests

Date       | Log
-----------|------------
2016/07/11 | First Draft

Discussion: https://github.com/basho/rfc/pull/11

### Abstract

This document outlines the requirements for testing Riak Client libraries.

### Requirements

* Libraries must be tested against all officially supported versions of Riak. As of this writing, that is `2.0.7 KV`, `2.1.4 KV` and `1.3.0 TS`
* Riak must be installed from official packages
* Riak will be 100% fresh and sparkly new on every test run
* There will be at least a three-node cluster for tests
* All branches will be tested, and all commits will be part of a test
* Test runs should wait a period of time to "batch" commits. Right now buildbot is set to five minutes
* A well-defined set of officially supported language environments will be used for each library. For instance, Python versions `2.7.8`, `2.7.X` (where `X` is the latest), `3.3.X`, `3.4.X`, `3.5.X`
* Setting up a language's test environment should be scripted. For instance, the `buildbot/Makefile` in the Python client has the entire `pyenv` setup process automated. This will ensure that new nodes added to the CI environment, or that users who wish to run the tests, can do so using a supported environment. Missing requirements will generate informative errors

### Nice-to-have

* The versions of Riak being tested should automatically upgrade when new releases are published
* When an `rc` tag of a Riak product is made, packages for that product should be built and automatically added to the clients test suite
* Adventurous users should be able to clone the client library repository, run `make test`, and run the test suite in a local environment that matches what is tested internally. Requirements should be minimal, and `make test` will alert the user to any missing requirements
* Using a local devrel for testing should be easy as well (for testing against experimental Riak versions, or for people like Luke who don't want to futz with VMs, Docker, etc etc)

### Implementation ideas

* Docker for Riak cluster nodes
* Ansible / `riak-client-tools` for node configuration
