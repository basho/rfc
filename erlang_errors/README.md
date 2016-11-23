# Operational Processes For Handling Erlang Errors

## Introduction

This document outlines business process issues for handling Erlang errors reported in normal customer usage

## Purpose

The purpose of this document is to enable changes to:

* cross-team operational processes
* organisational structures
* allocation to Eng staff
* working practices of CSE/Pro-Srv
* working practices of Engineers

to enable us to use reported Erlang errors to improve the product

## Scope

The scope of this RFC is:

* code crashes reported in logs by customers (via `riak-admin debug` reports)
* code crashes reported by our internal testing (via logs on the test servers)

## Background

Elegant error handling is one of the most important and least well understood aspects of the design of the Erlang run-time system - and the one that has the most impact on both cost and quality of code bases written in Erlang.

In **normal** programming languages error and exception handling is done inline. Module 1 calles Module2 which calls Module 3 etc, etc:
```
 ┌───────────────────────────────────┐
 │            Module 1               │
 │ ┌──────────────────────────────┐  │
 │ │                              │  │
 │ │                              │  │
 │ │             Code             │  │
 │ │                              │  │
 │ │                              │  │
 │ └──────────────────────────────┘  │
 │ ┌──────────────────────────────┐  │
 │ │      Exception Handling      │  │
 │ └──────────────────────────────┘  │
 └───────────────────────────────────┘
                   │
                   │ Calls
                   ▼
 ┌───────────────────────────────────┐
 │            Module 2               │
 │ ┌──────────────────────────────┐  │
 │ │                              │  │
 │ │                              │  │
 │ │             Code             │  │
 │ │                              │  │
 │ │                              │  │
 │ └──────────────────────────────┘  │
 │ ┌──────────────────────────────┐  │
 │ │      Exception Handling      │  │
 │ └──────────────────────────────┘  │
 └───────────────────────────────────┘
                   │
                   │ Calls
                   ▼
 ┌───────────────────────────────────┐
 │            Module 3               │
 │ ┌──────────────────────────────┐  │
 │ │                              │  │
 │ │                              │  │
 │ │             Code             │  │
 │ │                              │  │
 │ │                              │  │
 │ └──────────────────────────────┘  │
 │ ┌──────────────────────────────┐  │
 │ │      Exception Handling      │  │
 │ └──────────────────────────────┘  │
 └───────────────────────────────────┘
                   │
                   │ Calls
                   ▼
 ┌───────────────────────────────────┐
 │            Module 4               │
 │ ┌──────────────────────────────┐  │
 │ │                              │  │
 │ │                              │  │
 │ │             Code             │  │
 │ │                              │  │
 │ │                              │  │
 │ └──────────────────────────────┘  │
 │ ┌──────────────────────────────┐  │
 │ │      Exception Handling      │  │
 │ └──────────────────────────────┘  │
 └───────────────────────────────────┘
```

 In langauges like C++ the exception handling code can be between 10% and 25% of the total code base. When errors occur error-handling is done inline - within the same process:
```
 ┌───────────────────────────────────┐
 │            Module 1               │
 │ ┌──────────────────────────────┐  │
 │ │                              │  │
 │ │                              │  │
 │ │             Code             │  │
 │ │                              │  │
 │ │                              │  │
 │ └──────────────────────────────┘  │
 │ ┌──────────────────────────────┐  │
 │ │      Exception Handling      │  │
 │ └──────────────────────────────┘  │
 └───────────────────────────────────┘
                   │
                   │ Calls
                   ▼
 ┌───────────────────────────────────┐
 │            Module 2               │
 │ ┌──────────────────────────────┐  │
 │ │                              │  │
 │ │                              │  │
 │ │             Code             │  │
 │ │                              │  │
 │ │                              │  │
 │ └──────────────────────────────┘  │
 │ ┌──────────────────────────────┐  │         ┌────────────────────────┐
 │ │      Exception Handling      │◀─┼─────────│ Patch Up And Continue  │
 │ └──────────────────────────────┘  │         └────────────────────────┘
 └───▲─▲─▲───────────────▲─────▲▲────┘
     │ │ │         │     │     ││
     │ │ │         │ Call│     ││
     │ │ │         ▼     │     ││
 ┌───┼─┼─┼───────────────┼─────┼┼────┐
 │   │ │ │    Module 3   │     ││    │
 │ ┌─┼─┼─┼───────────────┼─────┼┼─┐  │
 │ │ │ │ │               │     ││ │  │
 │ │ │ X │               │     ││ │  │
 │ │ │   │       Code    X     ││ │  │
 │ │ │   │                     ││ │  │
 │ │ │   X                     X│ │  │
 │ └─┼──────────────────────────┼─┘  │
 │ ┌─┴──────────────────────────┴─┐  │
 │ │ X    Exception Handling    X │  │
 │ └──────────────────────────────┘  │
 └───▲──────────────────────────▲────┘
     │             │            │
     │             │ Calls      │
     │             ▼            │
 ┌───┼──────────────────────────┼────┐
 │   │        Module 4          │    │
 │ ┌─┼──────────────────────────┼─┐  │
 │ │ │                          │ │  │
 │ │ │                          X │  │
 │ │ │           Code             │  │
 │ │ X                            │  │
 │ │                              │  │
 │ └──────────────────────────────┘  │
 │ ┌──────────────────────────────┐  │
 │ │      Exception Handling      │  │
 │ └──────────────────────────────┘  │
 └───────────────────────────────────┘
```

