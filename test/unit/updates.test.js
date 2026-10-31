import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import { compareVersions, requestWorkerVersion, createUpdateManager } from '../../js/core/updates.js';
import { APP_VERSION } from '../../js/core/version.js';
const newer='9.0.0',delay=ms=>new Promise(r=>setTimeout(r,ms));
class Worker extends EventTarget{
	constructor(version=APP_VERSION,state='activated'){super();this.version=version;this.state=state;this.messages=[];}
	postMessage(data,ports=[]){this.messages.push(data);if(data.type==='MOBINGO_GET_VERSION')ports[0].postMessage({type:'MOBINGO_VERSION',version:this.version});else this.onApply?.();}
	change(state){this.state=state;this.dispatchEvent(new Event('statechange'));}
}
function fixture(options={}){
	const active=new Worker(),reg={active,waiting:null,installing:null,update:async()=>{}};
	const sw=new EventTarget();sw.controller=active;let registers=0,reloads=0,confirms=0;
	sw.register=async(url,opts)=>{registers++;assert.equal(url,'./sw.js');assert.equal(opts.updateViaCache,'none');return reg;};
	const manager=createUpdateManager({serviceWorker:sw,timeout:150,messageTimeout:100,reload:()=>{reloads++},confirm:()=>{confirms++;return true},...options});
	return {manager,reg,sw,active,counts:()=>({registers,reloads,confirms}),available(){const next=new Worker(newer,'installed');reg.waiting=next;next.onApply=()=>{reg.waiting=null;reg.active=next;sw.controller=next;next.change('activated');sw.dispatchEvent(new Event('controllerchange'));};return next;}};
}
test('R-21: 正規SemVerの数値比較と不正型/長文を拒否する',()=>{
	for(const [a,b,n]of [['1.2.0','1.10.0',-1],['2.0.0','1.99.99',1],['1.2.3','1.2.3',0],['1.3.0','1.2.99',1],['1.2.4','1.2.3',1],['999999.999999.999999','0.0.0',1]])assert.equal(compareVersions(a,b),n);
	for(const value of [null,1,'1.2','01.2.3','1.2.3-alpha','1.2.3x','9999999.0.0','<img>']){assert.equal(compareVersions(value,APP_VERSION),null);assert.equal(compareVersions(APP_VERSION,value),null);}
});
test('R-21: 版メッセージの完全検査・例外・期限とポート解放',async()=>{
	assert.equal(await requestWorkerVersion(new Worker(),30),APP_VERSION);
	for(const data of [null,{}, {type:'other',version:APP_VERSION},{type:'MOBINGO_VERSION',version:'<svg>'}])await assert.rejects(requestWorkerVersion({postMessage(_,ports){ports[0].postMessage(data)}},30));
	await assert.rejects(requestWorkerVersion({postMessage(){throw new Error('denied')}},30));
	await assert.rejects(requestWorkerVersion({postMessage(){}},10));
});
test('R-21: 非対応・初期未確認・同版・購読解除・重複確認',async()=>{
	const unsupported=createUpdateManager({serviceWorker:null});assert.equal(unsupported.state.phase,'unsupported');await unsupported.start();await unsupported.check();await unsupported.apply();
	const f=fixture();assert.equal(f.manager.state.phase,'idle');let calls=0;const stop=f.manager.subscribe(()=>calls++);assert.equal(calls,1);await f.manager.start();await f.manager.check();assert.equal(f.manager.state.phase,'current');assert.equal(f.counts().registers,1);stop();const before=calls;
	let resolve;f.reg.update=()=>new Promise(r=>resolve=r);const p=f.manager.check();await delay(1);await f.manager.check();await f.manager.apply();resolve();await p;assert.equal(calls,before);assert.equal(f.counts().reloads,0);
});
test('R-21: 新版の準備と確認付き適用・適用連打・1回だけreload',async()=>{
	const f=fixture(),next=f.available();await f.manager.check();assert.equal(f.manager.state.phase,'available');assert.equal(f.manager.state.latestVersion,newer);
	const saved=f.manager.state;saved.phase='error';assert.equal(f.manager.state.phase,'available');
	await Promise.all([f.manager.apply(),f.manager.apply()]);assert.equal(f.counts().reloads,1);assert.equal(f.counts().confirms,1);assert.equal(next.messages.filter(m=>m.type==='MOBINGO_SKIP_WAITING').length,1);
});
test('R-21: 未完成インストールを待ち、redundant・timeout・更新例外を最新としない',async()=>{
	for(const outcome of ['installed','activated','redundant','timeout','reject']){
		const f=fixture(),next=new Worker(newer,'installing');
		f.reg.update=async()=>{if(outcome==='reject')throw new Error('offline');f.reg.installing=next;if(outcome!=='timeout')setTimeout(()=>{if(outcome==='installed')f.reg.waiting=next;else if(outcome==='activated')f.reg.active=next;next.change(outcome)},2)};
		await f.manager.check();assert.equal(f.manager.state.phase,['installed','activated'].includes(outcome)?'available':'error',outcome);
	}
});
test('R-21: 登録失敗・保留期限・更新保留・active不在・旧版・不正応答は再試行できる',async()=>{
	for(const failure of ['register','pending-register','pending-update','missing','older','invalid']){
		const f=fixture();if(failure==='register')f.sw.register=async()=>{throw new Error('denied')};if(failure==='pending-register')f.sw.register=()=>new Promise(()=>{});if(failure==='pending-update')f.reg.update=()=>new Promise(()=>{});if(failure==='missing')f.reg.active=null;if(failure==='older')f.active.version='0.0.1';if(failure==='invalid')f.active.version='<svg>';
		await f.manager.check();assert.equal(f.manager.state.phase,'error',failure);assert.equal(f.counts().reloads,0);
		f.sw.register=async()=>f.reg;f.reg.update=async()=>{};f.reg.active=f.active;f.active.version=APP_VERSION;await f.manager.check();assert.equal(f.manager.state.phase,'current');
	}
});
test('R-21: 確認取消・受付/抽選ガード・対象差替え・適用失敗・既に切替済み',async()=>{
	for(const scenario of ['cancel','blocked','changed','throw','timeout','active']){
		let block=scenario==='blocked';const f=fixture({confirm:()=>scenario!=='cancel',canApply:()=>block?'操作を終えてください。':null}),next=f.available();await f.manager.check();
		if(scenario==='changed')f.reg.waiting=new Worker('9.1.0','installed');if(scenario==='throw')next.onApply=()=>{throw new Error('denied')};if(scenario==='timeout')next.onApply=()=>{};
		if(scenario==='active'){f.reg.waiting=null;f.reg.active=next;f.sw.controller=next;next.state='activated'}
		await f.manager.apply();assert.equal(f.counts().reloads,scenario==='active'?1:0,scenario);
		if(['changed','throw','timeout'].includes(scenario))assert.equal(f.manager.state.phase,'error');
		if(scenario==='blocked'){assert.equal(f.manager.state.phase,'available');block=false;await f.manager.apply();assert.equal(f.counts().reloads,1);}
	}
});
test('R-21: 他タブ切替は自動reloadせず、再確認後だけ再読込できる',async()=>{
	const f=fixture(),next=new Worker(newer);await f.manager.start();f.reg.active=next;f.sw.controller=next;f.sw.dispatchEvent(new Event('controllerchange'));assert.equal(f.counts().reloads,0);await f.manager.check();assert.equal(f.manager.state.phase,'available');await f.manager.apply();assert.equal(f.counts().reloads,1);
});

