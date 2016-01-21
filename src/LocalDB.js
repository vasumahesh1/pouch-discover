var NeDB = require('nedb');
var debug = require('debug');

module.exports = LocalDB;

function LocalDB(path) {
  path = path ? path : 'seq/sequence.db';

  var trace = debug('pouch-discover:trace:LocalDB');
  var info = debug('pouch-discover:info:LocalDB');
  var error = debug('pouch-discover:error:LocalDB');

  var _dbOptions = {
    filename: path,
    autoload: true
  };

  var _db = new NeDB(_dbOptions);

  return {
    getDocument: getDocument,
    upsertDocument: upsertDocument
  };

  ///////////////////////////////

  function getDocument(id) {
    var returnPromise = q.defer();

    var findCriteria = {
      _id: id
    };

    _db.findOne(findCriteria, function(err, doc) {
      if (err) {
        returnPromise.reject(null);
        return error('Unable to Find Document: ' + id, err);
      }


      trace('getDocument - Success', doc);

      returnPromise.resolve(doc);
    });

    return returnPromise.promise;
  }

  function upsertDocument(document) {

    var findCriteria = {
      _id: document._id
    };

    var updateOptions = {
      upsert: true
    };

    fileDb.update(findCriteria, document, updateOptions, function(err, numReplaced, upsert) {
      trace('Upsert Result: ', err, numReplaced, upsert);

      if (err) {
        error('Upsert Document Failed', err);
      }

      trace('Upsert Document Success');
    });
  }

}
