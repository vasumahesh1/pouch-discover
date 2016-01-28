var q = require('q');
var debug = require('debug');
var networkAddress = require('network-address');

module.exports = Slave;

function Slave(syncDbName, pouchInstance, options) {

  options = options ? options : {};

  var localDB = options.localDB ? options.localDB : null;
  var clientGuid = options.guid ? options.guid : null;
  var networkNode = options.node ? options.node : null;

  if (!syncDbName) {
    throw new Error('Invalid Config: Must Provide Database Name for Slave');
  }

  if (!clientGuid) {
    throw new Error('Invalid Config: Must Provide Client GUID for Slave');
  }

  if (!pouchInstance) {
    throw new Error('Invalid Config: Must Provide PocuhDB Instance for Slave');
  }

  if (!localDB) {
    throw new Error('Invalid Config: Must Provide localDB Instance for Slave');
  }

  if (!networkNode) {
    throw new Error('Invalid Config: Must Provide Discover Node Instance for Slave');
  }

  var trace = debug('pouch-discover:trace:Slave');
  var info = debug('pouch-discover:info:Slave');
  var error = debug('pouch-discover:error:Slave');

  var PouchDB = pouchInstance.constructor;
  var sequenceDocument;
  var replicationHook;

  return {
    switchMaster: switchMaster
  };

  //////////////////////

  function switchMaster(masterNode) {
    var returnPromise = q.defer();

    if (masterNode.address && masterNode.port) {
      var adv = masterNode.advertisement;
      var syncUrl = adv.localUrl;
      var clientGuid = adv.clientGuid;

      _getSequence(clientGuid)
        .then(function(sequence) {
          _cancelExistingReplication();
          info('Starting Replication to ' + masterNode.address + ' with seq: ' + sequence);

          _syncLocalMaster(syncDbName, syncUrl, sequence, clientGuid);
          returnPromise.resolve();
        })
        .catch(function(err) {
          returnPromise.reject(err);
        });

    } else {
      error('Invalid Node: Can\'t Find Address or Port');
      returnPromise.reject(new Error('Invalid Node: Can\'t Find Address or Port'));
    }

    return returnPromise.promise;
  }

  function _syncLocalMaster(dbName, url, sequence, guid) {
    trace('Syncing Arguments: ');
    trace('- Database: ' + dbName);
    trace('- URL: ' + url);
    trace('- Sequence: ' + sequence);
    trace('- GUID: ' + guid);

    replicationHook = PouchDB.sync(dbName, url, {
        live: true,
        retry: true,
        since: sequence
      })
      .on('change', function(info) {
        trace('Local Replication - Change Event', info['last_seq']);

        var sequence = info['last_seq'];
        sequenceDocument[guid] = sequence;
        _updateRemoteSequence();
        networkNode.send('pouchDiscover:webSequence:requestUpdate', clientGuid);
      })
      .on('paused', function() {
        trace('Local Replication - Pause');
      })
      .on('active', function() {
        trace('Local Replication - Active');
      })
      .on('denied', function(err) {
        error('Local Replication - Deinied', err);
      })
      .on('uptodate', function() {
        trace('Local Replication - Up To Date');
      })
      .on('complete', function() {
        trace('Local Replication - Complete');
      })
      .on('error', function(err) {
        error('Local Replication - Error', err);
      });

    var success = networkNode.join('pouchDiscover:webSequence:update:' + clientGuid, function(sequence) {
      if (sequence) {
        info('Local Replication - Web Sequence from Master: ' + sequence);
        sequenceDocument.web = sequence;
        _updateRemoteSequence();
      }
    });

    if (!success) {
      error('Error Joining Channel: pouchDiscover:webSequence:update');
    }
  }

  function _cancelExistingReplication() {
    if (replicationHook) {
      info('Cancelling Existing Local Replication');
      replicationHook.cancel();
    }

    replicationHook = null;
  }

  function _updateRemoteSequence() {
    var returnPromise = q.defer();

    localDB.upsertDocument(sequenceDocument)
      .then(function(res) {
        returnPromise.resolve(res);
      })
      .catch(function(err) {
        error('Failed to Updated Local Sequence of Master');
        returnPromise.reject(err);
      });

    return returnPromise.promise;
  }

  function _getSequence(guid) {
    var returnPromise = q.defer();

    var sequence;

    localDB.getDocument('sequenceMap')
      .then(function(res) {
        sequenceDocument = res;
        sequenceDocument.guid = res.guid || 0;
        trace('Found Local Sequence Starting with ' + sequenceDocument.guid);
        returnPromise.resolve(sequenceDocument.guid);
      })
      .catch(function() {
        trace('Unable to Find Local Sequence Starting with 0');
        sequenceDocument = {};
        sequenceDocument._id = 'sequenceMap';
        sequenceDocument[guid] = 0;

        returnPromise.resolve(0);
      });

    return returnPromise.promise;
  }
}
