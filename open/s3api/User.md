# S3 User Support in Riak KV

## Overview
Riak already supports the notion of a user through [Riak Security](http://docs.basho.com/riak/kv/2.1.4/using/security/basics/).
However, there are several additions/modifications that need to be made in order to support the extended information required
for the S3 API being built upon Riak KV.

## Context from Related RFCs
   * An "S3 Bucket" (S3B) maps to a Riak bucket type and bucket (RBTB) with the bucket type and bucket named after the S3B.
   For example, creating an S3B named "users" would create a RBTB of {<<"users">>, <<"users">>}
      * /bucket/filename.jpg would be stored with key "filename.jpg" in the bucket {<<"bucket">>, <<"bucket">>}
      * This notion of a bucket is subject to change, but at a minimum each S3B will have its own Riak Bucket Type.
      * This bucket type will contain a pointer to the Riak Security user (user) in order to support the concept of bucket ownership.
      See [S3 Buckets](insert link here) for more information.

## Implementation

### Riak Users Today

Users in Riak Security are stored in Cluster Metadata with a key of the user name specified in the
Cluster Metadata prefix of `{<<"security">>, <<"users">>}`. The data stored in the user is a simple `proplist`
containing any additional details about the user.

### New data needed to support S3 Authentication

The proplist attached to the user key in cluster metadata will be used to store the additional data
needed for an S3 User in this data structure. These additional data include:
* Access Key ID (api_key ID)
  * We will need to be able to look up a user by Access Key ID, which means we may need to add an additional record
    in metadata that contains that mapping.
* Shared Secret

These new items will need to be either supplied by the end-user, or generated, probably in
the same way we do in riak_cs today.

## Random questions

* Do we need to specify the owner of the S3 bucket on the bucket type itself?
   * Yes - S3 API returns Bucket owner in several places, so we need it
* How do we store the shared secret used to sign requests?
   * And what about "Access Keys & Shared Secrets" - do we support multiple Access Key ID/Secret pairs _per user_
      * Store on the user record
      * May need an index of api_key -> user
   * How do we generate them? Options:
      * Provide something to make one from the command-line and utilize whatever CS used before
      * Allow user to simply specify it
* What about object-level ACLs? We have no way to specify those today
   * Where are they stored? Clearly, on the riak_object in metadata makes sense, but may bloat objects
   * Where are the ALCs enforced? If you have to load the object to enforce the ACL, you'd need to do a second security check post-retrieval that, I believe, doesn't easily fit into WebMachine's view of the world.
* Issues
   * Split SSL and security
      * Why?
         * so you can connect via non-encrypted channel and still send credentials (now AuthV4)
         * If using Auth V4, they shouldn't be required to use SSL
            * ? - Should we allow non-SSL for our plaintext auth? Many users may have SSL-terminating load balancers and therefore don't need/want encryption "inside the firewall"
      * Issues:
         * Clients expect SSL and Security to be enabled together, and won't work if they can't upgrade to SSL



## Existing Code: Notes and Examples
* All of the security implementation for Riak is in riak_core_security.erl
  * as always, a really big module
  * authenticate/3 has a 5-level deep case statement - my eyes are bleeding even more than they did when I found the below thing
     * we'll probably have to find a way to hook the v4 signature stuff in here, but it's going to be, shall we say, interesting
     * Also, we'll gut the crap out of this module and fix it all while we're there because OMG
* Check `riak_api_pb_server:connected/2` for an example usage for ProtoBuf - it's pretty generic (and, as always, really long functions)
* `riak_api_web_security/is_authorized/1 checks authorization (4-level deep case statement... my eyes are bleeding)
* `riak_kv_wm_bucket_type:forbidden/2` for an example of checking permissions
* Already have users & groups in riak_security
* Already can apply permissions to a bucket/bucket type!
   * Amazon's 4 "permissions" - how do they map to S3 Access Policy?
      * which do we need to support?
      * Do we support "Authenticated Users" and "All Users" groups, or just specific users?
         * This is mostly "do we support unauthenticated users"
         * How do you do this with security enabled???
* SSL things (future work, not related to Concur, but should be looked at).
   * Fully-encrypted cluster traffic
      * Lots of different communications channels
         * Client connections (HTTP & PB)
         * disterl
         * handoff
         * repl
      * On-disk encryption?
   * Key management solutions?
   * Protobuf - need to enable SSL w/o security enabled as well.