In this diagram an **X** is an error which throws up the stack - and sometimes the upstream exception handling fails as well - leading to throw-on-throw.

A typical response is to have patch up and continue exception handling where the low level failures are (sometimes) logged and the system keeps going. The exception handling is often **action at a distance**: an error deep in the call stack is captured and reported higher up - this typically makes logging of errors opaque.

The situation gets worse when the code is threaded:
```
              Thread 1                                     Thread 2
 ┌───────────────────────────────────┐        ┌───────────────────────────────────┐
 │            Module 1               │        │            Module 4               │
 │ ┌──────────────────────────────┐  │        │ ┌──────────────────────────────┐  │
 │ │                              │  │        │ │                              │  │
 │ │                              │  │        │ │                              │  │
 │ │             Code             │  │        │ │             Code             │  │
 │ │                              │  │        │ │                              │  │
 │ │                              │  │        │ │                              │  │
 │ └──────────────────────────────┘  │        │ └──────────────────────────────┘  │
 │ ┌──────────────────────────────┐  │        │ ┌──────────────────────────────┐  │
 │ │      Exception Handling      │  │        │ │      Exception Handling      │  │
 │ └──────────────────────────────┘  │        │ └──────────────────────────────┘  │
 └───────────────────────────────────┘        └───────────────────────────────────┘
                   │                                            │
                   │ Calls                           ┌──────────┘ Calls
                   ▼                                 │
 ┌───────────────────────────────────┐               ▼
 │            Module 2         ┌─────┼─────────────────────────────────────┐
 │ ┌───────────────────────────┼──┐  │          Module 5                   │
 │ │                           │ ┌┼──┼──────────────────────────────────┐  │
 │ │                           │ ││  │                                  │  │
 │ │             Code          │ ││  │             Code                 │  │
 │ │                           │ ││  │                                  │  │
 │ │                           │ └┼──┼──────────────────────────────────┘  │
 │ └───────────────────────────┼──┘  │                                     │
 │ ┌───────────────────────────┼─┬┬──┼──────────────────────────────────┐  │
 │ │      Exception Handling   │ ││  │      Exception Handling          │  │
 │ └───────────────────────────┼─┴┴──┼──────────────────────────────────┘  │
 └─────────────────────────────┼─────┘                                     │
                   │           └───────────────────────────────────────────┘
                   │ Calls                           │
                   ▼                            Calls└──────────┐
 ┌───────────────────────────────────┐                          ▼
 │            Module 3               │        ┌───────────────────────────────────┐
 │ ┌──────────────────────────────┐  │        │            Module 6               │
 │ │                              │  │        │ ┌──────────────────────────────┐  │
 │ │                              │  │        │ │                              │  │
 │ │             Code             │  │        │ │                              │  │
 │ │                              │  │        │ │             Code             │  │
 │ │                              │  │        │ │                              │  │
 │ └──────────────────────────────┘  │        │ │                              │  │
 │ ┌──────────────────────────────┐  │        │ └──────────────────────────────┘  │
 │ │      Exception Handling      │  │        │ ┌──────────────────────────────┐  │
 │ └──────────────────────────────┘  │        │ │      Exception Handling      │  │
 └───────────────────────────────────┘        │ └──────────────────────────────┘  │
                                              └───────────────────────────────────┘
```

