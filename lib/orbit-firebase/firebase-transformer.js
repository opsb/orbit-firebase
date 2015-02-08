import { Class } from 'orbit/lib/objects';
import AddRecord from 'orbit-firebase/transformers/add-record';
import RemoveRecord from 'orbit-firebase/transformers/remove-record';
import ReplaceAttribute from 'orbit-firebase/transformers/replace-attribute';
import AddToHasMany from 'orbit-firebase/transformers/add-to-has-many';
import AddToHasOne from 'orbit-firebase/transformers/add-to-has-one';
import RemoveHasOne from 'orbit-firebase/transformers/remove-has-one';
import ReplaceHasMany from 'orbit-firebase/transformers/replace-has-many';
import RemoveFromHasMany from 'orbit-firebase/transformers/remove-from-has-many';
import UpdateMeta from 'orbit-firebase/transformers/update-meta';

export default Class.extend({
	init: function(firebaseClient, schema, serializer, cache){
		this._schema = schema;

		this._transformers = [
			new AddRecord(firebaseClient, schema, serializer),
			new RemoveRecord(firebaseClient),
			new ReplaceAttribute(firebaseClient),
			new AddToHasMany(firebaseClient, schema),
			new AddToHasOne(firebaseClient, schema),
			new RemoveHasOne(firebaseClient, schema),
			new ReplaceHasMany(firebaseClient, schema),
			new RemoveFromHasMany(firebaseClient, schema),
			new UpdateMeta(cache)
		];
	},

	transform: function(operation){
		this._normalizeOperation(operation);
		var transformer = this._findTransformer(operation);
		return transformer.transform(operation);
	},

    _normalizeOperation: function(op) {
      if (typeof op.path === 'string') {
      	op.path = op.path.split('/');
      }
    },

	_findTransformer: function(operation){
		for(var i = 0; i < this._transformers.length; i++){
			var transformer = this._transformers[i];

			if(transformer.handles(operation)) {
				console.log("using transformer", transformer);
				return transformer;
			}
		}

		throw new Error("Couldn't find a transformer for: " + JSON.stringify(operation));
	}
});
