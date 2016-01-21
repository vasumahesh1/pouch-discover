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

  policy = Policy(false, commonOptions);

  node.on('promotion', function(nodeData) {
    isMaster = true;
    policy = Policy(true, commonOptions);
    masterInstance.promote();
  });

  node.on('demotion', function(nodeData) {
    isMaster = false;
    masterInstance.cancelSync();
    policy = Policy(false, commonOptions);
  });

  node.on('added', function(nodeData) {
    
  });

  node.on('removed', function(nodeData) {
    log(arguments);
    onNodeRemoved(db, target, nodeData);
  });

  node.on('master', function(nodeData) {
    log(arguments);
    onNewMaster(db, target, node, nodeData);
  });
});

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
};
