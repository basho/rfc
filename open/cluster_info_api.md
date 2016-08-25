# RFC: Cluster API Info 

2016/06/20 Final Draft

### Abstract

For Riak 3.0, there is a need for a “Cluster API Info” API that can provide a Riak Client information about: 

1. What parts (Facets) and features of the external API are supported on all nodes in the cluster.
2. Which of the above features are enabled on all nodes.  
3. Connection information about each node in the cluster.
4. In addition to this, Riak should expose node information about the cluster. 

This document captures the design and behavior for this. 


### Purpose
The purpose of this document is to:

 - Have an agreed upon implementation specification
 - Describe the behavior of the commands, including error cases, client messages, and any user facing apis including riak-shell and riak-admin commands.


### Cluster API Info Proposal

#### 1. Overview

The Cluster API Info will contain information about two things: 

1. The collection of API features that all the Riak nodes support.
2. Information about each node in the cluster, including connection information, it’s erlang node name, cluster info such as state and availability, as well as a list of the major API “facets” each node supports. 

This information can then be used in the clients to make better choices about:

2. Which nodes to connect to (auto-discovery).
2. Which client API features to error out on if they are not supported server-side. (E.g. - Trying to run timeseries commands on Riak 2.0.7, or trying to run mapreduce jobs on a future riak version that has deprecated them).
3. Which API to use, if there are multiple options. (E.g. If Parallel Extract is supported, we can create a strategy to use that over ListKeys). 

##### Code Example 1.1 - Request and Response Example 
```erlang
%% erlang 
{ok, ClusterApiInfo} = riakc_pb_socket:get_cluster_api_info(Pid).

[
  {timestamp, “2016-05-17T16:47:55+00:00”},
  {available_api , [
    {api_kv_get, available}, 
    {api_kv_list_buckets, no_permission},
    {api_search_v1_search_query, unavailable},
    {api_search_v2_search_query, available}, 
    {api_dt_fetch, no_permission},
    {api_dt_type_hyperloglog, available},
    {api_ts_query, available},
    {api_ts_query_with_ttb, available},
    ...
  ]},
  {nodes_info, [
    {node_info, 
      {node_name, ‘riak@192.168.1.200’}
      {ip_address, “192.168.1.200”, 8087}, 
      {pb_port, 8087},
      {version_string, "riak 2.1.3"}, 
      {status, valid}, 
      {available, up}, 
      {facets, [api_kv, api_ts, api_2i, ...]}},
    ...
  ]}
]
```

##### Code Example 1.2 - Erlang Specs:
```erlang
%% erlang

get_cluster_api_info(Pid) -> ClusterApiInfo
Pid = pid()

%% The types listed below should be availble in a header file for easier cross-repo consumption
ClusterApiInfo = [cluster_api_info_result_item()]

cluster_api_info_result_item() = 
  {timestamp, Timestamp :: string()} |
  {available_api, Api :: [api_entry()]} |
  {nodes_info, NodesInfo :: [node_info()] | ‘no_permission’}

api_entry() = {facet_detail_name(), ‘available’|’unavailable’|’no_permission’}.

node_info() = [node_info_item()]

node_info_item() = 
  {ip_address, IpAddress :: string()} |
  {pb_port, PbPort :: pos_integer()} |
  {version_string, VersionString :: string()} |
  {status, Status :: status()} |
  {available, Available :: available()} |
  {api_facets, Facets :: [facet_detail_name()]}

status() = 'valid' | 'leaving' | 'exiting' | 'joining' | 'down'
available() = 'up' | 'down'
facet_detail_name() = atom()

```


