/* global Firebase */
import Orbit from 'orbit/main';
import Operation from 'orbit/operation';
import { uuid } from 'orbit/lib/uuid';
import Schema from 'orbit-common/schema';
import Source from 'orbit-common/source';
import FirebaseSource from 'orbit-firebase/firebase-source';
import FirebaseSerializer from 'orbit-firebase/firebase-serializer';
import { Promise, all, hash, denodeify,resolve, on, defer } from 'rsvp';
import { isArray } from 'orbit/lib/objects';
import Cache from 'orbit-common/cache';

import FirebaseClient from 'orbit-firebase/firebase-client';
import FirebaseTransformer from 'orbit-firebase/firebase-transformer';

import AddRecordTransformer from 'orbit-firebase/transformers/add-record';

on('error', function(reason){
  console.log(reason);
  console.error(reason.message, reason.stack);
});

function op(op, path, value){
  var operation = new Operation({op: op, path: path});
  if(value) operation.value = value;
  return operation;
}

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
    firebaseTransformer,
    cache;

///////////////////////////////////////////////////////////////////////////////

module("OC - FirebaseTransformer", {
  setup: function() {
    Orbit.Promise = Promise;
    Orbit.all = all;
    Orbit.resolve = resolve;

    var schema = new Schema(schemaDefinition);

    var firebaseRef = new Firebase("https://burning-torch-3002.firebaseio.com/test");
    firebaseRef.set(null);

    firebaseClient = new FirebaseClient(firebaseRef);
    var serializer = new FirebaseSerializer(schema);

    cache = new Cache(schema);

    firebaseTransformer = new FirebaseTransformer(firebaseClient, schema, serializer, cache);
  },

  teardown: function() {  
  }
});

test("can add record", function(){
  expect(2);
  stop();

  firebaseTransformer.transform(op('add', 'planet/1', {name: "Jupiter"}))
  .then(function(){
    firebaseClient.valueAt('planet/1').then(function(planet){
      start();

      ok(planet.id, "planet has an id");
      equal(planet.name, "Jupiter", "planet has a name");
    });
  });
});

test("can remove record", function(){
  expect(1);
  stop();

  firebaseTransformer.transform(op('add', 'planet/1', {name: "Jupiter"}))
  .then(function(){
    return firebaseTransformer.transform(op('remove', 'planet/1'));

  })
  .then(function(){
    firebaseClient.valueAt('planet/1').then(function(planet){
      start();
      ok(!planet, "planet has been removed");
    });

  });
});

test("can replace attribute", function(){
  expect(1);
  stop();

  firebaseTransformer.transform(op('add', 'planet/1', {name: "Jupiter"}))
  .then(function(){
    return firebaseTransformer.transform(op('replace', 'planet/1/name', 'Saturn'));

  })
  .then(function(){
    firebaseClient.valueAt('planet/1').then(function(planet){
      start();
      equal(planet.name, "Saturn");
    });

  });
});

test("can add attribute", function(){
  expect(1);
  stop();

  firebaseTransformer.transform(op('add', 'planet/1', {name: "Jupiter"}))
  .then(function(){
    return firebaseTransformer.transform(op('add', 'planet/1/name', 'Saturn'));

  })
  .then(function(){
    firebaseClient.valueAt('planet/1').then(function(planet){
      start();
      equal(planet.name, "Saturn");
    });

  });
});

/////////////////////////////////////////////////////////////////////////////
  // hasOne
  /////////////////////////////////////////////////////////////////////////////

test("add link - set hasOne", function(){
  stop();

  var planetId = 10;

  firebaseTransformer.transform(op('add', 'moon/1', {name: "Titan"}))
  .then(function(){
    return firebaseTransformer.transform(op('add', 'moon/1/__rel/planet', planetId));

  })
  .then(function(){
    firebaseClient.valueAt('moon/1/planet').then(function(firebasePlanetId){
      start();
      equal(firebasePlanetId, planetId);
    });

  });  
});

test("replace link - replace hasOne", function(){
  stop();

  var planetId = 10;

  firebaseTransformer.transform(op('add', 'moon/1', {name: "Titan"}))
  .then(function(){
    return firebaseTransformer.transform(op('replace', 'moon/1/__rel/planet', planetId));

  })
  .then(function(){
    firebaseClient.valueAt('moon/1/planet').then(function(firebasePlanetId){
      start();
      equal(firebasePlanetId, planetId);
    });

  });  
});

