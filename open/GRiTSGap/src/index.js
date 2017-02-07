var RiakDisco = function(){};

RiakDisco.prototype.RiakAdmin = require('./lib/riakAdmin');
RiakDisco.prototype.RiakCommon = require('./lib/riakCommon');
RiakDisco.prototype.RiakKV = require('./lib/riakKV');
// RiakDisco.prototype.RiakSearch = require('./lib/RiakSearch');
// RiakDisco.prototype.RiakDT = require('./lib/riakDT');
RiakDisco.prototype.RiakTS = require('./lib/riakTS');

module.exports = new RiakDisco();
