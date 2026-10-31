declare function addEventListener<K extends keyof ServiceWorkerGlobalScopeEventMap>(
	type: K, listener: (event: ServiceWorkerGlobalScopeEventMap[K]) => void
): void;