By contrast Erlang has out-of-band error handling:
```
 ┌───────────────────────────────────┐     ┌───────────────────────────────────┐
 │            Supervisor             │     │          Worker Module 1          │
 │ ┌──────────────────────────────┐  │     │ ┌──────────────────────────────┐  │
 │ │                              │  │     │ │                              │  │
 │ │                              │  │     │ │                              │  │
 │ │                              │  │     │ │             Code             │  │
 │ │             Code             │◀─┼─────┼─┼─────────────────────────  X  │  │
 │ │                              │  │     │ │                           ▲  │  │
 │ │                              │  │     │ └───────────────────────────┼──┘  │
 │ │                              │  │     │                             │     │
 │ └──────────────────────────────┘  │     │                             │     │
 │                 ▲                 │     │                             │     │
 └─────────────────┼─────────────────┘     └─────────────────────────────┼─────┘
                   │                                         │           │
                   │                                         │ Calls     │
                   │                                         ▼           │
                   │                       ┌─────────────────────────────┼─────┐
                   │                       │         Library Module 2    │     │
                   │                       │ ┌───────────────────────────┼──┐  │
                   │                       │ │                           │  │  │
                   │                       │ │                           X  │  │
                   │                       │ │             Code          ▲  │  │
                   │                       │ │                           │  │  │
                   │                       │ │                           │  │  │
                   │                       │ └───────────────────────────┼──┘  │
                   │                       │                             │     │
                   │                       │                             │     │
                   │                       │                             │     │
                   │                       └─────────────────────────────┼─────┘
                   │                                         │           │
                   │                                         │ Calls     │
                   │                                         ▼           │
                   │                       ┌─────────────────────────────┼─────┐
                   │                       │         Library Module 3    │     │
                   │                       │ ┌───────────────────────────┼──┐  │
                   │                       │ │                           │  │  │
                   │      Clean            │ │                           X  │  │
                   │     Failure           │ │             Code          ▲  │  │
                   └───────────────────────┼─┼───── X                    │  │  │
                                           │ │                           │  │  │
                                           │ └───────────────────────────┼──┘  │
                                           │                             │     │
                                           │                             │     │
                                           │                             │     │
                                           └─────────────────────────────┼─────┘
                                                             │           │'Dirty'
                                                             │ Calls     │Failure
                                                             ▼           │
                                           ┌─────────────────────────────┼─────┐
                                           │         Library Module 4    │     │
                                           │ ┌───────────────────────────┼──┐  │
                                           │ │                           │  │  │
                                           │ │                           X  │  │
                                           │ │             Code             │  │
                                           │ │                              │  │
                                           │ │                              │  │
                                           │ └──────────────────────────────┘  │
                                           │                                   │
                                           │                                   │
                                           │                                   │
                                           └───────────────────────────────────┘
```

In a **clean error** - the code crashes at the point of the error - and the line and error conditions are reported. In a **dirty error** the error is masked - and the bug appears **at a distance**. Errors at a distance can and should be attacked by aggressive use of guards on the way down and pattern matching on the way up - dialyzer is also a key tool - eliminating dialyzer errors eliminates action at a distance bugs.

To provide clean errors call paths like below should be discouraged:
```erlang
-export([frobullate/1]).

frobulate(Arko) ->
	Bob = #myrecord{},
	wibulate(Arko, Bob).

wibulate(Arko, Bob) ->
	Bob2 = django(Bob),
	hipster(Arko, Bob2).
```

In favour of code like:
```erlang
-export([frobullate/1]).

frobulate(Arko) when Arko =:= debug      orlese
	                 Arko =:= production ->
	Bob = #myrecord{},
	{ok, _Params} = wibulate(Arko, Bob).

wibulate(Arko, #myrecord{} = Bob) ->
	Bob2 = django(Bob),
	{ok, _Params} = hipster(Arko, Bob2).
```

By resticting the inputs to the module as tightly as possible, and then force-matching structures everywhere any errors can be made, if not clean, then certainly cleaner.

Erlang error handling is always the same:
* log the error
* check the timeout/retries:
* **either** restart the dead process
* **or** crash and report to the supervisor's supervisor

## Consequences

Code bases with in-band error handling are typically considerably more verbose than Erlang - elimination of error handling reduces maintenance costs.

But with in-band error handling there is a trade-off between **report and fix errors** *versus* **stability**. Typically an in-band system needs a lot of **patch up and continue** points to be stable which sets an error floor: 'we tolerate a defect rate of X bugs per ksloc because quality below that means the system is macro-unstable'.

In Erlang by contrast the system is macro-stable even in the **total absence of quality** - a system under early development where **all code is stubbed** remains macro-stable. So by using Erlang you can aspire to zero-defect code bases. Needless to say zero defects is a dream, every feature you add adds new and subtle bugs - but quality is a journey in Erlang, and not a destination in other languages.

So crash reports from customers returned via `riak-admin debug` or from our own extensive test suites are a **free** source of addressable and pre-diagnosed bug reports.

Getting crash reports from customers is an important source of information:

* free bugs! free bugs! free bugs! what's not to like about free bugs!
* errors from real-life use cases - which are typically expensive to replicate internally
* getting a statistical picture of quality **Module A** *versus* **Module B**, **Application X** *versus* **Application Y**

## Recommendations

The core recommendation is that we put in place feedback loops to collect, process and fix bugs reported via crash reports.

### A Worked Example

