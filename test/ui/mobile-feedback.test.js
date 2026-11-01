import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, delay } from '../helpers/browser.js';
import { reveal, visible } from '../helpers/layout.js';
import { generateBingoCard, generateDrawSequence } from '../../js/core/bingo.js';

let browser;
before(async () => { browser = await startBrowser(); });
after(async () => { await browser?.close(); });
const parent = (turn = 0, extra = {}) => ({ parentSeed: '1234', mode: 'mode_b', currentTurn: turn, specialRuleTurn: null, registeredChildSeeds: [], ...extra });
const child = (coords = ['2,2']) => ({ childSeed: 'ABCD', openedCellCoords: coords, specialRuleActive: false });
const setup = (mode, state) => `if(!window.sessionStorage.seeded){localStorage.setItem('mobingo_app_mode','${mode}');localStorage.setItem('mobingo_${mode === 'host' ? 'parent' : 'child'}_state',${JSON.stringify(JSON.stringify(state))});sessionStorage.seeded='1';}`;
const timers = `window.gameTimers=[];const timeout=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>{if([1800,2300,5000].includes(ms)){const id=timeout(()=>{},60000);gameTimers.push({fn,ms,id});return id;}return timeout(fn,ms,...args);};`;
const vibration = `window.vibrations=[];Object.defineProperty(navigator,'vibrate',{value:p=>{vibrations.push(p);return true;},configurable:true});`;

for (const width of [320, 360, 390]) {
	test(`R-22: ${width}pxの両役割ヘッダーでラベルが縦折れせず全操作を収める`, async () => {
		for (const mode of ['host', 'child']) {
			const page = await browser.page({ width, mobile: true, setup: setup(mode, mode === 'host' ? parent() : child()) });
			try {
				await page.wait(mode === 'host' ? '!!document.querySelector("#slide-thumb")' : '!!document.querySelector("#bingo-cells-grid")');
				for (const selector of ['#header-logo-btn', '#header-haptics-btn', '#header-sound-btn', '#header-switch-mode-btn', '#header-license-btn', ...(mode === 'host' ? ['#btn-projector'] : [])]) {
					await visible(page, selector, true);
				}
				const badge = await page.eval(`(()=>{const e=document.querySelector('.app-header .badge'),r=e.getBoundingClientRect();return {height:r.height,width:r.width}})()`);
				assert.ok(badge.height <= 25, JSON.stringify({ mode, width, badge }));
				assert.ok(await page.eval('document.querySelector(".logo-icon").getBoundingClientRect().width>=27'));
				assert.deepEqual(page.errors, []);
			} finally { await page.close(); }
		}
	});
}

async function touchDrag(page, ratio = 1) {
	const r = await reveal(page, '#slide-thumb', '.host-dashboard-left');
	const distance = await page.eval(`document.querySelector('#slide-track').clientWidth-document.querySelector('#slide-thumb').clientWidth-8`);
	const x = r.left + r.width / 2, y = r.top + r.height / 2;
	await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
	for (let step = 1; step <= 5; step++) {
		await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + distance * ratio * step / 5, y, id: 1 }] });
	}
	await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await page.wait('!document.querySelector("#slide-thumb").classList.contains("animating")');
}

