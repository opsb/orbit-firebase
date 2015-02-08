import { Class } from 'orbit/lib/objects';

export default Class.extend({
	init: function(firebaseClient, schema, serializer){
		this._firebaseClient = firebaseClient;
		this._schema = schema;
		this._serializer = serializer;
	},

	handles: function(operation){
		return operation.op === "add" && operation.path.length === 2;
	},

	transform: function(operation){
		var model = operation.path[0];
		var record = this._schema.normalize(model, operation.value);
		var serializedRecord = this._serializer.serializeRecord(model, record);

		return this._firebaseClient.set(operation.path, serializedRecord);
	}
});
