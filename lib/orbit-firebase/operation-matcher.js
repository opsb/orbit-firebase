import { Class } from 'orbit/lib/objects';
import { assert } from 'orbit/lib/assert';

export default Class.extend({
	init: function(operation, schema){
		assert('OperationMatcher requires the operation', operation);
		assert('OperationMatcher requires the schema', schema && schema.models);

		this.valueType = this._determineValueType(operation.path, schema);
		this.op = operation.op;
		this.schema = schema;
	},

	matches: function(op, valueType){
		return this.op === op && this.valueType === valueType;
	},

	_determineValueType: function(path, schema){
		if(path.length === 1) return 'type';
		if(path.length === 2) return 'record';
		if(path.length === 5) return 'link';
		if(path.length === 4 && path[2] === "__rel") return 'link';
		if(path[2].match(/^__/)) return "meta";

		var model = schema.models[path[0]];
		var key = path[2];
		if(model.attributes[key]) return 'attribute';
		if(model.keys[key]) return 'key';
		throw "Unable to determine value type at: " + path.join("/");
	},	
});
