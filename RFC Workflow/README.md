# RFC workflow

## Right tool, right job

The [RFC repo](http://github.com/basho/rfc) offers several features to
us related to technical ideas and projects:

* Discoverability
* Findability
    * *Findability*: Find something you're looking for
    * *Discoverability*: Find something you didn't know existed
* Open discussion

[Jira](https://bashoeng.atlassian.net/) offers:

* Project status
* Reporting on project's relationship to releases

The information that Jira offers is subject to rapid change, at any
time during a project, and is designed to be visible to any part of
the business. The RFC repository is a poor place to attempt to mirror
that information.

Conversely, Jira is an awkward solution for conceptual discussions and
discoverability of old projects.

## Lifecycle challenges

RFCs do not tend to have a well-structured lifecycle:

* Some originate when the project is just a notion in someone's head,
  while some are encapsulation of a planned solution a team is
  preparing.
* A project may be abruptly stopped due to changing business
  requirements or resource availability; that information will
  typically be captured in Jira rather than the RFC.
* A project can often begin while the RFC is still under active
  discussion (or as implied above the RFC may be a late arrival to a
  project).

Thus, using either labels or folders to represent an RFC's status both
adds friction to the workflow and seems unlikely to be as accurate as
Jira.

## Proposed workflow

1. YOLO-merge a new RFC *as a folder* into an `incoming/` folder in
   `master`. Even if the RFC is intended to be a single file with no
   supporting documents, create a dedicated folder.
    * Having the document in `master` from the beginning makes it much
      easier to discover.
2. Create a pull request to migrate the folder from `incoming/` to the
   top level of the repository, also in `master`.
3. Commentary against the pull request serves as the historic record
   of discussions around the proposal.
    * Comments on individual lines will be harder to find in the
      future than general comments against the PR, so take that into
      account when adding comments.
4. Be sure to include a Jira link in the RFC to an epic or similar
   suitable resource to track project status.
5. Once comments have cooled down, merge the PR regardless of whether
   the idea is deemed to be worth pursing.
    * No need for a formal approval process, because the real approval
      comes in the form of resource allocation at the team/project level.
    * Even if the project is not pursued, it should be discoverable for
      future engineers interested in similar ideas.
