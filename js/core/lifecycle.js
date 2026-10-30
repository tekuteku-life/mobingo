/** Own timers and cleanup callbacks for a view and its children. */
export function createScope() {
	let active = true;
	const cleanups = new Set();
	const scope = {
		get active() { return active; },
		add(cleanup) {
			if (!active) { cleanup(); return () => {}; }
			cleanups.add(cleanup);
			return () => cleanups.delete(cleanup);
		},
		timeout(callback, delay) {
			const cancel = () => clearTimeout(id);
			const id = setTimeout(() => {
				cleanups.delete(cancel);
				if (active) callback();
			}, delay);
			scope.add(cancel);
			return id;
		},
		child() {
			const child = createScope();
			const unlink = scope.add(() => child.dispose());
			child.add(unlink);
			return child;
		},
		dispose() {
			if (!active) return;
			active = false;
			for (const cleanup of [...cleanups]) cleanup();
			cleanups.clear();
		},
	};
	return scope;
}
