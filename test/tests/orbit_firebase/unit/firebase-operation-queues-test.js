import FirebaseOperationQueues from 'orbit-firebase/firebase-operation-queues';
import Orbit from 'orbit/main';
import Operation from 'orbit/operation';
import { all, Promise, resolve } from 'rsvp';
import FirebaseClient from 'orbit-firebase/firebase-client';

var firebaseOperationQueues;

function nextEventPromise(emitter, event){
  return new Promise(function(resolve, fail){
    emitter.one(event, 
      function(operation){ resolve(operation); },
      function(error){ fail(error); }
    )
  });
}

module("OC - FirebaseOperationQueues", {
  setup: function() {
    Orbit.Promise = Promise;
    Orbit.all = all;
    Orbit.resolve = resolve;

    var firebaseRef = new Firebase("https://orbit-firebase.firebaseio.com/test");
    firebaseRef.set(null);
    var firebaseClient = new FirebaseClient(firebaseRef);
    firebaseOperationQueues = new FirebaseOperationQueues(firebaseRef);
  },

  teardown: function() {
    console.log("tardown");
    firebaseOperationQueues.unsubscribeAll();
    firebaseOperationQueues = null;
  }
});

test("add record operation is added to record's queue", function(){
	stop();
	var operation = new Operation({ op: 'add', path: 'planet/abc1/__rel/moons/abc2', value: true, id: 'xyz123' });

	firebaseOperationQueues.subscribeToRecord('planet', 'abc1');

	var didTransform = nextEventPromise(firebaseOperationQueues, "didTransform");
	firebaseOperationQueues.enqueue(operation);

	didTransform.then(function(broadcastedOperation){
		start();
		equal(broadcastedOperation.id, operation.id);
	});
});

test("add record operation is added to type's queue", function(){
  expect(1);
  stop();
  var operation = new Operation({ op: 'add', path: 'planet/abc1/__rel/moons/abc2', value: true, id: 'xyz123' });

  firebaseOperationQueues.subscribeToType('planet');

  var didTransform = nextEventPromise(firebaseOperationQueues, "didTransform");
  firebaseOperationQueues.enqueue(operation);

  didTransform.then(function(broadcastedOperation){
    console.log("got callback");
    start();
    equal(broadcastedOperation.id, operation.id);
  });
});
