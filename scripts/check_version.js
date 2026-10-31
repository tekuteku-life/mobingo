import { readFile } from 'node:fs/promises';
import { APP_VERSION } from '../js/core/version.js';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const sw = await readFile('sw.js', 'utf8');
const cacheVersion = sw.match(/CACHE_NAME\s*=\s*['"]mobingo-v(\d+\.\d+\.\d+)['"]/)[1];
if (new Set([pkg.version, lock.version, lock.packages[''].version, APP_VERSION, cacheVersion]).size !== 1) {
	throw new Error('Application, package, lockfile and Service Worker versions must match');
}
console.log(`Version checks passed: ${APP_VERSION}`);
