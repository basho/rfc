var Riak = require('basho-riak-client');

var Config = function() { };

var _riakNodes = {
    'devA': {
        pbHostPort: '127.0.0.1:10017',
        relPath: '~/src/riak_ee/dev/dev1/'
    }
};

Config.prototype.eachRiakNode = _eachRiakNode =
function(cb) {
    Object.keys(_riakNodes).forEach(function(key) {  
        cb(_riakNodes[key]);
    });
};

Config.prototype.anyRiakNode = _anyRiakNode =
function(cb) {
    var keys = Object.keys(_riakNodes);
    var skip = Math.floor(Math.random() * keys.length);
    keys.forEach(function(key) {
        if (--skip < 0) {
            cb(_riakNodes[key]);
        }
    });
};

_mapRiakNodes =
function(mapCb) {
    var a = [];
    _eachRiakNode(function(riakNode) {
        a.push(mapCb(riakNode));
    });
    return a;
}

var _riakNodesPbHostPorts = _mapRiakNodes(function(riakNode) {
    return riakNode.pbHostPort;
});

Config.prototype.createClient = _createClient =
function(cb) {
    return new Riak.Client(_riakNodesPbHostPorts, cb);
};

Config.prototype.getRiakNodes = _getRiakNodes =
function() {
    return _riakNodes;
};

Config.prototype.addRiakNode = _addRiakNode =
function(name, pbHostPort, relPath) {
    _riakNodes[name] = {
        pbHostPort: pbHostPort,
        relPath: relPath
    };
};

Config.prototype.removeRiakNode = _removeRiakNode =
function(name) {
    delete _riakNodes[name];
};

module.exports = new Config();
