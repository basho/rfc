
# Changing the Riak to Client Protocol

The scope of this RFC describes the current APIs that Riak Time Series extends, and what they must do to allow smooth upgrade and downgrade against client versions.

### Gloassry

Client
:   The client library used to connect and communicate with Riak TS e.g. the (Java Client)[https://github.com/basho/riak-java-client].
Supported Version Range

### Riak TS has three public APIs

* Protobuffs using the `riak_pb` library. Internal datastructures in the client and in Riak TS are converted to records that are auto generated, which are then encoded to protobuff formatted binaries. This is supported by all TS clients.
* TTB or `term_to_binary`, currently records in `riak_pb` are converted to binary using the `erlang:term_to_binary/1` function and sent to the client. This is supported by the erlang, python and java clients.
* Each type of request in the HTTP API has a code path specific to that request. Currently no flags are supported in the query path. This RFC skips the HTTP API since it doesn't support flags so there is no protocol as such to be changed.

## Scenarios

### Supported Version Range

Bear in mind that Riak TS must be compatible with the previous and future two versions. For example the future 1.7 must be compatible with 1.5, 1.6, other 1.7 nodes and future 1.8 and 1.9 releases. All of these versions **could** be running in the same cluster.

AFAIK there are no safe guards against someone accidentally adding a node with a version that is not in the approved version range.

Downgrade is not supported between 1.5 and lower versions, it is assumed supported in the versions we use in the scenarios.

### System Architecture

The assumed architecture for the system in all scenarios is the user's application that has a client pool, connecting to a proxy (1.). The proxy connects to all nodes in the Riak Cluster that it can connect to, taking into account network partitions to and between nodes. The clients do not have knowledge of control over which Riak TS nodes they connect to.

1. [Proxies and Load balancers](http://docs.basho.com/riak/1.4.0/cookbooks/Load-Balancing-and-Proxy-Configuration/).

### Riak TS Upgrades

Riak TS nodes are upgraded by stopping one node at a time, running the commands to upgrade the software (1.) and restarting. Between each step and between each node upgrade, the cluster should ideally be allowed complete hand off.

1. [Upgrading Riak TS nodes](http://docs.basho.com/riak/ts/1.4.0/setup/upgrading/)

### Riak TS Upgrades

Riak TS node downgrades work in the same way as upgrades, but are only executed in an emergency scenario where the new version is causing immediate issues and there is not enough capacity to take the upgraded nodes out of production.

### Upgrading Clients

**The upgrade docs do not give instruction on what Riak TS users should do about their clients.** (1.)

The current [protobuffs](https://github.com/basho/erlang_protobuffs) library does not allow decoding a message that has an optional field that is not part of it's known definition. This means that clients can only be upgrade **after** all nodes have been upgraded. If a node must be downgraded all the clients must be downgraded before the node. 

The protobuffer [gpb](https://github.com/basho/gpb) library that will replace protobuffs in Riak accepts "newer" versions of records with optional fields, by dropping them meaning a newer client could successfully communicate with Riak TS if it used gpb on the server side.

See the upgrade scenario for details on the TTB client in an upgrade scenario.

1. (TS upgrade docs)[http://docs.basho.com/riak/ts/1.4.0/setup/upgrading/]
2. (JIRA for client upgrade docs)[https://bashoeng.atlassian.net/browse/RTS-1545]

### Scenario 1, Riak TS Node Upgrade

The following steps are:

##### 1. The clients are upgraded to the current version, all Riak TS nodes are running the previous version

* The clients must be able to accept responses from the previous versions of Riak TS.

##### Protobuffs API

In the `riak_ts.proto` file we have the `TsQueryReq` message on the client side. Because Riak TS is still running the previous version, the message definition on the server side does not have the `allow_qbuf_reuse` field. The client will be sending this field, but the server must ignore it to be able to serve the request.

```
// Dispatch a query to Riak
message TsQueryReq {
  // left optional to support parameterized queries in the future
  optional TsInterpolation query = 1;
  optional bool stream = 2 [default = false];
  optional bytes cover_context = 3; // chopped up coverage plan per-req
  optional bool allow_qbuf_reuse = 4 [default = false];
}
```

##### TTB API

The TTB API uses the records produced by the protobuff definitions in `riak_pb`, the message is turned into a byte array using `erlang:term_to_binary/1` (1.) and sent to the server. This means that the current record is sent to the previous version node, which doesn't understand the new definition. If the node tries to do a record match on the message it will typically throw an exception.

1. https://github.com/basho/riak_pb/blob/develop/src/riak_ttb_codec.erl#L39

##### 2. A Riak TS node is upgraded to the current version

* The clients must be able to send requests that can be understood by the current **and** previous version of Riak TS.

We can assume that the client and Riak TS node using the same protocol version can communicate, and any failure that is not network related is a logic bug that requires a code fix, without significant change.

This leaves the case in point 1 where a current version client communicates with a previous version TS node, which is not yet upgraded.

##### 3. New field in PB Riak Response messages

A new field is added to a protobuffs message that is sent from Riak to the Client. The erlang protobuffs library cannot decode messages with optional fields that are not part of it's definition. This means that the clients must be upgraded **before** any Riak nodes, which is the opposite of the usual procedure.

If a request message that is sent from the client, to Riak has a a field added to it's message then it is not possible to safely upgrade Riak or the Clients first.
