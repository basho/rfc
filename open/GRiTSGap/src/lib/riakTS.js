var config = require('../config');
var expandHomeDir = require('expand-home-dir');
var RiakCommon = require('./riakCommon');
var Riak = require('basho-riak-client');

var RiakTS = function(){};

var _hashMerge =
RiakCommon._hashMerge;

var _errorHandlingCb =
RiakCommon._errorHandlingCb;

var _execTimeSeriesCommand =
function(clientFunc) {
    config.createClient(function(err, client) {
        if (err) return _errorHandlingCb(err, null);
        clientFunc(err, client, _errorHandlingCb);
    });
};

RiakTS.prototype.createField = _createField =
function(fieldName, fieldType, isNullable) {
    return {
        name: fieldName,
        type: fieldType || 'VARCHAR',
        isNullable: isNullable || true,
    };
};

RiakTS.prototype.createQuantumField = _createQuantumField =
function(fieldName, fieldType, quantumValue, quantumUnits)  {
    return _hashMerge({
        quantumValue: quantumValue,
        quantumUnits: quantumUnits
    }, _createField(fieldName, fieldType, false));
};

RiakTS.prototype.listTables = _listTables =
function(cb) {
    var extractTableNameFromPath = function(path) {
        var startPattern = 'riak_ql_table_';
        var start = path.indexOf(startPattern);
        if (start < 0) return;
        start += startPattern.length;
        var end = path.indexOf('$');
        return path.slice(start, end);
    };
    config.anyRiakNode(function(riakNode) {
        var tableNames = {}; //<< use a hash to store the results, to de-dup versions
        var ddlPath = expandHomeDir(riakNode.relPath) + '/data/ddl_ebin/';
        fs.readdir(ddlPath, function(err, fileNames) {
            fileNames.forEach(function(fileName) {
                var tableName = extractTableNameFromPath(fileName);
                tableNames[tableName] = true;
            });
            cb(null, Object.keys(tableNames));
        });
    });
};

var _fieldsToSqlList =
function(quantumField, primaryKeyFields, additionalFields) {
    var sql = '';
    var _fieldToSqlListItemFactory = function(isPrimary) {
        return function(field) {
            if (isPrimary && field.isNullable) {
                throw new Error('primary key fields can not be nullable');
            }
            sql += field.name
                + ' ' + field.type
                + ' ' + ((field.isNullable) ? 'NULL' : 'NOT NULL')
                + ',';
        };
    };
    primaryKeyFields.forEach(_fieldToSqlListItemFactory(true));
    _fieldToSqlListItemFactory(true)(quantumField);
    additionalFields.forEach(_fieldToSqlListItemFactory(false));
    sql = sql.slice(0, sql.length - 1);
    return sql;
};

var _fieldsToSqlPrimaryKeyConstraint =
function(quantumField, primaryKeyFields) {
    var sql =
'PRIMARY KEY('
    + '(';
    primaryKeyFields.forEach(function(field) {
        sql += field.name + ','
    });
sql +=
    ' QUANTUM('
        + quantumField.name
        + ',' + quantumField.quantumValue
        + ',\'' + quantumField.quantumUnits + '\''
    + ')),'
    primaryKeyFields.forEach(function(field) {
        sql += field.name + ','
    })
sql +=
    quantumField.name
+ ')';
    return sql;
};

var _fieldsToSqlCreateTable =
function(tableName, quantumField, primaryKeyFields, additionalFields) {
    var sql =
'CREATE TABLE ' + tableName + '('
    + _fieldsToSqlList(quantumField, primaryKeyFields, additionalFields)
    + ',' + _fieldsToSqlPrimaryKeyConstraint(quantumField, primaryKeyFields)
+ ')';
    return sql;
};

var _createQuery =
function(sql, cb) {
    return new Riak.Commands.TS.Query.Builder()
        .withQuery(sql)
        .withCallback(cb)
        .build();
};

var _createInsert =
function(tableName, rows, cb) {
    return new Riak.Commands.TS.Store.Builder()
        .withTable(tableName)
        .withRows(rows)
        .withCallback(cb)
        .build();
};

var _createDescribe =
function(tableName, cb) {
    return new Riak.Commands.TS.Describe.Builder()
        .withTable(tableName)
        .withCallback(cb)
        .build();
};

