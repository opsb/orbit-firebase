/* global Firebase */
import FirebaseClient from 'orbit-firebase/firebase-client';
import Orbit from 'orbit/main';

var firebaseRef,
    firebaseClient;

module("OF - FirebaseClient", {
  setup: function() {
    Orbit.Promise = Promise;

    firebaseRef = new Firebase("https://orbit-firebase.firebaseio.com/test");
    firebaseRef.set(null);
    firebaseClient = new FirebaseClient(firebaseRef);
  },

  teardown: function() {
    firebaseRef = firebaseClient = null;
  }
});

test("#set", function(){
	stop();

	firebaseClient.set("/", "abc").then(function(){
    firebaseRef.once('value', function(snapshot){
      start();
      equal(snapshot.val(), "abc", "set value in firebase");
    });
  });
});

test("#push", function(){
  stop();

  firebaseClient.push("/", "abc").then(function(){
    firebaseRef.once("value", function(snapshot){
      start();
      var key = Object.keys(snapshot.val())[0];
      equal(snapshot.val()[key], "abc", "value was added to array");
    });
  });
});

test("#remove", function(){
  stop();

  firebaseRef.set("abc", function(){
    firebaseClient.remove("/").then(function(){
      firebaseRef.once("value", function(snapshot){
        start();
        equal(snapshot.val(), null, "value was removed");
      });
    });
  });
});

test("#valueAt", function(){
  stop();

  firebaseRef.set("abc", function(){
    firebaseClient.valueAt("/").then(function(value){
      start();
      equal(value, "abc", "value was retrieved");
    });
  });  
});

test("#appendToArray - empty array", function(){
  stop();

  firebaseClient.appendToArray("/", "abc").then(function(){
    firebaseRef.once("value", function(snapshot){
      start();
      deepEqual(snapshot.val(), ["abc"]);
    });
  });
});

test("#appendToArray - existing array", function(){
  stop();

  firebaseRef.set(["abc"], function(){
    firebaseClient.appendToArray("/", "def").then(function(){
      firebaseRef.once("value", function(snapshot){
        start();
        deepEqual(snapshot.val(), ["abc", "def"]);
      });
    });
  });
});

test("#removeFromArray", function(){
  stop();

  firebaseRef.set(["abc"], function(){
    firebaseClient.removeFromArray("/", "abc").then(function(){
      firebaseRef.once("value", function(snapshot){
        start();
        deepEqual(snapshot.val(), null);
      });
    });
  });
});

test("#removeFromArrayAt", function(){
  stop();

  firebaseRef.set(["abc", "def", "ghi"], function(){
    firebaseClient.removeFromArrayAt("/", 1).then(function(){
      firebaseRef.once("value", function(snapshot){
        start();
        deepEqual(snapshot.val(), ["abc", "ghi"]);
      });
    });
  });
});