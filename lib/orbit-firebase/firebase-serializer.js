import Serializer from 'orbit-common/serializer';
import { isArray } from 'orbit/lib/objects';
import { assert } from 'orbit/lib/assert';

export default Serializer.extend({
	serialize: function(type, records){
		return this.serializeRecord(type, records);
	},

	serializeRecord: function(type, record) {
		assert(record, "Must provide a record");

		var json = {};

		this.serializeKeys(type, record, json);
		this.serializeAttributes(type, record, json);
		this.serializeLinks(type, record, json);

		return json;
	},

	serializeKeys: function(type, record, json) {
		var modelSchema = this.schema.models[type];
		var resourceKey = this.resourceKey(type);
		var value = record[resourceKey];

		if (value) {
			json[resourceKey] = value;
		}
	},

	serializeAttributes: function(type, record, json) {
		var modelSchema = this.schema.models[type];

		Object.keys(modelSchema.attributes).forEach(function(attr) {
			this.serializeAttribute(type, record, attr, json);
		}, this);
	},

	serializeAttribute: function(type, record, attr, json) {
		json[this.resourceAttr(type, attr)] = record[attr];
	},

	serializeLinks: function(type, record, json) {
		var modelSchema = this.schema.models[type];
		var linkNames = Object.keys(modelSchema.links);

		linkNames.forEach(function(link){
			var linkDef = modelSchema.links[link];
			var value = record.__rel[link];

			if(linkDef.type === 'hasMany'){
				json[link] = Object.keys(value||{});
			}
			else {
				json[link] = value;
			}
		});
	},

	deserializeRecords: function(type, records){
		var _this = this;
		return records.map(function(record){
			return _this.deserialize(type, record.id, record);
		});
	},

	deserialize: function(type, id, record){
		record = record || {};
		var data = {};

		this.deserializeKeys(type, id, record, data);
		this.deserializeAttributes(type, record, data);
		this.deserializeLinks(type, record, data);

		return data;
	},

	deserializeKeys: function(type, id, record, data){
		data[this.schema.models[type].primaryKey.name] = id;
		data.__id = id;
		data.id = id;
	},

	deserializeAttributes: function(type, record, data){
		var modelSchema = this.schema.models[type];

		Object.keys(modelSchema.attributes).forEach(function(attr) {
			this.deserializeAttribute(type, record, attr, data);
		}, this);
	},

	deserializeAttribute: function(type, record, attr, data){
		data[attr] = record[attr] || null; // firebase doesn't like 'undefined' so replace with null
	},

	deserializeLinks: function(type, record, data){
		var _this = this;
		var modelSchema = this.schema.models[type];
		data.__rel = {};

		Object.keys(modelSchema.links).forEach(function(link) {
			var linkDef = modelSchema.links[link];
			var value = record[link]||{};

			// if(linkDef.type === "hasMany"){
			// 	value = _this.buildHash(value||[], true)
			// }

			data.__rel[link] = value;
		});
	},

	buildHash: function(keys, value){
		if(!isArray(keys)){
			debugger
		}
		var hash = {};
		
		keys.forEach(function(key){
			hash[key] = value;
		});

		return hash;
	},

	resourceKey: function(type) {
		return 'id';
	},	

	resourceType: function(type) {
		return this.schema.pluralize(type);
	},

	resourceLink: function(type, link) {
		return link;
	},

	resourceAttr: function(type, attr) {
		return attr;
	}
});