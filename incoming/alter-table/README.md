# RFC: ALTER TABLE

### Abstract

This RFC contains a series of technical documents pertaining to adding the capability to alter TS tables.

These technical documents cover:
* changes to the format of data on the metal
* the technical details of how changes are pushed around the riak ring
* a specification of how upgrade/downgrade will work for table schemas

From a user perspective they also cover:
* the user processes for applying changes to existing TS tables
* the user processes for writing to TS tables before, during and after a change to table structure

### Background

There are a number of guiding principles to this proposal:
* when a table changes its structure there will be no rewriting
    * data written to disk remains in its original format
    * upgrade and downgrade of data-on-metal to the current format will be done automatically
* a riak TS cluster must remain fully operational during a table format change
    * this includes client changes - an application must be able to upgrade from one table format to another smoothly under the control of the application developer

This RFC will be presented as a series of sub-documents which will be (fairly) self-contained in order to facilitate discussion and review.

The documents will be written bottom-up, from the metal format first and then back up the stack to the user experience to facilitate review and correctness checking.

### Contents

[On Disk Format](./on_disk_format.md)