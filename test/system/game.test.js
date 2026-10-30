import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser } from '../helpers/browser.js';

let browser;
before(async () => { browser = await startBrowser(); });
after(async () => { await browser?.close(); });

test('R-01/07/08/12: モードB開始→抽選→保存→復元→Undo→リセット', async () => {
	const page = await browser.page();
	try {
		await page.click('#btn-select-host');
		await page.input('#host-seed-input', '1234');
		await page.click('#btn-host-proceed');
		await page.wait('!!document.querySelector("#slide-thumb")');
		await page.drag(); await page.click('#wheel-arena');
		await page.wait('document.querySelector("#latest-ball-tag").textContent.includes("第1手")');
		await page.click('#wheel-arena');
		await page.wait('JSON.parse(localStorage.mobingo_parent_state).currentTurn === 1');
		await page.reload();
		await page.wait('!!document.querySelector("#btn-undo-ball")');
		assert.match(await page.eval('document.querySelector("#latest-ball-tag").textContent'), /第1手/);
		await page.click('#btn-undo-ball');
		await page.wait('JSON.parse(localStorage.mobingo_parent_state).currentTurn === 0');
		await page.click('#btn-reset-game');
		await page.wait('!!document.querySelector("#host-seed-input")');
		assert.equal(await page.eval('localStorage.getItem("mobingo_parent_state")'), null);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

test('R-09: モードA受付・重複・削除・ゲーム開始', async () => {
	const page = await browser.page();
	try {
		await page.click('#btn-select-host'); await page.click('#opt-mode-a');
		await page.input('#host-seed-input', '1234'); await page.click('#btn-host-proceed');
		assert.equal(await page.eval('document.querySelector("#scanner-finish-btn").disabled'), true);
		for (const seed of ['ABCD', 'ABCD', 'ZZZZ']) {
			await page.input('#scanner-manual-input', seed); await page.click('#scanner-manual-form button');
		}
		assert.equal(await page.eval('document.querySelector("#scanner-count").textContent'), '2');
		await page.click('.remove-chip-btn[data-seed="ZZZZ"]');
		assert.equal(await page.eval('document.querySelector("#scanner-count").textContent'), '1');
		await page.click('#scanner-finish-btn'); await page.wait('!!document.querySelector("#slide-thumb")');
		assert.deepEqual(await page.eval('JSON.parse(localStorage.mobingo_parent_state).registeredChildSeeds'), ['ABCD']);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

test('R-13: SW制御後、通信遮断して参加者カードを再訪する', async () => {
	const page = await browser.page();
	try {
		await page.wait('!!navigator.serviceWorker.controller', 10000);
		await page.click('#btn-select-child'); await page.input('#child-seed-input', 'ABCD'); await page.click('#btn-start-card');
		await page.wait('!!document.querySelector("#bingo-cells-grid")');
		const original = await page.eval('document.querySelector("#bingo-cells-grid").textContent');
		await page.cdp.send('Network.emulateNetworkConditions', { offline:true, latency:0, downloadThroughput:0, uploadThroughput:0 });
		await page.reload(); await page.wait('!!document.querySelector("#bingo-cells-grid")');
		assert.equal(await page.eval('document.querySelector("#bingo-cells-grid").textContent'), original);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});
