var q = require('q');
var networkAddress = require('network-address');

module.exports = MasterInstance;

function MasterInstance(database, remoteUrl, expressPort, options) {

  options = options ? options : {};

  var localDB = options.localDB ? options.localDB || null;
  var networkNode = options.node ? options.node || null;

  if (!remoteUrl) {
    throw new Error('Invalid Config: Must Provide Remote URL for Master');
  }

  if (!database) {
    throw new Error('Invalid Config: Must Provide PocuhDB Instance for Master');
  }

  if (!localDB) {
    throw new Error('Invalid Config: Must Provide localDB Instance for Master');
  }

  if (!networkNode) {
    throw new Error('Invalid Config: Must Provide Discover Node Instance for Master');
  }

  var trace = debug('pouch-discover:trace:MasterInstance');
  var info = debug('pouch-discover:info:MasterInstance');
  var error = debug('pouch-discover:error:MasterInstance');

  var PouchDB = database.constructor;
  var port = expressPort ? expressPort : 1777;
  var sequenceDocument;

  return {
    promote: promote
  };

  //////////////////////

  function promote() {
    var returnPromise = q.defer();
    var ip = networkAddress();

    trace('Attempting to launch Express PouchDB');
    _launchExpressPouch()
      .then(function() {
        info('Express PouchDB Started at port ' + port);

        return _getRemoteSequence();
      })
      .then(function(sequence) {
        return _startRemoteReplication(sequence);
      })
      .catch(function(err) {
        returnPromise.reject(err);
      });

    return returnPromise.promise;
  }

  function _launchExpressPouch() {
    var returnPromise = q.defer();

    var express = require('express');
    var app = express();

    app.use('/', require('express-pouchdb')(PouchDB));
    app.listen(port, function(err) {
      if (err) {
        return returnPromise.reject(err);
      }

      returnPromise.resolve();
    });

    return returnPromise.promise;
  }

  function _getRemoteSequence() {
    var returnPromise = q.defer();

    var sequence;

    localDB.getDocument('sequenceMap')
      .then(function(res) {
        sequenceDocument = res;
        sequenceDocument.web = res.web || 0;
        trace('Found Remote Sequence Starting with ' + sequenceDocument.web);
        returnPromise.resolve(sequenceDocument.web);
      })
      .catch(function() {
        trace('Unable to Find Remote Sequence Starting with 0');
        sequenceDocument = {
          _id: 'sequenceMap',
          web: 0
        };

        returnPromise.resolve(0);
      });

    return returnPromise.promise;
  }

  function _updateRemoteSequence() {
    var returnPromise = q.defer();

    localDB.upsertDocument(sequenceDocument)
      .then(function(res) {
        returnPromise.resolve(res);
      })
      .catch(function(err) {
        error('Failed to Updated Remote Sequence');
        returnPromise.reject(err);
      });

    return returnPromise.promise;
  }

  function _startRemoteReplication(remoteSequence) {
    PouchDB.replicate(target, remoteUrl, {
        retry: true,
        live: true,
        since: remoteSequence
      })
      .on('change', function(info) {
        trace('Replication - Change Event', info['last_seq']);

        var sequence = info['last_seq'];
        sequenceDocument.web = sequence;
        _updateRemoteSequence();
        networkNode.send('pouchDiscover:webSequence:update', sequenceDocument.web);
      })
      .on('paused', function() {
        trace('Remote Replication - Pause');
      })
      .on('active', function() {
        trace('Remote Replication - Active');
      })
      .on('denied', function(err) {
        error('Remote Replication - Deinied', err);
      })
      .on('uptodate', function() {
        trace('Remote Replication - Up To Date');
      })
      .on('complete', function() {
        trace('Remote Replication - Complete');
      })
      .on('error', function(err) {
        error('Remote Replication - Error', err);
      });
  }
}
