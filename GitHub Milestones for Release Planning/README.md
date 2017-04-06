# RFC: Use GitHub Milestones For Release Planning

Discussion: https://github.com/basho/rfc/pull/68

## Revision History

Date         | Description
-------------|------------------------------
`2016-10-04` | First Draft
`2017-04-06` | Second Draft

## Abstract

Most of the repositories in the `basho/` organization are filled with stale branches, PRs, issues and old release milestones, which gives the appearance of a company that claims to want an active OSS community, but does not invest in maintaining it. To the casual observer, Riak KV development has stopped. Our users have no idea what is happening in future releases, or that even a future release is planned ([`riak-users` thread](http://lists.basho.com/pipermail/riak-users_lists.basho.com/2016-October/018750.html)).

We should use GitHub's issues, milestones and release feature in the development and release of Riak `2.3.0` and beyond.

## Background

Upon joining the clients team, Alex, Chris and I undertook a project to clean up the repositories "owned" by the team, which involved doing the following:

* Deleting stale integration branches
* Deleting stale feature branches
* Closing PRs that do not merge or do not include tests (always with a polite message indicating why)
* Closing issues that no longer apply
* Closing anything "too old"

After the initial clean up, we then created milestones representing the next version for the client. For instance, we named the next Java client release `riak-java-client-2.0.7`. This allowed us to evaluate the remaining issues and sort those that would be addressed next into the next milestone. Issues that represented work requiring a minor version increment went into the `riak-java-client-2.1.0` milestone.

## Proposal

### Process

For Riak `2.3.0` we would do the following:

* Create a milestone in `basho/riak` ([done](https://github.com/basho/riak/milestone/14))
* Stories and larger-scope issues spanning other repos will be created in this repository, and added to the `riak-2.3.0` milestone.
* In affected dependent repositories, the appropriate milestone will be created to represent the next release for that software. Semver should be followed. For instance, milestone `riak_kv-2.3.0` will be created.
* Links to these dependent milestones can be added to an issue in `basho/riak` to encapsulate the scope of work for the release. For instance, an issue entitled `riak-2.3.0 milestones` would be created in `basho/riak`, whose content are links to milestones in dependent repositories (`riak_kv-2.3.0`, `riak_api-2.3.0`, etc).
* Issues representing work in those dependent repos will be created, and added to the repo-specific milestone.
* Issues representing private work will be created in the `riak_ee` repository. If the content of these issues contains sensitive information, these issues should *only* link to whatever internal tracking system we use, or they could link to per-customer private repos on GH (since private repos are no longer constrained). Linking from the `riak` issues to these in `riak_ee` won't disclose private data as links are by issue number, not title.
* That's it.

The general plan is to limit epics / features to the `basho/riak` and `basho/riak_ee` repositories. Product & project management would visit release milestones in only these two locations, and it would be up to team leads to link the appropriate sub-issues. That would greatly simplify getting information about the status of a release - only two places to look, basically.

By following this plan, the progress of the next Riak release can be determined by looking at the top-level milestone and following the links down. This can easily be scripted, or a tool like ZenHub could be used.

## Cross-repository Project Management

[ZenHub](https://www.zenhub.com) - this probuct **may** implement the cross-repo linking I outline above.
