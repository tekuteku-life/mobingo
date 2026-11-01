const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));
const CACHE_NAME = 'mobingo-v1.3.0';
const STATIC_ASSETS = [
	'./',
	'./index.html',
	'./manifest.json',
	'./css/style.css',
	'./icons/icon.svg',
	'./js/lib/qrcode.min.js',
	'./js/lib/jsqr.js',
	'./js/lib/confetti.js',
	'./js/app.js',
	'./js/core/base32.js',
	'./js/core/crypto.js',
	'./js/core/chacha20.js',
	'./js/core/bingo.js',
	'./js/core/audio.js',
	'./js/core/haptics.js',
	'./js/core/wakelock.js',
	'./js/core/storage.js',
	'./js/core/identity.js',
	'./js/core/ranking.js',
	'./js/core/lifecycle.js',
	'./js/core/updates.js',
	'./js/core/version.js',
	'./js/core/icons.js',
	'./js/views/mode-select.js',
	'./js/views/child.js',
	'./js/views/host.js',
	'./js/views/license-modal.js',
	'./js/components/bingo-barrel.js',
	'./js/components/slide-action.js'
];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(STATIC_ASSETS.map((url) => new Request(url, { cache: "reload" })));
		})
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => {
			return Promise.all(
				keys.map((key) => {
					if (key.startsWith('mobingo-') && key !== CACHE_NAME) {
						return caches.delete(key);
					}
				})
			);
		}).then(() => sw.clients.claim())
	);
});

sw.addEventListener('message', (event) => {
	const version = CACHE_NAME.slice('mobingo-v'.length);
	if (event.data?.type === 'MOBINGO_GET_VERSION') event.ports[0]?.postMessage({ type: 'MOBINGO_VERSION', version });
	const source = event.source;
	if (event.data?.type === 'MOBINGO_SKIP_WAITING' && event.data.version === version
		&& source && 'url' in source && 'type' in source && source.type === 'window' && source.url.startsWith(sw.registration.scope)) {
		event.waitUntil(sw.skipWaiting());
	}
});

sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
		const cached = await cache.match(event.request);
		if (cached) return cached;
		try {
			const response = await fetch(event.request);
			if (response && response.status === 200 && response.type === 'basic') {
				event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
			}
			return response;
		} catch {
			if (event.request.mode === 'navigate') return cache.match('./index.html');
		}
	}));
});
