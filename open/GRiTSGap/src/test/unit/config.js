var test = require('unit.js');

describe('config', function() {
    var config = require('../../config');

    describe('createClient', function() {
        it('returns a riak client', function() {
            var riakClient = config.createClient();
            test.value(riakClient.cluster.nodes.length)
                .is(Object.keys(config.getRiakNodes()).length);
        });
    });

    describe('getRiakNodes', function() {
        it('returns a hash of riak node metadata, ie host:port', function() {
            var riakNodes = config.getRiakNodes();
            test.value(Object.keys(riakNodes).length).isGreaterThan(0);
        });
    });

    describe('addRiakNode', function() {
        it('adds a riak node', function() {
            var riakNodesPreLength = Object.keys(config.getRiakNodes()).length;
            config.addRiakNode('dne', '127.0.0.1:8098', '~/src/riak_ee/dev/dev2');
            test.value(Object.keys(config.getRiakNodes()).length)
                .isGreaterThan(riakNodesPreLength);
        });
    });

    describe('removeRiakNode', function() {
        it('removes a riak node', function() {
            var riakNodesPre = config.getRiakNodes();
            var riakNodesPreLength = Object.keys(riakNodesPre).length;
            test.value(riakNodesPreLength).isGreaterThan(0);
            config.removeRiakNode(Object.keys(riakNodesPre)[0]);
            test.value(Object.keys(config.getRiakNodes()).length)
                .isLessThan(riakNodesPreLength);
        });
    });
});
