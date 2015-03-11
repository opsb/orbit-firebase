/* global Firebase */
import Schema from 'orbit-common/schema';
import FirebaseSerializer from 'orbit-firebase/firebase-serializer';
import FirebaseListener from 'orbit-firebase/firebase-listener';
import FirebaseClient from 'orbit-firebase/firebase-client';
import { uuid } from 'orbit/lib/uuid';
import Orbit from 'orbit/main';
import { captureDidTransform, captureDidTransforms, op } from 'tests/test-helper';
import { fop } from 'orbit-firebase/lib/operation-utils';

var schemaDefinition = {
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
        moons: {type: 'hasMany', model: 'moon', inverse: 'planet'},
        races: {type: 'hasMany', model: 'race', inverse: 'planets'},
        next: {type: 'hasOne', model: 'planet', inverse: 'previous'},
        previous: {type: 'hasOne', model: 'planet', inverse: 'next'}
      }
    },
    moon: {
      attributes: {
        name: {type: 'string'}
      },
      links: {
        planet: {type: 'hasOne', model: 'planet', inverse: 'moons'}
      }
    },
    race: {
      attributes: {
        name: {type: 'string'},
      },
      links: {
        planets: {type: 'hasMany', model: 'planet', inverse: 'races'}
      }
    }
  }
};

var firebaseClient,
    firebaseListener,
    schema,
    cache;

module("OF - FirebaseListener", {
  setup: function() {
    Orbit.Promise = Promise;

    var firebaseRef = new Firebase("https://orbit-firebase.firebaseio.com/test");
    firebaseRef.set(null);
    firebaseClient = new FirebaseClient(firebaseRef);

    schema = new Schema(schemaDefinition);
    var serializer = new FirebaseSerializer(schema);

    firebaseListener = new FirebaseListener(firebaseRef, schema, serializer);
  },

  teardown: function() {
    firebaseListener = firebaseClient = null;
  }
});

test("receive add record operation", function(){
  stop();
  firebaseListener.subscribeToType('planet', "abc123");

  var planet = schema.normalize('planet', {id: "abc123", name: "Pluto"});
  var receiveOperation = captureDidTransform(firebaseListener, 1);

  firebaseClient.set('planet/abc123', planet);

  receiveOperation.then(function(operation){
    start();
    equal(operation.op, 'add', "op matches");
    deepEqual(operation.path, ['planet', 'abc123'], "path matches");
    deepEqual(schema.normalize('planet', operation.value), planet, "record matches");
  });
});

test("receive remove record operation", function(){
  stop();
  firebaseListener.subscribeToType('planet', "abc123");

  var planet = schema.normalize('planet', {id: "abc123", name: "Pluto"});

  var receiveOperation = captureDidTransform(firebaseListener, 7);
  
  firebaseClient.set('planet/abc123', planet);
  firebaseClient.remove('planet/abc123');

  receiveOperation.then(function(receivedOperation){
    start();
    equal(receivedOperation.op, 'remove', "op matches");
    deepEqual(receivedOperation.path, ['planet', 'abc123'], "path matches");
  });
});

test("receive update attribute operation", function(){
  stop();
  firebaseListener.subscribeToType('planet');

  var planet = schema.normalize('planet', {id: "abc123", name: "Pluto"});

  var receiveOperation = captureDidTransform(firebaseListener, 6);
  firebaseClient.set('planet/abc123', planet);
  firebaseClient.set('planet/abc123/name', "Jupiter");

  receiveOperation.then(function(receivedOperation){
    start();
    equal(receivedOperation.op, 'replace', "op matches");
    deepEqual(receivedOperation.path, ['planet', 'abc123', 'name'], "path matches");
    equal(receivedOperation.value, "Jupiter", "attribute value matches");
  });
});

test("receive replace hasOne operation", function(){
  stop();
  firebaseListener.subscribeToType('moon');
  var moon = schema.normalize('moon', {id: "moon123", name: "titan"});
  var planet = schema.normalize('planet', {id: "planet456", name: "jupiter"});

  var receiveOperation = captureDidTransform(firebaseListener, 4);

  firebaseClient.set('moon/moon123', moon);
  firebaseClient.set('planet/planet456', planet);
  firebaseClient.set('moon/moon123/planet', planet.id);

  receiveOperation.then(function(receivedOperation){
    start();
    equal(receivedOperation.op, 'replace', "op matches");
    deepEqual(receivedOperation.path, ['moon', 'moon123', '__rel', 'planet'], "path matches");
    equal(receivedOperation.value, "planet456", "link value matches");    
  });
});

test("receive remove hasOne operation", function(){
  stop();
  firebaseListener.subscribeToType('moon');
  var moon = schema.normalize('moon', {id: "moon123", name: "titan"});
  var planet = schema.normalize('planet', {id: "planet456", name: "jupiter"});

  var receiveOperation = captureDidTransform(firebaseListener, 3);

  firebaseClient.set('moon/moon123', moon);
  firebaseClient.set('planet/planet456', planet);
  firebaseClient.remove('moon/moon123/planet');

  receiveOperation.then(function(receivedOperation){
    start();
    equal(receivedOperation.op, 'remove', "op matches");
    deepEqual(receivedOperation.path, ['moon', 'moon123', '__rel', 'planet'], "path matches");
  });
});

test("receive add to hasMany operation", function(){
  stop();
  firebaseListener.subscribeToType('planet');

  var moon = schema.normalize('moon', {id: "moon123", name: "titan"});
  var planet = schema.normalize('planet', {id: "planet456", name: "jupiter"});

  var receiveOperation = captureDidTransform(firebaseListener, 6);

  firebaseClient.set('moon/moon123', moon);
  firebaseClient.set('planet/planet456', planet);
  firebaseClient.set('planet/planet456/moons/moon123', true);

  receiveOperation.then(function(receivedOperation){
    start();
    equal(receivedOperation.op, 'add', "op matches");
    deepEqual(receivedOperation.path, ['planet', 'planet456', '__rel', 'moons', 'moon123'], "path matches");
    equal(receivedOperation.value, true, "link value matches");
  });
});

test("receive remove from hasMany operation", function(){
  stop();
  firebaseListener.subscribeToType('planet');

  var moon = schema.normalize('moon', {id: "moon123", name: "titan"});
  var planet = schema.normalize('planet', {id: "planet456", name: "jupiter"});

  var receiveOperation = captureDidTransform(firebaseListener, 8);

  firebaseClient.set('moon/moon123', moon);
  firebaseClient.set('planet/planet456', planet);
  firebaseClient.set('planet/planet456/moons/moon123', true);
  firebaseClient.remove('planet/planet456/moons/moon123');

  receiveOperation.then(function(receivedOperation){
    start();
    equal(receivedOperation.op, 'remove', "op matches");
    deepEqual(receivedOperation.path, ['planet', 'planet456', '__rel', 'moons', 'moon123'], "path matches");
  });
});
