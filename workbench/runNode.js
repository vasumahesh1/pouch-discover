/*jshint expr:true */
'use strict';

var PouchDB = require('pouchdb');
var uuid = require('node-uuid');
var nconf = require('nconf');
var debug = require('debug');


debug.enable('pouch-discover*');
nconf.argv()
  .env()
  .file({
    file: 'config.json'
  });

var info = debug('pouch-discover');

var DOC_CREATE_INIT_TIME = 10000;
var DOC_CREATE_INTERVAL = nconf.get('interval') || 15000;

var PouchDiscover = require('../index');
PouchDB.plugin(PouchDiscover);

var localDb = 'pouch-discover-test-db';
var db = PouchDB(localDb);

db.discover(localDb, nconf.get('remote'), nconf.get('guid'));

info('Starting Config: ');
info('Create Docs: ' + nconf.get('create:docs'));
info('GUID: ' + nconf.get('guid'));

if (nconf.get('create:docs')) {
  
  info('Creating Docs after: ' + DOC_CREATE_INIT_TIME + 'ms');
  info('Doc Create Interval: ' + DOC_CREATE_INTERVAL + 'ms');
  setTimeout(function() {
    var count = 0;

    var prefix = uuid.v4()
      .substring(0, 5);

    setInterval(function() {
      var id = nconf.get('guid') + '-document-' + prefix + '-' + count;
      info('Inserting Document: ' + id);

      db.put({
        _id: id,
        prefix: prefix,
        a: 10
      });

      count++;
    }, DOC_CREATE_INTERVAL);

  }, DOC_CREATE_INIT_TIME);
  
}
