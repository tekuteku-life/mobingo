import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, delay } from '../helpers/browser.js';

let browser;
before(async () => { browser = await startBrowser(); });
after(async () => { await browser?.close(); });
const cell = '[data-coord="0,0"]';
const seedState = { childSeed:'ABCD', openedCellCoords:['2,2'], specialRuleActive:false };
const storageSetup = (state = seedState) => `localStorage.setItem('mobingo_app_mode','child'); localStorage.setItem('mobingo_child_state',${JSON.stringify(JSON.stringify(state))});`;

test('R-05: 400ms境界・600ms復元・別pointer・捕捉喪失', async () => {
	const page = await browser.page({ setup: storageSetup() });
	try {
		await page.wait('!!document.querySelector("#bingo-cells-grid")');
		await page.eval('window.realNow=Date.now; window.testNow=1000; Date.now=()=>window.testNow');
		await page.pointer(cell,'pointerdown'); await page.eval('window.testNow+=400'); await page.pointer(cell,'pointerup');
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_child_state).openedCellCoords.includes("0,0")'),false);
		await page.pointer(cell,'pointerdown'); await page.eval('window.testNow+=399'); await page.pointer(cell,'pointerup');
		await page.wait('document.querySelector(\'[data-coord="0,0"]\').classList.contains("bingo-cell-opened")');
		await page.pointer(cell,'pointerdown'); await page.pointer(cell,'pointermove',{x:31}); await delay(650); await page.pointer(cell,'pointerup');
		assert.ok(await page.eval('JSON.parse(localStorage.mobingo_child_state).openedCellCoords.includes("0,0")'));
		await page.pointer(cell,'pointerdown'); await page.pointer(cell,'lostpointercapture'); await delay(650); await page.pointer(cell,'pointerup');
		assert.ok(await page.eval('JSON.parse(localStorage.mobingo_child_state).openedCellCoords.includes("0,0")'));
		await page.pointer(cell,'pointerdown'); await page.pointer(cell,'pointerdown',{id:2}); await page.pointer(cell,'pointerup',{id:2});
		await delay(650); await page.pointer(cell,'pointerup');
		await page.wait('document.querySelector(\'[data-coord="0,0"]\').classList.contains("bingo-cell-unopened")');
		await page.eval('Date.now=window.realNow');
		assert.deepEqual(page.errors,[]);
	} finally { await page.close(); }
});

test('R-16: 鍵導出完了前の役割変更で旧カードを保存・描画しない', async () => {
	const page = await browser.page({ setup:`window.kdfPending=[]; const derive=crypto.subtle.deriveBits.bind(crypto.subtle); crypto.subtle.deriveBits=async (...args)=>{const result=await derive(...args); return new Promise(resolve=>window.kdfPending.push(()=>resolve(result)));};` });
	try {
		await page.click('#btn-select-child'); await page.input('#child-seed-input','ABCD'); await page.click('#btn-start-card');
		await page.wait('window.kdfPending.length===1'); await page.click('#header-switch-mode-btn');
		await page.wait('!!document.querySelector("#btn-select-host")'); await page.eval('window.kdfPending.shift()()'); await delay(100);
		assert.equal(await page.eval('localStorage.getItem("mobingo_child_state")'),null);
		assert.equal(await page.eval('!!document.querySelector("#btn-select-host")'),true);
		assert.deepEqual(page.errors,[]);
	} finally { await page.close(); }
});

test('R-16: ビンゴQR予約後に役割を変更しても旧モーダルを開かない', async () => {
	const state = { ...seedState, openedCellCoords:['2,2','0,0','0,1','0,2','0,3'] };
	const page = await browser.page({setup:storageSetup(state)});
	try {
		await page.wait('!!document.querySelector("#bingo-cells-grid")'); await page.click('[data-coord="0,4"]');
		await page.wait('document.querySelector("#app-main").textContent.includes("ビンゴ達成")');
		await page.click('#header-switch-mode-btn'); await delay(850);
		assert.equal(await page.eval('!!document.querySelector("#child-qr-modal")'),false);
		assert.deepEqual(page.errors,[]);
	} finally { await page.close(); }
});

