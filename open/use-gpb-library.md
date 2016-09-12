# RFC: Use `gpb` protobuf library

Date       | Log
-----------|----------------
2016/07/14 | First Draft
2016/09/12 | Update #1 - `gpb` changes

### Abstract

Currently the [`erlang_protobuffs`](https://github.com/basho/erlang_protobuffs) library is used by Riak and `riak_pb` to translate `.proto` files into Erlang code that can serialize / deserialize records into binary format. Basho developed this library years ago, but it has fallen out of active support, and has a few deficiencies:

* Slow
* Does not deal with "extra" binary data in a message. If a newer message (with additional fields / data) is sent to a deserializer expecting the older format, the deserializer crashes. This limits how upgrades to client libraries can proceed
* Basho shouldn't be in the business of writing and supporting a protobuf library for Erlang, especially given the quality of `gpb`
* Does not support all of protobuf 2 spec

I propose switching to the [`gpb`](https://github.com/tomas-abrahamsson/gpb) library, which has the following advantages:

* Supported. Tomas is very active with the project and a pleasure to deal with ([PR #1](https://github.com/tomas-abrahamsson/gpb/pull/56), [PR #2](https://github.com/tomas-abrahamsson/gpb/pull/57))
* Supports most if not all of protobuf 2 spec, including ignoring extra data in a message
* In synthetic benchmarks, much faster than `erlang_protobuffs`. In real-word Riak benchmarks, not much difference is noticed (no downside, at least)
* Most likely will support protobuf 3 (but I hope we switch to TTB format by then for all messages...)

### Implementation

Switching to `gpb` requires that we change how the `.proto` files are converted to Erlang. Right now, a `rebar` plugin is used to run the conversion *on every single build* of `riak_pb`. This is unnecessary as the generated files can and should be checked in to source control and only re-generated when their content changes.

To this end, the `features/lrb/use-gpb` branch of `riak_pb` removes the generation step from `rebar.config` and adds a [separate `Makefile` target](https://github.com/basho/riak_pb/blob/features/lrb/use-gpb/Makefile#L27-L29) to do the generation. It uses a [dedicated config file](https://github.com/basho/riak_pb/blob/features/lrb/use-gpb/protogen.config) for `rebar`.

### Status

A while back, I created the following branches to try out `gpb` in Riak

* [`basho/riak`](https://github.com/basho/riak/tree/features/lrb/use-gpb) - based on `2.1.4` tag
* [`basho/riak_kv`](https://github.com/basho/riak_kv/tree/features/lrb/use-gpb) - based on `basho/2.1`
* [`basho/riak_api`](https://github.com/basho/riak_kv/tree/features/lrb/use-gpb) - based on `basho/2.1`
* [`basho/riak_pb`](https://github.com/basho/riak_pb/tree/features/lrb/use-gpb) - based on `2.1.4.0` tag
* [`basho/riak-erlang-client`](https://github.com/basho/riak-erlang-client/tree/features/lrb/use-gpb) - based on `2.1.2` tag

We have also forked `gpb` here:

* [`basho/gpb`](https://github.com/basho/gpb)

Running each project's test suite and dialyzer is successful. I have run most of the `riak_test` suite with success.

### Risks

* `erlang_protobuffs` is [more lenient when a list is provided](https://github.com/basho/erlang_protobuffs/blob/master/src/protobuffs.erl#L148-L151) as data for a `bytes` field. You can see that `rpberrorresp` sometimes has a list for `errmsg`, requiring [a fixup here](https://github.com/basho/riak_pb/blob/features/lrb/use-gpb/src/riak_pb_codec.erl#L406-L412). One workaround would be to add support to `gpb` to interpret lists as unicode strings when serializing to `bytes` fields.
* In Erlang code, `erlang_protobuffs` uses `1` and `0` for true and false, whereas `gpb` uses the atoms `true` and `false`. Of course, booleans are still serialized to `1` and `0`, as the spec requires.
* The functions to encode / decode messages are named slightly differently so usages must be carefully found and changed (unless macro magic can help?).

2016/09/12 Update to the above:

Working with Tomas, he has implemented an `epb_compatibility` option that provides 100% drop-in capability for `gpb` to replace `erlang_protobuffs` in a project. After using the latest set of changes, no code changes are necessary in Riak - only changes to how the `.proto` files are converted into Erlang (which is already done in the `riak_pb` and `riak_kv` `Makefile` files).

### TODO

* Rebase branches to the correct starting point
* Re-name branches to whatever the standard is these days
* Deal with the "Unicode Strings as Lists" serialization issue (DONE - `ebp_compatibility` option)
* Ensure every client library works correctly with `gpb`-enabled Riak
