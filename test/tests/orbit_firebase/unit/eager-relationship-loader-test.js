/* global Firebase */
import { op } from 'tests/test-helper';
import { Class } from 'orbit/lib/objects';
import Evented from 'orbit/evented';
import EagerRelationshipLoader from 'orbit-firebase/eager-relationship-loader';
import { Promise } from 'rsvp';
import Orbit from 'orbit/main';
import Schema from 'orbit-common/schema';
import { uuid } from 'orbit/lib/uuid';
import {  } from 'tests/test-helper';

var TransformableStub = Class.extend({
  init: function(){
    Evented.extend(this);
  },

  transform: function(operation){
    this.emit("didTransform", operation);
  }
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

var eagerRelationshipLoader,
    transformable,
    listener;

module("OF - EagerRelationshipLoader", {
  setup: function() {
    Orbit.Promise = Promise;

    var schema = new Schema(schemaDefinition);
    transformable = new TransformableStub();
    listener = {};
    eagerRelationshipLoader = new EagerRelationshipLoader(transformable, listener, schema);
  },

  teardown: function() {
  }
});

test("subscribes to all related records when record is added", function(){
  listener.subscribeToRecord = sinon.spy();
  listener.subscribeToRecords = sinon.spy();

  var planet = { id: 'abc123', name: 'Jupiter', __rel: {
    moons: { "moon1": true, "moon2": true },
    next: "planet1"
  }};
  var operation = op('add', ['planet', 'abc123'], planet);
  transformable.transform(operation);

  ok(listener.subscribeToRecords.calledWith('moon', ['moon1', 'moon2']), "moons in hasMany were added");
  ok(listener.subscribeToRecord.calledWith('planet', 'planet1'), "moon in hasOne was added");
});

test("subscribes to record when added to a hasMany link", function(){
  listener.subscribeToRecord = sinon.spy();

  var operation = op('add', ['planet', 'abc123', '__rel', 'moons', 'abc123'], true);
  transformable.transform(operation);

  ok(listener.subscribeToRecord.calledWith('moon', 'abc123'), "subscribed to linked moon");
});

test("subscribes to all records when a hasMany link is replaced", function(){
  listener.subscribeToRecords = sinon.spy();

  var operation = op('replace', ['planet', 'abc123', '__rel', 'moons'], { "abc1": true, "def2": true });
  transformable.transform(operation);

  ok(listener.subscribeToRecords.calledWith('moon', ['abc1', "def2"]), "subscribed to linked moons");
});

test("subscribes to record when added to a hasOne link", function(){
  listener.subscribeToRecord = sinon.spy();

  var operation = op('add', ['moon', 'abc123', '__rel', 'planet'], 'abc123');
  transformable.transform(operation);

  ok(listener.subscribeToRecord.calledWith('planet', 'abc123'), "subscribed to linked planet");
});

test("subscribes to record when added to a hasOne link that's named differently to the model", function(){
  listener.subscribeToRecord = sinon.spy();

  var operation = op('add', ['planet', 'planet1', '__rel', 'next'], 'planet2');
  transformable.transform(operation);

  ok(listener.subscribeToRecord.calledWith('planet', 'planet2'), "subscribed to linked planet");
});

test("subscribes to record when it replaces a hasOne link", function(){
  listener.subscribeToRecord = sinon.spy();

  var operation = op('replace', ['moon', 'abc123', '__rel', 'planet'], 'abc123');
  transformable.transform(operation);

  ok(listener.subscribeToRecord.calledWith('planet', 'abc123'), "subscribed to linked planet");
});

// todo - unsubscriptions...
