import { Class } from 'orbit/lib/objects';
import Orbit from 'orbit/main';
import { assert } from 'orbit/lib/assert';
import { isArray, isObject } from 'orbit/lib/objects';
import Source from 'orbit-common/source';

import FirebaseListener from './firebase-listener';
import FirebaseSerializer from './firebase-serializer';
import FirebaseUtils from './firebase-utils';
import FirebaseCache from './firebase-cache';
import OperationMatcher from './operation-matcher';
import OperationDecomposer from './operation-decomposer';
import SchemaUtils from './schema-utils';

var FirebaseSource = Source.extend({
	notifierName: "firebase-source",

	init: function(schema, options){
		var _this = this,
			options = options || {};

		this._super.apply(this, arguments);
		window.firebaseSource = this;

		assert('FirebaseSource requires Orbit.Promise be defined', Orbit.Promise);
		assert('FirebaseSource requires Orbit.all be defined', Orbit.all);
		assert('FirebaseSource requires Orbit.resolve be defined', Orbit.resolve);
		assert('FirebaseSource requires firebaseRef be defined', options.firebaseRef);

		this.firebaseRef = options.firebaseRef;
		this.serializer = new FirebaseSerializer(schema);
		this.schemaUtils = new SchemaUtils(schema);
		this.firebase = new FirebaseUtils(this.firebaseRef, schema, this.serializer);
		this.operationDecomposer = new OperationDecomposer(this.schema, this._cache);
		this.firebaseListener = new FirebaseListener(this.firebaseRef, this.serializer, this._cache, this.schema);
		this.firebaseCache = new FirebaseCache(this._cache, this.serializer, this.schema);

		this.firebaseListener.on("recordAdded", function(type, record){
			console.log("firebaseListener:recordAdded", record);
			_this.firebaseCache.addRecord(type, record);
			_this.settleTransforms();
		});

		this.firebaseListener.on("recordRemoved", function(type, record){
			console.log("firebaseListener:recordRemoved", record);
			_this.firebaseCache.removeRecord(type, _this.getId(type, record), record);
			_this.settleTransforms();
		});

		this.firebaseListener.on("linkUpdated", function(type, typeId, link, value){
			console.log("firebaseListener:linkUpdated", [type, typeId, link, value]);
			_this.firebaseCache.updateLink(type, typeId, link, value);
			_this.settleTransforms();
		});

		this.firebaseListener.on("attributeUpdated", function(type, id, attribute, value){
			console.log("firebaseListener:attributeUpdated", [type, id, attribute, value]);
			_this.firebaseCache.updateAttribute(type, id, attribute, value);
			_this.settleTransforms();
		});

		this.firebaseCache.on("recordAdded", function(type, id){
			console.log("firebaseListener:recordAdded", [type, id]);
			_this.firebaseListener.listenToRecord(type, id);
		});

		this.schema.on("modelRegistered", function(type){
			_this.firebaseListener.listenToType(type);
		});
	},

	_registerModel: function(model) {
		this.firebaseListener.listenToType(model);
	},

	/////////////////////////////////////////////////////////////////////////////
	// Transformable interface implementation
	/////////////////////////////////////////////////////////////////////////////

	_transform: function(operation){
		var _this = this,
			operations = this.operationDecomposer.decompose(operation);

		console.log("decomposed", operations);

		var pendingTransformations = operations.map(function(operation){
			var matcher = new OperationMatcher(operation, _this.schema);
			
			if(matcher.matches("add", "record")) return _this.transformAdd(operation);
			if(matcher.matches("remove", "record")) return _this.transformRemove(operation);
			if(matcher.matches("replace", "attribute")) return _this.transformUpdateAttribute(operation);
			if(matcher.matches("add", "attribute")) return _this.transformUpdateAttribute(operation);
			if(matcher.matches("add", "link")) return _this.transformAddLink(operation); 
			if(matcher.matches("remove", "link")) return _this.transformRemoveLink(operation);
			if(matcher.matches("replace", "link")) return _this.transformReplaceLink(operation);
			if(matcher.matches("add", "meta")) return _this.transformUpdateMeta(operation);
			if(matcher.matches("replace", "meta")) return _this.transformUpdateMeta(operation);
			if(matcher.matches("remove", "meta")) return _this.transformRemoveMeta(operation);
			debugger
			throw "Operation not supported: " + operation.op + " " + matcher.valueType + " " + operation.path.join("/");
		});
		
		return Orbit.all(pendingTransformations);
	},

	transformAdd: function(operation){
		var _this = this,
			type = operation.path[0],
			id = operation.path[1],
			firepath = type + "/" + id,
			record = operation.value,
			serializedRecord = _this.serializer.serialize(type, record),
			deserializedRecord = _this.serializer.deserialize(type, id, serializedRecord);

		return _this.firebase.addRecord(type, id, deserializedRecord).then(function(){
			// _this.firebaseCache.addRecord(type, deserializedRecord);
		});
	},

	transformRemove: function(operation){
		var _this = this,
			type = operation.path[0],
			id = operation.path[1];

		return _this.firebase.removeRecord(type, id).then(function(){
			// return _this.firebaseCache.removeRecord(type, id);
		});
	},	

	transformAddLink: function(operation){
		var _this = this,
			path = operation.path,
			type = path[0],
			typeId = path[1],
			link = path[3],
			linkDef = this.schema.models[type].links[link],
			linkId = linkDef.type === "hasMany" ? path[4] : operation.value;

		return _this.firebase.addLink(type, typeId, link, linkId).then(function(){
			// return _this.firebaseCache.addLink(type, typeId, link, linkId);
		});
	},

	transformRemoveLink: function(operation){
		var _this = this;
		var path = operation.path;
		var _this = this,
			path = operation.path,
			type = path[0],
			typeId = path[1],
			link = path[3],
			linkDef = this.schema.models[type].links[link],
			linkId = linkDef.type === "hasMany" ? path[4] : null;

		return _this.firebase.removeLink(type, typeId, link, linkId).then(function(){
			// return _this.firebaseCache.removeLink(type, typeId, link, linkId);
		});
	},

	transformReplaceLink: function(operation){
		var _this = this;
		var path = operation.path;
		var _this = this,
			path = operation.path,
			type = path[0],
			typeId = path[1],
			link = path[3],
			linkDef = this.schema.models[type].links[link],
			linkValue = linkDef.type === "hasMany" ? path[4] : operation.value;

		return _this.firebase.replaceLink(type, typeId, link, linkValue).then(function(){
			// return _this.firebaseCache.updateLink(type, typeId, link, linkValue);
		});
	},	

	transformUpdateAttribute: function(operation){
		var _this = this,
			path = operation.path,
			type = path[0],
			typeId = path[1],
			attribute = path[2],
			value = operation.value;

		return _this.firebase.updateAttribute(type, typeId, attribute, value).then(function(){
			// return _this.firebaseCache.updateAttribute(type, typeId, attribute, value);
		});
	},	

	transformUpdateMeta: function(operation){
		var _this = this,
			path = operation.path,
			type = path[0],
			typeId = path[1],
			meta = path[2],
			value = operation.value;

		return _this.firebaseCache.updateMeta(type, typeId, meta, value);
	},		

	transformRemoveMeta: function(operation){
		var _this = this,
			path = operation.path,
			type = path[0],
			typeId = path[1],
			meta = path[2],
			value = operation.value;

		return _this.firebaseCache.updateMeta(type, typeId, meta, value);
	},	

	/////////////////////////////////////////////////////////////////////////////
	// Requestable interface implementation
	/////////////////////////////////////////////////////////////////////////////	


	_find: function(type, id){
		return id ? this.findOne(type, id) : this.findAll(type);
	},

	_findLink: function(type, record, link){
		var firepath = [type, record.__id, link].join("/");
		return this.firebase.valueAt(firepath);
	},

	_findLinked: function(type, record, link){
		var _this = this;
		var linkDef = this.schemaUtils.lookupLinkDef(type, link);

		if(linkDef.type === "hasMany"){
			return new Orbit.Promise(function(resolve, reject){
				_this.firebaseRef.child(linkDef.model).orderByChild(linkDef.inverse).equalTo(record.__id).once('value', function(snapshot){
					var records = _this.deserializeRecords(type, snapshot.val());
					resolve(records);
				});
			});
		}
		else if(linkDef.type === "hasOne") {
			return new Orbit.Promise(function(resolve, reject){
				var idFirepath = [type, record.__id, linkDef.model].join("/");

				_this.firebase.valueAt(idFirepath).then(function(modelId){
					var model = _this.schema.singularize(link);
					var valueFirepath = [model, modelId].join("/");
					_this.firebase.valueAt(valueFirepath).then(function(record){
						var deserialized = _this.serializer.deserialize(model, modelId, record);
						resolve(deserialized);		
					});
				});
			});			
		}
	},

	findOne: function(type, id){
		var _this = this;
		return _this.firebase.findOne(type, id).then(function(record){
			return _this.firebaseCache.addRecord(type, record);
		});
	},

	findAll: function(type){
		var _this = this;
		return _this.firebase.findAll(type).then(function(records){
			return _this.firebaseCache.addRecords(type, records);
		});
	},

	deserializeRecords: function(type, serializedRecords){
		if(!serializedRecords) return [];

		var ids = Object.keys(serializedRecords);
		var deserialized = [];

		for(var i = 0; i < ids.length; i++){
			var id = ids[i];
			deserialized[i] = this.serializer.deserialize(type, id, serializedRecords[id]);
		}

		return deserialized;
	}
});

export default FirebaseSource;