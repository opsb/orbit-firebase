function objectValues(object){
	if(!object) return [];
	return Object.keys(object).map(function(key){
		return object[key];
	});
}

function reduce(array, callback){
	var reduced = [];

	for(var i = 0; i < array.length; i++){
		reduced[i] = callback(array[i]);
	}

	return reduced;
}

function pluck(array, property){
	return reduce(array, function(item){
		return item[property];
	});
}

export { objectValues, pluck, reduce }