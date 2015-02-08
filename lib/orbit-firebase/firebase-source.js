import { Class } from 'orbit/lib/objects';
import Orbit from 'orbit/main';
import { assert } from 'orbit/lib/assert';
import { isArray, isObject, expose } from 'orbit/lib/objects';
import Source from 'orbit-common/source';
import { pluck, reduce } from 'orbit-firebase/object-utils';

import TransformConnector from 'orbit/transform-connector';
import Transformable from 'orbit/transformable';
import Operation from 'orbit/operation';

import FirebaseClient from './firebase-client';
import FirebaseRequester from './firebase-requester';
import FirebaseTransformer from './firebase-transformer';
import FirebaseSerializer from './firebase-serializer';
import FirebaseOperationQueues from './firebase-operation-queues';
import FirebaseUtils from './firebase-utils';
import FirebaseCache from './firebase-cache';
import OperationMatcher from './operation-matcher';
import OperationDecomposer from './operation-decomposer';
import SchemaUtils from './schema-utils';

var CacheSource = Class.extend({
	init: function(cache){
		Transformable.extend(this);
		this._cache = cache;
		expose(this, this._cache, ['retrieve']);
	},

	_transform: function(operations){
		var _this = this;
		operations = isArray(operations) ? operations : [operations];

		operations.forEach(function(operation){
			_this._cache.transform(operation);
		});

		this.settleTransforms();
	}
});


export default Source.extend({
	notifierName: "firebase-source",

	init: function(schema, options){
		var _this = this,
			options = options || {};

		this._super.apply(this, arguments);
		window.firebaseSource = this;

		assert('FirebaseSource requires Orbit.Promise be defined', Orbit.Promise);
		assert('FirebaseSource requires Orbit.all be defined', Orbit.all);
		assert('FirebaseSource requires Orbit.map be defined', Orbit.map);
		assert('FirebaseSource requires Orbit.resolve be defined', Orbit.resolve);
		assert('FirebaseSource requires firebaseRef be defined', options.firebaseRef);

		window.firebaseSource = this;

		var firebaseRef = options.firebaseRef;
		var serializer = new FirebaseSerializer(schema);
		var firebaseClient = new FirebaseClient(firebaseRef);

		this._firebaseTransformer = new FirebaseTransformer(firebaseClient, schema, serializer);
		this._firebaseRequester = new FirebaseRequester(firebaseClient, schema, serializer);
		this._firebaseOperationQueues = new FirebaseOperationQueues(firebaseRef, schema);
		this._firebaseOperationQueues.id = "firebaseOperationQueues";

		var cacheSource = new CacheSource(this._cache);
		cacheSource.id = "cacheSource";
		var connector = new TransformConnector(this._firebaseOperationQueues, cacheSource);
		connector.id = "fromFirebase";
		this._cache.on("didTransform", function(operation){
			console.log("**** cacheDidTransform", operation);
		})
	},

	_transform: function(operation){
		var _this = this;

		return this._firebaseTransformer.transform(operation).then(function(result){

			if(operation.op === "add" && operation.path.length === 2){
				var type = operation.path[0];
				_this._subscribeToRecords(type, result);
			}

			if(operation.op !== "remove" && operation.path.length === 2){
				operation.value = _this.schema.normalize(operation.path[0], operation.value);
			}

			_this._firebaseOperationQueues.enqueue(operation);
		});
	},

	_find: function(type, id){
		var _this = this;
		return this._firebaseRequester.find(type, id).then(function(records){
			if(!id) _this._firebaseOperationQueues.subscribeToType(type);
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
		this._firebaseOperationQueues.subscribeToRecords(type, pluck(records, 'id'));
	},

	_addRecordsToCache: function(type, recordOrRecords) {
		console.log("addingRecordsToCache", recordOrRecords);
		var _this = this;
		var records = isArray(recordOrRecords) ? recordOrRecords : [recordOrRecords];

		var promisedRecords = reduce(records, function(record) {
			_this._addRecordToCache(type, record);
		});

		console.log("calling settleTransforms from firebase-souce");
		return this.settleTransforms().then(function(){
			return recordOrRecords;
		});
	},

	_addRecordToCache: function(type, record) {
		console.log('op:' + record.id, "fb-source._addRecordToCache");
		console.log("adding record to cache", record);
		var operation = new Operation({
			op: 'add',
			path: [type, record.id],
			value: record
		});

		this._cache.transform(operation);
	},
});
