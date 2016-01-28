'use strict';
var q = require('q');
var utils = require('./pouch-utils');
var Discover = require('node-discover');
var debug = require('debug');

var LocalDB = require('./src/LocalDB');
var Master = require('./src/Master');
var Slave = require('./src/Slave');
var Policy = require('./src/Policy');

// Inits
var localDB = LocalDB();
debug.enable('pouch-discover*');
var info = debug('pouch-discover');
var masterInstance;
var slaveInstance;
var policy;

exports.discover = utils.toPromise(function(syncDbName, remoteUrl, guid, options) {
  var pouchInstance = this;
  info('Launching Node:');
  info('- Local DB Name:', syncDbName);
  info('- Remote URL', remoteUrl);
  info('- Node GUID', guid);

  var node = Discover();

  var isMaster = false;

  options = options ? options : {};

  var commonOptions = {};
  commonOptions.localDB = localDB;
  commonOptions.guid = guid;
  commonOptions.node = node;

  var masterPort = options.port || null;

  var masterInstance = Master(syncDbName, pouchInstance, remoteUrl, masterPort, commonOptions);
  var slaveInstance = Slave(syncDbName, pouchInstance, commonOptions);

  policy = new Policy(false, commonOptions);

  info('Node Launched. Now Listening for Events.');

  node.on('promotion', function(nodeData) {
    info('Node Promoted');
    isMaster = true;
    policy = new Policy(true, commonOptions);
    masterInstance.promote();
  });

  node.on('demotion', function(nodeData) {
    info('Node Demoted');
    isMaster = false;
    masterInstance.cancelSync();
    policy = new Policy(false, commonOptions);
  });

  node.on('added', function(nodeData) {
    info('Node Added');
    if (isMaster) {
      setTimeout(function() {
        policy.apply();
      }, 10000);
    } else {

    }
  });

  node.on('removed', function(nodeData) {
    info('Node Removed');

  });

  node.on('master', function(nodeData) {
    info('New Master');
    policy.subscribe();

    slaveInstance.switchMaster(nodeData);

  });
});

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
};
