import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {startBrowser,delay} from '../helpers/browser.js';
import {updateBrowser,NEXT_VERSION,savedSetup} from '../helpers/update-server.js';
import {visible,reveal,tap} from '../helpers/layout.js';
import {APP_VERSION} from '../../js/core/version.js';
let browser;before(async()=>{browser=await startBrowser()});after(async()=>{await browser?.close()});
for(const [width,height]of [[320,568],[568,320],[640,280],[820,1180]])test(`R-21: ${width}x${height}の情報・版・更新確認を実touchで操作する`,async()=>{
	const {browser:real,release}=await updateBrowser();let page;
	try{
		page=await real.page({width,height,mobile:true,setup:savedSetup});
		await page.wait('!!navigator.serviceWorker.controller',10000);await page.wait('!!document.querySelector("#bingo-cells-grid")');const saved=await page.eval('localStorage.mobingo_child_state');await tap(page,'#header-license-btn');await reveal(page,'#app-version','#license-modal .modal-content');assert.equal(await page.eval('document.querySelector("#app-version").textContent'),APP_VERSION);await tap(page,'#btn-check-update','#license-modal .modal-content');await page.wait(`document.querySelector('#update-status').dataset.phase==='current'`);await reveal(page,'#update-status','#license-modal .modal-content');
		release.next=true;await tap(page,'#btn-check-update','#license-modal .modal-content');await page.wait(`document.querySelector('#update-status').dataset.phase==='available'`,15000);await reveal(page,'#update-status','#license-modal .modal-content');assert.match(await page.eval('document.querySelector("#update-status").textContent'),new RegExp(NEXT_VERSION));const token=await page.eval('window.documentToken=crypto.randomUUID()');page.dialog(false);await tap(page,'#btn-apply-update','#license-modal .modal-content');assert.equal(await page.eval('window.documentToken'),token);page.dialog(true);await tap(page,'#btn-apply-update','#license-modal .modal-content');await page.wait('!window.documentToken && !!document.querySelector("#bingo-cells-grid")',10000);assert.equal(await page.eval('localStorage.mobingo_child_state'),saved);
		await tap(page,'#header-license-btn');await reveal(page,'#app-version','#license-modal .modal-content');assert.equal(await page.eval('document.querySelector("#app-version").textContent'),NEXT_VERSION);await tap(page,'#close-license-bottom-btn','#license-modal .modal-content');assert.equal(await page.eval('!!document.querySelector("#license-modal")'),false);assert.deepEqual(page.errors,[]);
	}finally{try{await page?.close();}finally{await real.close();}}
});
for(const mode of ['mode_a','mode_b'])test(`R-20: ${mode}の当選順説明と空状態は丁寧体である`,async()=>{
	const state={parentSeed:'1234',mode,currentTurn:0,specialRuleTurn:null,registeredChildSeeds:[]},page=await browser.page({setup:`localStorage.setItem('mobingo_app_mode','host');localStorage.setItem('mobingo_parent_state',${JSON.stringify(JSON.stringify(state))})`});
	try{await page.wait('!!document.querySelector("#btn-winner-ranking")');await page.click('#btn-winner-ranking');const text=await page.eval('document.querySelector("#winner-ranking-modal").textContent');assert.match(text,/同じ手番は同順位です/);assert.match(text,/対象です/);assert.match(text,/当選者はいません/);assert.doesNotMatch(text,/である|はいない/);}finally{await page.close();}
});
test('R-21: 非対応・登録拒否でも現在版と情報を表示する',async()=>{
	for(const setup of [`Object.defineProperty(navigator,'serviceWorker',{value:undefined})`,`navigator.serviceWorker.register=async()=>{throw new Error('denied')}`]){
		const page=await browser.page({setup});try{await page.click('#header-license-btn');assert.equal(await page.eval('document.querySelector("#app-version").textContent'),APP_VERSION);assert.match(await page.eval('document.querySelector("#license-modal").textContent'),/デンソーウェーブ/);assert.ok(await page.eval('document.querySelector("#update-status").textContent.length>0'));assert.deepEqual(page.errors,[]);}finally{await page.close();}
	}
});
test('R-21: 閉じた情報画面は確認の遅延完了で書き換えず、再表示へ反映する',async()=>{
	const page=await browser.page();
	try{
		await page.wait('!!navigator.serviceWorker.controller',10000);await page.eval(`(async()=>{window.releaseUpdate=null;const get=navigator.serviceWorker.getRegistration.bind(navigator.serviceWorker);window.reg=await get();window.reg.update=()=>new Promise(resolve=>window.releaseUpdate=resolve);navigator.serviceWorker.register=async()=>window.reg})()`);
		await page.click('#header-license-btn');await page.click('#btn-check-update');await page.wait('!!window.releaseUpdate');await page.eval('window.oldStatus=document.querySelector("#update-status");window.oldText=oldStatus.textContent');await page.click('#close-license-btn');await page.eval('window.releaseUpdate()');await delay(100);assert.ok(await page.eval('oldStatus.textContent===oldText'));await page.click('#header-license-btn');await page.wait(`document.querySelector('#update-status').dataset.phase==='current'`);assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});
test('R-21: 受付中・抽選中の適用を拒否し、ゲーム保存値を変えない',async()=>{
	for(const phase of ['scanner','draw','ejection']){
		const {browser:real,release}=await updateBrowser();let page;
		try{
			page=await real.page();
			await page.wait('!!navigator.serviceWorker.controller',10000);await page.click('#btn-select-host');if(phase==='scanner')await page.click('#opt-mode-a');await page.click('#btn-host-proceed');if(phase!=='scanner'){await page.wait('!!document.querySelector("#slide-track")');await page.eval(`const timer=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>timer(fn,[1800,5000].includes(ms)?60000:ms,...args)`);await page.drag();if(phase==='ejection')await page.click('#wheel-arena');}else{await page.input('#scanner-manual-input','ABCD');await page.click('#scanner-manual-form button');}
			await page.click('#header-license-btn');release.next=true;await page.click('#btn-check-update');await page.wait(`document.querySelector('#update-status').dataset.phase==='available'`,15000);const token=await page.eval('window.documentToken=crypto.randomUUID()'),saved=await page.eval('localStorage.getItem("mobingo_parent_state")');await page.click('#btn-apply-update');assert.match(await page.eval('document.querySelector("#update-status").textContent'),phase==='scanner'?/受付/:/抽選/);assert.equal(await page.eval('window.documentToken'),token);assert.equal(await page.eval('localStorage.getItem("mobingo_parent_state")'),saved);
			await page.click('#close-license-btn');if(phase==='scanner'){await page.click('#scanner-finish-btn');await page.wait('!!document.querySelector("#slide-track")')}else{await page.click('#wheel-arena');if(phase==='draw')await page.click('#wheel-arena');await page.wait('JSON.parse(localStorage.mobingo_parent_state).currentTurn===1')}
			const completed=await page.eval('localStorage.mobingo_parent_state');await page.click('#header-license-btn');await page.click('#btn-apply-update');await page.wait('!window.documentToken && !!document.querySelector("#slide-track")',10000);assert.equal(await page.eval('localStorage.mobingo_parent_state'),completed);assert.deepEqual(page.errors,[]);
		}finally{try{await page?.close();}finally{await real.close();}}
	}
});

test('R-21: 適用待ちで画面を閉じて抽選を開始しても再読み込みせず、完了後に適用できる',async()=>{
	const state={parentSeed:'1234',mode:'mode_b',currentTurn:0,specialRuleTurn:null,registeredChildSeeds:[]};
	const {browser:real,release}=await updateBrowser();let page;
	try{
		page=await real.page({setup:`localStorage.setItem('mobingo_app_mode','host');if(!localStorage.mobingo_parent_state)localStorage.setItem('mobingo_parent_state',${JSON.stringify(JSON.stringify(state))})`});
		await page.wait('!!navigator.serviceWorker.controller',10000);await page.wait('!!document.querySelector("#slide-track")');
		await page.eval(`const timer=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>timer(fn,[1800,5000].includes(ms)?60000:ms,...args);window.releaseVersion=null;window.versionRequests=0;const send=ServiceWorker.prototype.postMessage;ServiceWorker.prototype.postMessage=function(data,ports){if(data.type==='MOBINGO_GET_VERSION'&&document.querySelector('#update-status')?.dataset.phase==='applying'&&++window.versionRequests===2){window.releaseVersion=()=>send.call(this,data,ports)}else send.call(this,data,ports)}`);
		await page.click('#header-license-btn');release.next=true;await page.click('#btn-check-update');await page.wait(`document.querySelector('#update-status').dataset.phase==='available'`,15000);const token=await page.eval('window.documentToken=crypto.randomUUID()');await page.click('#btn-apply-update');await page.wait('!!window.releaseVersion');await page.click('#close-license-btn');await page.drag();await page.click('#header-license-btn');await page.eval('window.releaseVersion()');
		await page.wait(`!window.documentToken || document.querySelector('#update-status')?.dataset.phase==='available'`);assert.equal(await page.eval('window.documentToken'),token);assert.match(await page.eval('document.querySelector("#update-status").textContent'),/抽選/);assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).currentTurn'),0);
		await page.click('#close-license-btn');await page.click('#wheel-arena');await page.click('#wheel-arena');await page.wait('JSON.parse(localStorage.mobingo_parent_state).currentTurn===1');await page.click('#header-license-btn');await page.click('#btn-apply-update');await page.wait('!window.documentToken && !!document.querySelector("#slide-track")',10000);assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).currentTurn'),1);assert.deepEqual(page.errors,[]);
	}finally{try{await page?.close();}finally{await real.close();}}
});

test('R-20: 参加者の縦横画面の操作案内も丁寧体である',async()=>{
	for(const [width,height]of [[320,568],[844,390]]){
		const page=await browser.page({width,height,mobile:true,setup:savedSetup});
		try{
			await page.wait('!!document.querySelector("#bingo-cells-grid")');const selectors=width>height?['.child-landscape-panel .child-operation-help','.child-landscape-panel .child-operation-detail']:['.child-portrait-footer .child-operation-help'];for(const selector of selectors){await reveal(page,selector,width>height?'.child-landscape-panel':'.child-portrait-footer');const text=await page.eval(`document.querySelector(${JSON.stringify(selector)}).textContent`);assert.match(text,/タップで穴を開けます/);assert.match(text,/長押し.*元に戻せます/);assert.doesNotMatch(text,/穴を開ける|元に戻す/);}
		}finally{await page.close();}
	}
});
