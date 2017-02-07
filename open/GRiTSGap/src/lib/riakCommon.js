var config = require('../config');

var RiakCommon = function(){};

/* Object.assign mutates the first parameter, so is more prone to issues, such
 * as the key used in setKeyValue() failing the assertion that fetchOptions
 * not have value set.
 * */
RiakCommon.prototype._hashMerge = _hashMerge =
function(/* target, ...sources */) {
    var args = Array.prototype.slice.call(arguments, 0);
    if (Array.isArray(args[0])) {
        args = [].concat.apply([], args);
    }
    /* apply from right to left, so closest hash to the lval in distance is
     * also closest semantically. */
    args = args.reverse();
    /* shoving an empty hash at the head of the arg listremoves the mutation*/
    args.unshift({});
    return Object.assign.apply(this, args);
}

RiakCommon.prototype.createKey = _createKey =
function(bucketType, bucket, key) {
    return {
        bucketType: bucketType || 'default',
        bucket: bucket || 'default',
        key: key
    };
};

RiakCommon.prototype._errorHandlingCb = _errorHandlingCb =
function(err, any) {
    if (err) return false;
    return true;
};

module.exports = new RiakCommon();