test("remove link - remove hasOne", function(){
  stop();

  var planetId = 10;

  firebaseTransformer.transform(op('add', 'moon/1', {name: "Titan"}))
  .then(function(){
    return firebaseTransformer.transform(op('remove', 'moon/1/__rel/planet'));

  })
  .then(function(){
    firebaseClient.valueAt('moon/1/planet').then(function(firebasePlanetId){
      start();
      ok(!firebasePlanetId);
    });

  });  
});

/////////////////////////////////////////////////////////////////////////////
  // hasMany that actsAsOrderedSet
  /////////////////////////////////////////////////////////////////////////////

// test("add link - add to hasMany that actsAsOrderedSet", function(){
//   expect(1);
//   stop();

//   var moonId = 3;

//   firebaseTransformer.transform(op('add', 'planet/1', {name: "Jupiter"}))
//   .then(function(){
//     return firebaseTransformer.transform(op('add', 'planet/1/__rel/moons/0', moonId))

//   })
//   .then(function(){
//     firebaseClient.valueAt('planet/1/moons').then(function(moons){
//       start();
//       equal(moons[0], moonId);
//     });

//   });
// });

// test("replace link - set hasMany that actsAsOrderedSet", function(){
//   stop();

//   var moonIds = [1,2,3];

//   firebaseTransformer.transform(op('add', 'moon/1', {name: "Titan"}))
//   .then(function(){
//     return firebaseTransformer.transform(op('replace', 'planet/1/__rel/moons', moonIds))

//   })
//   .then(function(){
//     firebaseClient.valueAt('planet/1/moons').then(function(firebaseMoonIds){
//       start();
//       deepEqual(firebaseMoonIds, moonIds);
//     });

//   });   
// });

// test("remove link - remove from a hasMany that actsAsOrderedSet", function(){
//   stop();

//   var moonIds = [1,2,3];

//   firebaseTransformer.transform(op('add', 'moon/1', {name: "Titan"}))
//   .then(function(){
//     return firebaseTransformer.transform(op('replace', 'planet/1/__rel/moons', moonIds))

//   })
//   .then(function(){
//     return firebaseTransformer.transform(op('remove', 'planet/1/__rel/moons/0'))    
//   })
//   .then(function(){
//     firebaseClient.valueAt('planet/1/moons').then(function(firebaseMoonIds){
//       start();
//       deepEqual(firebaseMoonIds, [2,3]);
//     });

//   });   
// });


/////////////////////////////////////////////////////////////////////////////
  // hasMany
  /////////////////////////////////////////////////////////////////////////////

test("add link - add to hasMany", function(){
  expect(1);
  stop();

  var moonId = 3;

  firebaseTransformer.transform(op('add', 'planet/1', {name: "Jupiter"}))
  .then(function(){
    return firebaseTransformer.transform(op('add', 'planet/1/__rel/moons/3', true));

  })
  .then(function(){
    firebaseClient.valueAt('planet/1/moons').then(function(moons){
      start();
      ok(moons[3]);
    });

  });
});

test("replace link - set hasMany", function(){
  stop();

  var moonIds = [1,2,3];

  firebaseTransformer.transform(op('add', 'moon/1', {name: "Titan"}))
  .then(function(){
    return firebaseTransformer.transform(op('replace', 'planet/1/__rel/moons', moonIds));

  })
  .then(function(){
    firebaseClient.valueAt('planet/1/moons').then(function(firebaseMoonIds){
      start();
      deepEqual(firebaseMoonIds, moonIds);
    });

  });   
});

test("remove link - remove from a hasMany", function(){
  stop();

  var moonIds = {"abc1": true, "abc2": true, "abc3": true};

  firebaseTransformer.transform(op('add', 'moon/1', {name: "Titan"}))
  .then(function(){
    return firebaseTransformer.transform(op('replace', 'planet/1/__rel/moons', moonIds));

  })
  .then(function(){
    return firebaseTransformer.transform(op('remove', 'planet/1/__rel/moons/abc1'));
  })
  .then(function(){
    firebaseClient.valueAt('planet/1/moons').then(function(firebaseMoons){
      start();
      deepEqual(firebaseMoons, {"abc2": true, "abc3": true});
    });

  });   
});

/////////////////////////////////////////////////////////////////////////////
  // meta
  /////////////////////////////////////////////////////////////////////////////


test("meta is applied directly to the cache", function(){
  expect(1);
  stop();
  cache.transform(op('add', 'moon/1', {}));

  firebaseTransformer.transform(op('add', 'moon/1/__ref', "abc123"))
  .then(function(){
    start();
    equal(cache.retrieve('moon/1/__ref'), 'abc123', "cache has been updated");
  });   
});













