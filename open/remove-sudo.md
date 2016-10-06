# RFC: Remove `sudo`

## Revision History

Date         | Description
-------------|------------------------------
`2016-09-07` | Stream-of-consciousness Draft
`2016-10-06` | Findings after testing with Ubuntu 12

## Abstract

Riak startup scripts require that the user running the script be either the `root` user or have `sudo` powers. This is then used to enable the `su` command to switch to the `riak` user before starting the Erlang VM See the [`check_user` function in `env.sh`](https://github.com/basho/node_package/blob/develop/priv/base/env.sh#L220-L248).

While this system "works" it has presented these issues:

* Shell scripts support is not well-standardized across supported platforms.
* Basho's shell scripts strive for POSIX compilance but have fallen short historically.
* Requiring `sudo` may not be desirable in all environments. Some administrators may hesitate to install the utility.
* There is no need for `sudo` or `su` if proper UNIX file and executable permissions are used.
* Build systems like Travis CI *could* support Riak within containers, but the `sudo` requirement prevents that.

### Proposal - Use Unix groups and file permissions

Tested on Ubuntu 12 LTS, using the official `riak_2.1.4-2_amd64.deb` package.

Directory / File(s)                 | Owner  | Group  | Permissions
------------------------------------|--------|--------|-------------------
`/run/riak` (`/var/run/riak`)       | `root` | `riak` | `2775`
`/var/log/riak`                     | `root` | `riak` | `2775`
`/var/lib/riak` (and sub-dirs)      | `root` | `riak` | `2770`
`/var/lib/riak/pipe`                | `root  | `riak` | `2770`
`/usr/lib/riak` (`/usr/lib64/riak`) | `root` | `root` | `0755`
`/usr/lib/riak/erts-5.10.3/bin/*`   | `root` | `riak` | `0750`
`/usr/sbin/riak`                    | `root` | `riak` | `0750`

Script modifications

* `/etc/init.d/riak` - add the `--chuid riak:riak` argument to `start-stop-daemon` to ensure Riak is started as `riak:riak`. See [this PR](https://github.com/basho/node_package/pull/209)
* `/usr/sbin/riak` - See [this PR](https://github.com/basho/node_package/pull/209)
* `/usr/lib/riak/lib/env.sh` - See [this PR](https://github.com/basho/node_package/pull/209)

## Misc

* Thoroughly review the support scripts to determine what functions can be moved into the Erlang VM startup. Ideally, the `riak` command would just execute `run_erl` with the correct arguments.
* Review installed files to ensure minimal permissions are set for use.
* Review writable locations to ensure the `riak` user has access.
