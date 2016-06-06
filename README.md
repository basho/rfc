# Basho RFCs

This repo contains documentation in Markdown format that detail architectural RFCs that require the attention of the Architecture team.

### Creating new RFCs

To create a new RFC, submit a PR to this repo that contains a new file or directory inside the `open/` directory. This indicates that a new RFC submission is available for comment. While the RFC is in the "open" status, additional commits and comments can be made to discuss the details of the RFC.

#### RFC Template

Here's a skeleton RFC template to use that outlines the key points that need to be addressed when creating an RFC:

```
# RFC: <Title>

### Abstract

<One paragraph summary of the problem and proposed solution (if any)>

### Background

<Background information; references to industry work or research; prior work on the problem>

### Proposal

- Outline
  - For multi-stage tasks

<Discussion of the work being proposed>

### References

<Links to existing projects or source code; external references>

- [http://link.to/some_reference](External Reference)
- [http://github.com/owner/project](GitHub Project Reference)
- [http://github.com/owner/project/issues/1](GitHub Issues Reference)
- [http://github.com/owner/project/pr/1](GitHub PR Reference)
```

#### Source code and POCs

It's acceptable to include source for POCs and prior work inside a directory created for an RFC. To do that, create a hierarchy inside the `open/` directory and include a `README.md` which is derived from the above template and include any relevant source code or snippets that go along with the RFC you're creating.

```
open/
  slugline_for_rfc/
    README.md
    src/
      rfc_poc/
        src/my_poc.erl
```

### Changing the status of an RFC

To change the status of an RFC, submit a PR to this repo that moves the RFC from the `open/` directory to one of `unassigned/`, `assigned/`, or `complete/`. Once an RFC has changed status, the tree should be tagged so that future links can always access the RFC as it was at that point in time.

### Code to implement the RFC

When creating a new project to implement or work on the features of an RFC, a backlink from that project to the RFC should be prominent in the README of the project, or in comments in source code if changing existing code. It's acceptable to use either a commit hash or a tag in the link to ensure the version of RFC being used as a reference is accessible in the future.

In general, changes should not be made to the content of the RFC once it has moved from "open" to another status. If changes /are/ necessary, however, it's important to make sure that links to the RFC reflect the commit hash or tag associated with that change to ensure code changes are referencing the version of RFC that directed the change.

### Feedback

Feedback to the Architecture team is welcome and expected! Send any comments or feedback to [arch@basho.com](mailto:arch@basho.com)
