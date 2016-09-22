# RFC: Use `HTTPS` URLs

Date       | Log
-----------|----------------
2016/09/22 | First Draft


### Overview

Currently, in many `rebar.config` files, the `git://` protocol is used. While I love me some `git` protocol, this will fail if the port is blocked, and I have run into this personally on several occasions. End-users who wish to clone and build Riak will inevitably run into this issue and will probably give up as a result.

### Proposal

In every repo used to build Riak and Riak EE:

```
sed -i.orig -e 's/\<git:\/\//https:\/\//g' rebar.config
```

### Resources

* GitHub recommends `https://`: https://help.github.com/articles/which-remote-url-should-i-use/
* Some comparisons: https://gist.github.com/grawity/4392747
* SO article by blocked user: http://stackoverflow.com/questions/4891527/git-protocol-blocked-by-company-how-can-i-get-around-that
