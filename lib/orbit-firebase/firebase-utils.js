import { Class } from 'orbit/lib/objects';
import Orbit from 'orbit/main';

export default Class.extend({
	init: function(firebaseRef, schema, serializer){
		this.firebaseRef = firebaseRef;
		this._schema = schema;
		this._serializer = serializer;
	},

	addRecord: function(type, id, record){
		var path = [type, id].join("/");

		if(!record.id) {
			throw new Error("Tried to add a watch for a record with no id: " + JSON.stringify(record));
		}
		if(record.id === "true"){
			throw new Error("Tried to add a watch for a record with an id of 'true': " + JSON.stringify(record));
		}

		return this.set(path, record);
	},

	removeRecord: function(type, id){
		var path = [type, id].join("/");
		return this.remove(path);
	},

	addLink: function(type, typeId, link, linkId){
		var linkDef = this._schema.models[type].links[link];
		var firepath = [type, typeId, link].join("/");
		if(linkDef.type === "hasMany") return this.appendToArray(firepath, linkId);
		if(linkDef.type === "hasOne") return this.set(firepath, linkId);
		throw new Error("No addLink handler for link type: " + linkDef.type);
	},

	removeLink: function(type, typeId, link, linkId){
		var linkDef = this._schema.models[type].links[link];
		var firepath = [type, typeId, link].join("/");
		if(linkDef.type === "hasMany") return this.removeFromArray(firepath, linkId);
		if(linkDef.type === "hasOne") return this.set(firepath, null);
		throw new Error("No removeLink handler for link type: " + linkDef.type);
	},

	replaceLink: function(type, typeId, link, linkValue){
		var firepath = [type, typeId, link].join("/");
		return this.set(firepath, linkValue);
	},

	updateAttribute: function(type, typeId, attribute, value){
		var path = [type, typeId, attribute].join("/");
		return this.set(path, value);
	},

	findOne: function(type, id){
		var _this = this;
		var path = [type, id].join("/");
		return _this.valueAt(path).then(function(record){
			// todo - is this the correct behaviour for not found?
			if(!record) return record;
			var deserialized = _this._serializer.deserialize(type, id, record);
			return deserialized;
		});
	},

	findAll: function(type){
		var _this = this;
		return _this.valueAt(type).then(function(recordsHash){
			var records = _this.objectValues(recordsHash);
			var deserialized = _this._serializer.deserializeRecords(type, records);
			return deserialized;
		});
	},

	objectValues: function(object){
		if(!object) return [];
		return Object.keys(object).map(function(key){
			return object[key];
		});
	},

	set: function(path, value){
		console.log("firebase.set:" + path, value);
		var _this = this;
		return new Orbit.Promise(function(resolve, reject){
			console.log("setting:" + path, value);
			try{
				value = value || null; // undefined causes error in firebase client
				_this.firebaseRef.child(path).set(value, function(error){
					error ? reject(error) : resolve(value); // jshint ignore:line
				});
			}
			catch(error){
				debugger
			}
		});

	},

	remove: function(path){
		var _this = this;
		return new Orbit.Promise(function(resolve, reject){
			_this.firebaseRef.child(path).remove(function(error){
				error ? reject(error) : resolve(); // jshint ignore:line
			});
		});
	},

	removeFromArray: function(arrayPath, value){
		var _this = this;

		return this.valueAt(arrayPath).then(function(array){
			if(!array) return;

			var index = array.indexOf(value);
			if(index === -1) return Orbit.resolve();

			array.splice(index, 1);
			return _this.set(arrayPath, array);
		});
	},

	appendToArray: function(arrayPath, value){
		var _this = this;
		return _this.valueAt(arrayPath).then(function(array){
			array = array || [];
			if(array.indexOf(value) === -1){
				array.push(value);
			}
			return _this.set(arrayPath, array);	

		});
	},

	valueAt: function(path){
		var _this = this;
		return new Orbit.Promise(function(resolve, reject){
			_this.firebaseRef.child(path).once('value', function(snapshot){

				resolve(snapshot.val());

			}, function(error){
				reject(reject);
			});
		});
	}
});

