import { Class } from 'orbit/lib/objects';

export default Class.extend({
	init: function(schema){
		this.schema = schema;
	},

	lookupLinkDef: function(model, link){
		var modelSchema = this.schema.models[model];
		if(!modelSchema) debugger;
		var linkDef = modelSchema.links[link];
		if(!linkDef) debugger;//throw "Unable to find linkDef for: " + [model, link].join("/");
		return linkDef;
	},

	lookupRelatedLinkDef: function(model, link){
		var linkDef = this.lookupLinkDef(model, link);
		return this.schema.models[linkDef.model].links[linkDef.inverse];
	},

	linkTypeFor: function(model, link){
		var linkDef = this.lookupLinkDef(model, link);
		if(!linkDef) throw new Error("Could not find type for " + model + "/" + link);
		return linkDef.type;
	}
});
