# RFC: Travis CI Builds For Basho Projects

### Revision History

Date         | Description
-------------|------------------------------
`2016-10-05` | First Draft

### Abstract

An important part of Basho's OSS / GitHub presence is public evidence that our software builds and runs tests correctly. We should ensure that all repositories in `basho/` that can be built on Travis CI do so and have build badges at the top of their `README.md` files.

### Proposal

See the following PRs for enabling Travis CI for Riak and Yokozuna:

* https://github.com/basho/riak/pull/873
* https://github.com/basho/yokozuna/pull/689

For any Basho project that requires Basho's patched Erlang, I'd like to share the build script for that. This could be accomplished via a submodule or a `curl` request to fetch the build script if necessary from a repo. `riak-client-tools` could be renamed to `riak-tools` and used.
