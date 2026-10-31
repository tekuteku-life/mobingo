import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { visible as assertVisible, tap } from '../helpers/layout.js';
import { startBrowser,delay } from '../helpers/browser.js';
let browser;
before(async()=>{browser=await startBrowser();});after(async()=>{await browser?.close();});
const child={childSeed:'ABCD',openedCellCoords:['2,2','0,0'],specialRuleActive:false};
const parent={parentSeed:'1234',mode:'mode_a',currentTurn:75,specialRuleTurn:null,registeredChildSeeds:['ABCD','ZZZZ']};
const setup=(mode,state)=>`localStorage.setItem('mobingo_app_mode',${JSON.stringify(mode)});localStorage.setItem('mobingo_${mode==='child'?'child':'parent'}_state',${JSON.stringify(JSON.stringify(state))});`;
const once=source=>`if(!localStorage.getItem('mobingo_app_mode')){${source}}`;
const fakeCamera=`navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;c.getContext('2d').fillRect(0,0,640,480);return c.captureStream(10);};`;
const visible=`e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}`;
for(const [width,height] of [[320,568],[768,1024],[820,1180],[1024,768],[1024,1024],[1440,900],[1920,1080],[2560,720]]){
	test(`R-19: ${width}x${height}の開催者幅・参加者ヘッダー・補助リセット`,async()=>{
		const page=await browser.page({width,height,mobile:width<1100,setup:once(setup('host',parent))});
		try{
			await page.wait('!!document.querySelector("#slide-track")');
			const host=await page.eval(`(()=>{const main=document.querySelector('#app-main').getBoundingClientRect(),e=document.querySelector('.host-dashboard-container'),r=e.getBoundingClientRect(),b=document.querySelector('.host-dashboard-board').getBoundingClientRect();return {available:main.width,width:r.width,board:b.width,columns:getComputedStyle(e).gridTemplateColumns}})()`);
			assert.ok(host.width>=host.available-20,JSON.stringify(host));assert.ok(host.width<=host.available+1,JSON.stringify(host));if(width>=700){assert.ok(host.board>200,JSON.stringify(host));await assertVisible(page,'.host-dashboard-left');await assertVisible(page,'.host-dashboard-board');assert.ok(await page.eval(`document.querySelector('.host-dashboard-board').getBoundingClientRect().left>=document.querySelector('.host-dashboard-left').getBoundingClientRect().right-1`));}await page.click('#btn-verify-qr');await page.click('#close-verify-btn');
			await page.eval(setup('child',child));await page.reload();await page.wait('!!document.querySelector("#bingo-cells-grid")');
			const result=await page.eval(`(()=>{const resets=[...document.querySelectorAll('.btn-action-reset-card')].filter(${visible}),qr=[...document.querySelectorAll('.btn-action-show-qr')].filter(${visible}),header=document.querySelector('.child-portrait-header');return {count:resets.length,h:resets[0].getBoundingClientRect().height,w:resets[0].getBoundingClientRect().width,qr:qr[0].getBoundingClientRect().height,header:getComputedStyle(header).display==='none'?null:[...header.children].map(e=>{const r=e.getBoundingClientRect();return r.y+r.height/2})}})()`);
			assert.equal(result.count,1);assert.ok(result.h<=36,JSON.stringify(result));assert.ok(result.qr>=40,JSON.stringify(result));if(result.header)assert.ok(Math.abs(result.header[0]-result.header[1])<2,JSON.stringify(result));
			assert.deepEqual(page.errors,[]);
		}finally{await page.close();}
	});
}
for(const shape of ['natural','tall','wide'])test(`R-19: PC復元リングのstrokeが欠けない ${shape}`,async()=>{
	const page=await browser.page({width:1440,height:900,setup:once(setup('child',child))});
	try{
		await page.wait('!!document.querySelector("#bingo-cells-grid")');
		if(shape!=='natural')await page.eval(`document.querySelector('[data-coord="0,0"]').style.cssText+=';width:${shape==='tall'?50:100}px;height:${shape==='tall'?100:50}px;flex-shrink:0'`);
		const r=await page.eval(`(()=>{const r=document.querySelector('[data-coord="0,0"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
		await page.cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',clickCount:1});await page.wait('!!document.querySelector(".animate-ring circle")');
		const bounds=await page.eval(`(()=>{const c=document.querySelector('.animate-ring circle'),m=c.getScreenCTM(),b=c.getBBox(),s=parseFloat(getComputedStyle(c).strokeWidth)/2;const points=[[b.x-s,b.y-s],[b.x+b.width+s,b.y-s],[b.x-s,b.y+b.height+s],[b.x+b.width+s,b.y+b.height+s]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));const box={left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};let e=c.parentElement,clips=[];while(e){const cs=getComputedStyle(e);if(e===c.parentElement||['hidden','clip','auto','scroll'].includes(cs.overflowY)||e.matches('.bingo-cell')){const r=e.getBoundingClientRect();clips.push({left:r.left,right:r.right,top:r.top,bottom:r.bottom});}e=e.parentElement;}return {box,clips}})()`);
		for(const clip of bounds.clips)for(const side of ['left','top','right','bottom'])assert.ok(['left','top'].includes(side)?bounds.box[side]>=clip[side]-1:bounds.box[side]<=clip[side]+1,JSON.stringify({shape,...bounds}));
		await delay(650);await page.cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1});await page.wait(`!JSON.parse(localStorage.mobingo_child_state).openedCellCoords.includes('0,0')`);
	}finally{await page.close();}
});

test('R-17: 名前作成・編集・実QR往復・開封保持とXSS隔離',async()=>{
	const page=await browser.page();
	try{
		await page.click('#btn-select-child');await page.input('#child-seed-input','ABCD');await page.input('#child-name-input',' e\u0301 ');await page.click('#btn-start-card');await page.wait('!!document.querySelector("#bingo-cells-grid")');
		await page.click('[data-coord="0,0"]');await page.wait(`JSON.parse(localStorage.mobingo_child_state).openedCellCoords.includes('0,0')`);await delay(200);
		await page.click('.child-portrait-name .btn-edit-name');const name='<img src=x onerror=alert(1)>';
		await page.input('#edit-name-input','a'.repeat(33));await page.click('#save-name-btn');assert.ok(await page.eval(`document.querySelector('#name-error').textContent.length>0`));assert.equal(await page.eval('JSON.parse(localStorage.mobingo_child_state).displayName'),'é');
		await page.input('#edit-name-input',name);await page.click('#save-name-btn');await page.wait('!document.querySelector("#child-name-modal")');
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_child_state).displayName'),name);assert.ok(await page.eval(`JSON.parse(localStorage.mobingo_child_state).openedCellCoords.includes('0,0')`));
		await page.click('.child-portrait-footer .btn-action-show-qr');await page.wait(`document.querySelector('#qr-canvas').width===200`);
		const payload=await page.eval(`(()=>{const c=document.querySelector('#qr-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height);return window.jsQR(d.data,d.width,d.height).data})()`);assert.deepEqual(JSON.parse(payload.slice('mobingo:child:v2:'.length)),{seed:'ABCD',displayName:name});assert.equal(await page.eval('document.querySelectorAll("img").length'),0);
		await page.reload();await page.wait('!!document.querySelector("#bingo-cells-grid")');assert.match(await page.eval('document.querySelector(".child-portrait-name").textContent'),/<img/);
		assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

test('R-17/18: QR名前取得・重複更新・旧QR保持・解除・当選順復元',async()=>{
	const name='<img src=x onerror=alert(1)>',page=await browser.page({setup:once(setup('host',{...parent,mode:'mode_b',registeredChildSeeds:[]}))+fakeCamera});
	try{
		await page.wait('!!document.querySelector("#slide-track")');
		for(const [payload,expected] of [['mobingo:child:v2:'+JSON.stringify({seed:'ABCD',displayName:name}),name],['ABCD',name],['mobingo:child:v2:'+JSON.stringify({seed:'ABCD',displayName:''}),'']]){
			await page.eval('window.jsQR=()=>null');await page.click('#btn-verify-qr');await page.wait(`document.querySelector('#v-video').readyState===4`);await page.eval(`window.jsQR=()=>({data:${JSON.stringify(payload)}})`);await page.wait('!!document.querySelector("#v-recheck-btn")');
			assert.ok((await page.eval('document.querySelector("#verify-body").textContent')).includes(expected));assert.equal(await page.eval('document.querySelectorAll("#verify-body img").length'),0);
			assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).participantNames.ABCD'),expected);assert.deepEqual(await page.eval('JSON.parse(localStorage.mobingo_parent_state).verifiedChildSeeds'),['ABCD']);
			await page.click('#close-verify-btn');
		}
		await page.reload();await page.wait('!!document.querySelector("#btn-winner-ranking")');await page.click('#btn-winner-ranking');assert.equal(await page.eval('document.querySelectorAll("[data-winner-seed]").length'),1);assert.match(await page.eval('document.querySelector("#winner-ranking-modal").textContent'),/照合/);await page.click('#close-ranking-btn');
		await page.click('#btn-reset-game');assert.equal(await page.eval('localStorage.getItem("mobingo_parent_state")'),null);await page.click('#btn-host-proceed');await page.wait('!!document.querySelector("#slide-track")');await page.click('#btn-winner-ranking');assert.equal(await page.eval('document.querySelectorAll("[data-winner-seed]").length'),0);
		assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

const qr=(seed,name)=>'mobingo:child:v2:'+JSON.stringify({seed,displayName:name});
const deferKdf=`window.pendingKdf=[];const derive=crypto.subtle.deriveBits.bind(crypto.subtle);crypto.subtle.deriveBits=async(...args)=>{const result=await derive(...args);return new Promise(resolve=>pendingKdf.push(()=>resolve(result)));};`;
test('R-17: モードA受付の名前更新・保持・解除・削除と確定中の変更拒否',async()=>{
	const page=await browser.page({setup:fakeCamera}),evil='<img src=x onerror=alert(1)>';
	try{
		await page.eval('window.nextPayload=null;window.qrSeen=[];window.jsQR=()=>{qrSeen.push(nextPayload);return nextPayload?{data:nextPayload}:null}');
		await page.click('#btn-select-host');await page.click('#opt-mode-a');await page.click('#btn-host-proceed');await page.wait(`document.querySelector('#scanner-video').readyState===4`);
		for(const [payload,name] of [[qr('ABCD',evil),evil],['ABCD',evil],[qr('ABCD',''),''],[qr('ABCD','花子'),'花子']]){
			await page.eval(`window.nextPayload=${JSON.stringify(payload)}`);await page.wait(`qrSeen.includes(${JSON.stringify(payload)})`);await delay(1250);
			assert.equal(await page.eval('document.querySelector("#scanner-count").textContent'),'1');assert.ok((await page.eval('document.querySelector("#scanner-chips").textContent')).includes(name));assert.ok((await page.eval('document.querySelector("#scanner-toast").textContent')).includes(name));assert.equal(await page.eval('document.querySelectorAll("#scanner-chips img,#scanner-toast img").length'),0);
		}
		await page.eval('window.nextPayload=null');await page.click('.remove-chip-btn');assert.equal(await page.eval('document.querySelector("#scanner-count").textContent'),'0');await delay(1250);
		await page.eval(`window.nextPayload='ABCD'`);await page.wait(`document.querySelector('#scanner-count').textContent==='1'`);assert.ok(!(await page.eval('document.querySelector("#scanner-chips").textContent')).includes('花子'));
		await page.eval(deferKdf);await page.click('#scanner-finish-btn');await page.wait('pendingKdf.length===1');const chips=await page.eval('document.querySelector("#scanner-chips").textContent');
		await page.eval(`window.nextPayload=${JSON.stringify(qr('ABCD','差替'))}`);await delay(1300);assert.equal(await page.eval('document.querySelector("#scanner-chips").textContent'),chips);assert.equal(await page.eval('localStorage.getItem("mobingo_parent_state")'),null);
		await page.eval('pendingKdf.shift()()');await page.wait('pendingKdf.length===1');await page.eval('pendingKdf.shift()()');await page.wait('!!document.querySelector("#slide-track")');assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).participantNames.ABCD??""'),'');
	}finally{await page.close();}
});

test('R-17/18: 閉じた名前付き照合の遅延完了は状態・旧DOMを変えない',async()=>{
	const state={...parent,mode:'mode_b',registeredChildSeeds:[],participantNames:{ABCD:'元の名前'},verifiedChildSeeds:[]};
	const page=await browser.page({setup:once(setup('host',state))+fakeCamera});
	try{
		await page.wait('!!document.querySelector("#slide-track")');await page.eval('window.jsQR=()=>null');await page.click('#btn-verify-qr');await page.wait(`document.querySelector('#v-video').readyState===4`);await page.eval(deferKdf);
		await page.eval(`window.jsQR=()=>({data:${JSON.stringify(qr('ABCD','差替'))}})`);await page.wait('pendingKdf.length===1');const saved=await page.eval('localStorage.mobingo_parent_state');await page.eval('window.oldBody=document.querySelector("#verify-body");window.oldText=oldBody.innerHTML');await page.click('#close-verify-btn');await page.eval('pendingKdf.shift()()');await delay(150);
		assert.equal(await page.eval('localStorage.mobingo_parent_state'),saved);assert.ok(await page.eval('oldBody.innerHTML===oldText'));assert.equal(await page.eval('!!document.querySelector("#host-verify-modal")'),false);
	}finally{await page.close();}
});

test('R-17/18: 未達成の名前だけ取得・登録と有効照合の和集合・同名別ID',async()=>{
	for(const turn of [0,75]){
		const page=await browser.page({setup:once(setup('host',{...parent,currentTurn:turn,registeredChildSeeds:['ABCD'],participantNames:{ABCD:'同名'}}))+fakeCamera});
		try{
			await page.wait('!!document.querySelector("#slide-track")');
			for(const seed of ['ZZZZ','ABCD']){
				await page.eval('window.jsQR=()=>null');await page.click('#btn-verify-qr');await page.wait(`document.querySelector('#v-video').readyState===4`);await page.eval(`window.jsQR=()=>({data:${JSON.stringify(qr(seed,'同名'))}})`);await page.wait('!!document.querySelector("#v-recheck-btn")');await page.click('#close-verify-btn');
			}
			assert.deepEqual(await page.eval('JSON.parse(localStorage.mobingo_parent_state).participantNames'),{ABCD:'同名',ZZZZ:'同名'});assert.deepEqual(await page.eval('JSON.parse(localStorage.mobingo_parent_state).verifiedChildSeeds'),turn===0?[]:['ZZZZ','ABCD']);
			await page.click('#btn-winner-ranking');const ids=await page.eval('[...document.querySelectorAll("[data-winner-seed]")].map(e=>e.dataset.winnerSeed).sort()');assert.deepEqual(ids,turn===0?[]:['ABCD','ZZZZ']);
			assert.deepEqual(page.errors,[]);
		}finally{await page.close();}
	}
});
