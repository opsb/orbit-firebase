import Orbit from 'orbit/main';
import Operation from 'orbit/operation';
import { uuid } from 'orbit/lib/uuid';
import Schema from 'orbit-common/schema';
import MemorySource from 'orbit-common/memory-source';
import FirebaseSource from 'orbit-firebase/firebase-source';
import TransformConnector from 'orbit/transform-connector';
import { Promise, all, hash, denodeify,resolve, on, defer, map } from 'rsvp';
import jQuery from 'jquery';
import { verifyLocalStorageContainsRecord } from 'tests/test-helper';

var memorySource,
    firebaseSource,
    memoryToFirebaseConnector,
    firebaseToMemoryConnector,
    firebaseRef,
    otherFirebaseSource;

module("Integration - Firebase / Memory (Blocking)", {
  setup: function() {
    Orbit.Promise = Promise;
    Orbit.all = all;
    Orbit.resolve = resolve;    
    Orbit.map = map;    

    // Create schema
    var schema = new Schema({
      modelDefaults: {
        keys: {
          'id': {primaryKey: true, defaultValue: uuid}
        }
      },
      models: {
        planet: {
          attributes: {
            name: {type: 'string'},
            classification: {type: 'string'}
          },
          links: {
            moons: {type: 'hasMany', model: 'moon', inverse: 'planet'}
          }
        },
        moon: {
          attributes: {
            name: {type: 'string'}
          },
          links: {
            planet: {type: 'hasOne', model: 'planet', inverse: 'moons'}
          }
        }
      }
    });

    memorySource = new MemorySource(schema);
    memorySource.id = 'memorySource';

    firebaseRef = new Firebase("https://burning-torch-3002.firebaseio.com/test");
    firebaseRef.set(null);


    firebaseSource = new FirebaseSource(schema, {firebaseRef: firebaseRef});
    firebaseSource.id = 'firebase';

    otherFirebaseSource = new FirebaseSource(schema, {firebaseRef: firebaseRef});
    otherFirebaseSource.id = 'otherFirebase'

    memoryToFirebaseConnector = new TransformConnector(memorySource, firebaseSource);
    firebaseToMemoryConnector = new TransformConnector(firebaseSource, memorySource);

    schema.emit('modelRegistered', 'planet');
  },

  teardown: function() {
    firebaseRef = firebaseSource = memorySource = null;
  }
});

function nextEventPromise(emitter, event){
  return new Promise(function(resolve, fail){
    emitter.one(event, 
      function(operation){ resolve(operation); },
      function(error){ fail(error); }
    )
  });
}

function captureOperation(source, count, logOperations){
  return new Promise(function(resolve, reject){
    var operations = [];

    source.on("didTransform", function(operation){
      operations.push(operation);

      if(logOperations){
        console.log("operation " + operations.length + ": ", operation);
      }
      
      if(operations.length === count){
        resolve(operation);
      }
    });
  });
}

test("add to memory source should be synced with firebase source automatically", function() {
  expect(4);

  stop();

  var operation = new Operation({
    op: 'add',
    path: ['planet', '123'],
    value: memorySource.normalize('planet', {name: 'Jupiter'})
  });
  
  memorySource.transform(operation).then(function() {
    memorySource.find('planet', '123').then(function(planet1) {
      firebaseSource.find('planet', '123').then(function(planet2) {
        start();
        notStrictEqual(planet2, planet1, 'not the same object as the one originally inserted');
        equal(planet2.__id, planet1.__id, 'backup record has the same primary id');
        equal(planet2.name, planet1.name, 'backup record has the same name');
        equal(planet2.name, 'Jupiter', 'records have the updated name');
      });
    });
  });
});

test("add record to memory store operation is synchronised with other firebase store", function(){
  stop();

  var operation = new Operation({
    op: 'add',
    path: ['planet', '123'],
    value: memorySource.normalize('planet', {name: 'Jupiter'})
  });

  otherFirebaseSource._firebaseOperationQueues.subscribeToType("planet");
  var didTransformOtherFirebaseSource = nextEventPromise(otherFirebaseSource, "didTransform");

  memorySource.transform(operation);

  didTransformOtherFirebaseSource.then(function(receivedOperation){
    start();
    deepEqual(receivedOperation, operation, 'operations matched');
  });
});

test("when link is added to a hasOne in the memory store operation is synchronised with other firebase store", function(){
  stop();

  otherFirebaseSource._firebaseOperationQueues.subscribeToType("planet");
  otherFirebaseSource._firebaseOperationQueues.subscribeToType("moon");

  var planet = memorySource.normalize('planet', {name: 'Jupiter'})
  var addPlanetOp = new Operation({
    op: 'add',
    path: ['planet', planet.id],
    value: planet
  });

  var moon = memorySource.normalize('moon', {name: 'Titan'})
  var addMoonOp = new Operation({
    op: 'add',
    path: ['moon', moon.id],
    value: moon
  });

  var linkMoonToPlanetOp = new Operation({
    op: 'add',
    path: ['moon', moon.id, '__rel', 'planet'],
    value: planet.id
  });

  var receiveTransformations = captureOperation(otherFirebaseSource, 3, true);

  memorySource.transform(addPlanetOp);
  memorySource.transform(addMoonOp);
  memorySource.transform(linkMoonToPlanetOp);

  receiveTransformations.then(function(receivedOperation){
    start();
    deepEqual(receivedOperation, linkMoonToPlanetOp, 'operations matched');
  }); 
});

















