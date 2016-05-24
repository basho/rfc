# Basho RFCs

This repo contains documentation in Markdown format that detail architectural RFCs that require the attention of the Architecture team.

### Creating new RFCs

To create a new RFC, submit a PR to this repo that contains a new file or directory inside the `open/` directory. This indicates that a new RFC submission is available for comment. While the RFC is in the "open" status, additional commits and comments can be made to discuss the details of the RFC.

### Changing the status of an RFC

To change the status of an RFC, submit a PR to this repo that moves the RFC from the `open/` directory to one of `unassigned/`, `assigned/`, or `complete/`. Once an RFC has changed status, the tree should be tagged so that future links can always access the RFC as it was at that point in time.

### Code to implement the RFC

When creating a new project to implement or work on the features of an RFC, a backlink from that project to the RFC should be prominent in the README of the project, or in comments in source code if changing existing code. It's acceptable to use either a commit hash or a tag in the link to ensure the version of RFC being used as a reference is accessible in the future.

In general, changes should not be made to the content of the RFC once it has moved from "open" to another status. If changes /are/ necessary, however, it's important to make sure that links to the RFC reflect the commit hash or tag associated with that change to ensure code changes are referencing the version of RFC that directed the change.

### Feedback

Feedback to the Architecture team is welcome and expected! Send any comments or feedback to [arch@basho.com](mailto:arch@basho.com)
