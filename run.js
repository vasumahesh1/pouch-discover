/*jshint expr:true */
'use strict';

var PouchDB = require('pouchdb');
var uuid = require('node-uuid');
var nconf = require('nconf');

nconf.argv()
  .env()
  .file({
    file: 'config.json'
  });

var thePlugin = require('./index');
PouchDB.plugin(thePlugin);

var localDb = 'pouch-discover-test-db';

console.log('Using: ' + localDb);

var db = PouchDB(localDb);

db.discover(localDb, nconf.get('remote'), nconf.get('guid'));

// setTimeout(function() {

//   var count = 0;

//   var prefix = uuid.v4()
//     .substring(0, 5);

//   setInterval(function() {
//     var id = SYSTEM + '-system-' + prefix + '-' + count;
//     console.log('Sending: ' + id);

//     db.put({
//       _id: id,
//       a: 10
//     });
//     count++;
//   }, 15000);

// }, 10000);