test('R-21: 全終了経路でMessagePort・期限タイマー・状態リスナーを解放する',async()=>{
	const NativeChannel=globalThis.MessageChannel,nativeSet=globalThis.setTimeout,nativeClear=globalThis.clearTimeout,timers=new Set();const closed=new Set();let latest;
	globalThis.MessageChannel=class extends NativeChannel{constructor(){super();latest=this;for(const port of [this.port1,this.port2]){const close=port.close.bind(port);port.close=()=>{closed.add(port);close()}}}};
	globalThis.setTimeout=(fn,ms,...args)=>{let id;id=nativeSet(()=>{timers.delete(id);fn(...args)},ms);timers.add(id);return id};globalThis.clearTimeout=id=>{timers.delete(id);nativeClear(id)};
	try{
		for(const outcome of ['success','invalid','throw','timeout','messageerror']){
			const before=closed.size,worker={postMessage(_,ports){if(outcome==='success')ports[0].postMessage({type:'MOBINGO_VERSION',version:APP_VERSION});if(outcome==='invalid')ports[0].postMessage({type:'MOBINGO_VERSION',version:'bad'});if(outcome==='throw')throw new Error('denied');if(outcome==='messageerror')latest.port1.dispatchEvent(new MessageEvent('messageerror'))}};
			if(outcome==='success')await requestWorkerVersion(worker,20);else await assert.rejects(requestWorkerVersion(worker,20));assert.equal(closed.size-before,2,outcome);assert.equal(timers.size,0,outcome);
		}
		for(const outcome of ['installed','redundant','timeout']){
			const f=fixture(),next=new Worker('9.0.0','installing'),count=()=>getEventListeners(next,'statechange').length;f.reg.installing=next;f.reg.update=async()=>{if(outcome!=='timeout')setTimeout(()=>{f.reg.waiting=next;next.change(outcome)},1)};await f.manager.check();assert.equal(count(),0,outcome);assert.equal(timers.size,0,outcome);
		}
		for(const outcome of ['success','throw','timeout']){
			const f=fixture(),count=()=>getEventListeners(f.sw,'controllerchange').length,next=f.available();if(outcome==='throw')next.onApply=()=>{throw new Error('denied')};if(outcome==='timeout')next.onApply=()=>{};await f.manager.check();await f.manager.apply();assert.equal(count(),0,outcome);assert.equal(timers.size,0,outcome);
		}
	}finally{globalThis.MessageChannel=NativeChannel;globalThis.setTimeout=nativeSet;globalThis.clearTimeout=nativeClear;for(const timer of timers)nativeClear(timer);}
});

test('R-21: 切替待ち・版返信待ちで操作を始めてもreloadせず、完了後に再試行できる',async()=>{
	for(const stage of ['controller','reply']){
		let blocked=false,armed=true;const f=fixture({canApply:()=>blocked?'抽選を終えてください。':null}),next=f.available(),send=next.postMessage.bind(next),activate=next.onApply;
		if(stage==='controller')next.onApply=()=>{if(armed){blocked=true;armed=false}activate()};
		else next.postMessage=(data,ports)=>{if(data.type==='MOBINGO_GET_VERSION'&&next.state==='activated'&&armed){blocked=true;armed=false}send(data,ports)};
		await f.manager.check();await f.manager.apply();assert.equal(f.counts().reloads,0,stage);assert.equal(f.manager.state.phase,'available');assert.match(f.manager.state.message,/抽選/);
		blocked=false;await f.manager.apply();assert.equal(f.counts().reloads,1);
	}
});
