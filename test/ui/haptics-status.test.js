import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser } from '../helpers/browser.js';
import { tap, reveal } from '../helpers/layout.js';
import { APP_VERSION } from '../../js/core/version.js';
let browser;
before(async () => { browser = await startBrowser(); });
after(async () => { await browser?.close(); });
const open = async page => { await page.click('#header-license-btn'); await page.wait('!!document.querySelector("#btn-test-vibration")'); };

test('R-24: 振動の拒否とゲーム情報を含まない確認情報を表示する', async () => {
	const page = await browser.page({ setup: `localStorage.setItem('private_game_data','PRIVATE-NAME');Object.defineProperty(navigator,'vibrate',{value:()=>false,configurable:true});` });
	try {
		const saved = await page.eval('JSON.stringify({...localStorage})');
		await open(page); await page.click('#btn-test-vibration');
		assert.equal(await page.eval('document.querySelector("#feedback-vibration-status").dataset.state'), 'rejected');
		const details = await page.eval('JSON.parse(document.querySelector("#feedback-details").value)');
		assert.equal(details.version, APP_VERSION); assert.equal(details.userActivated, true);
		assert.equal(details.haptics.lastResult, 'rejected');
		assert.equal('audio' in details, false);
		assert.equal(await page.eval('!!document.querySelector("#btn-test-sound")'), false);
		assert.equal(await page.eval('document.querySelector("#feedback-details").value.includes("PRIVATE-NAME")'), false);
		await page.click('section[aria-labelledby="feedback-heading"] summary'); await page.click('#feedback-details');
		assert.equal(await page.eval(`(()=>{const e=document.querySelector('#feedback-details');return e.selectionStart===0&&e.selectionEnd===e.value.length})()`), true);
		assert.equal(await page.eval(`document.querySelector('#feedback-details').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`), true);
		assert.equal(await page.eval('JSON.stringify({...localStorage})'), saved);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

for (const [state, api] of [['requested', '()=>true'], ['unsupported', 'undefined'], ['failed', '()=>{throw new Error("denied")}']]) {
	test(`R-24: 振動${state}を実出力の成功と混同しない`, async () => {
		const page = await browser.page({ setup: `Object.defineProperty(navigator,'vibrate',{value:${api},configurable:true});` });
		try {
			await open(page); await page.click('#btn-test-vibration');
			assert.equal(await page.eval('document.querySelector("#feedback-vibration-status").dataset.state'), state);
			assert.doesNotMatch(await page.eval('document.querySelector("#feedback-vibration-status").textContent'), /振動しました|振動しています/);
			assert.deepEqual(page.errors, []);
		} finally { await page.close(); }
	});
}

test('R-24: 振動確認で振動オフ設定とミュートを変更しない', async () => {
	const page = await browser.page();
	try {
		await page.click('#header-sound-btn'); await page.click('#header-haptics-btn');
		await open(page); await page.click('#btn-test-vibration');
		assert.equal(await page.eval('document.querySelector("#feedback-vibration-status").dataset.state'), 'disabled');
		assert.equal(await page.eval('localStorage.mobingo_haptics_enabled'), 'false');
		assert.equal(await page.eval(`import('/js/core/audio.js').then(({soundManager})=>soundManager.getMuted())`), true);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

test('R-24: 閉じた旧ボタンからの振動要求と旧表示の更新を防ぐ', async () => {
	const page = await browser.page({ setup: `window.patterns=[];Object.defineProperty(navigator,'vibrate',{value:value=>{patterns.push(value);return true},configurable:true});` });
	try {
		await open(page); await page.click('#btn-test-vibration');
		await page.eval(`window.oldVibration=document.querySelector('#btn-test-vibration');window.oldStatus=document.querySelector('#feedback-vibration-status');window.oldText=oldStatus.textContent;window.oldCount=patterns.length;`);
		await page.click('#close-license-btn'); await open(page);
		await page.eval(`oldVibration.dispatchEvent(new MouseEvent('click',{bubbles:true}));`);
		assert.equal(await page.eval('patterns.length'), await page.eval('oldCount'));
		assert.equal(await page.eval('oldStatus.textContent'), await page.eval('oldText'));
		assert.equal(await page.eval('document.querySelector("#feedback-vibration-status").textContent'), '');
		assert.deepEqual(await page.eval('patterns'), [200]);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

test('R-24: standalone・利用者操作情報非対応も確認情報で区別する', async () => {
	const page = await browser.page({ setup: `const media=window.matchMedia.bind(window);window.matchMedia=query=>query==='(display-mode: standalone)'?{matches:true}:media(query);Object.defineProperty(navigator,'userActivation',{value:undefined,configurable:true});` });
	try {
		await open(page);
		const details = await page.eval('JSON.parse(document.querySelector("#feedback-details").value)');
		assert.equal(details.displayMode, 'standalone'); assert.equal(details.userActivated, null);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

for (const [width, height] of [[320, 568], [640, 280]]) {
	test(`R-24: ${width}×${height}で振動確認・情報・閉じるへ実touchで到達する`, async () => {
		const page = await browser.page({ width, height, mobile: true, setup: `Object.defineProperty(navigator,'vibrate',{value:()=>true,configurable:true});` });
		try {
			await tap(page, '#header-license-btn');
			for (const selector of ['#btn-test-vibration', 'section[aria-labelledby="feedback-heading"] summary']) await tap(page, selector, '#license-modal .modal-content');
			await reveal(page, '#feedback-details', '#license-modal .modal-content');
			assert.equal(await page.eval('JSON.parse(document.querySelector("#feedback-details").value).version'), APP_VERSION);
			await tap(page, '#close-license-bottom-btn', '#license-modal .modal-content');
			assert.equal(await page.eval('!!document.querySelector("#license-modal")'), false);
			assert.deepEqual(page.errors, []);
		} finally { await page.close(); }
	});
}
