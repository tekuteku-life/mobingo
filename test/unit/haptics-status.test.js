import test from 'node:test';
import assert from 'node:assert/strict';
import { hapticsManager } from '../../js/core/haptics.js';

test('R-24: 振動の拒否・非対応・例外・設定オフと要求受付を区別する', () => {
	const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	try {
		hapticsManager.setEnabled(true);
		Object.defineProperty(globalThis, 'navigator', { value: { vibrate: () => false }, configurable: true });
		assert.equal(hapticsManager.testVibration().state, 'rejected');
		assert.equal(hapticsManager.getStatus().lastResult, 'rejected');
		for (const navigator of [{}, undefined]) {
			Object.defineProperty(globalThis, 'navigator', { value: navigator, configurable: true });
			assert.equal(hapticsManager.getStatus().supported, false);
			assert.equal(hapticsManager.testVibration().state, 'unsupported');
		}
		Object.defineProperty(globalThis, 'navigator', { value: { vibrate() { throw new Error('denied'); } }, configurable: true });
		assert.equal(hapticsManager.testVibration().state, 'failed');
		hapticsManager.setEnabled(false);
		assert.equal(hapticsManager.testVibration().state, 'disabled');
		const patterns = [];
		Object.defineProperty(globalThis, 'navigator', { value: { vibrate: value => { patterns.push(value); return true; } }, configurable: true });
		hapticsManager.setEnabled(true);
		const result = hapticsManager.testVibration();
		assert.deepEqual(patterns, [200]);
		assert.equal(result.state, 'requested');
		result.state = 'changed';
		assert.deepEqual(hapticsManager.getStatus(), { enabled: true, supported: true, lastResult: 'requested' });
	} finally {
		hapticsManager.setEnabled(true);
		Object.defineProperty(globalThis, 'navigator', original);
	}
});