test('R-16: 照合モーダル終了後に取得したカメラのtrackを停止する', async () => {
	const page = await browser.page({ setup:`window.streamStops=0; window.cameraPending=[]; navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>window.cameraPending.push(resolve));` });
	try {
		await page.click('#btn-select-host'); await page.click('#btn-host-proceed'); await page.wait('!!document.querySelector("#slide-thumb")');
		await page.click('#btn-verify-qr'); await page.wait('window.cameraPending.length===1'); await page.click('#close-verify-btn');
		await page.eval(`(() => { const c=document.createElement('canvas'); const stream=c.captureStream(); for(const track of stream.getTracks()){const stop=track.stop.bind(track); track.stop=()=>{window.streamStops++;stop();};} window.cameraPending.shift()(stream); })()`);
		await page.wait('window.streamStops===1');
		assert.equal(await page.eval('!!document.querySelector("#host-verify-modal")'),false);
		assert.deepEqual(page.errors,[]);
	} finally { await page.close(); }
});

test('R-16: 抽選中リセット後に旧タイマーが保存状態を復活させない', async () => {
	const page=await browser.page();
	try {
		await page.click('#btn-select-host'); await page.click('#btn-host-proceed'); await page.wait('!!document.querySelector("#slide-thumb")');
		await page.drag(); await page.click('#btn-reset-game'); await delay(7100);
		assert.equal(await page.eval('localStorage.getItem("mobingo_parent_state")'),null);
		assert.equal(await page.eval('!!document.querySelector("#host-seed-input")'),true);
		assert.deepEqual(page.errors,[]);
	} finally { await page.close(); }
});

test('R-05: 長押しタイマーを制御し599ms不成立・600ms成立を検証する',async()=>{
	const page=await browser.page({setup:storageSetup({...seedState,openedCellCoords:['2,2','0,0']})});
	try{
		await page.wait('!!document.querySelector("#bingo-cells-grid")');
		await page.eval(`window.longPressTime=0;window.longPressTimers=new Map();const set=window.setTimeout,clear=window.clearTimeout;window.setTimeout=(fn,ms,...args)=>{if(ms!==600)return set(fn,ms,...args);const id=-Math.random();longPressTimers.set(id,{fn,due:longPressTime+ms});return id;};window.clearTimeout=id=>{longPressTimers.delete(id);clear(id);};window.advanceLongPress=ms=>{longPressTime+=ms;for(const [id,timer]of longPressTimers)if(timer.due<=longPressTime){longPressTimers.delete(id);timer.fn();}};`);
		await page.pointer(cell,'pointerdown');await page.eval('advanceLongPress(599)');
		assert.ok(await page.eval('JSON.parse(localStorage.mobingo_child_state).openedCellCoords.includes("0,0")'));
		await page.eval('advanceLongPress(1)');
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_child_state).openedCellCoords.includes("0,0")'),false);
		await page.pointer(cell,'pointerup');assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

test('R-16: 再描画・投影終了・役割変更で旧Canvas監視とRAFを残さない',async()=>{
	const page=await browser.page({setup:`window.observedCanvases=new Set();window.pendingFrames=new Set();const Observer=ResizeObserver,raf=requestAnimationFrame,caf=cancelAnimationFrame;window.ResizeObserver=class{constructor(fn){this.inner=new Observer(fn);this.targets=new Set();}observe(el){this.targets.add(el);observedCanvases.add(el);this.inner.observe(el);}disconnect(){for(const el of this.targets)observedCanvases.delete(el);this.targets.clear();this.inner.disconnect();}};window.requestAnimationFrame=fn=>{const id=raf(time=>{pendingFrames.delete(id);fn(time);});pendingFrames.add(id);return id;};window.cancelAnimationFrame=id=>{pendingFrames.delete(id);caf(id);};`});
	try{
		await page.click('#btn-select-host');await page.click('#btn-host-proceed');await page.wait('!!document.querySelector("#slide-thumb")');
		assert.equal(await page.eval('observedCanvases.size'),1);
		await page.click('#btn-projector');assert.equal(await page.eval('observedCanvases.size'),2);
		await page.click('#close-proj-btn');assert.equal(await page.eval('observedCanvases.size'),1);
		await page.click('#header-sound-btn');await page.wait('!!document.querySelector("#slide-thumb")');
		assert.equal(await page.eval('[...observedCanvases].filter(el=>!el.isConnected).length'),0);
		await page.drag();await page.wait('pendingFrames.size>0');await page.click('#header-switch-mode-btn');
		assert.equal(await page.eval('observedCanvases.size'),0);assert.equal(await page.eval('pendingFrames.size'),0);
		assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});
