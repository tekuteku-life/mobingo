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
		await page.drag(); await page.click('#btn-reset-game'); await delay(7800);
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

test('R-06/16: ビンゴ後の特殊役切替でも自動QR予約を保持し離脱で紙吹雪を停止する',async()=>{
	const state={...seedState,openedCellCoords:['2,2','0,0','0,1','0,2','0,3']};
	const page=await browser.page({setup:storageSetup(state)});
	try{
		await page.wait('!!document.querySelector("#bingo-cells-grid")');
		await page.eval('window.confettiResets=0;const reset=window.confetti.reset;window.confetti.reset=()=>{window.confettiResets++;reset();}');
		await page.click('[data-coord="0,4"]');await page.wait('document.querySelector("#app-main").textContent.includes("ビンゴ達成")');
		await page.click('.child-portrait-footer .btn-action-toggle-special');
		await page.wait('!!document.querySelector("#child-qr-modal")',1500);
		assert.match(await page.eval('document.querySelector("#child-qr-modal").textContent'),/BINGO達成中/);
		await page.click('#close-qr-btn');const before=await page.eval('window.confettiResets');await page.click('#header-switch-mode-btn');
		assert.ok(await page.eval('window.confettiResets')>before);assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

for(const scenario of ['saved-child','saved-host','saved-mode-a-card','host-submit','registration-finish','registration-card']){
	test(`R-16: ${scenario}の鍵導出完了を離脱後に反映しない`,async()=>{
		let setup=`window.kdfPending=[];const derive=crypto.subtle.deriveBits.bind(crypto.subtle);crypto.subtle.deriveBits=async(...args)=>{const result=await derive(...args);return new Promise(resolve=>kdfPending.push(()=>resolve(result)));};`;
		if(scenario==='saved-child')setup+=storageSetup();
		if(scenario==='saved-host'||scenario==='saved-mode-a-card')setup+=`localStorage.setItem('mobingo_app_mode','host');localStorage.setItem('mobingo_parent_state',JSON.stringify({parentSeed:'1234',mode:'${scenario==='saved-mode-a-card'?'mode_a':'mode_b'}',currentTurn:1,specialRuleTurn:null,registeredChildSeeds:['ABCD']}));`;
		const page=await browser.page({setup});
		try{
			if(scenario==='host-submit'){await page.click('#btn-select-host');await page.click('#btn-host-proceed');}
			if(scenario.startsWith('registration')){
				await page.click('#btn-select-host');await page.click('#opt-mode-a');await page.click('#btn-host-proceed');
				await page.input('#scanner-manual-input','ABCD');await page.click('#scanner-manual-form button');await page.click('#scanner-finish-btn');
			}
			await page.wait('kdfPending.length===1');
			if(scenario==='saved-mode-a-card'||scenario==='registration-card'){
				await page.eval('kdfPending.shift()()');await page.wait('kdfPending.length===1');
			}
			const before=await page.eval('localStorage.getItem("mobingo_parent_state")');
			await page.click('#header-switch-mode-btn');await page.eval('kdfPending.shift()()');await delay(100);
			assert.ok(await page.eval('!!document.querySelector("#btn-select-host")'));
			assert.equal(await page.eval('localStorage.getItem("mobingo_parent_state")'),before);assert.deepEqual(page.errors,[]);
		}finally{await page.close();}
	});
}

test('R-16: 事前受付のカメラ遅延取得と戻る操作でtrackを停止する',async()=>{
	const page=await browser.page({setup:`window.cameraPending=[];window.streamStops=0;navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>cameraPending.push(resolve));`});
	try{
		await page.click('#btn-select-host');await page.click('#opt-mode-a');await page.click('#btn-host-proceed');await page.wait('cameraPending.length===1');
		await page.click('#scanner-back-btn');
		await page.eval(`(()=>{const stream=document.createElement('canvas').captureStream();for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{streamStops++;stop();};}cameraPending.shift()(stream);})()`);
		await page.wait('streamStops===1');assert.ok(await page.eval('!!document.querySelector("#host-seed-input")'));assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

test('R-09/16: カメラ稼働中の受付から戻ると停止し、再受付で一覧を保持する',async()=>{
	const page=await browser.page({setup:`window.cameraStops=0;navigator.mediaDevices.getUserMedia=async()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;canvas.getContext('2d').fillRect(0,0,640,480);const stream=canvas.captureStream(10);for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{cameraStops++;stop();};}return stream;};`});
	try{
		await page.click('#btn-select-host');await page.click('#opt-mode-a');await page.click('#btn-host-proceed');await page.wait('document.querySelector("#scanner-video").readyState===4');
		await page.input('#scanner-manual-input','ABCD');await page.click('#scanner-manual-form button');await page.click('#scanner-back-btn');
		assert.equal(await page.eval('cameraStops'),1);await page.click('#btn-host-proceed');await page.wait('document.querySelector("#scanner-video").readyState===4');
		assert.equal(await page.eval('document.querySelector("#scanner-count").textContent'),'1');assert.equal(await page.eval('document.querySelector("#scanner-finish-btn").disabled'),false);
		await page.click('#scanner-back-btn');assert.equal(await page.eval('cameraStops'),2);assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

test('R-16: 当選照合のKDF完了前に背景で閉じると結果を反映しない',async()=>{
	const page=await browser.page({setup:`window.kdfPending=[];const derive=crypto.subtle.deriveBits.bind(crypto.subtle);crypto.subtle.deriveBits=async(...args)=>{const result=await derive(...args);if(!new TextDecoder().decode(args[0].salt).includes('mobingo:card'))return result;return new Promise(resolve=>kdfPending.push(()=>resolve(result)));};`});
	try{
		await page.click('#btn-select-host');await page.click('#btn-host-proceed');await page.wait('!!document.querySelector("#slide-thumb")');
		await page.click('#btn-verify-qr');await page.click('#tab-manual-btn');await page.input('#v-manual-input','ABCD');await page.click('#verify-manual-form button');await page.wait('kdfPending.length===1');
		await page.eval(`(async()=>{window.closedVerifyBody=document.querySelector('#verify-body');window.closedVerifyText=closedVerifyBody.textContent;window.verifyAudioCalls=0;const {soundManager}=await import('/js/core/audio.js');for(const name of ['playFanfare','playBallEjected']){const play=soundManager[name].bind(soundManager);soundManager[name]=(...args)=>{verifyAudioCalls++;return play(...args);};}})()`);
		await page.cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:2,y:2,button:'left',clickCount:1});await page.cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:2,y:2,button:'left',clickCount:1});
		await page.eval('kdfPending.shift()()');await page.eval('new Promise(resolve=>setTimeout(resolve,0))');
		assert.equal(await page.eval('!!document.querySelector("#host-verify-modal")'),false);
		assert.equal(await page.eval('closedVerifyBody.textContent===closedVerifyText'),true);assert.equal(await page.eval('verifyAudioCalls'),0);assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

for(const phase of ['spin','ejection']){
	test(`R-16: ${phase}でリセットした旧操作を再配送しても保存しない`,async()=>{
		const page=await browser.page();
		try{
			await page.click('#btn-select-host');await page.click('#btn-host-proceed');await page.wait('!!document.querySelector("#slide-thumb")');await page.drag();
			if(phase==='ejection')await page.click('#wheel-arena');
			await page.eval('window.oldWheel=document.querySelector("#wheel-arena")');await page.click('#btn-reset-game');await page.eval('window.oldWheel.click()');
			assert.equal(await page.eval('localStorage.getItem("mobingo_parent_state")'),null);assert.ok(await page.eval('!!document.querySelector("#host-seed-input")'));assert.deepEqual(page.errors,[]);
		}finally{await page.close();}
	});
}
