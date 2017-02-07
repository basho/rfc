var test = require('unit.js');

describe('riakCommon', function() {
    var riakCommon = require('../../lib/riakCommon');
    describe('require', function() {
        it('yields a valid object', function() {
            test.object(riakCommon).isInstanceOf(Object);
        });
    });

    describe('_hashMerge', function() {
        var inputHashes = [
            {id: 1, a: 1, b: 12},
            {id: 2, 88: '<3', 73: 'peace out', 99: '>:-/'}
        ];

        it('accepts an array or variadic array of arguments', function() {
            var merged = riakCommon._hashMerge(inputHashes);
            var mergedVariadic = riakCommon._hashMerge(inputHashes[0],
                inputHashes[1]);
            test.object(mergedVariadic).is(merged);
        });

        it('merges hashes, from right to left', function() {
            /* NOTE: non-distinct id field should come from left-most hash */
            var expected = {
                id: 1, a: 1, b: 12,
                       88: '<3', 73: 'peace out', 99: '>:-/'
            };
            var merged = riakCommon._hashMerge(inputHashes);
            test.object(merged).is(expected);
        });

        it('merges hashes, w/o mutating the inputs', function() {
            var hashLength = function(it) { return it.length; };
            var expectedLengths = inputHashes.map(hashLength);

            var merged = riakCommon._hashMerge(inputHashes);
            var actualLengths = inputHashes.map(hashLength);

            test.array(actualLengths).is(expectedLengths);
        });

        it('merges deeply', function() {
            var expected = {
                id: 1,
                body: {
                    isDesireable: false
                }
            };
            var merged = riakCommon._hashMerge(expected);
            test.object(merged).is(expected);
        });
    });

    describe('createKey', function() {
        var expectedFull = {
            bucketType: 'sets',
            bucket: 'theory',
            key: 'cardinality'
        };

        it('has reasonable defaults', function() {
            var expected = {
                bucketType: 'default',
                bucket: 'default',
                key: null /*<< no reasonable default*/
            };

            var key = riakCommon.createKey(null, null, null);

            test.object(key).is(expected);
        });

        it('is fully specializable', function() {
            var expected = expectedFull;
            var key = riakCommon.createKey(expectedFull.bucketType,
                expectedFull.bucket,
                expectedFull.key);
            test.object(key).is(expected);
        });
    });

    describe('_errorHandlingCb', function() {
        it('nops on no err', function() {
            var err = null;
            test.bool(riakCommon._errorHandlingCb(err, 'some value'))
                .isTrue();
        });

        it('indicates err on err', function() {
            var err = new Error('some error');
            test.bool(riakCommon._errorHandlingCb(err, 'some value'))
                .isFalse();
        });
    });
});
