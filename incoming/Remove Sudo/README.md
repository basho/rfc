# RFC: Remove `sudo`

## Revision History

Date         | Description
-------------|------------------------------
`2016-09-07` | Stream-of-consciousness Draft
`2016-10-06` | Findings after testing with Ubuntu 12
`2016-10-07` | Findings after reading Postgres source code / manuals

## Abstract

Riak startup scripts require that the user running the script be either the `root` user or have `sudo` powers. This is then used to enable the `su` command to switch to the `riak` user before starting the Erlang VM See the [`check_user` function in `env.sh`](https://github.com/basho/node_package/blob/develop/priv/base/env.sh#L220-L248).

While this system "works" it has presented these issues:

* Shell scripts support is not well-standardized across supported platforms.
* Basho's shell scripts strive for POSIX compilance but have fallen short historically.
* Requiring `sudo` may not be desirable in all environments. Some administrators may hesitate to install the utility.
* There is no need for `sudo` or `su` if proper UNIX file and executable permissions are used.
* Build systems like Travis CI *could* support Riak within containers, but the `sudo` requirement prevents that.

### Background - What does PGSQL do?

[Documentation](https://www.postgresql.org/docs/9.6/static/server-start.html)

When installed, Postgres creates a `postgres` user and group. When starting the database server, the `pg_ctl` program *requires* that the `postgres` user runs the executable:

> Whatever you do, the server must be run by the PostgreSQL user account and not by root or any other user

In other words, it won't use `sudo` or `su` to change to the correct user for you.

In addition, the `pid` of the `postmmaster` process is written to the data directory of the db files it is serving, *not* to `/var/run`. The `postgres` user doesn't have permission to write to that location anyway, and it is also used to prevent more than one server using the same data files.

### Proposal

Tested on Ubuntu 12 LTS, using the official `riak_2.1.4-2_amd64.deb` package.

Directory / File(s)                 | Owner  | Group  | Permissions | Note
------------------------------------|--------|--------|-------------|------
`/var/log/riak`                     | `riak` | `riak` | `0755`      |
`/var/lib/riak` (and sub-dirs)      | `riak` | `riak` | `0750`      |
`/var/lib/riak/pipe`                | `riak  | `riak` | `0750`      |
`/var/lib/riak/riak.pid`            | `riak  | `riak` | `0644`      | pid file
`/usr/lib/riak` (`/usr/lib64/riak`) | `root` | `root` | `0755`      | no change
`/usr/lib/riak/erts-5.10.3/bin/*`   | `root` | `riak` | `0750`      |
`/usr/sbin/riak`                    | `root` | `riak` | `0750`      |

#### Script modifications

* `/etc/init.d/riak` - add the `--chuid riak:riak` argument to `start-stop-daemon` to ensure Riak is started as `riak:riak`. See [this PR](https://github.com/basho/node_package/pull/209)
* `/usr/sbin/riak` - See [this PR](https://github.com/basho/node_package/pull/209)
* `/usr/lib/riak/lib/env.sh` - See [this PR](https://github.com/basho/node_package/pull/209)

#### Other modifications

Since the assumption is that  will start as `riak:riak`, this means the 

* The Erlang pipe directory should be moved to a writeable location in `/var/lib/riak`. `/var/lib/riak/pipe` is what I tested with.

## Misc

* Thoroughly review the support scripts to determine what functions can be moved into the Erlang VM startup. Ideally, the `riak` command would just execute `run_erl` with the correct arguments.
* Review installed files to ensure minimal permissions are set for use.
* Review writable locations to ensure the `riak` user has access.
