import test from 'node:test';
import assert from 'node:assert/strict';
import { soundManager } from '../../js/core/audio.js';
import * as haptics from '../../js/core/haptics.js';
import { renderIcon } from '../../js/core/icons.js';
import { wakeLockManager } from '../../js/core/wakelock.js';

const methods = ['playPunch', 'playRestore', 'playRoll', 'playBallEjected', 'playScanBeep', 'playFanfare', 'playHotAlert', 'playSpecialUnlock'];
test('R-22: 音声の無音初期化・中断復帰・閉じたcontextの再生成と回転時刻の下限', async () => {
	let resumes = 0, buffers = 0;
	const starts = [];
	const random = Math.random;
	class AudioContext {
		state = 'suspended'; currentTime = 0; destination = {};
		resume() { resumes++; this.state = 'running'; return Promise.resolve(); }
		createBuffer() { return {}; }
		createBufferSource() { return { connect() {}, start() { buffers++; } }; }
		createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, start(t) { starts.push(t); }, stop() {} }; }
		createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
	}
	try {
		globalThis.window = { AudioContext }; soundManager.ctx = null;
		soundManager.unlock();
		assert.equal(buffers, 1);
		soundManager.ctx.state = 'interrupted';
		soundManager.unlock(); assert.equal(resumes, 2);
		const old = soundManager.ctx; old.state = 'closed';
		soundManager.unlock(); assert.notEqual(soundManager.ctx, old);
		Math.random = () => 0;
		soundManager.playRoll();
		assert.ok(starts.every(t => t >= 0));
	} finally { soundManager.ctx = null; delete globalThis.window; Math.random = random; }
});

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
	const feedback = Object.values(haptics).filter(fn => typeof fn === 'function');
	const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });
	for (const fn of feedback) fn();
	const patterns = [];
	Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (value) => patterns.push(value) }, configurable: true });
	haptics.vibratePunch(); haptics.vibrateRestore(); haptics.vibrateBingo();
	for (const level of ['single', 'double', 'triple_or_more', 'none']) haptics.vibrateReach(level);
	assert.deepEqual(patterns, [30, [40,30,40], [100,50,100,50,250], 60, [60,40,60], [80,40,80,40,100]]);
	haptics.vibrateRoll(); haptics.vibrateBallEjected();
	assert.deepEqual(patterns.at(-1), [60,40,100]);
	assert.ok(patterns.at(-2).length > 5);
	haptics.hapticsManager.setEnabled(false);
	assert.equal(haptics.hapticsManager.getEnabled(), false);
	assert.equal(patterns.at(-1), 0);
	const count = patterns.length;
	for (const fn of feedback) if (fn !== haptics.stopVibration) fn('single');
	assert.equal(patterns.length, count);
	haptics.hapticsManager.setEnabled(true);
	Object.defineProperty(globalThis, 'navigator', { value: { vibrate() { throw new Error('denied'); } }, configurable: true });
	for (const fn of feedback) assert.doesNotThrow(fn);
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
