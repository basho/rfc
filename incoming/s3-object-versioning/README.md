# RFC: S3 Object Versioning

### Abstract

[S3 Object versioning][1] is a feature to be included in [RIAK S3
API][2]. Object versioning is a bucket level setting and when enabled,
assigns a new version to data that is stored under a bucket, key
pair. There is a current version of data and 0 or more non-current
versions.

Implementing object version requires a manifest that describes where
and how the _actual_ current and non-current versions of data are
stored.

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
write operations would first store the actual object and then update
the manifest. The manifest is a fixed size structure, a record, rather
than a variable sized structure like a list or dict for type-safety
and pattern-matchability. It might also be the solution for storing
objects that will need to be split into smaller chunks to store in
RIAK.

#### Storing an object

An object is uploaded at an `S3BucketName`, `S3Key` pair, which is
mapped to a RIAK bucket type, bucket and key as

| *S3*          | *Riak*           |
|-------------- |------------------|
| S3BucketName  | RIAK Bucket Type |
| __s3_bucket__ | RIAK Bucket Name |
| S3Key         | RIAK Key         |

referred to as the `BKey`. We will store the manifest at the `BKey`
and generate a random key, which is also the version, for the
data. Once stored, data at the `BKey` will not be modified. The
generated key will be stored as a reference to the data in the
manifest. Every uploaded object will require at least two writes, one
for the data and the other to update the manifest.

There are few design decisions to note,

* Every S3 object to be stored requires update of at least two RIAK
  objects.

* Keys for data are randomly generated and the manifest and data are
  stored in the same RIAK bucket as the actual data.

### Storing Large Objects

Large object will need to split into smaller "chunks" of data for
storing because of limitations on maximum size of a RIAK
object. Extending the `object`, the reference to data to store a list
of keys like

```erlang
object {
 id :: binary()
 data :: [key, RiakKey :: binary()]
}
```

instead of a single key allows one to store chunks. Each chunk would
be assigned a random key and stored in the same RIAK bucket as the
data. Meta-data about the chunks could be stored as a header with the
actual data or as RIAK object metadata.

#### Potential Issues

##### Object Lifecycle

Uses the sweeper to iterate over all objects. The sweeper visits a
RIAK object at a time and will need to know if the RIAK object it is
visiting is a manifest, a current version or a non-current version.

#### List Objects

Uses leveldb backend in a way that assumes data is stored in at the
`S3BucketName` and `S3Key` pair.

### References

[1]: https://docs.aws.amazon.com/AmazonS3/latest/dev/Versioning.html
[2]: http://github.com/basho/riak_s3_api
