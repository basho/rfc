# RFC: Smoke Testing

Discussion: https://github.com/basho/rfc/pull/48

## Revision History

| Date         | Description |
| -------------|------------------------------ |
| `2016-12-05` | Initial version |

## Abstract
Smoke testing is in the process of being better defined, but currently consists of
client tests against a packaged release on a single node in a Vagrant box.  Future
improvements will include running the `riak_test` against a release candidate package
as well as supporting multi-node clusters on all supported platforms in AWS.

All of this is planned to be automated as much as possible. 

### Background - What is Smoke Testing?
Smoke testing has been ill-defined at Basho.  Initially "smoke testing" was introduced by
the product team to test packages after a broken package as released in early 2016.
This initially was simply installing each package on each OS by hand to see if it installs.

[Rob Genova](https://www.linkedin.com/in/rcgenova) developed a HashiCorp
[Terraform](https://www.terraform.io/) [script](https://github.com/basho-labs/terraform-riak) to
set up a small cluster on AWS and
install a package.  This was a great initial step but it was very manual process
installing a single OS and running a very simple tests against a Time Series package.

In parallel, [Chris Mancini](https://www.linkedin.com/in/solveproblemswithcode) had been
working on a set of Ansible scripts which could be used to test clients against an
actual package install.  Since this automation was much further along and ran many more
interesting end-to-end tests, it was decided to pick up his creation and augment it
to run on even more platforms.

### State of Testing
Currently the [riak-clients-vagrant](https://github.com/basho-labs/riak-clients-vagrant)
must be manually cloned and manually run on each of the target platforms:
 * Ubuntu 14.04 "trusty tahr"
 * Ubuntu 16.04 "xenial xerus"
 * CentOS 6
 * CentOS 7
 * Debian 7 "wheezy"
 * Debian 8 "jessie"
 
[Korry Clark](https://www.linkedin.com/in/korrigan-clark-970295b4) is working on adding
scripts to more easily run multiple platforms automatically.  It uses the
[ansible-roles](https://github.com/basho-labs/ansible-roles) to programmatically build
a cluster (of a single node).

These are the current clients supported by test:
 * PHP
 * Go
 * Ruby
 * Java
 * NodeJS

### Future Work
One of the other current deficiencies is the testing on a single node.  This should
probably not be too arduous to expand this to test on a small cluster of nodes, say
three.  The challenge is that each node will have to know about the IPs of the other
nodes in the cluster and then a **riak** cluster would need to be created before
running the tests.  I suspect some of the tests will have issues running on multiple
nodes, but it would be a better test overall.

[Charlie Voiselle](https://www.linkedin.com/in/charlievoiselle) maintains a
[spreadsheet](https://docs.google.com/spreadsheets/d/1L8_o5-9dD4rwUp9oz_u7WlBDJxYaBQBsGRHQ3-Ht6tQ/)
of officially supported platforms. The following platforms are not tested
via `riak-clients-vagrant` since they are not Linux
and or do not have readily available Vagrant boxes:
* Solaris 10
* MacOS 10.12
* SUSE Linux Enterprise Server 11

It seems that Chef has [Packer](https://www.packer.io/) recipes available in
[bento](https://github.com/chef/bento) for many of the unsupported OSes, so
perhaps at the very least a Vagrant could be set up for these packages.  It would
be possible to virtualize these on AWS if necessary.

Moving this testing to be run by Jenkin, Ansible Tower and running on AWS would be
another great improvement.  It would be nice to simply fire off a job and have
clusters of all the interesting platforms built and the whole test suite run on
multiple nodes.  Reporting test results back to the user would be another issue to
solve.

