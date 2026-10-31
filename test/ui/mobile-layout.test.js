import test,{before,after}from'node:test';
import assert from'node:assert/strict';
import{startBrowser}from'../helpers/browser.js';
import{geometry,visible,reveal,tap}from'../helpers/layout.js';

let browser;
before(async()=>{browser=await startBrowser();});after(async()=>{await browser?.close();});
const sizes=[[320,568],[360,640],[390,844],[568,320],[640,360],[844,390],[640,280]];
const tracking=`window.layoutObservers=new Set();window.layoutFrames=new Set();const RO=ResizeObserver,raf=requestAnimationFrame,caf=cancelAnimationFrame;window.ResizeObserver=class{constructor(fn){this.inner=new RO(fn);this.targets=new Set();}observe(el){this.targets.add(el);layoutObservers.add(el);this.inner.observe(el);}disconnect(){for(const el of this.targets)layoutObservers.delete(el);this.targets.clear();this.inner.disconnect();}};window.requestAnimationFrame=fn=>{const id=raf(time=>{layoutFrames.delete(id);fn(time);});layoutFrames.add(id);return id;};window.cancelAnimationFrame=id=>{layoutFrames.delete(id);caf(id);};`;
const setup=tracking+`navigator.mediaDevices.getUserMedia=()=>Promise.reject(new Error('camera disabled for layout test'));`;

async function child(page){
	await tap(page,'#btn-select-child','.setup-screen');
	await reveal(page,'#child-seed-input','.setup-screen');await page.type('#child-seed-input','ABCD');
	await tap(page,'#btn-start-card','.setup-screen');await page.wait('!!document.querySelector("#bingo-cells-grid")');
	await openCell(page);
}
async function openCell(page){
	await tap(page,'[data-coord="0,0"]');
	await page.wait(`document.querySelector('[data-coord="0,0"]').classList.contains('bingo-cell-opened')`);
}
async function drawBall(page){
	await reveal(page,'#slide-track','.host-dashboard-left');
	const r=await page.eval(`(()=>{const t=document.querySelector('#slide-track').getBoundingClientRect(),h=document.querySelector('#slide-thumb').getBoundingClientRect();return{x:h.x+h.width/2,y:h.y+h.height/2,d:t.width-h.width-8};})()`);
	await page.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.y,id:1}]});
	for(let step=1;step<=8;step++)await page.cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.d*step/8,y:r.y,id:1}]});
	await page.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
	await page.wait('document.querySelector("#barrel-status-hint").textContent.includes("回転中")');
	await page.wait('document.querySelector("#barrel-status-hint").textContent.includes("ボール確定")',4000);
	await tap(page,'#latest-ball-tag','.host-dashboard-left');
	await page.wait('JSON.parse(localStorage.mobingo_parent_state).currentTurn===1');
	assert.match(await page.eval('document.querySelector("#latest-ball-tag").textContent'),/第1手/);
}
async function verificationResult(page){
	await reveal(page,'.verify-result-message','#host-verify-modal .modal-content');
	for(let row=0;row<5;row++)for(let col=0;col<5;col++)await reveal(page,`[data-verify-coord="${row},${col}"]`,'#host-verify-modal .modal-content');
}
async function host(page,modeA=false){
	await tap(page,'#btn-select-host','.setup-screen');
	if(modeA)await tap(page,'#opt-mode-a','.setup-screen');
	await reveal(page,'#host-seed-input','.setup-screen');await page.type('#host-seed-input','1234');
	await tap(page,'#btn-host-proceed','.setup-screen');
	if(!modeA)await page.wait('!!document.querySelector("#slide-thumb")');
}
async function cardLayout(page,width,height){
	for(let row=0;row<5;row++)for(let col=0;col<5;col++)await visible(page,`[data-coord="${row},${col}"]`,true);
	const panel=width>height?'.child-landscape-panel':'.child-portrait-footer';
	for(const selector of ['.btn-action-toggle-special','.btn-action-show-qr','.btn-action-reset-card'])await reveal(page,`${panel} ${selector}`,panel);
	await tap(page,`${panel} .btn-action-show-qr`,panel);
	await reveal(page,'#qr-canvas','#child-qr-modal .modal-content');await visible(page,'#qr-canvas');
	await tap(page,'#close-qr-bottom-btn','#child-qr-modal .modal-content');
}
async function projectorLayout(page,width,height){
	const launch=await visible(page,'#btn-projector',true);
	assert.ok(launch.top<60&&launch.right>width-40,'Projection launch must be at top right');
	assert.ok(launch.height>=44,'Projection launch must be a 44px touch target');
	const observers=await page.eval('layoutObservers.size'),frames=await page.eval('layoutFrames.size');
	await tap(page,'#btn-projector');
	const back=await visible(page,'#close-proj-btn',true);
	assert.ok(back.height>=44&&back.top<60&&back.right>width-40,'Return must stay at top right');
	assert.ok(Math.abs(back.right-launch.right)<=20&&Math.abs(back.top-launch.top)<=20,'Projection/return touch positions must be close');
	await visible(page,'#proj-barrel-canvas');
	const cells=await page.eval('document.querySelectorAll("[data-projector-ball]").length');assert.equal(cells,75);
	const tops=[];
	for(let number=1;number<=75;number++){
		const r=await visible(page,`[data-projector-ball="${number}"]`);
		assert.ok(r.clientWidth>=12&&r.scrollWidth<=r.clientWidth+1,`Ball ${number} text must fit`);
		tops.push(Math.round(r.top));
	}
	assert.equal(new Set(tops).size,5,'Mobile projection must use five rows of fifteen numbers');
	if(width<height){const board=await visible(page,'.projector-board');assert.ok(board.width>board.height,'Portrait number board must be compact and wide');const hero=await visible(page,'.projector-hero');assert.ok(hero.height<=height*0.45,'Portrait hero must not stretch vertically');}
	await tap(page,'#close-proj-btn');assert.equal(await page.eval('!!document.querySelector("#projector-view")'),false);
	for(let repeat=0;repeat<2;repeat++){await tap(page,'#btn-projector');await visible(page,'#proj-barrel-canvas');assert.equal(await page.eval('layoutObservers.size'),observers+1);await tap(page,'#close-proj-btn');assert.equal(await page.eval('layoutObservers.size'),observers);assert.equal(await page.eval('[...layoutObservers].some(e=>!e.isConnected)'),false);assert.ok(await page.eval('layoutFrames.size')<=frames);}
}

