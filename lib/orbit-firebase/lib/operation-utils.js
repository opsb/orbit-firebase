function fop(operation){
	return {
		id: operation.id,
		op: operation.op,
		path: (typeof operation.path === 'string') ? operation.path : operation.path.join("/"),
		value: operation.value
	};
}

export { fop };
