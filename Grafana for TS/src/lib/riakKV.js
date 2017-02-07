var config = require('../config');
var RiakCommon = require('./riakCommon');
var Riak = require('basho-riak-client');

var RiakKV = function(){};

var _hashMerge =
RiakCommon._hashMerge;

RiakKV.prototype.createKey = _createKey =
RiakCommon.createKey;

var _errorHandlingCb =
RiakCommon._errorHandlingCb;

RiakKV.prototype._execKeyValueCommand = _execKeyValueCommand =
function(clientFunc) {
    config.createClient(function(err, client) {
        if (err) return _errorHandlingCb(err, null);
        clientFunc(err, client, _errorHandlingCb);
    });
};

RiakKV.prototype.conflictResolverLastModified = _conflictResolverLastModified =
function(objects) {
    if (!objects && objects.length <= 0) return null;
    if (objects.length == 1) return objects[0];

    var resolvedSibling = null;
    var maxLastModified = -Infinity;
    objects.forEach(function(o) {
        if (maxLastModified < o.lastModified) {
            resolvedSibling = o;
            maxLastModified = o.lastModified;
        }
    });
    return resolvedSibling;
};

RiakKV.prototype.getKeyValue = _getKeyValue =
function(key, cb) {
    var fetchOptions = _hashMerge(key, {
        conflictResolver: _conflictResolverLastModified
    });
    _execKeyValueCommand(function(err, client, errorhHandlingCb) {
        client.fetchValue(fetchOptions, function(err, rslt) {
            if (!_errorHandlingCb(err, rslt)) {
                cb(err, null);
                return;
            }
            if (rslt.isNotFound) {
                cb(err, null);
            } else {
                cb(err, rslt.values.shift());
            }
        });
    });
};

RiakKV.prototype.setKeyValue = _setKeyValue =
function(key, value, cb) {
    _getKeyValue(key, function(err, obj) {
        var riakObj = obj || new Riak.Commands.KV.RiakObject();
        riakObj.setContentType('text/plain');
        riakObj.setValue(value);

        storeOptions = _hashMerge(key, {
            value: riakObj
        });

        _execKeyValueCommand(function(err, client, errorhHandlingCb) {
            client.storeValue(storeOptions, function(err, rslt) {
                if (!_errorHandlingCb(err, rslt)) return;
                cb(err, null);
            });
        });
    });
};

RiakKV.prototype.deleteKeyValue = _deleteKeyValue =
function(key, cb) {
    var deleteOptions = key;
    _execKeyValueCommand(function(err, client, errorHandlingCb) {
        client.deleteValue(deleteOptions, function(err, rslt) {
            if (!_errorHandlingCb(err, rslt)) return;
            cb(err, null);
        });
    });
};

module.exports = new RiakKV();
