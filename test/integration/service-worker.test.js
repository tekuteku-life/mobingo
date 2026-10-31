import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script, createContext } from 'node:vm';
import { resolve } from 'node:path';
import { productionFiles } from '../../scripts/files.js';

const source = await readFile('sw.js', 'utf8');
function worker({ hit, response, offline = false } = {}) {
	const handlers = {};
	const deleted = [], added = [], put = [];
	let skipped=0;
	const cacheName = source.match(/CACHE_NAME\s*=\s*['"]([^'"]+)/)[1];
	const context = createContext({
		self: { addEventListener: (type, fn) => { handlers[type] = fn; }, registration:{scope:'https://example.test/mobingo/'}, skipWaiting: async () => {skipped++}, clients: { claim: async () => {} } },
		Request: class {constructor(url,options){this.url=url;this.cache=options.cache;}},
		caches: { open: async () => ({ match:async(request)=>request==='./index.html'?'INDEX':hit, addAll: async (assets) => added.push(...assets), put: async (...args) => put.push(args) }),
			keys: async () => [cacheName, 'mobingo-v0', 'other-app-v1'], delete: async (key) => deleted.push(key),
			match: async () => {assert.fail('Other version caches must not be searched')}  },
		fetch: async () => { if (offline) throw new Error('offline'); return response; },
	});
	new Script(source, { filename: resolve('sw.js') }).runInContext(context);
	return { handlers, deleted, added, put, skipped:()=>skipped };
}

test('R-13: precacheは全実行資産を含み、実ファイルが存在する', async () => {
	const w = worker();
	let pending;
	w.handlers.install({ waitUntil: (value) => { pending = value; } });
	await pending;
	for (const file of await productionFiles()) {
		if (file === 'sw.js') continue;
		assert.ok(w.added.some(request=>request.url===`./${file}`&&request.cache==='reload'), file);
	}
	for (const request of w.added) await readFile(request.url === './' ? 'index.html' : request.url);
});

test('R-13: activateで他アプリのキャッシュを削除しない', async () => {
	const w = worker(); let pending;
	w.handlers.activate({ waitUntil: (value) => { pending = value; } });
	await pending;
	assert.deepEqual(w.deleted, ['mobingo-v0']);
});

test('R-13: GET以外・cache hit・ネットワーク応答・オフラインnavigation', async () => {
	const hit = worker({ hit: 'HIT' }); let pending;
	hit.handlers.fetch({ request: { method: 'POST' }, respondWith() { assert.fail('POST intercepted'); } });
	hit.handlers.fetch({ request: { method: 'GET' }, respondWith: (value) => { pending = value; } });
	assert.equal(await pending, 'HIT');
	for (const response of [undefined, { status: 404 }, { status: 200, type: 'cors' }, { status: 200, type: 'basic', clone: () => 'CLONE' }]) {
		const w = worker({ response });
		w.handlers.fetch({ request: { method: 'GET' }, respondWith: (value) => { pending = value; }, waitUntil() {} });
		assert.equal(await pending, response);
		await Promise.resolve();
		assert.equal(w.put.length, response?.type === 'basic' ? 1 : 0);
	}
	const w = worker({ offline: true });
	for (const mode of ['navigate', 'cors']) {
		w.handlers.fetch({ request: { method: 'GET', mode }, respondWith: (value) => { pending = value; } });
		assert.equal(await pending, mode === 'navigate' ? 'INDEX' : undefined);
	}
});

test('R-14: インストール済みPWAも画面の向きを固定しない',async()=>{
	const manifest=JSON.parse(await readFile('manifest.json','utf8'));
	assert.equal(manifest.orientation,'any');
});

test('R-21: installは自動skipせず、版返信と正規windowの確認済み適用だけを受け付ける',async()=>{
	const w=worker();let pending;w.handlers.install({waitUntil:value=>pending=value});await pending;assert.equal(w.skipped(),0);
	let reply;const message={data:{type:'MOBINGO_GET_VERSION'},ports:[{postMessage:data=>reply=data}]};w.handlers.message(message);assert.match(reply.version,/^\d+\.\d+\.\d+$/);assert.equal(reply.type,'MOBINGO_VERSION');
	for(const data of [null,{}, {type:'MOBINGO_GET_VERSION'},{type:'MOBINGO_SKIP_WAITING',version:'0.0.0'}])w.handlers.message({data,ports:[],waitUntil(){assert.fail('unexpected apply')}});
	for(const source of [null,{type:'worker',url:'https://example.test/mobingo/a'},{type:'window',url:'https://evil.test/'},{type:'window',url:'https://example.test/other/'}])w.handlers.message({data:{type:'MOBINGO_SKIP_WAITING',version:reply.version},source,waitUntil(){assert.fail('untrusted source')}});
	w.handlers.message({data:{type:'MOBINGO_SKIP_WAITING',version:reply.version},source:{type:'window',url:'https://example.test/mobingo/'},waitUntil:value=>pending=value});await pending;assert.equal(w.skipped(),1);
});
