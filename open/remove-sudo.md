# RFC: Remove `sudo`

### Revision History

Date         | Description
-------------|------------------------------
`2016-09-07` | Stream-of-consciousness Draft

### Abstract

Riak startup scripts require that the user running the script be either the `root` user or have `sudo` powers. This is then used to enable the `su` command to switch to the `riak` user before starting the Erlang VM See the [`check_user` function in `env.sh`](https://github.com/basho/node_package/blob/develop/priv/base/env.sh#L220-L248).

While this system "works" it has presented these issues:

* Shell scripts support is not well-standardized across supported platforms.
* Basho's shell scripts strive for POSIX compilance but have fallen short historically.
* Requiring `sudo` may not be desirable in all environments. Some administrators may hesitate to install the utility.
* There is no need for `sudo` or `su` if proper UNIX file and executable permissions are used.
* Build systems like Travis CI *could* support Riak within containers, but the `sudo` requirement prevents that.

### Proof-of-concept Idea

Riak should be installed on a plain Ubuntu system. Modifications to remove `sudo` should be done to prove the idea's feasibility:

* `check_user` should not `exec` a new shell using `su` (that line could be commented out).
* `check_user_internal` should not `exit 1` if its check fails (comment it out).
* The `run_erl` binary should be modified via `chown riak:riak` and `chmod 6660` to make it setuid/setgid and only executable by the `root` user, `riak` user, or members of the `riak` group.
* Other `erts` binaries should me modified so that only the owner or members of the `riak` group can execute them.
* The other Riak support scripts should have their permissions modified so that only members of the `riak` group can execute them.

After doing the above, starting Riak via `riak start` should start Riak and it should run as the `riak` user.

### Implementation Proposal

* Thoroughly review the support scripts to determine what functions can be moved into the Erlang VM startup. Ideally, the `riak` command would just execute `run_erl` with the correct arguments.
* Review installed files to ensure minimal permissions are set for use.
* Review writable locations to ensure the `riak` user has access.
* The `riak` shell script could (should) be ported to C or Go. If it isn't feasible to setuid/setgid `run_erl`, then this executable could be installed setuid/setgid to ensure that the Erlang VM eventually starts with `riak:riak` permissions.

### Misc

* Other servers like OpenSSH or Postgres should be reviewed to see how they deal with the issue of running as a limited user.
* Other servers' installation sequence should be reviewed to see if they allow choosing a pre-existing user as the installed user. Has a customer ever requested installation as `nobody` vs `riak`, for instance?
