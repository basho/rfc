# RFC: Ad-hoc Clustering for Repeatable Test Cycles

Discussion: https://github.com/basho/rfc/pull/2

### Abstract

We have several use cases in different contexts where we need ad-hoc Riak clusters. For instance, build/test cycles need ad-hoc clusters in order to run unit and integration tests; there are also demo and sales use cases where we want to spin up an ad-hoc cluster in order to demonstrate Riak's operational flexibility. Unfortunately, creating Riak clusters is not easy when the operations are all automated and non-interactive. It's not clear what steps must be taken and in what order to end up with a working cluster. Cycle times of minutes are not unusual. That may not be a problem for one-off type tasks, where you can afford to wait for several minutes while a cluster settles. But when creating ad-hoc clusters, especially if the cluster creation happens frequently within the scope of a test (like starting a cluster with a clean slate), waiting minutes for a cluster to "settle" provides a suboptimal user experience.

We should define the canonical way to create a Riak cluster using whatever tools are in use (Jupyter notebook, Bash script, Docker container, Java test suite, whatever...) and identify any gaps that need engineering attention in order to reduce cycle times and ensure a working cluster.

### Background

To make creating clusters easier, the MARQS team devised a Docker container that runs a single Riak node. To start a single Riak node and expose the default ports, the user just does a `docker run`:

    $ docker run -d -P --name=dev1 basho/riak-ts

The image has smarts built in that allow the user to create an ad-hoc cluster by running the image with the appropriate parameters. After the above command is run, a subsequent node can be auto-joined to the cluster by linking the containers:

    $ docker run -d -P --name=dev2 --link=dev1 -e CLUSTER1=dev1 basho/riak-ts

This quickly builds up a cluster using containers if run manually. Scripting this process is hard because there's nothing to prevent the user from issuing docker run commands before the nodes are ready to be joined to a cluster. If the commands are run "too soon" (e.g. before the primary node is completely ready) then the cluster won't ever settle, with usually one node stuck in "joining" status indefinitely.

The Spark Connector team has taken this one step further and encoded a cluster start/join process into Java code that can be run from a unit or integration test. The process it follows is similar to running the docker image directly from the command line but has some needed tweaks to accommodate a different context in which it is run (using a Java-based Docker client rather than the CLI).

Here is some psuedo-code to illustrate starting a 3-node ad-hoc cluster for integration tests (currently implemented in Java but could be translated to other languages easily):

- (1..3 as N).fork(() -> startNode(name + N).andAfter(`riak-admin wait-for-service riak_kv`))
- if(N > 1) joinNode(name + N, name + 1)
- if(N == 3) clusterPlan(); clusterCommit(); blockUntilHandoffComplete()

### Proposal

The process of translating these basic steps to other languages is compounded by the different capabilities (and possibilities) of the different platforms where we need to support ad-hoc clusters. e.g. we've started using the Docker container to create ad-hoc clusters from Python. But we could easily create a common_test framework to do the same from Erlang.

Given the fragility of the above process (and a race condition that seems to exist if the correct "waits" aren't performed, both the wait-for-service and the cluster handoff wait), it seems we need a better way to specify a cluster configuration at boot time that doesn't involve a join/plan/commit/wait cycle that increases cycle times significantly.

#### Declarative Cluster Config

It would be helpful to have a way to specify the configuration of a cluster declaratively. We could specify arbitrary names to accommodate situations where there is no real DNS or EPMD entry for the host or node name, like in a Docker container using the --name and --link options. The configuration should be specified in a language-neutral way, using something like JSON or YAML since several languages will be using the functionality.

This would also fit some situations we've come across recently where a cluster could be started with a declarative config at boot time, in which the user could provide the map needed to translate old node/vnode information to new ones because the config would contain the arbitrarily-named segments of the ring that represent what we can only represent today with a join/plain/commit/wait/rename cycle.

A minimal config could be represented by JSON or YAML:

```json
{
  "my_test_cluster": {
    "options": {
      "riak": {
        "ring_size": 256
      },
      "docker": {
        "args": [ "-p 8098:10018" ]
      }
    },
    "nodes": [
      {
        "name": "<<optional: my_test_cluster_1 if not specified>>",
        "options": {
          "riak": {
            "listener.http.internal": "127.0.0.1:10018"
          }
        }
      }
    ]
  }
}
```

The above JSON could be created from multiple languages and could even be generated on-demand as a way to "checkpoint" a cluster config. An export feature could be created that would write this JSON which could then be re-applied after migration or restart.

### References

- Riak Docker image [https://github.com/basho-labs/docker-images/tree/master/riak](https://github.com/basho-labs/docker-images/tree/master/riak)
- Dockerized Riak test framework [https://github.com/basho-labs/riak-test-docker/](https://github.com/basho-labs/riak-test-docker/)
