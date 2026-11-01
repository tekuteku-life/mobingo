import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser } from '../helpers/browser.js';
import { tap, reveal } from '../helpers/layout.js';
import { APP_VERSION } from '../../js/core/version.js';
let browser;
before(async () => { browser = await startBrowser(); });
after(async () => { await browser?.close(); });
const open = async page => { await page.click('#header-license-btn'); await page.wait('!!document.querySelector("#btn-test-sound")'); };

test('R-24: 実AudioContextへ確認音を要求し、振動の拒否とゲーム情報を含まない確認情報を表示する', async () => {
	const page = await browser.page({ setup: `localStorage.setItem('private_game_data','PRIVATE-NAME');Object.defineProperty(navigator,'vibrate',{value:()=>false,configurable:true});` });
	try {
		const saved = await page.eval('JSON.stringify({...localStorage})');
		await open(page); await page.click('#btn-test-sound');
		await page.wait('document.querySelector("#feedback-sound-status").dataset.state==="requested"');
		await page.click('#btn-test-vibration');
		assert.equal(await page.eval('document.querySelector("#feedback-vibration-status").dataset.state'), 'rejected');
		const details = await page.eval('JSON.parse(document.querySelector("#feedback-details").value)');
		assert.equal(details.version, APP_VERSION); assert.equal(details.audio.contextState, 'running');
		assert.equal(details.userActivated, true); assert.equal(details.haptics.lastResult, 'rejected');
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

test('R-24: アプリのミュート・振動オフ設定を確認操作で変更しない', async () => {
	const page = await browser.page();
	try {
		await page.click('#header-sound-btn'); await page.click('#header-haptics-btn');
		await open(page); await page.click('#btn-test-sound'); await page.click('#btn-test-vibration');
		await page.wait('document.querySelector("#feedback-sound-status").dataset.state==="muted"');
		assert.equal(await page.eval('document.querySelector("#feedback-vibration-status").dataset.state'), 'disabled');
		assert.equal(await page.eval('localStorage.mobingo_haptics_enabled'), 'false');
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

for (const [state, setup] of [
	['unsupported', `window.AudioContext=undefined;window.webkitAudioContext=undefined;`],
	['failed', `window.AudioContext=class{state='suspended';resume(){return Promise.reject(new DOMException('denied','NotAllowedError'))}};`],
	['pending', `window.AudioContext=class{state='suspended';resume(){return new Promise(()=>{})}};`],
	['cancelled', `window.AudioContext=class{state='suspended';resume(){return new Promise(resolve=>window.finishAudio=()=>{this.state='running';resolve()})}};`],
]) {
	test(`R-24: 音声${state}を画面上で区別し、再試行できる`, async () => {
		const page = await browser.page({ setup });
		try {
			await open(page); await page.click('#btn-test-sound');
			if (state === 'cancelled') await page.eval(`(async()=>{const {soundManager}=await import('/js/core/audio.js');soundManager.ctx={state:'running'};finishAudio();})()`);
			await page.wait(`document.querySelector('#feedback-sound-status').dataset.state==='${state}'`);
			assert.equal(await page.eval('document.querySelector("#btn-test-sound").disabled'), false);
			assert.deepEqual(page.errors, []);
		} finally { await page.close(); }
	});
}

test('R-24: 音声確認の保留中に閉じた場合、遅延発音・旧画面更新・連打を防ぐ', async () => {
	const page = await browser.page({ setup: `window.resumePromise=new Promise(resolve=>window.resumeAudio=resolve);window.AudioContext=class{state='suspended';resume(){return resumePromise}};` });
	try {
		await open(page);
		await page.eval(`(async()=>{const {soundManager}=await import('/js/core/audio.js');window.sound=soundManager;window.probes=0;window.beeps=0;soundManager.playScanBeep=()=>beeps++;const probe=soundManager.testPlayback.bind(soundManager);soundManager.testPlayback=(...args)=>{probes++;return probe(...args)};})()`);
		await page.click('#btn-test-sound');
		await page.eval(`window.oldSound=document.querySelector('#btn-test-sound');window.oldVibration=document.querySelector('#btn-test-vibration');window.oldStatus=document.querySelector('#feedback-sound-status');window.oldText=oldStatus.textContent;oldSound.dispatchEvent(new MouseEvent('click',{bubbles:true}));`);
		assert.equal(await page.eval('probes'), 1);
		await page.click('#close-license-btn'); await open(page);
		await page.eval(`sound.ctx.state='running';resumeAudio();resumePromise.then(()=>new Promise(resolve=>setTimeout(resolve,0)))`);
		assert.equal(await page.eval('beeps'), 0);
		assert.equal(await page.eval('oldStatus.textContent'), await page.eval('oldText'));
		assert.equal(await page.eval('document.querySelector("#feedback-sound-status").textContent'), '');
		await page.eval(`oldSound.dispatchEvent(new MouseEvent('click',{bubbles:true}));oldVibration.dispatchEvent(new MouseEvent('click',{bubbles:true}));`);
		assert.equal(await page.eval('probes'), 1);
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
	test(`R-24: ${width}×${height}で確認操作と情報・閉じるへ実touchで到達する`, async () => {
		const page = await browser.page({ width, height, mobile: true, setup: `Object.defineProperty(navigator,'vibrate',{value:()=>true,configurable:true});` });
		try {
			await tap(page, '#header-license-btn');
			for (const selector of ['#btn-test-sound', '#btn-test-vibration', 'section[aria-labelledby="feedback-heading"] summary']) await tap(page, selector, '#license-modal .modal-content');
			await reveal(page, '#feedback-details', '#license-modal .modal-content');
			assert.equal(await page.eval('JSON.parse(document.querySelector("#feedback-details").value).version'), APP_VERSION);
			await tap(page, '#close-license-bottom-btn', '#license-modal .modal-content');
			assert.equal(await page.eval('!!document.querySelector("#license-modal")'), false);
			assert.deepEqual(page.errors, []);
		} finally { await page.close(); }
	});
}
