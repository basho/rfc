# RFC: Thumbs, A simple integration robot

### Abstract

Once upon a time, Bors was chosen to perform the duties of integration robot.
Since then, original goals have drifted and maintenance has lapsed. 

### Background

In recent years it has become apparant that the functionality provided by Bors, consistently is met with dissapointment and complaints.
Due to the relatively simple nature of our use case, we believe by defining crisp requirements, we can develop a tool to provide the required functionality without the current deficiencies.
We hope to involve all major stakeholders and consumers of Bors, distilling a list of minimally required features. 
This document aims to clarify the base requirement of this tool and propose a deployment.

### Current Issues

- API requests limit reached
- Unmaintained code, ironically, rusting.
- The nature of actions sometimes unclear

### Proposal

We propose to build an integration robot to perform the operations on pull requests based on preset rules.


#### Minimum requirements

- **REVIEW**: When a push is made to a pull request branch, it should be evaluated against a default set of rules:
-  IF PR is reviewed by at least 2 people that aren't the author, continue.
- **MERGE**: An integration branch is created and a rebase is performed of the pr branch onto the target
- IF it fails, mark the build as failed, update Github PR comment with status of failure.
- **BUILD** the branch
- IF it fails, mark build as failed, update Github PR comment with status of failure.
- **TEST** the branch with unit tests.
- IF it fails, mark the build as failed, update Github PR comment with status of failure.
- **PASS**: Merge, Build and Tests all pass, system merges working integration branch to target branch. 
- System updates Github PR comment with status of success and closes PR

#### Implementation 

- A running daemon process listens for github webhook calls.
- When a webhook trigger is received, it conducts a set of steps to evaluate the build.
- Pulls down PR metadata relating to push
- Iterates through comments to count nonauthor reviewers
- creates work area, checks out integration-test branch
- attempts a rebase of PR branch onto target
- attempts a build run on the newly merged branch work dir.
- attempts a test run on the newly built branch work dir.
- pushes successfully built integration-test branch to target branch
- updates PR comment with success status

#### Stories
- As a user, I should be able to set the default required reviewer count in a config file

### References

- Bors [https://github.com/graydon/bors](https://github.com/graydon/bors)
- Thumbs [https://github.com/davidx/thumbs](https://github.com/davidx/thumbs)
