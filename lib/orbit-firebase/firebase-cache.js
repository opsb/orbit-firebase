import { Class, expose, isArray, isObject, isNone } from 'orbit/lib/objects';
import SchemaUtils from './schema-utils';
import CacheUtils from './cache-utils';
import Evented from 'orbit/evented';

export default Class.extend({
	init: function(cache, serializer, schema){
		Evented.extend(this);
		this._cache = cache;
		this._cacheUtils = new CacheUtils(cache);
		this._serializer = serializer;
		this._schema = schema;
		this._schemaUtils = new SchemaUtils(schema);
		this.step = 0;
	},

	addRecord: function(type, record){
		if(!record) return;
		var serialized = this._serializer.serializeRecord(type, record);
		this.transformCache({ op: 'add', path: [type, this.getId(type, record)], value: record });
		this.emit("recordAdded", type, record);
		return record;
	},

	addRecords: function(type, records){
		var _this = this;
		records.forEach(function(record){
			_this.addRecord(type, record);
		});
		return records;
	},

	removeRecord: function(type, id){
		if(!this._cache.retrieve([type, id])) return;

		this.transformCache({ op: 'remove', path: [type, id] });
		this.emit("recordRemoved", type, id);
	},

	addLink: function(type, typeId, link, linkId){
		console.log("firebase-cache.addLink", [type, typeId, link, linkId]);
		var linkType = this._schemaUtils.lookupLinkDef(type, link).type;

		if(linkType === "hasOne") return this.setHasOne(type, typeId, link, linkId);
		if(linkType === "hasMany") return this.addToHasMany(type, typeId, link, linkId);
		throw new Error("Link type not handled: " + linkType);
	},

	removeLink: function(type, typeId, link, linkId){
		var linkType = this._schemaUtils.lookupLinkDef(type, link).type;

		if(linkType === "hasOne") return this.setHasOne(type, typeId, link, null);
		if(linkType === "hasMany") return this.removeFromHasMany(type, typeId, link, linkId);
		throw new Error("Link type not handled: " + linkType);
	},

	setHasOne: function(type, typeId, link, linkId){
		if(this._cacheUtils.retrieveLink(type, typeId, link) === linkId) return;
		this.transformCache({ op: "add", path: [type, typeId, "__rel", link], value: linkId});
	},

	addToHasMany: function(type, typeId, link, linkId){
		var hasManyArray = Object.keys(this._cacheUtils.retrieveLink(type, typeId, link));
		debugger
		console.log("addToHasMany", hasManyArray, linkId);
		if(hasManyArray.indexOf(linkId) !== -1) return;
		this.transformCache({ op: "add", path: [type, typeId, "__rel", link, linkId], value: true});
	},

	removeFromHasMany: function(type, typeId, link, linkId){
		var hasManyArray = this._cacheUtils.retrieveLink(type, typeId, link);
		if(hasManyArray.indexOf(linkId) === -1) return;
		this.transformCache({ op: "remove", path: [type, typeId, "__rel", link, linkId] });
	},

	updateAttribute: function(type, typeId, attribute, value){
		var currentValue = this._cache.retrieve([type, typeId, attribute]);
		if(currentValue === value) return;
		this.transformCache({ op: "replace", path: [type, typeId, attribute], value: value });
	},

	updateMeta: function(type, typeId, meta, value){
		var currentValue = this._cache.retrieve([type, typeId, meta]);
		if(currentValue === value) return;
		this.transformCache({ op: "replace", path: [type, typeId, meta], value: value });	
	},

	updateLink: function(type, typeId, link, newValue){
		var _this = this,
			linkType = this._schemaUtils.lookupLinkDef(type, link).type,
			currentValue = this._cacheUtils.retrieveLink(type, typeId, link),
			cacheLinkPath = [type, typeId, "__rel", link];

		if(linkType === "hasOne"){
			if(newValue === currentValue) return;
			_this.transformCache({op: 'replace', path: cacheLinkPath, value: newValue});
		}
		else if(linkType === "hasMany"){
			var currentLinkIds = currentValue||[];
			var newLinkIds = newValue||[];

			var added = newLinkIds.filter(function(linkId){
				return currentLinkIds.indexOf(linkId) === -1;
			});

			var removed = currentLinkIds.filter(function(linkId){
				return newLinkIds.indexOf(linkId) === -1;
			});
			
			added.forEach(function(linkId){
				var path = cacheLinkPath.concat([linkId]);
				try{
					_this.transformCache({op: 'add', path: path, value: true});

				}
				catch(error){
					debugger
				}
			});

			removed.forEach(function(linkId){
				var path = cacheLinkPath.concat([linkId]);
				_this.transformCache({op: 'remove', path: path});
			});
		}		
	},

	transformCache: function(operation) {
		this.step += 1;
		console.log("t => " + operation.op + " " + operation.path.join("/") + " " + operation.value);

		// if(this.step % 100 === 1){
		// 	debugger
		// }

		this.validateOperation(operation);
		console.log("transformCache", operation);
		var pathToVerify,
		inverse;

		if (operation.op === 'add') {
			pathToVerify = operation.path.slice(0, operation.path.length - 1);
		} else {
			pathToVerify = operation.path;
		}

		if (this._cache.retrieve(pathToVerify)) {
	      	this._cache.transform(operation);

	  	} else if (operation.op === 'replace') {
	      	// try adding instead of replacing if the cache does not yet contain
	      	// the data
	      	operation.op = 'add';
	      	this.transformCache(operation);

	  	} else {
	      	// if the cache can't be transformed because, still trigger `didTransform`
	      	//
	      	// NOTE: this is not an error condition, since the local cache will often
	      	// be sparsely populated compared with the remote store
	      	// try {
	      		this._cache.transform(operation, []);
			// }
			// catch(error){
			// 	debugger
			// }	  	
	  	}
	},

	validateOperation: function(operation){
		var validOperations = ["add", "remove", "replace", "copy", "move", "test"];
		if(validOperations.indexOf(operation.op) === -1) throw new Error("Invalid operation: " + operation.op);
		if(operation.path[-1] === "_rel") throw new Error("Relationship not specified");
	},

	getId: function(type, data) {
		if (isObject(data)) {
			return data[this._schema.models[type].primaryKey.name];
		} else {
			return data;
		}
	}
});