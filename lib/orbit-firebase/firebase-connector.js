import TransformConnector from 'orbit/transform-connector';

export default TransformConnector.extend({
	filterFunction: function(operation){
		var path = operation.path;
		var recordPath = [path[0], path[1]];
		var record = this.target.retrieve(recordPath);

		if(!record && path.length > 2){
			return false;
		}

		return true;
	}
});