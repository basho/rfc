# RFC: S3 Boundaries

### Abstract

The S3 API allows users to list S3 objects. This is a common operation, and it returns the object name and some metadata, including `etag`, `last modified`, and `size`. Presently in Riak KV, some of these are computed at read time. In the case of the etag, by computing the md5 hash of the version vectors. However; key listing in KV is expensive and discouraged. I propose we precompute these attributes in the case of an S3 PUT and store the metadata in the `riak_object` in order to make this operation, which will be common in S3, less expensive. This RFC is a request for comments on this approach, and more generally, on recognizing and unifying the boundaries we have between S3 and Riak KV.

### Background

`riak_s3_api` is an erlang application that lives side-by-side with Riak KV and provides an S3-compatible API. Its abstractions already meet Riak KV at a number of places:

* Riak S3 Users: we add attributes to Riak Security users under the namespace `s3`:
  * s3.display_name
  * s3.access_key_id
  * s3.secret_access_key
* Buckets are Riak S3 Buckets if:
  * there exists a bucket type and bucket of the same name, e.g. bkey of {bucket_name, bucket_name}
  * the bucket type has {username, Username} metadata

This coupling implies a protocol (i.e. you can't simply change the namespace for riak security metadata in a later version). Writing to the `riak_object` metadata on an S3 put will introduce another namespace. Because we co-exist with Riak KV, this RFC is both a request for comments on approach, and on namespace.

### Proposal

#### Normalize namespace for S3-related boundaries
In the case of Riak S3 Buckets, there is presently no prefix, which could lead to some interesting, probably unexpected behavior for customers who run both KV and S3 loads on the same cluster. We should define one prefix, and apply it uniformly across riak_core_metadata, the concept of a Riak S3 Bucket, and `riak_object` metadata.

Speaking with Jason Voegele on the topic, he suggested we increase the specifity of our prefix and avoid collisions by using the well-known reverse domain name pattern: _com.basho.riak.s3_.

I concur.

#### Write Riak Object Metadata on S3 Put
Instead of computing the etag as the md5 of the version vectors on read, in S3, we will:
* Compute the MD5 of the request body (this also lets us validate client-set md5 sum)
* Store that as e.g. `com.basho.riak.s3.etag`
* Store size as e.g. `com.basho.riak.s3.size`, etc.