test('R-22: 実touchの球表示タップ・連続スライドとスクロール位置維持', async () => {
	const page = await browser.page({ width: 640, height: 280, mobile: true, setup: setup('host', parent()) + timers + vibration });
	try {
		await page.wait('!!document.querySelector("#slide-thumb")');
		await touchDrag(page);
		assert.equal(await page.eval('gameTimers.at(-1).ms'), 2300);
		await page.eval('gameTimers.at(-1).fn()');
		await reveal(page, '#slide-thumb', '.host-dashboard-left');
		const scroll = await page.eval('document.querySelector(".host-dashboard-left").scrollTop');
		assert.ok(scroll > 0);
		await page.tap('#slide-thumb');
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).currentTurn'), 1);
		assert.doesNotMatch(await page.eval('document.querySelector("#barrel-status-hint").textContent'), /回転中/);
		assert.ok(Math.abs(await page.eval('document.querySelector(".host-dashboard-left").scrollTop') - scroll) < 2);
		await visible(page, '#slide-thumb', true);
		await touchDrag(page);
		await page.eval('gameTimers.at(-1).fn()');
		await touchDrag(page, 0.4);
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).currentTurn'), 1);
		await touchDrag(page);
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).currentTurn'), 2);
		assert.match(await page.eval('document.querySelector("#barrel-status-hint").textContent'), /回転中/);
		await visible(page, '#slide-thumb', true);
		await page.eval('gameTimers.at(-1).fn()');
		await page.eval('gameTimers.at(-1).fn()');
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).currentTurn'), 3);
		await visible(page, '#slide-thumb', true);
		const patterns = await page.eval('vibrations');
		assert.ok(patterns.some(p => Array.isArray(p) && p.length > 5));
		assert.ok(patterns.some(p => Array.isArray(p) && p.join() === '60,40,100'));
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