Logs were sent from Nokia this morning which I looked at as part of the ride-along.  I did some charactisation on them:

Get the number of errored crash reports:
```
cut -d " " -f 3-12 console.log | grep "\[error\]" | wc -l
887
```

Reduce these to unique ones:
```
cut -d " " -f 3-12 console.log | grep "\[error\]" | sed 's/<[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*>/**PID**/g' | sort | uniq | wc -l
109
```

Then count the occurences:
```
cut -d " " -f 3-12 console.log | grep "\[error\]" | sed 's/<[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*>/**PID**/g' | sort | uniq -c | sort -ndi
```
...
```
     10 [error] **PID** gen_fsm **PID** in state started terminated with reason:
     13 [error] **PID**@riak_kv_console:status:185 Status failed exit:{{{function_clause,[{riak_kv_vnode,terminate,[{bad_return_value,{stop,[{riak_kv_bitcask_backend,{init_keydir_scan_key_files,too_many_iterations}}]}},undefined],[{file,"src/riak_kv_vnode.erl"},{line,1066}]},{riak_core_vnode,terminate,3,[{file,"src/riak_core_vnode.erl"},{line,907}]},{gen_fsm,terminate,7,[{file,"gen_fsm.erl"},{line,597}]},{proc_lib,init_p_do_apply,3,[{file,"proc_lib.erl"},{line,239}]}]},{gen_fsm,sync_send_event,[**PID**,wait_for_init,infinity]}},{gen_server,call,[riak_core_vnode_manager,{all_vnodes,riak_kv_vnode},infinity]}}
     19 [error] **PID** CRASH REPORT Process **PID** with 0 neighbours exited
     31 [error] **PID**@riak_kv_console:status:185 Status failed exit:{noproc,{gen_server,call,[riak_core_vnode_manager,{all_vnodes,riak_kv_vnode},infinity]}}
    205 [error] **PID** scan_key_files: error {case_clause,{error,system_limit}} @ [{bitcask,scan_key_files,5,[{file,"src/bitcask.erl"},{line,1169}]},{bitcask,init_keydir_scan_key_files,4,[{file,"src/bitcask.erl"},{line,1283}]},{bitcask,init_keydir,4,[{file,"src/bitcask.erl"},{line,1235}]},{bitcask,open,2,[{file,"src/bitcask.erl"},{line,157}]},{riak_kv_bitcask_backend,start,2,[{file,"src/riak_kv_bitcask_backend.erl"},{line,165}]},{riak_cs_kv_multi_backend,start_backend,4,[{file,"src/riak_cs_kv_multi_backend.erl"},{line,218}]},{riak_cs_kv_multi_backend,'-start_backend_fun/1-fun-0-',3,[{file,"src/riak_cs_kv_multi_backend.erl"},{line,198}]},{lists,foldl,3,[{file,"lists.erl"},{line,1248}]}]
    462 [error] **PID** scan_key_files: error function_clause @ [{riak_kv_bitcask_backend,key_transform_to_1,[<<"\": \"0.0\", \n
```

A process like this could be automated and pushed into a pipeline. The crash reports would need to be aggreagated by release - so a prioritisation decision would need to be taken (are we only doing this for 2.x releases etc, etc). The pipeline should be shared between the test infrastructure and the CSE team.

This pipeline would be effectively an automated triage process - high frequency bugs could then be tackled. Prioritisation would best be done after the data has been examined but the following criteria suggestion themselves as options:

* maximum number of instances (one debug file per customer)
* maximum number of customers see the problem
* by a count of errors per instance for a module/repo
* by a count of cusomters experiencing errors for a module/repo

There are a number of obvious workflows which could be used depending on how we triage the problem and the scale of the defects exposed:
```
                                    Application
      Bug Based                     Refactoring

  ┌────────────────┐             ┌────────────────┐
  │                │             │                │
  │  CSE Diagnose  │             │  CSE Diagnose  │
  │                │             │                │
  └────────────────┘             └────────────────┘
           │                              │
           │                              │
           ▼                              ▼
  ┌────────────────┐             ┌────────────────┐
  │                │             │                │
  │    CSE Fix     │             │    Eng Fix     │
  │                │             │                │
  └────────────────┘             └────────────────┘
           │                              │
           │                              │
           ▼                              ▼
  ┌────────────────┐             ┌────────────────┐
  │                │             │                │
  │    CSE Test    │             │    Eng Test    │
  │                │             │                │
  └────────────────┘             └────────────────┘
           │                              │
           │                              │
           ▼                              ▼
  ┌────────────────┐             ┌────────────────┐
  │                │             │                │
  │   Eng Review   │             │   Eng Review   │
  │                │             │                │
  └────────────────┘             └────────────────┘
```

### Fin