var _createGet =
function(tableName, keys, cb) {
    return new Riak.Commands.TS.Get.Builder()
        .withTable(tableName)
        .withKey(keys)
        .withCallback(cb)
        .build();
};

RiakTS.prototype._get = _get =
function(tableName, keys, cb) {
    var cmd = _createGet(tableName, keys, cb);
    _execTimeSeriesCommand(function(err, client, errorHandlingCb) {
        client.execute(cmd);
    });
};

RiakTS.prototype.createTable = _createTable =
function(tableName, quantumField, primaryKeyFields, additionalFields, cb) {
    var sql = _fieldsToSqlCreateTable(tableName, quantumField,
            primaryKeyFields, additionalFields);
    var cmd = _createQuery(sql, cb);
    _execTimeSeriesCommand(function(err, client, errorHandlingCb) {
        client.execute(cmd);
    });
};

RiakTS.prototype.describeTable = _describeTable =
function(tableName, cb) {
    var cmd = _createDescribe(tableName, cb);
    _execTimeSeriesCommand(function(err, client, errorHandlingCb) {
        client.execute(cmd);
    });
};

RiakTS.prototype.listColumns = _listColumns =
function(tableName, cb) {
    _describeTable(tableName, function(err, result) {
        if (err) {
            cb(err, null);
        } else {
            var columnNames = {};
            result.rows.forEach(function(row) {
                columnNames[row[0]] = {
                    type: row[1].toString(),
                    isNullable: (~~row[2] == 0),
                    isPrimaryKey: (~~(row[3] || false) == 0),
                    isLocalKey: (~~(row[4] || false) == 0)
                };
            });
            cb(null, columnNames);
        }
    });
};

RiakTS.prototype.insertRows = _insertRows =
function(tableName, rows, cb) {
    var cmd = _createInsert(tableName, rows, cb);
    _execTimeSeriesCommand(function(err, client, errorHandlingCb) {
        client.execute(cmd);
    });
};

RiakTS.prototype.query = _query =
function(sql, cb) {
    var cmd = _createQuery(sql, cb);
    _execTimeSeriesCommand(function(err, client, errorHandlingCb) {
        client.execute(cmd);
    });
};

RiakTS.prototype.listKeys = _listKeys =
function(tableName, cb) {
    var mappedKeys = [];
    var mappedCb = function(err, result) {
        if (!err) {
            result.keys.forEach(function(keysCsv) {
                var keys = keysCsv.toString().split(',');
                // convert timestamps to int
                keys = keys.map(function(it) {
                    if (!~~it) return it;
                    return parseInt(it);
                });
                mappedKeys.push(keys);
            });
        }
        if (result.done) {
            cb(err, {keys: mappedKeys});
        }
    };
    var cmd = new Riak.Commands.TS.ListKeys.Builder()
        .withTable(tableName)
        .withStreaming(true)
        .withCallback(mappedCb)
        .build();
    _execTimeSeriesCommand(function(err, client, errorHandlingCb) {
        client.execute(cmd);
    });
};

RiakTS.prototype._allTheThings = _allTheThings =
function(tableName, cb) {
    var keyStats = {};
    var fieldStats = {};
    var errors = [];
    var allStats = {
        keyStats: keyStats,
        fieldStats: fieldStats,
        errors: errors
    };
    var incrementStat = function(stats, key) {
        stats[key] = (stats[key] || 0) + 1;
    };
    var tilDone = 0;

    _listKeys(tableName, function(err, result) {
        result.keys.forEach(function(keys) {
            ++tilDone;
            _get(tableName, keys, function(err, result) {
                --tilDone;
                if (err) {
                    errors.push(err);
                } else if (result && result.rows) {
                    result.rows.forEach(function(row) {
                        row.forEach(function(column) {
                            incrementStat(fieldStats, column.toString());
                        });
                    });
                }
            });

            keys.forEach(function(key) {
                incrementStat(keyStats, key);
            });
        });

        var interval = setInterval(function() {
            if (tilDone <= 0) {
                cb(err, allStats);
                clearInterval(interval);
            }
        }, 300);
    });
};

module.exports = new RiakTS();
