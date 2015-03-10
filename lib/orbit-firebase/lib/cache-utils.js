import { Class } from 'orbit/lib/objects';

export default Class.extend({
	init: function(cache){
		this.cache = cache;
	},

	retrieveLink: function(type, id, link) {
		var val = this.cache.retrieve([type, id, '__rel', link]);
		if (val !== null && typeof val === 'object') {
			val = Object.keys(val);
		}
		return val;
	},
});