notes: 
 - `api_entry()` contains an API key, and a status atom.  The status atom will default to `available` on most API features.  `unavailable` will be used for those features that are supported but specifically turned off, such as search.  `no_permission` will be used when the feature is supported, but the user has no permissions to use it. 
 - `no_permission` in the nodes field is used when the user does not have sufficient permissions to access cluster information.
 - `timestamp` is an ISO 8601 formatted timestamp string
 - `api_set` is a list of key/values that list the minimum covering set of common API facet details. 
 - `version_string` is the version string reported from each Riak node.
 - `status` is the node status as reported in [cluster status command](http://docs.basho.com/riak/kv/2.1.4/using/admin/commands/#status).
 - `available` is the node availability as reported in [cluster status command](http://docs.basho.com/riak/kv/2.1.4/using/admin/commands/#status).
 - `api_facets` are the collection of facet groups reported for each node.  Valid values are listed in [Table 10.1]().


##### Expected Errors
If any error should occur, Riak should return an RpbErrorResp message with an appropriate error code / message. Each client should return that error along the normal paths.  

 - Security is enabled, and client does not have permission to access the API.
 - If security prevents the user from looking up cluster information, then the nodes()section of the response will return the atom ‘no_permission’.


#### 2. Riak Changes

 - Register current API capabilities to riak_core_capability upon startup.
(See [Table 7.2](#table-72-facet-details) for the list of all capabilities).
 - Create functionality to roll up all the capabilities and node info in riak_kv. 
   - For features that can be turned on/off, query for that information at this point.
   - For features that depend on security permissions, also check those permissions. 
 - Create endpoints in riak_pb, riak_api, etc to expose this new info. 

* **Open Question:** Should we include or exclude loopback addresses for multi-homed riak nodes (listening on 127.0.0.1 and external ip, or 0.0.0.0 ? ).*

#### 3. PB Message Changes
The following messages will need to be added to the riak.proto file.

```java
message RpbClusterApiInfo {
    required bytes timestamp;
    repeated AvailableAPI availableApi;
    repeated NodeInfo nodes;
}

message AvailableAPI {
    required bytes api_key;
    required ApiStatus status;
}

enum ApiStatus {
    AVAILABLE = 0;
    UNAVAILABLE = 1;
    NO_PERMISSION = 2;
}

enum NodeStatus {
    VALID = 0;
    LEAVING = 1;
    EXITING = 2;
    JOINING = 3;
    DOWN = 4;
}

message NodeInfo {
    required bytes name;
    required bytes ip_address;
    required int pb_port;
    required bytes version_string;
    required NodeStatus status;
    required boolean available;
    repeated bytes api_facets;
}
```

#### 4. TTB Message Changes
This message set will not be available on the TTB interface.


#### 5. Client Changes

##### Immediate Client Changes

 - Call Riak on client startup for capabilities, cache these for some period of time.
 - Check API capabilities before executing a call, to make sure server supports it. Throw exception/error if it does not.

##### Future Client Changes

 - Use node information to automatically connect to all active & up nodes (auto-discovery).
 - In combination with a new Stats API, monitor FSM times & reduce requests to nodes that show higher than normal latencies. 


#### 6. Riak Shell / Riak Admin Changes

##### `riak-shell` Changes

 - Add a new riak-shell extension named ‘api’.
 - In the new extension, create two methods:
   - `available_cluster_api`
     - Fetches the available_api record from the server either using RPC, PB, or TTB.  Displays it in the format shown in [Figure 6.1](#figure-61---example-of-the-available_cluster_api-call_).
   - `nodes_api_info`
     - Fetches the nodes_info record from the server either using RPC, PB, or TTB.  Displays it in the format shown in [Figure 6.1](#figure-61---example-of-the-available_cluster_api-call_). 

##### Figure 6.1 - Example of the available_cluster_api call
```
✅ riak-shell(1)>available_cluster_api;
Publically Available API as of 2016-05-17 16:47:55+00:00

API Detail                      Available?

api_kv_get                      true
api_kv_list_buckets             no permission 
api_search_v1_search_query      false
api_search_v2_search_query      true 
api_dt_fetch                    no permission
api_dt_type_hyperloglog         true
api_ts_query                    true
api_ts_query_with_ttb           true
... 

✅ riak-shell(2)>nodes_api_info;
Nodes API Info as of 2016-05-17 16:47:55+00:00

Node Name          IP Address    Port Version String Status Avail API Facets
riak@192.168.1.200 192.168.1.200 8087 "riak 2.1.3"   valid  up    [api_kv, api_ts, api_2i, ...]
```

#### `riak-admin` Changes

 - Add a `cluster-api-info` command to the `riak-admin` script.  
   - Fetches the cluster_api_info record from the server either using RPC, PB, or TTB.  
   - Pretty-print the cluster_api_info atom back to the shell.

#### 7. Current List of API Facets (Riak 2.0+)
See the [live spreadsheet](https://docs.google.com/a/basho.com/spreadsheets/d/1TEYnCrlnQWy07rlCVjmNLa_4QiaGkgh6tKD5Vy5p4sA/edit?usp=sharing) for latest info. 

##### Table 7.1: Facet Groups

| Facet | riak_core_capabilities Key Prefix |
| ----- | --------------------------------- |
| Core|api_core |
| KV|api_kv |
| Time Series|api_ts |
| Search (Classic)|api_search_v1 |
| Search (Yokozuna)|api_search_v2 |
| DataTypes|api_dt |
| Map/Reduce|api_mapreduce |
| Secondary Indexes|api_2i |

##### Table 7.2: Facet Details

| Facet | Full Key | Description (What is supported) | Security Value to Check |
| ----- | -------- | ------------------------------- | ----------------------- |
|Core|api_core|Core Features Facet Header||
|KV|api_kv|KV Features Facet Header||
|Map/Reduce|api_mapreduce|MapReduce Features Facet Header||
|Search (Classic)|api_search_v1|Yokozuna Search Features Facet Header||
|Search (Yokozuna)|api_search_v2|Classic Search Facet Header||
|Secondary Indexes|api_2i|2i||
|Time Series|api_ts|TimeSeries Features Facet Header||
|Core|api_core_get_server_info|Get Server Info||
|Core|api_core_get_bucket_props|Get Bucket Propreties|riak_core.get_bucket|
|Core|api_core_set_bucket_props|Set Bucket Properties|riak_core.set_bucket|
|Core|api_core_reset_bucket_props|Reset Bucket Properties|riak_core.set_bucket|
|Core|api_core_get_bucket_type_props|Get Bucket Type Properties|riak_core.get_bucket_type|
|Core|api_core_set_bucket_type_props|Set Bucket Type Properties|riak_core.set_bucket_type|
|Core|api_core_auth|Auth Request|Is security enabled?|
|DataTypes|api_dt_fetch|Fetch Datatype||
|DataTypes|api_dt_update|Update Datatype||
|DataTypes|api_dt_type_counter|Counter Datatype||
|DataTypes|api_dt_type_set|Set Datatype||
|DataTypes|api_dt_type_register|Register Datatype||
|DataTypes|api_dt_type_flag|Flag Datatype||
|DataTypes|api_dt_type_map|Map Datatype||
|DataTypes|api_dt|DataType Features Facet Header||
|KV|api_kv_get|KV Get|riak_kv.get|
|KV|api_kv_put|KV Put|riak_kv.put|
|KV|api_kv_delete|KV Delete|riak_kv.delete|
|KV|api_kv_list_buckets|KV List Buckets|riak_kv.list_buckets|
|KV|api_kv_list_keys|KV List Keys|riak_kv.list_keys|
|KV|api_kv_get_bucket_key_preflist|Get Bucket/Key Preflist||
|KV|api_kv_get_coverage_context|Get Bucket Coverage Context||
|Map/Reduce|api_mapreduce_map_reduce_query|Map Reduce Query|riak_kv.mapreduce|
|Map/Reduce|api_mapreduce_javascript|JavaScript Map Reduce Engine||
|Map/Reduce|api_mapreduce_erlang|Erlang Map Reduce Engine||
|Map/Reduce|api_mapreduce_linkwalking|Map Reduce Linkwalking||
|Map/Reduce|api_mapreduce_key_filters|Map Reduce Key Filters||
|Search (Classic)|api_search_v1_search_query|Old Search Query|If security is enabled, this is disabled.|
|Search (Yokozuna)|api_search_v2_search_query|Yoko/New Search Query|search.query|
|Search (Yokozuna)|api_search_v2_get_index|Yokozuna Get Index|search.admin|
|Search (Yokozuna)|api_search_v2_put_index|Yokozuna Put Index|search.admin|
|Search (Yokozuna)|api_search_v2_delete_index|Yokozuna Delete Index|search.admin|
|Search (Yokozuna)|api_search_v2_put_schema|Yokozuna Put Schema|search.admin|
|Search (Yokozuna)|api_search_v2_get_schema|Yokozuna Get Schema|search.admin|
|Secondary Indexes|api_2i_index_query_with_coverage_context|2i Query with Coverage Context||
|Secondary Indexes|api_2i_index_query|2i Query|riak_kv.index|
|Time Series|api_ts_query|Timeseries Query||
|Time Series|api_ts_get|Timeseries Get Row||
|Time Series|api_ts_put|Timeseries Put Rows||
|Time Series|api_ts_delete|Timeseries Delete Row||
|Time Series|api_ts_list_keys|Timeseries List Keys||
|Time Series|api_ts_query_with_coverage_context|Timeseries Query with Coverage Context||
|Time Series|api_ts_query_with_ttb|Timeseries Query TermToBinary Encoding||
|Time Series|api_ts_get_with_ttb|Timeseries Get Row TermToBinary Encoding||
|Time Series|api_ts_put_with_ttb|Timeseries Put Rows TermToBinary Encoding||
|Time Series|api_ts_sql_aggregations|Timeseries SQL Aggregations Syntax||
|Time Series|api_ts_sql_create_table|Timeseries SQL Create Table Syntax||
|Time Series|api_ts_sql_describe|Timeseries SQL Describe Table Syntax||


