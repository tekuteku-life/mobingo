import test from 'node:test';
import assert from 'node:assert/strict';
import { soundManager } from '../../js/core/audio.js';
import * as haptics from '../../js/core/haptics.js';
import { renderIcon } from '../../js/core/icons.js';
import { wakeLockManager } from '../../js/core/wakelock.js';

const methods = ['playPunch', 'playRestore', 'playRoll', 'playBallEjected', 'playScanBeep', 'playFanfare', 'playHotAlert', 'playSpecialUnlock'];
test('R-15: 音声非対応・ミュート・全効果音のAPI呼出し', () => {
	delete globalThis.window;
	for (const method of methods) soundManager[method]();
	soundManager.unlock();
	globalThis.window = {};
	for (const method of methods) soundManager[method]();
	soundManager.setMuted(true);
	assert.equal(soundManager.getMuted(), true);
	for (const method of methods) soundManager[method]();
	soundManager.setMuted(false);
	let started = 0;
	const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} };
	class AudioContext {
		state = 'suspended'; currentTime = 0; destination = {};
		resume() { this.state = 'running'; return Promise.resolve(); }
		createOscillator() { return { frequency: param, connect() {}, start() { started++; }, stop() {} }; }
		createGain() { return { gain: param, connect() {} }; }
	}
	globalThis.window = { AudioContext };
	soundManager.unlock();
	for (const method of methods) soundManager[method]();
	assert.ok(started > 40);
	soundManager.ctx = null;
	globalThis.window = { webkitAudioContext: AudioContext };
	soundManager.unlock(); assert.ok(soundManager.ctx);
	soundManager.ctx = null; delete globalThis.window;
});

test('R-15: 振動非対応・例外・全パターン', () => {
	const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });
	for (const fn of Object.values(haptics)) fn();
	const patterns = [];
	Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (value) => patterns.push(value) }, configurable: true });
	haptics.vibratePunch(); haptics.vibrateRestore(); haptics.vibrateBingo();
	for (const level of ['single', 'double', 'triple_or_more', 'none']) haptics.vibrateReach(level);
	assert.deepEqual(patterns, [30, [40,30,40], [100,50,100,50,250], 60, [60,40,60], [80,40,80,40,100]]);
	Object.defineProperty(globalThis, 'navigator', { value: { vibrate() { throw new Error('denied'); } }, configurable: true });
	for (const fn of Object.values(haptics)) assert.doesNotThrow(fn);
	assert.doesNotThrow(()=>haptics.vibrateReach("single"));
	Object.defineProperty(globalThis, 'navigator', original);
});

test('R-15: Wake Lock取得・解放・表示復帰・拒否', async () => {
	const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	let releaseListener, released = 0;
	const sentinel = { addEventListener: (_, fn) => { releaseListener = fn; }, release: async () => { released++; } };
	Object.defineProperty(globalThis, 'navigator', { value: { wakeLock: { request: async () => sentinel } }, configurable: true });
	await wakeLockManager.request(); assert.equal(wakeLockManager.sentinel, sentinel);
	releaseListener(); assert.equal(wakeLockManager.sentinel, null);
	globalThis.document = { visibilityState: 'visible' };
	await wakeLockManager.handleVisibilityChange();
	wakeLockManager.release(); assert.equal(released, 1);
	wakeLockManager.release();
	await wakeLockManager.handleVisibilityChange(); assert.equal(wakeLockManager.sentinel, null);
	Object.defineProperty(globalThis, 'navigator', { value: { wakeLock: { request: async () => { throw new Error('denied'); } } }, configurable: true });
	await wakeLockManager.request();
	Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true }); await wakeLockManager.request();
	delete globalThis.document; Object.defineProperty(globalThis, 'navigator', original);
});

test('R-15: 全SVGアイコンと既定値を描画する', () => {
	for (const name of ['volume','volume-x','refresh','shield','smartphone','users','sparkles','dices','arrow-right','trophy','bell','star','qrcode','close','check','camera','keyboard','tv','flame','undo','award','unknown']) {
		assert.match(renderIcon(name), /^<svg .*width="20"/);
		assert.match(renderIcon(name, 32, 'icon'), /width="32".*class="icon"/);
	}
});

test('R-15: AudioContext生成失敗をゲーム操作へ伝播させない',()=>{
	globalThis.window={AudioContext:class{constructor(){throw new Error('audio denied');}}};
	soundManager.ctx=null;
	assert.doesNotThrow(()=>soundManager.unlock());
	for(const method of methods)assert.doesNotThrow(()=>soundManager[method]());
	delete globalThis.window;
});
