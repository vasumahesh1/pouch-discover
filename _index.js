'use strict';
var q = require('q');
var utils = require('./pouch-utils');
var Discover = require('node-discover');
var address = require('network-address');
var Datastore = require('nedb');
var fileDb = new Datastore({
  filename: 'seq/lan.db',
  autoload: true
});

// fileDb.persistence.setAutocompactionInterval(300000); // 5mins

var debug = require('debug');
debug.enable('pouch-discover*');
var mainDbLog = debug('pouch-discover:maindb');
var slaveDbLog = debug('pouch-discover:slavedb');
var fileDbLog = debug('pouch-discover:filedb');
var log = debug('pouch-discover');



var remoteReplicateHook = null;

var lastSequence = {};
var webSequence = null;

exports.discover = utils.toPromise(function(target, remoteUrl, guid) {
  var db = this;

  getDocument('sequence_web')
    .then(function(res) {
      log('Web Data: ', res);
      if (res) {
        webSequence = res['web'];
      }

      return getDocument('sequence_db')
    })
    .then(function(res) {
      log('Sequence Data: ', res);
      if (res) {
        lastSequence = res;
      }

      var node = Discover();

      node.on("promotion", function(nodeData) {
        log(arguments);
        onPromotion(db, target, node, remoteUrl, guid, nodeData);
      });

      node.on("demotion", function(nodeData) {
        log(arguments);
        onDemotion(db, target, nodeData);
      });

      node.on("added", function(nodeData) {
        log(arguments);
        onNewNode(db, target, nodeData);
      });

      node.on("removed", function(nodeData) {
        log(arguments);
        onNodeRemoved(db, target, nodeData);
      });

      node.on("master", function(nodeData) {
        log(arguments);
        onNewMaster(db, target, node, nodeData);
      });

    });

  // var PouchDB = pouch.constructor;

  // callback(null, 'hello');
});

function onPromotion(db, target, node, remoteUrl, guid, nodeData) {
  log("I was promoted to a master.");

  var express = require('express');
  var app = express();
  var PouchDB = db.constructor;

  if (remoteReplicateHook) {
    remoteReplicateHook.cancel();
  }

  remoteReplicateHook = null;


  app.use('/', require('express-pouchdb')(PouchDB));
  app.listen(3000);

  var data = {
    url: 'http://' + address() + ':3000/' + target,
    guid: guid
  };

  // log('Replicating: ', target, data.url);
  PouchDB.replicate(target, remoteUrl, {
      retry: true,
      live: true,
      since: webSequence
    })
    .on('change', function(info) {
      mainDbLog('MAIN - change', info.last_seq);
      node.send('webSequence', info.last_seq);
      webSequence = info.last_seq;
      logSequenceToDb('sequence_web', 'web', info.last_seq);
    })
    .on('paused', function() {
      mainDbLog('MAIN - paused');
    })
    .on('active', function() {
      mainDbLog('MAIN - active');
    })
    .on('denied', function(info) {
      mainDbLog('MAIN - denied', arguments);
    })
    .on('uptodate', function(info) {
      mainDbLog('MAIN - uptodate', arguments);
    })
    .on('complete', function(info) {
      mainDbLog('MAIN - complete', arguments);
    })
    .on('error', function(err) {
      mainDbLog('MAIN - error', arguments);
    });

  node.advertise(data);

  // node.send('masterReplicationConfig', data);
  // log('SEND masterReplicationConfig', data);
}

function onDemotion(db, target) {
  log("I was demoted from being a master.");
}

function onNewNode(db, target) {
  log("A new node has been added.");
  // node.eachNode(function(node) {
  //   if (node.advertisement == 'master') {
  //     log("nodejs loves this node too");
  //   }
  // });
}

function onNodeRemoved(db, target) {
  log("A node has been removed.");
}

function onNewMaster(db, target, node, nodeData) {
  log("A new master is in control");

  var PouchDB = db.constructor;

  if (nodeData.address && nodeData.port) {
    if (remoteReplicateHook) {
      remoteReplicateHook.cancel();
    }

    remoteReplicateHook = null;

    var masterData = nodeData.advertisement;

    var masterUrl = masterData.url;

    var seq;
    var masterGuid = masterData.guid;

    slaveDbLog('Checking Sequence: ', lastSequence);

    if (lastSequence[masterGuid]) {
      seq = lastSequence[masterGuid];
      slaveDbLog('Found Existing Sequence: ' + seq);
    }

    remoteReplicateHook = PouchDB.sync(target, masterUrl, {
        live: true,
        retry: true,
        since: seq
      })
      .on('change', function(info) {
        slaveDbLog('change', info.change['last_seq'], info.change.docs);
        lastSequence[masterGuid] = info.change['last_seq'];
        logSequenceToDb('sequence_db', masterGuid, info.change['last_seq']);
      })
      .on('paused', function() {
        slaveDbLog('paused', arguments);
      })
      .on('active', function() {
        slaveDbLog('active', arguments);
      })
      .on('denied', function(info) {
        slaveDbLog('denied', arguments);
      })
      .on('uptodate', function(info) {
        slaveDbLog('uptodate', arguments);
      })
      .on('complete', function(info) {
        slaveDbLog('complete', arguments);
      })
      .on('error', function(err) {
        slaveDbLog('error', arguments);
      });

    var success = node.join('webSequence', function(data) {
      if (data) {
        log('Updating WEB Sequence to ' + data);
        webSequence = data;
        logSequenceToDb('sequence_web', 'web', data);
      }
    });

  } else {
    slaveDbLog('Node Address or Port Invalid');
  }
}


function logSequenceToDb(id, field, data) {
  var change = {};
  change[field] = data;
  change['_id'] = id;

  fileDb.update({
    _id: id
  }, change, {
    upsert: true
  }, function(err, numReplaced, upsert) {

    fileDbLog(err, numReplaced, upsert);

    if (err) {
      return fileDbLog('logSequenceToDb - err', err);
    }


    fileDbLog('logSequenceToDb - Success');
  });
}

function getDocument(id) {
  var defer = q.defer();

  fileDb.findOne({
    _id: id
  }, function(err, doc) {


    if (err) {
      defer.resolve(null);
      return fileDbLog('getDocument - err', err);
    }


    fileDbLog('getDocument - Success', doc);

    defer.resolve(doc);
  });

  return defer.promise;
}

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
};