for(const[width,height]of sizes){
	test(`U-08 mobile ${width}x${height}: 開始・参加・カード・QR・開催・照合・情報・投影`,async()=>{
		const page=await browser.page({width,height,mobile:true,setup});
		try{
			assert.ok(await page.eval('navigator.maxTouchPoints>0'));
			// The primary roles and join action must fit immediately at standard landscape sizes.
			if(width>=568&&height>=320&&width>height){await visible(page,'#btn-select-child',true);await visible(page,'#btn-select-host',true);}
			await tap(page,'#btn-select-child','.setup-screen');
			if(width>=568&&height>=320&&width>height)await visible(page,'#btn-start-card',true);
			await reveal(page,'#child-seed-input','.setup-screen');await page.type('#child-seed-input','ABCD');await tap(page,'#btn-start-card','.setup-screen');
			await page.wait('!!document.querySelector("#bingo-cells-grid")');await openCell(page);await cardLayout(page,width,height);
			await tap(page,'#header-switch-mode-btn');await host(page);
			const barrel=await reveal(page,'#barrel-canvas','.host-dashboard-left');assert.ok(Math.min(barrel.width,barrel.height)>=(width>height?160:200),'Mobile barrel must be enlarged');
			for(const selector of ['#btn-verify-qr','#btn-unlock-special','#slide-track'])await reveal(page,selector,'.host-dashboard-left');
			await drawBall(page);
			await tap(page,'#btn-verify-qr','.host-dashboard-left');
			await reveal(page,'.verify-camera-stage','#host-verify-modal .modal-content');
			await tap(page,'#tab-manual-btn','#host-verify-modal .modal-content');
			const input=await reveal(page,'#v-manual-input','#host-verify-modal .modal-content');assert.ok(input.width>=100,'Manual verification input must be usable');
			await page.type('#v-manual-input','ABCD');await tap(page,'#verify-manual-form button','#host-verify-modal .modal-content');await page.wait('!!document.querySelector("#v-recheck-btn")');await verificationResult(page);
			await tap(page,'#v-recheck-btn','#host-verify-modal .modal-content');await tap(page,'#close-verify-btn','#host-verify-modal .modal-content');
			await tap(page,'#header-license-btn');await tap(page,'#close-license-bottom-btn','#license-modal .modal-content');
			await projectorLayout(page,width,height);
			assert.deepEqual(page.errors,[]);
		}finally{await page.close();}
	});

	test(`U-08 mobile ${width}x${height}: モードA受付・登録・特殊役・投影`,async()=>{
		const page=await browser.page({width,height,mobile:true,setup});
		try{
			await host(page,true);
			await reveal(page,'#scanner-manual-input','.scanner-screen');await page.type('#scanner-manual-input','ABCD');await tap(page,'#scanner-manual-form button','.scanner-screen');
			await visible(page,'#scanner-count');await tap(page,'.remove-chip-btn','.scanner-screen');
			await reveal(page,'#scanner-manual-input','.scanner-screen');await page.type('#scanner-manual-input','ABCD');await tap(page,'#scanner-manual-form button','.scanner-screen');
			await tap(page,'#scanner-finish-btn','.scanner-screen');await page.wait('!!document.querySelector("#slide-thumb")');
			await tap(page,'#btn-unlock-special','.host-dashboard-left');await page.wait('!!document.querySelector(".modal-overlay")');
			await visible(page,'.special-splash > div');await visible(page,'.modal-overlay h2');await page.wait('!document.querySelector(".modal-overlay")',5000);
			await projectorLayout(page,width,height);assert.deepEqual(page.errors,[]);
		}finally{await page.close();}
	});
}

