/* global Firebase */

import { Class } from 'orbit/lib/objects';
import Evented from 'orbit/evented';
import Operation from 'orbit/operation';

export default Class.extend({
	init: function(firebaseRef, schema){
		Evented.extend(this);
		this._firebaseRef = firebaseRef;
		this._subscriptions = {};
		this._receivedOperations = {};
		this._schema = schema;
	},

	subscribeToType: function(type){
		this._subscribeTo([type]);
	},

	subscribeToRecords: function(type, ids){
		var _this = this;
		ids.forEach(function(id){
			_this.subscribeToRecord(type, id);
		});
	},

	subscribeToRecord: function(type, id){
		this._subscribeTo([type, id]);
	},

	enqueue: function(operation){
		if(!operation.id) throw new Error("operation must have an id");

		var _this = this;
		var queues = this._queuesForOperation(operation);
		var serializedOperation = this._serializeOperation(operation);

		queues.forEach(function(queue){
			var queuePath = _this._queuePathFor(queue);
			_this._firebaseRef.child(queuePath).push(serializedOperation);
		});
	},

	unsubscribeAll: function(){
		var _this = this;
		Object.keys(this._subscriptions).forEach(function(queuePath){
			var callback = _this._subscriptions[queuePath];
			_this._firebaseRef.child(queuePath).orderByChild('date').limitToLast(1).off("child_added", callback);
		});
	},

	_queuesForOperation: function(operation){
		var path = (typeof operation.path === 'string') ? operation.path.split("/") : operation.path;
		return [
			[path[0]],
			[path[0], path[1]]
		];
	},

	_subscribeTo: function(path){
		var _this = this;
		var queuePath = this._queuePathFor(path);

		if(this._subscriptions[queuePath]) return;

		var callbackReady = false;
		var callback = function(snapshot){
			var operation = _this._deserializeOperation(snapshot.val());
			// if(callbackReady){
				_this._emitDidTransform(operation);
			// }
			// else {
			// 	callbackReady = true; // discards first operation as we only want new children (by default firebase sends the last existing operation when the child_added listener is attached)
			// }
		};

		this._subscriptions[queuePath] = callback;

		this._firebaseRef.child(queuePath).orderByChild('date').limitToLast(1).on('child_added', callback);
	},

	_queuePathFor: function(path){
		var joinedPath = (typeof path === 'string') ? path : path.join("/");
		return "operation-queues/" + joinedPath + "/operations";
	},

	_serializeOperation: function(operation){		
		var serialized = {
			date: Firebase.ServerValue.TIMESTAMP,
			operation: JSON.stringify({ // firebase removes keys with null values, by stringifying the operation the keys are retained
				id: operation.id,
				op: operation.op,
				path: operation.path,
				value: operation.value||null,
				log: operation.log||null
			})
		};

		return serialized;
	},

	_deserializeOperation: function(serialized){
		return new Operation(JSON.parse(serialized.operation));
	},

	_emitDidTransform: function(operation){
		if(!this._receivedOperations[operation.id]){
			this._receivedOperations[operation.id] = true;
			this.emit("didTransform", operation);
		}
	}
});
