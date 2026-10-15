const CACHE_NAME = 'mobingo-v1';
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
	'./js/core/icons.js',
	'./js/views/mode-select.js',
	'./js/views/child.js',
	'./js/views/host.js',
	'./js/views/license-modal.js',
	'./js/components/bingo-barrel.js',
	'./js/components/slide-action.js'
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(STATIC_ASSETS);
		}).then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => {
			return Promise.all(
				keys.map((key) => {
					if (key !== CACHE_NAME) {
						return caches.delete(key);
					}
				})
			);
		}).then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	event.respondWith(
		caches.match(event.request).then((cachedResponse) => {
			if (cachedResponse) {
				return cachedResponse;
			}
			return fetch(event.request).then((networkResponse) => {
				if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
					return networkResponse;
				}
				const responseToCache = networkResponse.clone();
				caches.open(CACHE_NAME).then((cache) => {
					cache.put(event.request, responseToCache);
				});
				return networkResponse;
			}).catch(() => {
				// Fallback for navigation
				if (event.request.mode === 'navigate') {
					return caches.match('./index.html');
				}
			});
		})
	);
});
