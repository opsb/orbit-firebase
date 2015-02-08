import Orbit from 'orbit/main';
import Operation from 'orbit/operation';
import { uuid } from 'orbit/lib/uuid';
import Schema from 'orbit-common/schema';
import Source from 'orbit-common/source';
import Cache from 'orbit-common/cache';
import OperationDecomposer from 'orbit-firebase/operation-decomposer';
import FirebaseSource from 'orbit-firebase/firebase-source';
import { Promise, all, hash, denodeify,resolve, on, defer } from 'rsvp';
import { isArray, isObject } from 'orbit/lib/objects';

on('error', function(reason){
  console.log(reason);
  console.error(reason.message, reason.stack);
});

var schema,
    cache,
    operationDecomposer,
    saturn,
    earth,
    titan,
    europa,
    jupiter,
    human,
    martian;

///////////////////////////////////////////////////////////////////////////////

function buildPlanet(properties){
  properties.__rel = {
    moons: {},
    races: {},
    next: null,
    previous: null
  }
  return properties;
}

function buildMoon(properties){
  properties.__rel = {
    planet: null
  }
  return properties;
}

function buildRace(properties){
  properties.__rel = {
    planets: {}
  }
  return properties;
}

module('OC - Firebase - Operation decomposer', {
  setup: function() {
    Orbit.Promise = Promise;

    schema = new Schema({
      modelDefaults: {
        keys: {
          '__id': {primaryKey: true, defaultValue: uuid}
        }
      },
      models: {
        planet: {
          attributes: {
            name: {type: 'string'},
            classification: {type: 'string'}
          },
          links: {
            moons: {type: 'hasMany', model: 'moon', inverse: 'planet', actsAsSet: true},
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
    });

    cache = new Cache(schema, {});
    operationDecomposer = new OperationDecomposer(schema, cache);

    saturn = buildPlanet({id: '10', name: 'Saturn'});
    jupiter = buildPlanet({id: '11', name: 'Jupiter'});
    earth = buildPlanet({id: '12', name: 'Earth'});

    titan = buildMoon({id: '20', name: 'Titan'});
    europa = buildMoon({id: '21', name: 'Europa'});

    human = buildRace({id: '30', name: 'Human'});
    martian = buildRace({id: '31', name: 'Martian'});
    
    console.log('finished setup');
  },

  teardown: function() {
    cache = operationDecomposer = null;
  }
});

function stringifyOperations(operations){
  return operations.map(function(operation){
    var value = isObject(operation.value) ? JSON.stringify(operation.value) : operation.value;
    var segments = [operation.op, operation.path.join("/")];
    if(value) segments.push(value);
    return "[" + segments.join(", ") + "]";
  });
}

function operationsShouldMatch(actualOperations, expectedOperations){
  console.log(JSON.stringify({
    actual: stringifyOperations(actualOperations), 
    expected: stringifyOperations(expectedOperations)
  }, null, 2));

  equal(actualOperations.length, expectedOperations.length, 'Same number of operations');
  
  for(var i = 0; i < actualOperations.length; i++){
    var actual = actualOperations[i];
    var expected = expectedOperations[i];
    deepEqual(actual.serialize(), expected.serialize(), "Operation " + i + " matches");
  }
}

function transformCache(){
  [].slice.call(arguments).forEach(function(operation){
    cache.transform(operation);
  });
}

function asHash(k,v){
  var hash = {};
  hash[k] = v;
  return hash;
}

function op(op, path, value){
  var operation = new Operation({op: op, path: path});
  if(value) operation.value = value;
  return operation;
}

function associateMoonWithPlanet(moon, planet){
  try {
    cache.transform( op('add', ['planet', planet.id, "__rel", "moons", moon.id], true) );
    cache.transform( op('add', ['moon', moon.id, "__rel", 'planet'], planet.id) );
  } 
  catch(error){
    debugger
  }
}

test('add to hasOne => hasMany', function(){
  transformCache(
    op('add', ['planet', saturn.id], saturn),
    op('add', ['moon', titan.id], titan),
    op('add', ['planet', jupiter.id], jupiter),
    op('add', ['moon', europa.id], europa)
  );

  associateMoonWithPlanet(titan, saturn);
  associateMoonWithPlanet(europa, jupiter);

  operationsShouldMatch(
    operationDecomposer.decompose(
      op('add', ['moon', europa.id, '__rel', 'planet'], saturn.id)
    ),
    [
      op('add', ['moon', europa.id, '__rel', 'planet'], saturn.id),
      op('remove', ['planet', jupiter.id, '__rel', 'moons', europa.id]),
      op('add', ['planet', saturn.id, '__rel', 'moons', europa.id], true)
    ]
  );  
});

test('replace hasOne => hasMany', function(){
  transformCache(
    op('add', ['planet', saturn.id], saturn),
    op('add', ['moon', titan.id], titan),
    op('add', ['planet', jupiter.id], jupiter),
    op('add', ['moon', europa.id], europa)
  );

  associateMoonWithPlanet(titan, saturn);
  associateMoonWithPlanet(europa, jupiter);

  operationsShouldMatch(
    operationDecomposer.decompose(
      op('replace', ['moon', europa.id, '__rel', 'planet'], saturn.id)
    ),
    [
      op('replace', ['moon', europa.id, '__rel', 'planet'], saturn.id),
      op('remove', ['planet', jupiter.id, '__rel', 'moons', europa.id]),
      op('add', ['planet', saturn.id, '__rel', 'moons', europa.id], true)
    ]
  );  
});

test('replace hasMany => hasOne with empty array', function(){
  cache.transform(op('add', ['planet', saturn.id], saturn));
  cache.transform(op('add', ['moon', titan.id], titan));  

  associateMoonWithPlanet(titan, saturn);

  operationsShouldMatch(
    operationDecomposer.decompose(
      op('replace', ['planet', saturn.id, '__rel', 'moons'], {})
    ),
    [
      op('replace', ['planet', saturn.id, '__rel', 'moons'], {}),
      op('remove', ['moon', titan.id, '__rel', 'planet'])
    ]
  );  
});

test('replace hasMany => hasOne with populated array', function(){
  cache.transform(op('add', ['planet', saturn.id], saturn));
  cache.transform(op('add', ['moon', titan.id], titan));  
  cache.transform(op('add', ['planet', jupiter.id], jupiter));

  associateMoonWithPlanet(titan, saturn);

  operationsShouldMatch(
    operationDecomposer.decompose(
      op('replace', ['planet', jupiter.id, '__rel', 'moons'], asHash(titan.id, true))
    ),
    [
      op('replace', ['planet', jupiter.id, '__rel', 'moons'], asHash(titan.id, true)),
      op('add', ['moon', titan.id, '__rel', 'planet'], jupiter.id),
      op('remove', ['planet', saturn.id, '__rel', 'moons', titan.id])
    ]
  );
});

test('replace hasMany => hasMany', function(){
  transformCache(
    op('add', ['race', human.id], human),
    op('add', ['planet', earth.id], earth),
    op('add', ['race', human.id, '__rel', 'planets', earth.id], true),
    op('add', ['planet', earth.id, '__rel', 'races', human.id], true)
  );

  operationsShouldMatch(
    operationDecomposer.decompose(
      op('replace', ['planet', earth.id, '__rel', 'races'], {})
    ),
    [
      op('replace', ['planet', earth.id, '__rel', 'races'], {})
    ]
  );  
});

test('remove hasOne => hasMany', function(){
  cache.transform(op('add', 'planet/10', saturn));
  cache.transform(op('add', 'moon/20', titan));  
  cache.transform(op('add', 'planet/11', jupiter));
  cache.transform(op('add', 'moon/21', europa));

  associateMoonWithPlanet(titan, saturn);
  associateMoonWithPlanet(europa, jupiter);

  operationsShouldMatch(
    operationDecomposer.decompose(
      op('remove', ['moon', europa.id, '__rel', 'planet'])
    ),
    [
      op('remove', ['moon', europa.id, '__rel', 'planet']),
      op('remove', ['planet', jupiter.id, '__rel', 'moons', europa.id])
    ]
  );  
});

test('remove hasMany => hasOne', function(){
  cache.transform(op('add', 'planet/10', saturn));
  cache.transform(op('add', 'moon/20', titan));  
  cache.transform(op('add', 'planet/11', jupiter));
  cache.transform(op('add', 'moon/21', europa));

  associateMoonWithPlanet(titan, saturn);
  associateMoonWithPlanet(europa, jupiter);

  operationsShouldMatch(
    operationDecomposer.decompose(
      op('remove', ['planet', jupiter.id, '__rel', 'moons', europa.id])
    ),
    [
      op('remove', ['planet', jupiter.id, '__rel', 'moons', europa.id]),
      op('remove', ['moon', europa.id, '__rel', 'planet'])
    ]
  );  
});

test('add to hasOne => hasOne', function(){
  cache.transform(op('add', ['planet', jupiter.id], jupiter));
  cache.transform(op('add', ['planet', saturn.id], saturn));
  cache.transform(op('add', ['planet', earth.id], earth));

  cache.transform(op('add', ['planet', saturn.id, '__rel', 'next'], jupiter.id));
  cache.transform(op('add', ['planet', jupiter.id, '__rel', 'previous'], saturn.id));

  operationsShouldMatch(
    operationDecomposer.decompose(
      op('add', ['planet', earth.id, '__rel', 'next'], saturn.id)
    ),
    [
      op('add', ['planet', earth.id, '__rel', 'next'], saturn.id),
      op('add', ['planet', saturn.id, '__rel', 'previous'], earth.id)
    ]
  );  
});

test('add to hasOne => hasOne with existing value', function(){
  cache.transform(op('add', ['planet', jupiter.id], jupiter));
  cache.transform(op('add', ['planet', saturn.id], saturn));
  cache.transform(op('add', ['planet', earth.id], earth));

  cache.transform(op('add', ['planet', saturn.id, '__rel', 'next'], jupiter.id));
  cache.transform(op('add', ['planet', jupiter.id, '__rel', 'previous'], saturn.id));

  operationsShouldMatch(
    operationDecomposer.decompose(
      op('add', ['planet', earth.id, '__rel', 'next'], jupiter.id)
    ),
    [
      op('add', ['planet', earth.id, '__rel', 'next'], jupiter.id),
      op('add', ['planet', jupiter.id, '__rel', 'previous'], earth.id),
      op('remove', ['planet', saturn.id, '__rel', 'next'])
    ]
  );  
});

test('replace hasOne => hasOne with existing value', function(){
  cache.transform(op('add', ['planet', jupiter.id], jupiter));
  cache.transform(op('add', ['planet', saturn.id], saturn));
  cache.transform(op('add', ['planet', earth.id], earth));

  cache.transform(op('add', ['planet', saturn.id, '__rel', 'next'], jupiter.id));
  cache.transform(op('add', ['planet', jupiter.id, '__rel', 'previous'], saturn.id));

  operationsShouldMatch(
    operationDecomposer.decompose(
      op('replace', ['planet', earth.id, '__rel', 'next'], jupiter.id)
    ),
    [
      op('replace', ['planet', earth.id, '__rel', 'next'], jupiter.id),
      op('add', ['planet', jupiter.id, '__rel', 'previous'], earth.id),
      op('remove', ['planet', saturn.id, '__rel', 'next'])
    ]
  );  
});

test('replace hasOne => hasOne with existing value', function(){
  cache.transform(op('add', ['planet', jupiter.id], jupiter));
  cache.transform(op('add', ['planet', saturn.id], saturn));
  cache.transform(op('add', ['planet', earth.id], earth));

  cache.transform(op('add', ['planet', saturn.id, '__rel', 'next'], jupiter.id));
  cache.transform(op('add', ['planet', jupiter.id, '__rel', 'previous'], saturn.id));

  operationsShouldMatch(
    operationDecomposer.decompose(
      op('replace', ['planet', earth.id, '__rel', 'next'], jupiter.id)
    ),
    [
      op('replace', ['planet', earth.id, '__rel', 'next'], jupiter.id),
      op('add', ['planet', jupiter.id, '__rel', 'previous'], earth.id),
      op('remove', ['planet', saturn.id, '__rel', 'next'])
    ]
  );  
});

test('add to hasMany => hasMany', function(){
  cache.transform( op('add', 'planet/12', earth) );
  cache.transform( op('add', 'race/10', human) );

  operationsShouldMatch(
    operationDecomposer.decompose(
      op('add', ['race', human.id, '__rel', 'planets', earth.id], true)
    ),
    [
      op('add', ['race', human.id, '__rel', 'planets', earth.id], true),
      op('add', ['planet', earth.id, '__rel','races', human.id], true)
    ]
  );  
});

test('remove from hasMany => hasMany', function(){
  cache.transform( op('add', ['planet', earth.id], earth) );
  cache.transform( op('add', ['race', human.id], human) );
  cache.transform( op('add', ['planet', earth.id, '__rel', 'races', human.id]) );
  cache.transform( op('add', ['race', human.id, '__rel', 'planets', earth.id]) );

  operationsShouldMatch(
    operationDecomposer.decompose(
      op('remove', ['race', human.id, '__rel', 'planets', earth.id])
    ),
    [
      op('remove', ['race', human.id, '__rel', 'planets', earth.id]),
      op('remove', ['planet', earth.id, '__rel','races', human.id])
    ]
  );  
});
