import { Class } from 'orbit/lib/objects';

export default Class.extend({
	init: function(firebaseClient){
		this._firebaseClient = firebaseClient;
	},

	handles: function(operation){
		return operation.op === "remove" && operation.path.length === 2;
	},

	transform: function(operation){
		return this._firebaseClient.set(operation.path, null);
	}
});
