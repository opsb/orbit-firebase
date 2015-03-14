import Transformable from 'orbit/transformable';
import { isArray, isObject, expose, Class } from 'orbit/lib/objects';

export default Class.extend({
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
