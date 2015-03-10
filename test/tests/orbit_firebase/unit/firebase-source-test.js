/* global Firebase */
import Orbit from 'orbit/main';
import { uuid } from 'orbit/lib/uuid';
import Schema from 'orbit-common/schema';
import Source from 'orbit-common/source';
import FirebaseSource from 'orbit-firebase/firebase-source';
import FirebaseClient from 'orbit-firebase/firebase-client';
import { Promise, all, hash, denodeify,resolve, on, defer, map } from 'rsvp';
import { isArray } from 'orbit/lib/objects';
import { nextEventPromise, captureOperations } from 'tests/test-helper';

on('error', function(reason){
  console.log(reason);
  console.error(reason.message, reason.stack);
});

var schema,
    source,
    firebaseRef,
    firebaseClient;

///////////////////////////////////////////////////////////////////////////////

module("OC - FirebaseSource", {
  setup: function() {
    Orbit.Promise = Promise;
    Orbit.all = all;
    Orbit.resolve = resolve;
    Orbit.map = map;

    schema = new Schema({
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

    firebaseRef = new Firebase("https://burning-torch-3002.firebaseio.com/test");
    firebaseRef.set(null);

    source = new FirebaseSource(schema, {firebaseRef: firebaseRef});
    firebaseClient = new FirebaseClient(firebaseRef);
  },

  teardown: function() {
    schema = null;
    source = null;

  }
});

test("#add - can add record", function(){
  expect(7);
  var planetDetails = {name: 'Jupiter', classification: 'gas giant'};

  stop();

  source.add('planet', planetDetails).then(function(cachedPlanet){
    start();
    ok(cachedPlanet.id, "orbit id should be defined");
    equal(planetDetails.name, cachedPlanet.name, "cache planet name");
    equal(planetDetails.classification, cachedPlanet.classification, "cache planet classification");
    stop();
    var path = ['planet', cachedPlanet.id].join("/");
    firebaseRef.child(path).once('value', function(snapshot){
      start();
      var stored = snapshot.val();
      ok(planetDetails.id, 'add planet id');
      equal(planetDetails.id, stored.id, "store planet id");
      equal(planetDetails.name, stored.name, "store planet name");
      equal(planetDetails.classification, stored.classification, "store planet classification");
    });
  });
});

test("#patch - can patch records", function() {
  stop();
  var _this = this;

  var planet;
  var planetDetails = {name: 'Jupiter', classification: 'gas giant'};
  source.add('planet', planetDetails)
  .then(function(addedPlanet){
    planet = addedPlanet;
    return source.patch('planet', {id: addedPlanet.id}, 'classification', 'iceball');
  })  
  .then(function(){
      firebaseRef.child('planet/' + planet.id + '/classification').once('value', function(snapshot){
      start();
      equal(snapshot.val(), 'iceball');
      equal(source.retrieve(["planet", planet.id]).classification, 'iceball');
    });
  });
});

test("#remove - can delete records", function() {
  expect(2);
  stop();
  var planetDetails = {name: 'Jupiter', classification: 'gas giant'};

  source.add('planet', planetDetails).then(function(planet){
    source.remove('planet', planet.id).then(function(){
      var path = ['planet', planet.id].join("/");

      firebaseRef.child(path).once('value', function(snapshot){
        start();
        ok(!snapshot.val(), "remove record from firebase");
        ok(!source.retrieve(["planet", planet.id]), "remove record from cache");
      });
    });
  });
});


test("#find - can find individual records by passing in a single id", function() {
  expect(4);
  stop();
  var planetDetails = {name: 'Jupiter', classification: 'gas giant'};
  source.add('planet', planetDetails).then(function(originalPlanet){
    source.find('planet', planetDetails.id).then(function(foundPlanet){
      start();
      equal(foundPlanet.id, originalPlanet.id, "assign id");
      equal(foundPlanet.name, originalPlanet.name, "assign name");
      equal(foundPlanet.classification, originalPlanet.classification, "assign classification");

      equal(source.retrieve(['planet', originalPlanet.id]).id, originalPlanet.id);
    });
  });
});

test("#find - can find all records", function() {
  expect(1);
  stop();

  var planetsPromise = all([
    source.add('planet', {name: 'Jupiter', classification: 'gas giant'}),
    source.add('planet', {name: 'Earth', classification: 'terrestrial'}),
    source.add('planet', {name: 'Saturn', classification: 'gas giant'})
  ]);

  planetsPromise.then(function(){
    source.find('planet').then(function(planets){
      start();
      equal(planets.length, 3, "loaded 3 planets");
    });
  });
});

test("#find - returns empty when no results for find all", function() {
  expect(2);
  stop();

  source.find('planet').then(function(planets){
    start();
    ok(isArray(planets), "returned planets as array");
    equal(planets.length, 0, "no results");
  });
});


test("#addLink - can add to hasMany", function() {
  expect(2);
  stop();

  var titan, saturn, fbTitan, fbSaturn;
  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('planet', saturn.id, 'moons', titan.id);
  })
  .then(function(){
    return all([
      firebaseClient.valueAt('moon/' + titan.id).then(function(titan){ fbTitan = titan; }),
      firebaseClient.valueAt('planet/' + saturn.id).then(function(saturn){ fbSaturn = saturn; }),
    ]);
  })
  .then(function(){
    start();
    ok(fbSaturn.moons[titan.id], "firebase should have added  titan to saturn");
    equal(source.retrieveLink('planet', saturn.id, 'moons'), titan.id, "cache should have added titan to saturn");
  });
});

