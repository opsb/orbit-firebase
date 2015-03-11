/* global Firebase */
import Orbit from 'orbit/main';
import Operation from 'orbit/operation';
import { uuid } from 'orbit/lib/uuid';
import Schema from 'orbit-common/schema';
import MemorySource from 'orbit-common/memory-source';
import FirebaseSource from 'orbit-firebase/firebase-source';
import TransformConnector from 'orbit/transform-connector';
import { Promise, all, hash, denodeify,resolve, on, defer, map } from 'rsvp';
import { isObject } from 'orbit/lib/objects';
import jQuery from 'jquery';
import { op, nextEventPromise, captureDidTransform, captureDidTransforms } from 'tests/test-helper';
import { fop } from 'orbit-firebase/lib/operation-utils';

var memorySourceA,
    memorySourceB,
    firebaseSource,
    otherFirebaseSource,
    firebaseRef;

module("Integration - Memory / Memory / Firebase", {
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
        contact: {
          attributes: {
            firstName: {type: 'string'},
            lastName: {type: 'string'},
            email: {type: 'string'}
          },
          links: {
            phoneNumbers: {type: 'hasMany', model: 'phoneNumber', inverse: 'contact'}
          }
        },
        phoneNumber: {
          attributes: {
            phoneNumber: {type: 'string'}
          },
          links: {
            contact: {type: 'hasOne', model: 'contact', inverse: 'phoneNumbers'}
          }
        }
      }
    });

    firebaseRef = new Firebase("https://burning-torch-3002.firebaseio.com/test");
    firebaseRef.set(null);

    memorySourceA = new MemorySource(schema);
    memorySourceA.id = 'memorySourceA';

    memorySourceB = new MemorySource(schema);
    memorySourceB.id = 'memorySourceB';    
    
    firebaseSource = new FirebaseSource(schema, {firebaseRef: firebaseRef});
    firebaseSource.id = 'firebase';

    otherFirebaseSource = new FirebaseSource(schema, {firebaseRef: firebaseRef});
    otherFirebaseSource.id = 'otherFirebase';

    var memoryAToMemoryBConnector = new TransformConnector(memorySourceA, memorySourceB);
    var memoryBToFirebaseConnector = new TransformConnector(memorySourceB, firebaseSource);

    schema.emit('modelRegistered', 'planet');
  },

  teardown: function() {
    firebaseSource.disconnect();
    otherFirebaseSource.disconnect();

    firebaseRef = firebaseSource = otherFirebaseSource = memorySourceA = memorySourceB = null;
    stop();

    // allow for firebase events to settle
    setTimeout(function(){
      start();
    }, 100);
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


// Demonstrates issue of each source producing inverse related operations
test("add new contact with phone number", function(){
  stop();

  // listen to operations from firebase
  otherFirebaseSource._firebaseListener.subscribeToType("contact");
  otherFirebaseSource._firebaseListener.subscribeToType("phoneNumber");

  // promise that waits until x number of operations have been received by the otherFirebaseSource
  var receiveOperations = captureDidTransforms(otherFirebaseSource, 4, {logOperations: true});

  // create models
  var contact = memorySourceA.normalize('contact', {});
  var phoneNumber = memorySourceA.normalize('phoneNumber', {});

  // transmit operations
  var addContactOp = op('add', ['contact', contact.id], contact);
  var addPhoneNumberOp = op('add', ['phoneNumber', phoneNumber.id], phoneNumber);
  var linkContactToPhoneNumberOp = op('add', ['contact', contact.id, '__rel', 'phoneNumbers', phoneNumber.id], true);

  var transmittedOperations = [
    addContactOp, 
    addPhoneNumberOp, 
    linkContactToPhoneNumberOp
  ];

  transmittedOperations.forEach(function(operation){
    memorySourceA.transform(operation);
  });

  // wait for operations to be received by otherFirebaseSource
  receiveOperations.then(function(receivedOperations){
    start();

    var relatedInverseOp = op('replace', ['phoneNumber', phoneNumber.id, '__rel', 'contact'], contact.id);

    var expectedOperations = [
      addContactOp,
      addPhoneNumberOp,
      linkContactToPhoneNumberOp,
      relatedInverseOp
    ];

    operationsShouldMatch(receivedOperations, expectedOperations);
  });   
});















