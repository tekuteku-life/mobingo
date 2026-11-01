import test from 'node:test';
import assert from 'node:assert/strict';
import { soundManager } from '../../js/core/audio.js';
import { hapticsManager } from '../../js/core/haptics.js';

async function withAudio(run, state = 'suspended') {
	const original = soundManager.playScanBeep;
	let played = 0;
	globalThis.window = { AudioContext: class { state = state; resume() { this.state = 'running'; return Promise.resolve(); } } };
	soundManager.ctx = null; soundManager.setMuted(false); soundManager.lastErrorName = '';
	soundManager.playScanBeep = () => { played++; };
	try { await run(() => played); }
	finally { soundManager.playScanBeep = original; soundManager.ctx = null; soundManager.setMuted(false); delete globalThis.window; }
}

test('R-24: ミュート・API非対応・context生成失敗を区別する', async () => {
	try {
		soundManager.ctx = null; soundManager.setMuted(true);
		assert.equal((await soundManager.testPlayback()).state, 'muted');
		soundManager.setMuted(false); delete globalThis.window;
		assert.equal((await soundManager.testPlayback()).state, 'unsupported');
		assert.equal(soundManager.getStatus().supported, false);
		globalThis.window = { AudioContext: class { constructor() { throw new DOMException('denied', 'SecurityError'); } } };
		const result = await soundManager.testPlayback();
		assert.equal(result.state, 'failed'); assert.equal(result.errorName, 'SecurityError');
	} finally { soundManager.ctx = null; delete globalThis.window; }
});

test('R-24: runningなら確認音を1回要求し、再開中は完了するまで予約しない', async () => {
	await withAudio(async played => {
		assert.equal((await soundManager.testPlayback()).state, 'requested'); assert.equal(played(), 1);
		soundManager.ctx.state = 'suspended';
		let release;
		soundManager.ctx.resume = () => new Promise(resolve => { release = resolve; });
		const pending = soundManager.testPlayback();
		assert.equal(played(), 1);
		soundManager.ctx.state = 'running'; release();
		assert.equal((await pending).state, 'requested'); assert.equal(played(), 2);
	}, 'running');
});

test('R-24: 時間切れ・非runningで解決した再開では音を鳴らさない', async () => {
	await withAudio(async played => {
		soundManager.initContext(false);
		let release;
		soundManager.ctx.resume = () => new Promise(resolve => { release = resolve; });
		assert.equal((await soundManager.testPlayback({ timeoutMs: 5 })).state, 'pending');
		soundManager.ctx.state = 'running'; release(); await Promise.resolve();
		assert.equal(played(), 0);
		soundManager.ctx.state = 'suspended'; soundManager.ctx.resume = () => Promise.resolve();
		assert.equal((await soundManager.testPlayback()).state, 'pending'); assert.equal(played(), 0);
	});
});

test('R-24: 中止・context差替え・再開中のミュートでは遅延発音しない', async () => {
	for (const reason of ['abort', 'replace', 'mute']) await withAudio(async played => {
		soundManager.initContext(false);
		let release;
		soundManager.ctx.resume = () => new Promise(resolve => { release = resolve; });
		const controller = new AbortController();
		const pending = soundManager.testPlayback({ signal: controller.signal });
		const ctx = soundManager.ctx;
		if (reason === 'abort') controller.abort();
		if (reason === 'replace') soundManager.ctx = { state: 'running' };
		if (reason === 'mute') soundManager.setMuted(true);
		ctx.state = 'running'; release();
		assert.equal((await pending).state, reason === 'mute' ? 'muted' : 'cancelled');
		assert.equal(played(), 0);
	});
	await withAudio(async played => {
		const controller = new AbortController(); controller.abort();
		assert.equal((await soundManager.testPlayback({ signal: controller.signal })).state, 'cancelled'); assert.equal(played(), 0);
	});
});

test('R-24: 同期再開例外・再生例外も開始失敗として報告する', async () => {
	await withAudio(async played => {
		soundManager.initContext(false);
		soundManager.ctx.resume = () => { throw new Error('resume failed'); };
		assert.equal((await soundManager.testPlayback()).state, 'failed'); assert.equal(played(), 0);
		soundManager.ctx.state = 'running'; soundManager.playScanBeep = () => { throw new Error('play failed'); };
		assert.equal((await soundManager.testPlayback()).state, 'failed');
	});
});

