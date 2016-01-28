var q = require('q');
var debug = require('debug');
var networkAddress = require('network-address');

module.exports = Master;

function Master(syncDbName, pouchInstance, remoteUrl, expressPort, options) {

  options = options ? options : {};

  var localDB = options.localDB ? options.localDB : null;
  var clientGuid = options.guid ? options.guid : null;
  var networkNode = options.node ? options.node : null;

  if (!syncDbName) {
    throw new Error('Invalid Config: Must Provide Database Name for Master');
  }

  if (!remoteUrl) {
    throw new Error('Invalid Config: Must Provide Remote URL for Master');
  }

  if (!clientGuid) {
    throw new Error('Invalid Config: Must Provide Client GUID for Master');
  }

  if (!pouchInstance) {
    throw new Error('Invalid Config: Must Provide PocuhDB Instance for Master');
  }

  if (!localDB) {
    throw new Error('Invalid Config: Must Provide localDB Instance for Master');
  }

  if (!networkNode) {
    throw new Error('Invalid Config: Must Provide Discover Node Instance for Master');
  }

  var trace = debug('pouch-discover:trace:Master');
  var info = debug('pouch-discover:info:Master');
  var error = debug('pouch-discover:error:Master');

  var PouchDB = pouchInstance.constructor;
  var port = expressPort ? expressPort : 1777;
  var sequenceDocument;
  var replicationHook;

  return {
    promote: promote,
    cancelSync: cancelSync
  };

  //////////////////////

  function promote() {
    var returnPromise = q.defer();
    var ip = networkAddress();

    cancelSync();

    trace('Attempting to launch Express PouchDB');
    _launchExpressPouch()
      .then(function() {
        info('Express PouchDB Started at port ' + port);

        return _getRemoteSequence();
      })
      .then(function(sequence) {

        var adv = {};
        adv.localUrl = 'http://' + networkAddress() + ':' + port + '/' + syncDbName;
        adv.clientGuid = clientGuid;

        trace('Sending Advertisement to Nodes:', adv);

        networkNode.advertise(adv);

        return _startRemoteReplication(sequence);
      })
      .catch(function(err) {
        error('Error in Promote: ', err);
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
    trace('Remote Syncing Arguments: ');
    trace('- Database: ' + syncDbName);
    trace('- URL: ' + remoteUrl);
    trace('- Sequence: ' + remoteSequence);

    replicationHook = PouchDB.replicate(syncDbName, remoteUrl, {
        retry: true,
        live: true,
        since: remoteSequence
      })
      .on('change', function(info) {
        trace('Remote Replication - Change Event', info['last_seq']);

        var sequence = info['last_seq'];
        sequenceDocument.web = sequence;
        _updateRemoteSequence();
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
      .on('complete', function(info) {
        trace('Remote Replication - Complete', info);
      })
      .on('error', function(err) {
        error('Remote Replication - Error', err);
      });


    networkNode.join('pouchDiscover:webSequence:requestUpdate', function(guid) {
      if (guid) {
        trace('Sending Web Sequence to: ' + guid, sequenceDocument.web);
        networkNode.send('pouchDiscover:webSequence:update:' + guid, sequenceDocument.web);
      }
    });
  }

  function cancelSync() {
    if (replicationHook) {
      info('Cancelling Existing Remote Replication');
      replicationHook.cancel();
    }

    replicationHook = null;
  }
}
