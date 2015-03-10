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

export { removeItem, removeAt };