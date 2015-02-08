import { Class } from 'orbit/lib/objects';

export default Class.extend({
	init: function(firebaseClient){
		this._firebaseClient = firebaseClient;
	},

	handles: function(operation){
		return ["replace", "add"].indexOf(operation.op) !== -1 && operation.path.length === 3 && !operation.path[2].match(/^__/);
	},

	transform: function(operation){
		return this._firebaseClient.set(operation.path, operation.value);
	}
});