test('R-22: 最終球表示中のスライドは75球で停止する', async () => {
	const page = await browser.page({ setup: setup('host', parent(74)) + timers });
	try {
		await page.wait('!!document.querySelector("#slide-thumb")');
		await page.drag(); await page.click('#wheel-arena'); await page.drag();
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).currentTurn'), 75);
		assert.equal(await page.eval('document.querySelector("#slide-track").classList.contains("disabled")'), true);
		assert.doesNotMatch(await page.eval('document.querySelector("#barrel-status-hint").textContent'), /回転中/);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

test('R-22: スライド背景タップと旧リセットの再配送で余分な確定・削除をしない', async () => {
	const page = await browser.page({ setup: setup('host', parent()) + timers });
	try {
		await page.wait('!!document.querySelector("#slide-thumb")');
		await page.click('#slide-track');
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).currentTurn'), 0);
		await page.drag(); await page.click('#slide-track');
		assert.match(await page.eval('document.querySelector("#barrel-status-hint").textContent'), /回転中/);
		await page.click('#wheel-arena'); await page.click('#slide-track');
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).currentTurn'), 1);
		await page.eval('window.oldReset=document.querySelector("#btn-reset-game");window.confirmations=0;window.confirm=()=>{confirmations++;return true}');
		await page.click('#btn-reset-game'); await page.eval('oldReset.click()');
		assert.equal(await page.eval('confirmations'), 2);
		assert.equal(await page.eval('localStorage.getItem("mobingo_parent_state")'), null);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

test('R-22: 振動オン・オフを役割変更後のヘッダーへ反映し、ミュートと独立に保つ', async () => {
	const page = await browser.page();
	try {
		await page.click('#header-sound-btn'); await page.click('#header-haptics-btn');
		await page.click('#btn-select-child');
		assert.equal(await page.eval('document.querySelector("#header-haptics-btn").getAttribute("aria-pressed")'), 'false');
		await page.click('#header-haptics-btn');
		assert.equal(await page.eval('document.querySelector("#header-haptics-btn").getAttribute("aria-pressed")'), 'true');
		await page.click('#header-switch-mode-btn'); await page.click('#header-haptics-btn');
		await page.click('#btn-select-host');
		assert.equal(await page.eval('document.querySelector("#header-haptics-btn").getAttribute("aria-pressed")'), 'false');
		await page.click('#header-haptics-btn');
		assert.equal(await page.eval(`(async()=>{const {soundManager}=await import('/js/core/audio.js');return soundManager.getMuted();})()`), true);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

test('R-16/22: 受付確定中の遅延操作を拒否し、順位背景を閉じて操作に戻れる', async () => {
	const page = await browser.page({ setup: `window.cardPending=[];const derive=crypto.subtle.deriveBits.bind(crypto.subtle);crypto.subtle.deriveBits=async(...args)=>{const result=await derive(...args);if(!new TextDecoder().decode(args[0].salt).includes('mobingo:card'))return result;return new Promise(resolve=>cardPending.push(()=>resolve(result)));};` });
	try {
		await page.click('#btn-select-host'); await page.click('#opt-mode-a'); await page.click('#btn-host-proceed');
		await page.input('#scanner-manual-input', 'ABCD'); await page.click('#scanner-manual-form button'); await page.click('#scanner-finish-btn');
		await page.wait('cardPending.length===1');
		await page.eval(`for(const selector of ['.remove-chip-btn','#scanner-back-btn','#scanner-finish-btn'])document.querySelector(selector).dispatchEvent(new MouseEvent('click',{bubbles:true}));document.querySelector('#scanner-manual-input').value='ZZZZ';document.querySelector('#scanner-manual-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));`);
		assert.equal(await page.eval('document.querySelector("#scanner-count").textContent'), '1');
		assert.equal(await page.eval('localStorage.getItem("mobingo_parent_state")'), null);
		await page.eval('cardPending.shift()()'); await page.wait('!!document.querySelector("#slide-thumb")');
		assert.deepEqual(await page.eval('JSON.parse(localStorage.mobingo_parent_state).registeredChildSeeds'), ['ABCD']);
		await page.click('#btn-winner-ranking');
		await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 2, y: 2, button: 'left', clickCount: 1 });
		await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 2, y: 2, button: 'left', clickCount: 1 });
		assert.equal(await page.eval('!!document.querySelector("#winner-ranking-modal")'), false);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

for (const [width, height] of [[320, 568], [640, 280]]) {
	test(`R-22: ${width}×${height}のQR用途・リセット分離・振動切替と保存`, async () => {
		const page = await browser.page({ width, height, mobile: true, setup: setup('child', child()) + vibration });
		try {
			await page.wait('!!document.querySelector("#bingo-cells-grid")');
			await visible(page, '#header-haptics-btn', true);
			const panel = width > height ? '.child-landscape-panel' : '.child-portrait-footer';
			assert.match(await page.eval(`document.querySelector('${panel} .btn-action-show-qr').textContent`), /参加登録・照合/);
			const separator = await page.eval(`(()=>{const e=document.querySelector('${panel} .child-reset-section'),s=getComputedStyle(e);return {border:parseFloat(s.borderTopWidth),space:parseFloat(s.paddingTop)}})()`);
			assert.ok(separator.border >= 1 && separator.space >= 8);
			await page.tap('[data-coord="0,0"]'); await delay(200);
			assert.ok((await page.eval('vibrations')).includes(30));
			await page.tap('#header-haptics-btn');
			assert.equal(await page.eval('document.querySelector("#header-haptics-btn").getAttribute("aria-pressed")'), 'false');
			const count = await page.eval('vibrations.length');
			await page.tap('[data-coord="0,1"]'); await delay(200);
			assert.equal(await page.eval('vibrations.length'), count);
			assert.equal(await page.eval('localStorage.mobingo_haptics_enabled'), 'false');
			await page.reload(); await page.wait('!!document.querySelector("#bingo-cells-grid")');
			assert.equal(await page.eval('document.querySelector("#header-haptics-btn").getAttribute("aria-pressed")'), 'false');
			await page.tap('#header-haptics-btn');
			await page.pointer('[data-coord="0,0"]', 'pointerdown'); await delay(650);
			await page.pointer('[data-coord="0,0"]', 'pointerup'); await delay(200);
			assert.ok(await page.eval('vibrations.some(p=>Array.isArray(p)&&p.join()==="40,30,40")'));
			assert.deepEqual(page.errors, []);
		} finally { await page.close(); }
	});
}

test('R-22: touchendでの音声解除を繰り返し、中断後も再開する', async () => {
	const page = await browser.page({ mobile: true, setup: `window.resumes=0;window.warmed=0;window.AudioContext=class{state='suspended';currentTime=0;destination={};resume(){resumes++;if(window.allowAudio)this.state='running';return Promise.resolve();}createBuffer(){return {};}createBufferSource(){return {connect(){},start(){warmed++;},set buffer(v){}};}};` });
	try {
		await page.tap('#header-license-btn'); await page.tap('#close-license-btn');
		await page.eval('window.allowAudio=true;window.previousResumes=resumes;window.dispatchEvent(new Event("touchend"))');
		assert.ok(await page.eval('resumes>previousResumes && warmed>0'));
		await page.eval(`(async()=>{const {soundManager}=await import('/js/core/audio.js');soundManager.ctx.state='interrupted';window.previousResumes=resumes;})()`);
		await page.tap('#header-license-btn');
		assert.ok(await page.eval('resumes>previousResumes'));
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

for (const mode of ['child', 'host']) {
	test(`R-22: ${mode}のSW再訪後、実touchから実Web Audioに効果音の信号が流れる`, async () => {
		const probe = `
			window.audioPeaks={};window.audioMethod='';
			const NativeAudioContext=window.AudioContext;
			window.AudioContext=class extends NativeAudioContext {
				constructor(){
					super();this.probe=super.createAnalyser();this.probe.fftSize=512;this.probe.connect(this.destination);
					const samples=new Float32Array(512);
					setInterval(()=>{this.probe.getFloatTimeDomainData(samples);const peak=Math.max(...samples.map(Math.abs));if(window.audioMethod)audioPeaks[audioMethod]=Math.max(audioPeaks[audioMethod]||0,peak);},5);
				}
				createGain(){const gain=super.createGain(),connect=gain.connect.bind(gain);gain.connect=(target,...args)=>connect(target===this.destination?this.probe:target,...args);return gain;}
			};`;
		const page = await browser.page({ width: 412, height: 915, mobile: true, setup: setup(mode, mode === 'host' ? parent() : child()) + probe });
		try {
			await page.wait('!!navigator.serviceWorker.controller', 10000);
			await page.reload();
			await page.wait(mode === 'host' ? '!!document.querySelector("#slide-thumb")' : '!!document.querySelector("#bingo-cells-grid")');
			await page.eval(`(async()=>{const {soundManager}=await import('/js/core/audio.js');window.sound=soundManager;for(const method of ['playPunch','playRestore','playRoll','playBallEjected']){const play=soundManager[method].bind(soundManager);soundManager[method]=(...args)=>{window.audioMethod=method;return play(...args);};}})()`);
			assert.equal(await page.eval('sound.ctx'), null);
			if (mode === 'child') {
				await page.tap('[data-coord="0,0"]');
				await page.wait('audioPeaks.playPunch>0.01 && sound.ctx.state==="running"');
				await delay(200);
				await page.eval('sound.ctx.suspend()');
				const r = await visible(page, '[data-coord="0,0"]', true);
				await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.left + r.width / 2, y: r.top + r.height / 2, id: 1 }] });
				await page.wait('audioPeaks.playRestore>0.01 && sound.ctx.state==="running"');
				await page.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			} else {
				await touchDrag(page);
				await page.wait('audioPeaks.playRoll>0.01 && sound.ctx.state==="running"');
				await page.wait('audioPeaks.playBallEjected>0.01', 5000);
			}
			assert.deepEqual(page.errors, []);
		} finally { await page.close(); }
	});
}

const sequence = await generateDrawSequence('1234');
// 全員達成の境界は製品の判定関数を使わず、12本を独立に構成する。
function firstWinTurn(card) {
	const lines = [...card.grid, ...Array.from({ length: 5 }, (_, col) => card.grid.map(row => row[col])), card.grid.map((row, i) => row[i]), card.grid.map((row, i) => row[4-i])];
	return Math.min(...lines.map(line => Math.max(...line.map(cell => cell.value === 0 ? 0 : sequence.indexOf(cell.value) + 1))));
}
const winTurn = firstWinTurn(await generateBingoCard('ABCD'));
const otherWinTurn = firstWinTurn(await generateBingoCard('ZZZZ'));
assert.notEqual(winTurn, otherWinTurn);
for (const [name, mode, state, expected] of [
	['参加者未達成', 'child', child(), 2],
	['参加者ビンゴ', 'child', child(['2,2', '0,0', '0,1', '0,2', '0,3', '0,4']), 1],
	['開催者進行中', 'host', parent(1), 2],
	['開催者75球終了', 'host', parent(75), 1],
	['モードA全員達成直前', 'host', parent(winTurn - 1, { mode: 'mode_a', registeredChildSeeds: ['ABCD'] }), 2],
	['モードA全員達成', 'host', parent(winTurn, { mode: 'mode_a', registeredChildSeeds: ['ABCD'] }), 1],
	['モードA一部のみ達成', 'host', parent(Math.min(winTurn, otherWinTurn), { mode: 'mode_a', registeredChildSeeds: ['ABCD', 'ZZZZ'] }), 2],
	['モードA複数人全員達成', 'host', parent(Math.max(winTurn, otherWinTurn), { mode: 'mode_a', registeredChildSeeds: ['ABCD', 'ZZZZ'], specialRuleTurn: 0 }), 1],
	['参加者特殊役のみ達成', 'child', { ...child(['2,2', '0,0', '0,4', '4,0', '4,4']), specialRuleActive: true }, 1],
	['モードA受付0人', 'host', parent(1, { mode: 'mode_a' }), 2],
	['モードB照合済みは全員とみなさない', 'host', parent(winTurn, { verifiedChildSeeds: ['ABCD'] }), 2],
]) {
	test(`R-22: ${name}のリセット確認${expected}回と取消`, async () => {
		const page = await browser.page({ setup: setup(mode, state) });
		try {
			const selector = mode === 'child' ? '.child-portrait-footer .btn-action-reset-card' : '#btn-reset-game';
			await page.wait(`!!document.querySelector('${selector}')`);
			if (mode === 'child' && expected === 1) { await page.wait('!!document.querySelector("#child-qr-modal")'); await page.click('#close-qr-btn'); }
			const key = `mobingo_${mode === 'host' ? 'parent' : 'child'}_state`;
			for (let cancelAt = 1; cancelAt <= expected; cancelAt++) {
				await page.eval(`window.confirmations=[];window.confirm=message=>{confirmations.push(message);return confirmations.length!==${cancelAt}}`);
				await page.click(selector);
				assert.equal(await page.eval('confirmations.length'), cancelAt);
				assert.deepEqual(await page.eval(`JSON.parse(localStorage.getItem('${key}'))`), state);
			}
			await page.eval('window.confirmations=[];window.confirm=message=>{confirmations.push(message);return true}');
			await page.click(selector);
			assert.equal(await page.eval('confirmations.length'), expected);
			assert.equal(await page.eval(`localStorage.getItem('${key}')`), null);
			assert.deepEqual(page.errors, []);
		} finally { await page.close(); }
	});
}

for (const turn of [74, winTurn - 1]) {
	test(`R-22: ${turn + 1}球目表示中も終了条件を反映する`, async () => {
		const page = await browser.page({ setup: setup('host', parent(turn, { mode: 'mode_a', registeredChildSeeds: ['ABCD'] })) + timers });
		try {
			await page.wait('!!document.querySelector("#slide-thumb")');
			await page.drag(); await page.click('#wheel-arena');
			await page.eval('window.confirmations=[];window.confirm=message=>{confirmations.push(message);return true}');
			await page.click('#btn-reset-game');
			assert.equal(await page.eval('confirmations.length'), 1);
			assert.equal(await page.eval('localStorage.getItem("mobingo_parent_state")'), null);
			assert.deepEqual(page.errors, []);
		} finally { await page.close(); }
	});
}
