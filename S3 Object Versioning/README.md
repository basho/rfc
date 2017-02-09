# RFC: S3 Object Versioning

### Abstract

[S3 Object versioning][1] is is a feature to be included in [Riak S3
API][2]. Object versioning is a bucket level setting and when enabled,
assigns a new version to data that is stored under a bucket, key
pair. There is a current version of data and 0 or more non-current
versions.

Implementing object version requires a manifest that describes where
where and how the _actual_ current and non-current versions of data
are stored.

This RFC proposes a design for this manifest.

### Background

Amazon official document for [object versioning]
(https://docs.aws.amazon.com/AmazonS3/latest/dev/Versioning.html) has
an overview of the feature. Object versioning has an effect on some
bucket and object APIs as well as [S3 Object lifecycle]
(http://docs.aws.amazon.com/AmazonS3/latest/UG/lifecycle-configuration-bucket-with-versioning.html).

#### Bucket APIs

* [GET Bucket Object Versions](http://docs.aws.amazon.com/AmazonS3/latest/API/RESTBucketGETVersion.html)
* [Get Bucket Versioning](http://docs.aws.amazon.com/AmazonS3/latest/API/RESTBucketGETversioningStatus.html)
* [Put Bucket Versioning](http://docs.aws.amazon.com/AmazonS3/latest/API/RESTBucketPUTVersioningStatus.html)

#### Object APIs

* [Get Object](http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectGET.html)
* [Put Object](http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectDELETE.html)

### Proposal

Use a manifest RIAK object structured like:

```erlang
manifest {
  current :: object{}
  non_current :: [ object{} ]
}

object {
 id :: binary()
 data :: {key, RiakKey :: binary()}
}
```

Note, `object{}` is a reference to an S3 object stored in RIAK. All
write operations would first the actual object and then update the
manifest. The manifest is a fixed size structure, a record, rather
than a variable sized structure like a list or dict for type-safety
and pattern-matchability. It might also be the solution for storing
objects that will need to be split into smaller chunks to store in
RIAK.


### References

[1]: https://docs.aws.amazon.com/AmazonS3/latest/dev/Versioning.html
[2]: http://github.com/basho/riak_s3_api
