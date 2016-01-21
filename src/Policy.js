var q = require('q');
var networkAddress = require('network-address');

module.exports = Slave;

function Policy(isMaster, options) {

  isMaster = isMaster ? isMaster : false;

  options = options ? options : {};

  var localDB = options.localDB ? options.localDB || null;
  var networkNode = options.node ? options.node || null;
  var clientGuid = options.guid ? options.guid || null;

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
  var wait = options.wait ? options.wait || 30000;

  var trace = debug('pouch-discover:trace:Policy');
  var info = debug('pouch-discover:info:Policy');
  var error = debug('pouch-discover:error:Policy');

  var sequenceDocument;

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

          var result = networkNode.join('pouchDiscover:webSequence:reportBack', function(data) {
            if (data) {
              localWebMap[data.guid] = data.sequence;
            } else {
              error('Error in ReportBack Data');
            }
          });

          if (result) {
            trace('Asking Nodes to Report Web Sequence');
            networkNode.send('pouchDiscover:webSequence:report');

            setTimeout(function() {

              var highest = -1;
              var newMasterGuid;

              for (var key in localWebMap) {

                var sequence = localWebMap[key];

                if (highest < sequence) {
                  highest = sequence;
                  newMasterGuid = key;
                }
              }

              trace('Report Timeout Expired. Node Mapping is as: ', localWebMap);

              if (newMasterGuid !=== clientGuid) {
                // Not the Same Master
                info('Selected new Master: ' + clientGuid);
                networkNode.send('pouchDiscover:webSequence:result', newMasterGuid);
                networkNode.demote();
              } else {
                info('Same GUID Detected. Master will not Change. Current Master is Highest and Up to Date.');
              }

            }, wait);

          } else {
            error('Unable to Join ReportBack Channel');
          }
        })
        .catch(function(err) {
          error('Report Send Error: Policy Remote Sequence Get Error.', err);
        });
    }
  }


  function subscribe() {
    // For Slaves
    if (!isMaster) {
      trace('Subscribing Polcy: Slave');
      var success = networkNode.join('pouchDiscover:webSequence:report', function() {
        _getRemoteSequence()
          .then(function(sequence) {
            var data = {};
            data.sequence = sequence;
            data.guid = clientGuid;

            var result = networkNode.join('pouchDiscover:webSequence:result', function(guid) {
              if (guid && guid === clientGuid) {
                info('Report: Node Selected. Promoting to Master');
                networkNode.promote();
              }
            });

            if (result) {
              trace('Report: Sending Requested Sequence Data', data);
              networkNode.send('pouchDiscover:webSequence:reportBack', data);
            } else {
              error('Error Joining Result Channel');
            }
          })
          .catch(function(err) {
            error('Report Error: Policy Remote Sequence Get Error.', err);
          });
      });

      if (!success) {
        error('Error Joining Channel: pouchDiscover:webSequence:update');
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
