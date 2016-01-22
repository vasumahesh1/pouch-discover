var q = require('q');
var debug = require('debug');
var networkAddress = require('network-address');

module.exports = Policy;

function Policy(isMaster, options) {
  var trace = debug('pouch-discover:trace:Policy');
  var info = debug('pouch-discover:info:Policy');
  var error = debug('pouch-discover:error:Policy');

  isMaster = isMaster ? isMaster : false;

  options = options ? options : {};

  var localDB = options.localDB ? options.localDB : null;
  var networkNode = options.node ? options.node : null;
  var clientGuid = options.guid ? options.guid : null;

  if (!networkNode) {
    throw new Error('Invalid Config: Must Provide Discover Node Instance for Policy');
  }

  if (!localDB) {
    throw new Error('Invalid Config: Must Provide localDB Instance for Master');
  }

  if (!clientGuid) {
    throw new Error('Invalid Config: Must Provide Client GUID for Policy');
  }

  // Wait for Collecting Sequence tokens from all Nodes
  var wait = options.wait ? options.wait : 30000;

  var sequenceDocument;

  trace('Policy Initialized');

  return {
    apply: apply,
    subscribe: subscribe
  };

  //////////////////////

  function apply() {
    // For Master
    if (isMaster) {

      trace('Applying Polcy: Master');

      _getRemoteSequence()
        .then(function(sequence) {
          var localWebMap = {};
          localWebMap[clientGuid] = sequence;

          networkNode.eachNode(function(node) {
            var adv = node.advertisement;

            if (adv && adv.isSlave) {
              localWebMap[adv.guid] = adv.webSequence;
            }
          });

          _selectNewMaster(localWebMap);
        })
        .catch(function(err) {
          error('Report Send Error: Policy Remote Sequence Get Error.', err);
        });
    }
  }

  function _selectNewMaster(mapping) {
    var highest = -1;
    var newMasterGuid;

    for (var key in mapping) {

      var sequence = mapping[key];

      if (highest < sequence) {
        highest = sequence;
        newMasterGuid = key;
      }
    }

    trace('Report Timeout Expired. Node Mapping is: ', mapping);

    if (newMasterGuid.toString() !== clientGuid.toString()) {
      // Not the Same Master
      info('Selected new Master: ' + newMasterGuid);
      networkNode.send('pouchDiscover:webSequence:result', newMasterGuid);
      networkNode.demote();
    } else {
      info('Same GUID Detected. Master will not Change. Current Master is Highest and Up to Date.');
    }
  }


  function subscribe() {
    // For Slaves
    if (!isMaster) {
      trace('Subscribing Polcy: Slave');

      _getRemoteSequence()
        .then(function(sequence) {
          var data = {};
          data.guid = clientGuid;
          data.webSequence = sequence;
          data.sequenceDocument = sequenceDocument;
          data.isSlave = true;

          networkNode.advertisement = data;
        })
        .catch(function(err) {
          error('Report Error: Policy Remote Sequence Get Error.', err);
        });

      var result = networkNode.join('pouchDiscover:webSequence:result', function(guid) {
        if (guid && guid === clientGuid) {
          info('Report: Node Selected. Promoting to Master');
          networkNode.promote();
        }
      });

      if (!result) {
        error('Error Joining Result Channel');
      }
    }
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
}
