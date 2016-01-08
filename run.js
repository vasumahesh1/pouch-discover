/*jshint expr:true */
'use strict';

var SYSTEM = '1';

var PouchDB = require('pouchdb');
var uuid = require('node-uuid');

var thePlugin = require('./index');
PouchDB.plugin(thePlugin);

var localDb = 'test-1';

console.log('Using: ' + localDb);

var db = PouchDB(localDb);

db.discover(localDb, 'Remote Link Here', SYSTEM);

setTimeout(function() {

  var count = 0;

  var prefix = uuid.v4()
    .substring(0, 5);

  setInterval(function() {
    var id = SYSTEM + '-system-' + prefix + '-' + count;
    console.log('Sending: ' + id);

    db.put({
      _id: id,
      a: 10
    });
    count++;
  }, 15000);

}, 10000);
