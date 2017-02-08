# Basho RFCs

This repo contains documentation in Markdown format that detail RFCs
that require feedback from architecture and other relevant parties.

The workflow for RFCs has undergone significant changes in late
October 2016, so expect some turbulence while we sort through existing
RFCs.

### RFC Workflow

1. Create a new folder under `incoming/` directly on the `master` branch.
    * Create a `README.md` in the folder for the RFC itself (see below for template).
    * Supporting materials (typically diagrams) can be placed in the same folder.
    * See **Naming Folders** below.
2. Push `master` to github.
3. Create a new branch.
    * Move the folder to the top level of the `rfc` repository.
    * Push the branch to github.
    * File a pull request to merge your branch to `master`.
4. Solicit comments on the RFC via the open pull request.
    * Line comments are not possible with this model, so all comments must be general PR comments.
    * Make any changes to the RFC as seem appropriate and push directly to the files in `master`.
5. When consensus is reached merge the pull request to `master`.
    * No official approval needed to merge the PR.
    * "No one cares" is a valid reason to merge the PR.
    * Add a section at the top of the `README` to indicate the outcome of the discussion and link to the pull request.
    * If a project to implement the RFC exists, add the Jira link to the pull request and `README`.

Future status updates should primarily be directed to Jira, but it is
perfectly valid to add useful status information in `README` without a
new pull request.

Only open new pull requests against a merged RFC when extended
commentary is useful/necessary. Otherwise, just change the document in
place.

#### Naming Folders

All RFCs must go into a dedicated folder as `README.md`. The title of
the RFC should be captured (and possibly shortened) in the name of the
folder.

Make the name only as long as is necessary to capture essential
information for findability and discoverability. If it impacts
handoff, make sure `Handoff` is in the name.

Use [title case](http://www.titlecapitalization.com) for the folder
name. Use a space to separate each word. Underscores and hyphens are
just visual clutter for a directory structure that won't be processed
programmatically.

#### RFC Template

Here's a skeleton RFC template to use that outlines the key points
that need to be addressed when creating an RFC:

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

#### Source Code and POCs

It is useful to include source for POCs and prior work inside the directory created for an RFC. Example:

```
<rfc folder>/
    src/
      rfc_poc/
        src/my_poc.erl
```

### Leveraging the RFC

Our `rfc` repository is closed to the public. When the RFC is
instantiated inside our code base, if the RFC is close enough to the
final implementation to be useful, copy it into an appropriate
documentation folder.

If it needs to be cleaned up before doing so, please make the changes
in the `rfc` repository first, then copy it. There is no need for a
pull request to update this repository's copy.

### Feedback

Feedback to the Architecture team is welcome and expected! Send any comments or feedback to [arch@basho.com](mailto:arch@basho.com)
