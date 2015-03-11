function removeItem(array, condemned){
	return array.filter(function(item){
		return item !== condemned;
	});
}

function removeAt(array, index){
	var working = array.splice(0);
	working.splice(index, 1);
	return working;
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

export { removeItem, removeAt, reduce, pluck };