import { Class } from 'orbit/lib/objects';
import OperationMatcher from './operation-matcher';
import SchemaUtils from './schema-utils';
import CacheUtils from './cache-utils';
import Operation from 'orbit/operation';

function asHash(k,v){
  var hash = {};
  hash[k] = v;
  return hash;
}

function buildObject(keys, value){
	var hash = {};
	keys.forEach(function(key){
		hash[key] = value;
	});
	return hash;
}

var ChangeDetails = Class.extend({
	init: function(path, value, schema, cache){
		this.path = path;
		this.value = value;
		this.schema = schema;
		this.schemaUtils = new SchemaUtils(schema);		
		this.cache = cache;
	},

	model: function(){
		return this.path[0];
	},

	modelId: function(){
		return this.path[1];
	},

	link: function(){
		return this.path[3];
	},

	currentValue: function(){
		return this.cache.retrieve(this.path);
	},

	linkDef: function(){
		return this.schemaUtils.lookupLinkDef(this.model(), this.link());
	},

	originalInversePath: function(){
		return [this.linkDef().model, this.currentValue(), "__rel", this.linkDef().inverse];
	},

	inverseLinkDef: function(){
		return this.schemaUtils.lookupRelatedLinkDef(this.model(), this.link());
	},

	newInversePath: function(){
		return [this.linkDef().model, this.value, "__rel", this.linkDef().inverse];
	}
});

var RelationshipResolver = Class.extend({
	init: function(schema, cache){
		this.visited = [];
		this.schema = schema;
		this.schemaUtils = new SchemaUtils(schema);
		this.cache = cache;
		this.cacheUtils = new CacheUtils(cache);		
		this.operations = [];
	},

	visit: function(op, path, value){
		if(this.hasVisited(path)) return;
		this.markVisited(path);

		console.log("visiting", [op, path, value].join("|"));
		var linkType = this.schemaUtils.linkTypeFor(path[0], path[3]);
		console.log("visiting", [linkType, op, path, value].join("|"));

		if(!path[1]) throw new Error("invalid modelId: " + op + "|" + path + "|" + value);

		this[linkType][op].call(this, path, value);
	},

	hasVisited: function(path){
		return this.visited.indexOf(path.join("/")) !== -1;
	},

	markVisited: function(path){
		this.visited.push(path.join("/"));
	},

	hasOne: {
		add: function(path, value){
			var changeDetails = new ChangeDetails(path, value, this.schema, this.cache);

			this.operations.push(new Operation({ op: 'add', path: changeDetails.path, value: changeDetails.value }));
			if(changeDetails.currentValue()){
				this.visit("remove", changeDetails.originalInversePath(), changeDetails.modelId());
			}
			this.visit("add", changeDetails.newInversePath(), changeDetails.modelId());
		},

		remove: function(path, value){
			var changeDetails = new ChangeDetails(path, value, this.schema, this.cache);
			if(!value) return;
			this.operations.push(new Operation({ op: 'remove', path: changeDetails.path}));
			this.visit("remove", changeDetails.originalInversePath(), changeDetails.modelId());
		},

		replace: function(path, value){
			var changeDetails = new ChangeDetails(path, value, this.schema, this.cache);

			this.operations.push(new Operation({ op: 'replace', path: changeDetails.path, value: changeDetails.value }));
			if(changeDetails.currentValue()){
				this.visit("remove", changeDetails.originalInversePath(), changeDetails.modelId());
			}
			this.visit("add", changeDetails.newInversePath(), changeDetails.modelId());
		}
	},

	hasMany: {
		add: function(path, value){

			var linkDef = this.schemaUtils.lookupLinkDef(path[0], path[3]);
			var inversePath = [linkDef.model, value, "__rel", linkDef.inverse];

			this.operations.push(new Operation({ op: 'add', path: path.concat(value), value: true }));
			this.visit("add", inversePath, path[1]);
		},

		remove: function(path, value){
			var linkDef = this.schemaUtils.lookupLinkDef(path[0], path[3]);
			var inversePath = [linkDef.model, value, "__rel", linkDef.inverse];
			this.operations.push(new Operation({ op: 'remove', path: path.concat(value) }));
			this.visit("remove", inversePath, path[1]);
		},

		replace: function(path, value){
			var _this = this,
				relatedLinkDef = this.schemaUtils.lookupRelatedLinkDef(path[0], path[3]);

			this.operations.push(new Operation({ op: 'replace', path: path, value: buildObject(value, true) }));
			
			if(relatedLinkDef.type === 'hasMany') return;

			var linkValue = this.cache.retrieve(path),
				currentValue = linkValue ? Object.keys(linkValue) : [],
				modelId = path[1],
				linkDef = this.schemaUtils.lookupLinkDef(path[0], path[3]);
			
			var added = value.filter(function(id){
				return currentValue.indexOf(id) === -1;
			});
			var removed = currentValue.filter(function(id){
				return value.indexOf(id) === -1;
			});

			added.forEach(function(id){
				var inversePath = [linkDef.model, id, "__rel", linkDef.inverse];
				_this.visit("add", inversePath, modelId);
			});

			removed.forEach(function(id){
				var inversePath = [linkDef.model, id, "__rel", linkDef.inverse];
				_this.visit("remove", inversePath, modelId);
			});
		}
	}
});

export default Class.extend({
	init: function(schema, cache){
		this.schema = schema;
		this.schemaUtils = new SchemaUtils(schema);
		this.cache = cache;
		this.cacheUtils = new CacheUtils(cache);
	},

	decompose: function(operation){
		if(operation.path[2] !== "__rel") return [operation];
		console.log("decomposing", [operation.op, operation.path.join("/"), operation.value].join(", "));
		var relationshipResolver = new RelationshipResolver(this.schema, this.cache);
		console.log("original", operation);
		var normalized = this.normalize(operation);
		console.log("normalized", normalized);
		relationshipResolver.visit(normalized.op, normalized.path, normalized.value);
		return relationshipResolver.operations;
	},

	normalize: function(operation){
		var linkDef = this.schemaUtils.lookupLinkDef(operation.path[0], operation.path[3]);
		var path = operation.path;

		if(["hasMany", "hasOne"].indexOf(linkDef.type) === -1) throw new Error("unsupported link type: " + linkDef.type);

		if(linkDef.type === "hasOne" && operation.op === "add") return operation;
		if(linkDef.type === "hasOne" && operation.op === "remove"){
			return {
				op: operation.op, 
				path: path, 
				value: this.cache.retrieve(path)
			};
		}
		if(linkDef.type === "hasMany" && (['add', 'remove'].indexOf(operation.op) !== -1)) {
			return { 
				op: operation.op, 
				path: path.slice(0,-1), 
				value: path[path.length-1] 
			};
		}
		if(linkDef.type === "hasMany" && operation.op === "replace"){
			return {
				op: operation.op,
				path: operation.path,
				value: Object.keys(operation.value)	
			};
		}
		return operation;
	}
});
