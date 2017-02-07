var test = require('unit.js');

describe('riakKV', function() {
    var riakKV = require('../..//lib/riakKV');
    var riakAdmin = require('../../lib/riakAdmin');
    var errorHandlingCb = riakKV._errorHandlingCb;

    describe('state: riak started', function() {
        before(function(done) {
            this.timeout(120000);
            riakAdmin.ensureStartNodes(function(err, success) {
                if (!success) throw new Error('failed to start riak');
                done();
            });
        });

        describe('_execKeyValueCommand', function() {
            it('creates a connection', function(done) {
                riakKV._execKeyValueCommand(function(err, client, errorHandlingCb) {
                    test.value(err).is(null);
                    test.object(client).hasProperty('cluster');
                    done();
                });
            });
        });

        var key = riakKV.createKey(null, 'test', 'food');
        var expectedValue = 'apple';
        describe('setKeyValue', function() {
            it('sets a value at a key', function(done) {
                riakKV.setKeyValue(key, expectedValue, function(err, result) {
                    test.value(err).is(null);
                    done();
                });
            });
        });

        describe('getKeyValue', function() {
            it('gets a value at a key', function(done) {
                riakKV.getKeyValue(key, function(err, result) {
                    test.value(err).is(null);
                    test.value(result.value.toString()).is(expectedValue);
                    done();
                });
            });

            it('errors for a bucket type that does not exist', function(done) {
                riakKV.getKeyValue(riakKV.createKey('dne', 'test', 'doesNotExist'),
                    function(err, result) {
                        test.value(err).isNot(null);
                        test.value(result).is(null);
                        done();
                    });
            });

            it('gets null for a key that does not exist', function(done) {
                riakKV.getKeyValue(riakKV.createKey(null, 'test', 'doesNotExist'),
                    function(err, result) {
                        test.value(err).is(null);
                        test.value(result).is(null);
                        done();
                    });
            });
        });

        describe('deleteKeyValue', function() {
            it('deletes a value at a key', function(done) {
                riakKV.deleteKeyValue(key, function(err, result) {
                    test.value(err).is(null);
                    done();
                });
            });
        });
    });

    describe('state: riak stopped', function() {
        before(function(done) {
            this.timeout(120000);
            riakAdmin.ensureStopNodes(function(err, success) {
                if (!success) throw new Error('failed to stop riak');
                done();
            });
        });

        describe('_execKeyValueCommand', function() {
            it('throws an exception', function() {
                var expected = new Error('connect ECONNREFUSED 127.0.0.1:10017');
                var cb = function(err, client, errorHandlingCb) {
                    test.exception(err).match(function(ex) {
                        return (ex instanceof Error);
                    });
                    done();
                };
            });
        });
        // TODO: get, set, delete w/i riak stopped
    });
});
