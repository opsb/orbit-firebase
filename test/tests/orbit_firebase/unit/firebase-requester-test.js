/* global Firebase */
import Orbit from 'orbit/main';
import { uuid } from 'orbit/lib/uuid';
import Schema from 'orbit-common/schema';
import Source from 'orbit-common/source';
import FirebaseSource from 'orbit-firebase/firebase-source';
import FirebaseSerializer from 'orbit-firebase/firebase-serializer';
import FirebaseRequester from 'orbit-firebase/firebase-requester';
import { Promise, all, hash, denodeify,resolve, on, defer, map } from 'rsvp';
import { isArray } from 'orbit/lib/objects';

import FirebaseClient from 'orbit-firebase/firebase-client';
import FirebaseTransformer from 'orbit-firebase/firebase-transformer';

import AddRecordTransformer from 'orbit-firebase/transformers/add-record';
import { op } from 'tests/test-helper';

on('error', function(reason){
  console.log(reason);
  console.error(reason.message, reason.stack);
});

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
    firebaseRequester;

///////////////////////////////////////////////////////////////////////////////

module("OC - FirebaseRequester", {
  setup: function() {
    Orbit.Promise = Promise;
    Orbit.all = all;
    Orbit.resolve = resolve;
    Orbit.map = map;

    var schema = new Schema(schemaDefinition);

    var firebaseRef = new Firebase("https://burning-torch-3002.firebaseio.com/test");
    firebaseRef.set(null);

    firebaseClient = new FirebaseClient(firebaseRef);
    var serializer = new FirebaseSerializer(schema);

    firebaseRequester = new FirebaseRequester(firebaseClient, schema, serializer);
  },

  teardown: function() {  
  }
});

test("find - by id", function(){
  expect(2);
  stop();

  var jupiter = {id: "abc1", name: "Jupiter"};

  firebaseClient.set('planet/abc1', jupiter)
  .then(function(){
    firebaseRequester.find('planet', "abc1").then(function(planet){
      start();

      equal(planet.id, jupiter.id, 'id included');
      equal(planet.name, jupiter.name, 'name included');
    });
  });

});

test("find - all", function(){
  expect(4);
  stop();

  var jupiter = {id: "abc1", name: "Jupiter"};
  var saturn = {id: "abc2", name: "Saturn"};

  firebaseClient.set('planet/abc1', jupiter);
  
  firebaseClient.set('planet/abc2', saturn)
  .then(function(){
    firebaseRequester.find('planet').then(function(planets){
      start();
      
      equal(planets[0].id, jupiter.id, 'id included');
      equal(planets[0].name, jupiter.name, 'name included');

      equal(planets[1].id, saturn.id, 'id included');
      equal(planets[1].name, saturn.name, 'name included');
    });
  });

});

test("findLink - hasMany", function(){
  expect(1);
  stop();

  var moonIds = {"abc2":true, "abc3":true};

  firebaseClient.set('planet/abc1/moons', moonIds)
  .then(function(){
    firebaseRequester.findLink('planet', 'abc1', 'moons').then(function(firebaseMoonIds){
      start();
      deepEqual(firebaseMoonIds, ['abc2', 'abc3']);
    });
    
  });
});

test("findLinked - hasMany", function(){
  stop();

  var jupiter = {id: "abc1", name: "Jupiter", moons: { "abc2": true, "abc3": true }};
  var titan = {id: "abc2", name: "Titan", planet: "abc1"};
  var callisto = {id: "abc3", name: "Callisto", planet: "abc1"};

  all([
    firebaseClient.set('planet/abc1', jupiter),
    firebaseClient.set('moon/abc2', titan),
    firebaseClient.set('moon/abc3', callisto)
  ])
  .then(function(){

    firebaseRequester.findLinked('planet', 'abc1', 'moons').then(function(moons){
      start();
      equal(moons[0].id, titan.id);
      equal(moons[1].id, callisto.id);
    });
  });

});

test("findLinked - hasOne", function(){
  expect(2);
  stop();

  var jupiter = {id: "abc1", name: "Jupiter", moons: { "abc2": true, "abc3": true }};
  var titan = {id: "abc2", name: "Titan", planet: "abc1"};
  var callisto = {id: "abc3", name: "Callisto", planet: "abc1"};

  all([
    firebaseClient.set('planet/abc1', jupiter),
    firebaseClient.set('moon/abc2', titan),
    firebaseClient.set('moon/abc3', callisto)
  ])
  .then(function(){
    firebaseRequester.findLinked('moon', 'abc2', 'planet').then(function(planet){
      start();
      equal(planet.id, jupiter.id);
      equal(planet.name, jupiter.name);
    });
  });

});