test('U-08 mobile: 参加カードと投影を縦→横→縦で再配置し状態・手番を保持する',async()=>{
	const page=await browser.page({width:390,height:844,mobile:true,setup});
	try{
		await child(page);const state=await page.eval('localStorage.mobingo_child_state');const numbers=await page.eval('[...document.querySelectorAll(".bingo-cell")].map(e=>e.textContent.trim())');
		for(const[width,height]of[[844,390],[390,844]]){await page.resize(width,height);await cardLayout(page,width,height);assert.equal(await page.eval('localStorage.mobingo_child_state'),state);assert.deepEqual(await page.eval('[...document.querySelectorAll(".bingo-cell")].map(e=>e.textContent.trim())'),numbers);assert.ok(await page.eval(`document.querySelector('[data-coord="0,0"]').classList.contains('bingo-cell-opened')`));}
		await tap(page,'#header-switch-mode-btn');await host(page);await drawBall(page);const parent=await page.eval('localStorage.mobingo_parent_state');const latest=await page.eval('document.querySelector("#latest-ball-tag").textContent');
		await tap(page,'#btn-projector');
		for(const[width,height]of[[844,390],[390,844]]){
			await page.resize(width,height);await visible(page,'#close-proj-btn',true);for(let number=1;number<=75;number++)await visible(page,`[data-projector-ball="${number}"]`);
			assert.equal(await page.eval('localStorage.mobingo_parent_state'),parent);assert.equal(await page.eval('document.querySelector("#latest-ball-tag").textContent'),latest);assert.match(await page.eval('document.querySelector(".projector-turn").textContent'),/第 1 手/);
		}
		await tap(page,'#close-proj-btn');assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

for(const[width,height]of sizes){
	test(`U-08 mobile ${width}x${height}: 終盤照合と逆ビンゴ賞`,async()=>{
		const saved={parentSeed:'1234',mode:'mode_a',currentTurn:75,specialRuleTurn:20,registeredChildSeeds:['ABCD','ZZZZ','0000']};
		const page=await browser.page({width,height,mobile:true,setup:setup+`localStorage.setItem('mobingo_app_mode','host');localStorage.setItem('mobingo_parent_state',${JSON.stringify(JSON.stringify(saved))});`});
		try{
			await page.wait('!!document.querySelector("#btn-dobe-award")');
			await tap(page,'#btn-dobe-award','.host-dashboard-left');
			await reveal(page,'.modal-content h3','.modal-content');for(const seed of ['ABCD','ZZZZ','0000'])await reveal(page,`[data-award-seed="${seed}"]`,'.modal-content');await tap(page,'#close-dobe-btn','.modal-content');
			await tap(page,'#btn-verify-qr','.host-dashboard-left');await reveal(page,'.verify-camera-stage','#host-verify-modal .modal-content');
			await tap(page,'#tab-manual-btn','#host-verify-modal .modal-content');
			await reveal(page,'#v-manual-input','#host-verify-modal .modal-content');await page.type('#v-manual-input','ABCD');await tap(page,'#verify-manual-form button','#host-verify-modal .modal-content');
			await page.wait('!!document.querySelector("#v-recheck-btn")');await verificationResult(page);assert.match(await page.eval('document.querySelector("#verify-body").textContent'),/有効なビンゴ/);
			await tap(page,'#v-recheck-btn','#host-verify-modal .modal-content');await tap(page,'#close-verify-btn','#host-verify-modal .modal-content');
			await projectorLayout(page,width,height);assert.deepEqual(page.errors,[]);
		}finally{await page.close();}
	});
}
