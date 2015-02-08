import { Class } from 'orbit/lib/objects';
import SchemaUtils from 'orbit-firebase/schema-utils';
import { removeItem } from 'orbit-firebase/array-utils';

export default Class.extend({
	init: function(firebaseClient, schema){
		this._firebaseClient = firebaseClient;
		this._schemaUtils = new SchemaUtils(schema);
	},

	handles: function(operation){
		var path = operation.path;
		if(path[2] !== '__rel') return;
		var linkType = this._schemaUtils.lookupLinkDef(path[0], path[3]).type;
		return operation.op === "remove" && path[2] === '__rel' && linkType === 'hasOne';
	},

	transform: function(operation){
		var path = removeItem(operation.path, '__rel');
		return this._firebaseClient.remove(path);
	}
});
