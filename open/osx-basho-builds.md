# RFC: OSX for basho-builds

### Abstract

Devops would like to create a build infrastructure for OSX that closely mimics the current build infrastructure for other operating systems. We hold the following tenets for any OS that is introduced in basho-builds:
* The system must support spinning up and tearing down of build / test infrastructure at any time
* The system must be able to provision arbitrary versions of the OS at any time
* The system must be accessible to engineering through defined gateways (ie jenkins) without any sheparding from Devops

### Background

As stated by product management, Engineering is to deliver packages for the last two versions of all supported operating systems. While this is easy for most of the Unixes due to their licensing scheme and availability of tooling (ie AWS), this is a problem for OSX since the license only allows the OS to be run on apple hardware (virtualized or otherwise).

Running a set of machines, either on our own premises or otherwise, does allow us to build for multiple versions of OSX, but requires a hard lock of the OS version on those machines. This prevents us from running arbitrary versions at any given time, and provides no delineation between building and testing envs, potentially allowing build and testing processes to interfere with eachother either actively or passively. 

### Proposal

**Virtual OSX Environment using VMWare**
* Provides clustering / management of multiple machines into resource pool
* Provides API for management / spin-up / teardown of resources
  * API is different from AWS, but ansible provides core module for management of VSphere, so we can leverage most existing effort
* Allows for arbitrary versions of OSX without dependence on underlying OS version
* Provides open access via API without exposing underlying hardware to risk

### References
* [Cost analysys](https://docs.google.com/spreadsheets/d/1mw6XG23dnbstsTBAMBoQc1FCKkT98cSa79thvmg89CI/edit#gid=0)
