/* global clearTimeout */
import Operation from 'orbit/operation';
import { fop } from 'orbit-firebase/lib/operation-utils';
import { on } from 'rsvp';

on('error', function(reason){
  console.log(reason);
  console.error(reason.message, reason.stack);
});

function op(opType, path, value){
  var operation = new Operation({op: opType, path: path});
  if(value) operation.value = value;
  return operation;
}

function nextEventPromise(emitter, event){
  return new Promise(function(resolve, fail){
    emitter.one(event, 
      function(operation){ resolve(operation); },
      function(error){ fail(error); }
    );
  });
}

function captureDidTransform(source, count, options){
  return captureDidTransforms(source, count, options).then(function(operations){
    return operations[operations.length-1];
  });
}

function captureDidTransforms(source, count, options){
  options = options || {};
  return new Promise(function(resolve, reject){
    var operations = [];

    var timeout = setTimeout(function(){
      reject("Failed to receive " + count + " operations", operations.length);
    }, 1500);

    function callback(operation){
      operations.push(operation);

      if(options.logOperations){
        console.log("operation " + operations.length + ": ", fop(operation));
      }
      
      if(operations.length === count){
        source.off("didTransform", callback);
        clearTimeout(timeout);
        resolve(operations);
      }
    }

    source.on("didTransform", callback, this);
  });
}


export { nextEventPromise, op, captureDidTransform, captureDidTransforms };