test('#addLink - can set hasOne link', function(){
  expect(2);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('moon', titan.id, 'planet', saturn.id);
  })
  .then(function(){
    return firebaseClient.valueAt('moon/' + titan.id);
  })
  .then(function(fbTitan){
    start();
    equal(fbTitan.planet, saturn.id, "titan is in orbit around saturn");
    equal(source.retrieveLink('moon', titan.id, "planet"), saturn.id, "cache should have added saturn to titan");
  });  
});

test("#removeLink - can remove from a hasMany relationship", function() {
  expect(2);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('planet', saturn.id, 'moons', titan.id);
  })
  .then(function(){
    return source.removeLink('planet', saturn.id, 'moons', titan.id);
  })
  .then(function(){
    return all([
      firebaseClient.valueAt('moon/' + titan.id).then(function(titan){ fbTitan = titan; }),
      firebaseClient.valueAt('planet/' + saturn.id).then(function(saturn){ fbSaturn = saturn; }),
    ]);
  })
  .then(function(){
    start();
    ok(!fbSaturn.moons, "saturn is no longer orbitted by titan");
    equal(source.retrieveLink('planet', saturn.id, 'moons').length, 0, "cache should have removed titan from saturn");
  });
});

// test("#replaceLink - can update a hasMany relationship with hasOne inverse", function() {
//   expect(4);
//   stop();

//   var titan, saturn, fbTitan, fbSaturn;

//   all([
//     source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn}),
//     source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan}),
//   ])
//   .then(function(){
//     return source.addLink('moon', titan.id, 'planet', saturn.id);
//   })
//   .then(function(){
//     return source.updateLink('planet', saturn.id, 'moons', []);
//   })
//   .then(function(){
//     return all([
//       loadFirebaseValue('moon/' + titan.id).then(function(titan){ fbTitan = titan; }),
//       loadFirebaseValue('planet/' + saturn.id).then(function(saturn){ fbSaturn = saturn; }),
//     ])
//   })
//   .then(function(){
//     start();
//     ok(!fbTitan.planet, "titan has left saturn's orbit");
//     ok(!fbSaturn.moons, "no moons orbiting saturn");

//     equal(source.retrieveLink('planet', saturn.id, 'moons').length, 0, "cache has removed titan from saturn");
//     ok(!source.retrieveLink('moon', titan.id, "planet"), "cache has removed saturn from titan");
//   });
// });

test("#removeLink - can remove a hasOne relationship", function() {
  expect(4);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('moon', titan.id, 'planet', saturn.id);
  })
  .then(function(){
    return source.removeLink('moon', titan.id, 'planet');
  })
  .then(function(){
    return all([
      firebaseClient.valueAt('moon/' + titan.id).then(function(titan){ fbTitan = titan; }),
      firebaseClient.valueAt('planet/' + saturn.id).then(function(saturn){ fbSaturn = saturn; }),
    ]);
  })
  .then(function(){
    start();
    ok(!fbTitan.planetId, "titan has left saturn's orbit");
    ok(!fbSaturn.moonIds, "saturn is no longer orbitted by titan");

    equal(source.retrieveLink('planet', saturn.id, 'moons').length, 0, "cache should have removed titan from saturn");
    ok(!source.retrieveLink('moon', titan.id, "planet"), "cache should have removed saturn from titan");
  });
});

test("#findLink - can find has-many linked ids", function() {
  expect(1);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('planet', saturn.id, 'moons', titan.id);
  }) 
  .then(function(){
    source.findLink('planet', saturn.id, 'moons').then(function(moonIds){
      start();
      equal(moonIds.length, 1);
    });
  });
});

test("#findLinked - can find has-many linked records", function() {
  expect(1);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('planet', saturn.id, 'moons', titan.id);
  }) 
  .then(function(){
    source.findLinked('planet', saturn.id, 'moons').then(function(moons){
      start();
      equal(moons.length, 1);
    });
  });
});

test("#findLink - can find has-one linked id", function() {
  expect(1);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('moon', titan.id, 'planet', saturn.id);
  }) 
  .then(function(){
    source.findLink('moon', titan.id, 'planet').then(function(planetId){
      start();
      equal(planetId, saturn.id);
    });
  });
});

test("#findLinked - can find has-one linked record", function() {
  expect(1);
  stop();

  var titan, saturn, fbTitan, fbSaturn;

  all([
    source.add('planet', {name: "Saturn"}).then(function(sourceSaturn){saturn = sourceSaturn;}),
    source.add('moon', {name: "Titan"}).then(function(sourceTitan){titan = sourceTitan;}),
  ])
  .then(function(){
    return source.addLink('moon', titan.id, 'planet', saturn.id);
  }) 
  .then(function(){
    source.findLinked('moon', titan.id, 'planet').then(function(planet){
      start();
      equal(planet.id, saturn.id);
    });
  });
});
