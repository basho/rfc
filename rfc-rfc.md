# RFC: RFC Process

Date         | Log
-------------|------------------------
`2016-10-07` | Initial Draft
`2016-10-13` | Minor wording changes

## Abstract

We've got a good RFC process that is easy to use, but items tend to wallow in PR state. Let's fix that by using GH features like labels and issues.

## Proposal

Workflow for an RFC:

* "Hey I've got something I think Basho should do" - write your doc in markdown, branch `master` in the RFC repo, open a PR to add your `.md` to the root of the repo. The "initial open PR" state is currently understood as the initial review period for an RFC. The PR description should include a link to the doc, which will necessarily point to a branch. Two labels should be added - `proposed` and `needs-review`.

* If Basho does not decide to go forward with the RFC, the PR will be labeled with `rejected` or something like that and closed. The `.md` should be moved to a `rejected/` directory to reduce clutter. `proposed` and `needs-review` would be removed.

* If the RFC is given the OK, the PR is merged into `master` and an issue opened to track the RFC with a link to the document in issue's description for easy finding. The issue is given an informative label (`approved`). `needs-review` would be removed.

* When the work actually starts, the label changes to something different (`in-progress`). Links to other GH issues and milestones in other repos could be added to make it easy to find the RFC that inspired the work. Since `basho/rfc` is private, no information leakage is possible.

* When the work ships, the label changes to something different (`shipped`) and the issue is closed. The `.md` file should be moved to a `shipped/` directory to reduce clutter.

* If, during the `approved` or `in-progress` states a change is necessary, then a PR will be used for that process. A comment with a mention of the "tracking issue" (i.e. `basho/rfc#123`) should be added to PR description to keep things grouped. The PR should be given the same label as the tracking PR, and the `needs-review` label should be added. When the PR is merged, `needs-review` is removed.

* That's it.

## How to find things

* Find RFCs needing initial review: https://github.com/basho/rfc/pulls?q=is%3Apr%20is%3Aopen%20label%3Aneeds-review

* Find approved RFCs needing review: https://github.com/basho/rfc/pulls?q=is%3Apr%20is%3Aopen%20label%3Aneeds-review%20label%3Aapproved

* Find in-progress RFCs: https://github.com/basho/rfc/labels/in-progress
