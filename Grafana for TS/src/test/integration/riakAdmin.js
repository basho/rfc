var test = require('unit.js');

describe('riakAdmin', function() {
    // pumping the timeout to allow for slow Riak node and cluster startup.
    // ensureStartNodes is the current long pole, consistently 15s < time < 20s.
    // pingNodes is a short pole, consistently 250ms < time < 350ms
    this.timeout(60000);
    before(function() {
        // typically skipping riakAdmin testing since this is covered by tests
        // which should test the up and down states of riak, so need to ensure
        // start and stop states.
        //
        // TODO: did not create an environment setting to specify which tests
        // to run as well as a default set of tests.
        this.skip();
    });

    var riakAdmin = require('../../lib/riakAdmin');
    var successSignalCbFactory = function(done) {
        return function(err, success) {
            test.value(success).match(/true|false/);
            done();
        };
    };
    describe('pingNodes', function() {
        it('signals when done', function(done) {
            riakAdmin.pingNodes(successSignalCbFactory(done));
        });
    });

    describe('startNodes', function() {
        it('signals when done', function(done) {
            riakAdmin.startNodes(successSignalCbFactory(done));
        });
    });

    describe('stopNodes', function() {
        it('signals when done', function(done) {
            riakAdmin.stopNodes(successSignalCbFactory(done));
        });
    });

    describe('ensureStartNodes', function() {
        it('signals when done', function(done) {
            riakAdmin.ensureStartNodes(successSignalCbFactory(done));
        });
    });

    describe('ensureStopNodes', function() {
        it('signals when done', function(done) {
            riakAdmin.ensureStopNodes(successSignalCbFactory(done));
        });
    });
});
