# RFC: S3 Object Versioning

### Abstract

This RFC is *on-hold*, and was created when there was a requirement to include [versioning][1] in [RIAK S3 API][3]. It contains a proposal to add [S3 object versioning][1] in [RIAK S3 API][3]. The RFC is influenced by [RIAK S3 API][3]s implementation of [S3 object lifecycle management][4] and [GET Bucket Object Versions][8]. A PoC for this feature is available [here][7].

### Background

S3 supports [versioning][1] of objects. Versioning is a [bucket][2] level settingand when enabled for a bucket, S3 stores a current and non current version for every object. Versioning can be suspended for a bucket but can not be disabled once enabled. S3 allows [get][11] or [delete][11] of a specific version of an object. Also allowed is [list][8] of a version enabled bucket that gets metadata about all versions of the object in that bucket.

The following APIs need to be implemented to support versioning of objects in [RIAK S3 API][2].

#### Bucket APIs

* [GET Bucket Object Versions][8]
* [Get Bucket Versioning][9]
* [Put Bucket Versioning][10]

#### Object APIs

* [Get Object][11]
* [Delete Object][12]

### Proposal

[RIAK S3 API][2] stores an object by mapping a `{S3BucketName, Key}` pair to a `{{S3BucketName, <<"__s3_bucket__">>}, Key}`. Versioning is implemented by storing a manifest instead of the object at `{{S3BucketName, <<"__s3_bucket__">>}, Key}`. The manifest is a data structure like

```erlang
manifest_v1 {
  current :: object_v1{}
  non_current :: [ object_v1{} ]
}

object_v1 {
 version :: binary()
 data :: {key, RiakKey :: binary()}
}
```

`object_v1{}` stores a RIAK Key pointing to the actual object data. The manifest is a fixed size structure, a record, rather than a variable sized structure like a list or dict for type-safety and pattern-matching.

#### Storing manifests and data

Once versioning is enabled `{{S3BucketName, <<"__s3_bucket__">>}, Key}` stores a manifest instead of the actual object. It is tempting to store the actual object like,

`{{S3BucketName, <<"__s3_bucket__">>}, RandomKey}`

but this would prevent an efficient implementation [list objects][6]. [list objects][6] depends on keys being sorted in the backend when filtering keys that do not match a prefix. Having randomly generated keys in the same bucket means [list objects][6] would need to do the filtering, e.g., based on a tag in the object metadata, but that is prohibitive in computation cost. Instead, when versioning is enabled for a bucket we store

* Manifest at `{{S3BucketName, <<"__s3_bucket__">>}, Key}`
* Object at `{{S3BucketName, <<"__s3_bucket__data__">>}, Key_<N>_<Version>}`

The generated key for the object is `Key_<VersionNum>_<Version>`, where `VersionNum` is an incremeting integer, stored in the manifest and `Version` random bytes representing the `Version`. `Key_<VersionNum>_<Version>` is preferable to a random key as there is trace-ability between versions of an object and `{S3BucketName, Key}` pair. It allows a manifest to be repaired or recreated if it ever goes out sync.

#### Rollout on an existing cluster

Enabling versioning changes how we store objects. An initial thought, to be future proof, is to always use a manifest and roll out the manifest before any data was written to the cluster. However, after some discussions in the team it was concluded that we can not assume buckets to be empty before rolling out versioning or require reformatting of data to enable versioning. Versioning, when added, should create manifests required on the fly. This has a positive side-effect. Not requiring a manifest always be present avoids extra reads or writes for accessing objects in non-versioned buckets. The downside is multiple paths in the code to access versioned and non-versioned data.

Rollout in a cluster with existing data would require that we distingiush manifest from data objects. A token in the metadata of a manifest, absence of which, can distinguish manifests from objects.

#### Downgrade

Once versioning is enabled for a bucket writing data to it will start creating manifests. Therefore, downgrade to a version of [RIAK S3 API][3] that does not support versioning will require reformatting of data.

#### Changing the manifest

Changes to the manifest structure after it has been stored persistently on customer deployments are inevitable. Being a fixed size structure, a record, implies that change to the manifest structure would require supporting multiple versions of the manifest in the source code until all data has been re-formatted. This is preferable to using a variable size structure a list or dict for two reasons.

* We can use type-safety to ensure that all versions of a manifest are handled correctly.

* It is explicit in handling of different versions.

#### Large Objects

There is a potential overlap in the implementation of versioning and large objects. Large objects can also be implemented using the same manifest by changing the manifest like:

```erlang
manifest_v1 {
  current :: object_v1{} | large_object_v1{}
  non_current :: [ object_v1{} | large_object_v1{} ]
}

object_v1 {
 version :: binary()
 data :: {key, RiakKey :: binary()}
}

large_object_v1 {
 version :: binary()
 data :: [{key, RiakKey :: binary()}]
}
```

where `large_object_v1{}` stores a list of RIAK keys, each storing a chunk of data. The key for a chunk is named as `Key_<ChunkNum>_<VersionNum>_Version`, extending the key for a version with `ChunkNum`. Including the `ChunkNum`, allows us to fix or recreate a manifest if required.


[1]: https://docs.aws.amazon.com/AmazonS3/latest/dev/Versioning.html
[2]: http://docs.aws.amazon.com/AmazonS3/latest/dev/UsingBucket.html
[3]: http://github.com/basho/riak_s3_api
[4]: http://docs.aws.amazon.com/AmazonS3/latest/dev/object-lifecycle-mgmt.html
[5]: http://docs.aws.amazon.com/AmazonS3/latest/API/v2-RESTBucketGET.html
[6]: http://docs.aws.amazon.com/AmazonS3/latest/API/v2-RESTBucketGET.html
[7]: https://github.com/raghavkarol/riak_s3_api/pull/1
[8]: http://docs.aws.amazon.com/AmazonS3/latest/API/RESTBucketGETVersion.html
[9]: http://docs.aws.amazon.com/AmazonS3/latest/API/RESTBucketGETversioningStatus.html
[10]: http://docs.aws.amazon.com/AmazonS3/latest/API/RESTBucketPUTVersioningStatus.html
[11]: http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectGET.html
[12]: http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectDELETE.html
