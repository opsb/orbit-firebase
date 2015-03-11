import { isArray } from 'orbit/lib/objects';
import { reduce } from 'orbit-firebase/lib/array-utils';

function formatOperation(operation){
	var formatted = {
		id: operation.id,
		op: operation.op,
		path: (typeof operation.path === 'string') ? operation.path : operation.path.join("/")
	};	

	if(operation.value) formatted.value = operation.value;

	return formatted;
}

function fop(operationOrOperations){
	if(isArray(operationOrOperations)){
		return reduce(operationOrOperations, function(operation){
			return formatOperation(operation);
		});
	}
	else {
		return formatOperation(operationOrOperations);
	}
}

export { fop };
