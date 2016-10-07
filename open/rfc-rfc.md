# RFC: RFC Process

Date         | Log
-------------|------------------------
`2016-10-07` | Initial Draft

### Abstract

We've got a good RFC process that is easy to use, but items tend to wallow in PR state. Let's fix that by using GH features like labels and issues.

### Proposal

Workflow for an RFC:

* "Hey I've got something I think Basho should do" - write your doc in markdown, branch `master` in the RFC repo, open a PR to add your `.md` to the root of the repo. The "initial open PR" state is currently understood as the initial review period for an RFC. The PR description should include a link to the doc, which will necessarily point to a branch.

* If Basho does not decide to go forward with the RFC, the PR will be labeled with `rejected` or something like that and closed. The `.md` could be moved to a `rejected/` directory to reduce clutter.

* If the RFC is given the OK, the PR is merged into `master` and an issue opened to track the RFC with a link to the document in the repo for easy finding. The issue is given an informative label (`approved`).

* When the work actually starts, the label changes to something different (`in-progress`). Links to other GH issues in other repos could be added to make it easy to find the RFC that inspired the work.

* When the work ships, the label changes to something different (`shipped`) and the issue is closed. The `.md` could be moved to a `shipped/` directory to reduce clutter.

* If, during the `approved` - `shipped` states a change is necessary, then a PR will be used for that process. A comment with a mention of that PR (i.e. `basho/rfc#123`) should be added to the "tracking issue" to keep things grouped.

* Fin
