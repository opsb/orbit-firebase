import { Class } from 'orbit/lib/objects';
import Orbit from 'orbit/main';
import { assert } from 'orbit/lib/assert';
import { isArray, isObject, expose } from 'orbit/lib/objects';
import Source from 'orbit-common/source';
import { pluck, reduce } from 'orbit-firebase/lib/object-utils';

import TransformConnector from 'orbit/transform-connector';
import Transformable from 'orbit/transformable';
import Operation from 'orbit/operation';

import FirebaseClient from './firebase-client';
import FirebaseRequester from './firebase-requester';
import FirebaseTransformer from './firebase-transformer';
import FirebaseSerializer from './firebase-serializer';
import FirebaseListener from './firebase-listener';
import FirebaseConnector from './firebase-connector';
import EagerRelationshipLoader from './eager-relationship-loader';
import OperationMatcher from './operation-matcher';
import OperationDecomposer from './operation-decomposer';
import SchemaUtils from './lib/schema-utils';
import { fop } from './lib/operation-utils';

var CacheSource = Class.extend({
	init: function(cache){
		Transformable.extend(this);
		this._cache = cache;
		expose(this, this._cache, ['retrieve']);
	},

	_transform: function(operations){
		console.log("transforming cache", operations);
		var _this = this;
		operations = isArray(operations) ? operations : [operations];

		operations.forEach(function(operation){
			_this._cache.transform(operation);
		});
	}
});

export default Source.extend({
	notifierName: "firebase-source",

	init: function(schema, options){
		var _this = this;
		options = options || {};

		this._super.apply(this, arguments);

		assert('FirebaseSource requires Orbit.Promise be defined', Orbit.Promise);
		assert('FirebaseSource requires Orbit.all be defined', Orbit.all);
		assert('FirebaseSource requires Orbit.map be defined', Orbit.map);
		assert('FirebaseSource requires Orbit.resolve be defined', Orbit.resolve);
		assert('FirebaseSource requires firebaseRef be defined', options.firebaseRef);

		var firebaseRef = options.firebaseRef;
		var serializer = new FirebaseSerializer(schema);
		var firebaseClient = new FirebaseClient(firebaseRef);

		this._firebaseTransformer = new FirebaseTransformer(firebaseClient, schema, serializer);
		this._firebaseRequester = new FirebaseRequester(firebaseClient, schema, serializer);
		this._firebaseListener = new FirebaseListener(firebaseRef, schema, serializer);

		var cacheSource = new CacheSource(this._cache);
		this._firebaseConnector = new FirebaseConnector(this._firebaseListener, cacheSource);
		new EagerRelationshipLoader(this._firebaseListener, this._firebaseListener, schema);
	},

	disconnect: function(){
		this._firebaseListener.unsubscribeAll();
	},

	_transform: function(operation){
		console.log("fb.transform", operation.serialize());
		var _this = this;

		return this._firebaseTransformer.transform(operation).then(function(result){

			if(operation.op === "add" && operation.path.length === 2){
				var type = operation.path[0];
				_this._subscribeToRecords(type, result);
			}

			if(operation.op !== "remove" && operation.path.length === 2){
				operation.value = _this.schema.normalize(operation.path[0], operation.value);
			}

			_this._cache.transform(operation);
		});
	},

	_find: function(type, id){
		var _this = this;
		return this._firebaseRequester.find(type, id).then(function(records){
			if(!id) _this._firebaseListener.subscribeToType(type);
			_this._subscribeToRecords(type, records);
			return _this._addRecordsToCache(type, records);
		});
	},

	_findLink: function(type, id, link){
		return this._firebaseRequester.findLink(type, id, link);
	},

	_findLinked: function(type, id, link){
		var _this = this,
			linkedType = this.schema.models[type].links[link].model;

		return this._firebaseRequester.findLinked(type, id, link).then(function(records){
			_this._subscribeToRecords(linkedType, records);
			return _this._addRecordsToCache(linkedType, records);
		});
	},

	_subscribeToRecords: function(type, records){
		records = isArray(records) ? records : [records];
		this._firebaseListener.subscribeToRecords(type, pluck(records, 'id'));
	},

	_addRecordsToCache: function(type, recordOrRecords) {
		var _this = this;
		var records = isArray(recordOrRecords) ? recordOrRecords : [recordOrRecords];

		records.forEach(function(record){
			_this._addRecordToCache(type, record);
		});

		return this.settleTransforms().then(function(){
			return recordOrRecords;
		});
	},

	_addRecordToCache: function(type, record) {
		var operation = new Operation({
			op: 'add',
			path: [type, record.id],
			value: record
		});

		this._firebaseConnector.transform(operation);
	},
});
