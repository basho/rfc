var config = require('../config');
var exec = require('exec-retry');
var test = require('unit.js');

var RiakAdmin = function(){};

var _eachNode = config.eachRiakNode;

var _execCbFactory = function(execCb, cb) {
    return function(err, stdout, stderr) {
        var mappedResult = execCb(err, stdout, stderr);
        cb(err, mappedResult);
    };
};

var _pingStdoutToBoolCb = function(err, stdout, stderr) {
    return (err == null ||
            stdout.indexOf('pong') >= 0);
};

var _startStdoutToBoolCb = function(err, stdout, stderr) {
    return (err == null ||
            stdout.length == 0 ||
            stderr.indexOf('already running') >= 0);
};

var _stopStdoutToBoolCb = function(err, stdout, stderr) {
    return (err == null ||
            stdout.indexOf('ok') >= 0 ||
            stderr.indexOf('is not running') >= 0);
};

var _riakAdminTestStdoutToBoolCb = function(err, stdout, stderr) {
    return (err == null &&
            stdout.indexOf('Successfully completed') >= 0);
};

RiakAdmin.prototype.pingNodes = _pingNodes =
function(cb) {
    var execCb = _execCbFactory(_pingStdoutToBoolCb, cb);
    _eachNode(function(riakNode) {
        exec(riakNode.relPath + '/bin/riak ping', execCb);
    });
};

RiakAdmin.prototype.startNodes = _startNodes =
function(cb) {
    var execCb = _execCbFactory(_startStdoutToBoolCb, cb);
    _eachNode(function(riakNode) {
        exec(riakNode.relPath + '/bin/riak start', execCb);
    });
};

RiakAdmin.prototype.stopNodes = _stopNodes =
function(cb) {
    var execCb = _execCbFactory(_stopStdoutToBoolCb, cb);
    _eachNode(function(riakNode) {
        exec(riakNode.relPath + '/bin/riak stop', execCb);
    });
};

var _riakAdminTest =
function(cb) {
    var retryOptions = { minTimeout: 1000, factor: 1.0, retries: 90 };
    var execCb = _execCbFactory(_riakAdminTestStdoutToBoolCb, cb);
    _eachNode(function(riakNode) {
        exec(riakNode.relPath + '/bin/riak-admin test',
            retryOptions, execCb);
    });
};

RiakAdmin.prototype.ensureStartNodes = _ensureStartNodes =
function(cb) {
    var riakAdminTestFactory = function() {
        return function(err, success) {
            _riakAdminTest(function(err, success) {
                if (success) {
                    cb(null, success);
                } else {
                    throw new Error('failed to perform riak-admin test successfully');
                }
            });
        };
    };

    _pingNodes(function(err, success) {
        if (success) {
            riakAdminTestFactory()(null, success);
        } else {
            _startNodes(riakAdminTestFactory());
        }
    });
};

RiakAdmin.prototype.ensureStopNodes = _ensureStopNodes =
function(cb) {
    _pingNodes(function(err, success) {
        if (!success) {
            cb(null, !success);
        } else {
            _stopNodes(cb);
        }
    });
};

module.exports = new RiakAdmin();