test('R-24: 通常の再開失敗も観測し、旧contextの完了で現在の結果を上書きしない', async () => {
	await withAudio(async () => {
		soundManager.initContext(false);
		const ctx = soundManager.ctx;
		ctx.resume = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
		soundManager.unlock(); await new Promise(resolve => setTimeout(resolve, 0));
		assert.equal(soundManager.getStatus().lastErrorName, 'NotAllowedError');
		ctx.resume = () => { ctx.state = 'running'; return Promise.resolve(); };
		soundManager.initContext(); await Promise.resolve();
		assert.equal(soundManager.getStatus().lastErrorName, '');
		for (const reject of [false, true]) {
			ctx.state = 'suspended'; soundManager.ctx = ctx;
			let release;
			ctx.resume = () => new Promise((resolve, fail) => { release = reject ? fail : resolve; });
			soundManager.initContext(); soundManager.ctx = { state: 'running' }; soundManager.lastErrorName = 'current';
			release(new Error('old')); await new Promise(resolve => setTimeout(resolve, 0));
			assert.equal(soundManager.getStatus().lastErrorName, 'current');
		}
	});
});

test('R-24: 音声の再開拒否を握りつぶさず、確認音を予約しない', async () => {
	let played = 0;
	const original = soundManager.playScanBeep;
	try {
		globalThis.window = { AudioContext: class {
			state = 'suspended';
			resume() { return Promise.reject(new DOMException('blocked', 'NotAllowedError')); }
		} };
		soundManager.ctx = null; soundManager.setMuted(false);
		soundManager.playScanBeep = () => { played++; };
		const result = await soundManager.testPlayback();
		assert.equal(result.state, 'failed');
		assert.equal(result.errorName, 'NotAllowedError');
		assert.equal(played, 0);
	} finally { soundManager.playScanBeep = original; soundManager.ctx = null; delete globalThis.window; }
});

test('R-24: 振動のfalseと非対応・例外・アプリオフを区別する', () => {
	const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	try {
		hapticsManager.setEnabled(true);
		Object.defineProperty(globalThis, 'navigator', { value: { vibrate: () => false }, configurable: true });
		assert.equal(hapticsManager.testVibration().state, 'rejected');
		Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
		assert.equal(hapticsManager.testVibration().state, 'unsupported');
		assert.equal(hapticsManager.getStatus().supported, false);
		Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });
		assert.equal(hapticsManager.getStatus().supported, false);
		assert.equal(hapticsManager.testVibration().state, 'unsupported');
		Object.defineProperty(globalThis, 'navigator', { value: { vibrate() { throw new Error('denied'); } }, configurable: true });
		assert.equal(hapticsManager.testVibration().state, 'failed');
		hapticsManager.setEnabled(false);
		assert.equal(hapticsManager.testVibration().state, 'disabled');
	} finally { hapticsManager.setEnabled(true); Object.defineProperty(globalThis, 'navigator', original); }
});

test('R-24: 名前のない例外と時間切れ後の拒否でも状態を壊さない', async () => {
	await withAudio(async played => {
		soundManager.initContext(false);
		soundManager.ctx.resume = () => Promise.reject(null);
		soundManager.initContext(); await new Promise(resolve => setTimeout(resolve, 0));
		assert.equal(soundManager.getStatus().lastErrorName, 'Error');
		assert.equal((await soundManager.testPlayback()).errorName, 'Error');
		let reject;
		soundManager.ctx.resume = () => new Promise((resolve, fail) => { reject = fail; });
		assert.equal((await soundManager.testPlayback({ timeoutMs: 5 })).state, 'pending');
		soundManager.lastErrorName = 'newer'; reject(new Error('late'));
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.equal(soundManager.getStatus().lastErrorName, 'newer'); assert.equal(played(), 0);
	});
	try {
		soundManager.ctx = null; globalThis.window = { AudioContext: class { constructor() { throw null; } } };
		assert.equal((await soundManager.testPlayback()).errorName, 'Error');
	} finally { soundManager.ctx = null; delete globalThis.window; }
});
