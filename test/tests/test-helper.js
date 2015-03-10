/* global clearTimeout */
import Operation from 'orbit/operation';

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

function captureDidTransform(source, count, logOperations){
  return new Promise(function(resolve, reject){
    var operations = [];

    var timeout = setTimeout(function(){
      reject("Failed to receive " + count + " operations");
    }, 1500);

    source.on("didTransform", function(operation){
      operations.push(operation);

      if(logOperations){
        console.log("operation " + operations.length + ": ", operation);
      }
      
      if(operations.length === count){
        clearTimeout(timeout);
        resolve(operation);
      }
    });
  });
}

export { nextEventPromise, op, captureDidTransform };
