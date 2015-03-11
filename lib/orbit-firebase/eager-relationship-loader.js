import { Class } from 'orbit/lib/objects';

export default Class.extend({
	init: function(transformable, listener, schema){
		var _this = this;
		this._schema = schema;
		this._listener = listener;

		transformable.on("didTransform", function(operation){
			_this._process(operation);
		});
	},

	_process: function(operation){
		console.log("checking", operation);
		if(['add', 'replace'].indexOf(operation.op) === -1) return;
		if(operation.path[2] === '__rel') this._processLink(operation);
		if(operation.path.length === 2) this._processRecord(operation);

	},

	_processRecord: function(operation){
		var _this = this;
		var record = operation.value;
		var modelType = operation.path[0];
		var modelSchema = this._schema.models[modelType];

		Object.keys(modelSchema.links).forEach(function(link){
			var linkDef = _this._schema.models[modelType].links[link];
			var linkType = _this._schema.singularize(link);

			if(linkDef.type === 'hasOne'){
				if(record.__rel[link]){
					var id = record.__rel[link];
					_this._listener.subscribeToRecord(linkDef.model, id);
				}

			} else if (linkDef.type === 'hasMany'){
				if(record.__rel[link]){
					var ids = Object.keys(record.__rel[link]);
					_this._listener.subscribeToRecords(linkDef.model, ids);
				}
			}

		});
	},

	_processLink: function(operation){
		var modelType = operation.path[0];
		var link = operation.path[3];
		var linkDef = this._schema.models[modelType].links[link];
		var linkType = linkDef.model;
		var relationshipType = linkDef.type;
		var id, ids;

		if(relationshipType === 'hasMany'){
			if(operation.path.length === 4){
				ids = Object.keys(operation.value);
				this._listener.subscribeToRecords(linkType, ids);

			} else if (operation.path.length === 5){
				id = operation.path[4];
				this._listener.subscribeToRecord(linkType, id);

			}

		} else if (relationshipType === 'hasOne'){
			id = operation.value;
			this._listener.subscribeToRecord(linkType, id);

		}
		else {
			throw new Error("Relationship type not supported: " + relationshipType);
		}
	}
});
