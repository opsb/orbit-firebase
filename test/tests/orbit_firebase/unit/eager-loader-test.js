/* global Firebase */
import FirebaseClient from 'orbit-firebase/firebase-client';
import FirebaseConnector from 'orbit-firebase/firebase-connector';
import Orbit from 'orbit/main';
import Cache from 'orbit-common/cache';
import Schema from 'orbit-common/schema';
import { uuid } from 'orbit/lib/uuid';
import { Promise } from 'rsvp';
import { op } from 'tests/test-helper';
import { Class } from 'orbit/lib/objects';
import Evented from 'orbit/evented';

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

var SourceStub = Class.extend({
  init: function(){
    Evented.extend(this);
  },

  transform: function(operation){
    this.emit("didTransform", operation);
  }
});

var firebaseRef,
    firebaseClient,
    firebaseConnector,
    source,
    cache;

module("OF - EagerLoader", {
  setup: function() {
    Orbit.Promise = Promise;
    var schema = new Schema(schemaDefinition);
    cache = new Cache(schema);
    source = new SourceStub();
    firebaseConnector = new FirebaseConnector(source, cache);
  },

  teardown: function() {
  }
});


