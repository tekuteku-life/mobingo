import test from 'node:test';
import assert from 'node:assert/strict';
import {updateBrowser,NEXT_VERSION,savedSetup} from '../helpers/update-server.js';
import {APP_VERSION} from '../../js/core/version.js';
import {delay} from '../helpers/browser.js';
const storage=`JSON.stringify(['mobingo_app_mode','mobingo_child_state','mobingo_parent_state'].map(k=>localStorage.getItem(k)))`;
async function info(page){await page.click('#header-license-btn');await page.wait('!!document.querySelector("#btn-check-update")');}
async function check(page){await page.click('#btn-check-update');await page.wait(`document.querySelector('#update-status').dataset.phase!=='checking'`,15000);}
test('R-21: 実Workerの同版確認→新版待機→取消→適用→再読込→保存復元',async()=>{
	const {browser,release}=await updateBrowser();let page;
	try{
		page=await browser.page({setup:savedSetup});
		await page.wait('!!navigator.serviceWorker.controller',10000);await page.wait('!!document.querySelector("#bingo-cells-grid")');const saved=await page.eval(storage);await info(page);assert.equal(await page.eval('document.querySelector("#app-version").textContent'),APP_VERSION);await check(page);assert.equal(await page.eval('document.querySelector("#update-status").dataset.phase'),'current');
		await page.eval(`caches.open('other-app-v1').then(c=>c.put('/other-sentinel',new Response('keep')))`);const token=await page.eval('window.documentToken=crypto.randomUUID()');release.next=true;await check(page);assert.equal(await page.eval('document.querySelector("#update-status").dataset.phase'),'available');assert.ok((await page.eval('document.querySelector("#update-status").textContent')).includes(NEXT_VERSION));assert.ok(await page.eval('(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting)()'));
		page.dialog(false);await page.click('#btn-apply-update');await delay(100);assert.equal(await page.eval('window.documentToken'),token);assert.equal(await page.eval(storage),saved);
		page.dialog(true);await page.click('#btn-apply-update');await page.wait(`!window.documentToken && !!document.querySelector('#bingo-cells-grid')`,10000);assert.equal(await page.eval(storage),saved);assert.ok(await page.eval(`document.querySelector('[data-coord="0,0"]').classList.contains('bingo-cell-opened')`));await info(page);assert.equal(await page.eval('document.querySelector("#app-version").textContent'),NEXT_VERSION);
		assert.ok(await page.eval(`caches.has('other-app-v1')`));assert.ok(!(await page.eval(`caches.has('mobingo-v'+${JSON.stringify(APP_VERSION)})`)));
		release.offline=true;const failures=release.failedSwRequests;await check(page);assert.ok(release.failedSwRequests>failures,'SW update request must fail at HTTP fixture');assert.equal(await page.eval('document.querySelector("#update-status").dataset.phase'),'error');
		await page.cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await page.reload();await page.wait('!!document.querySelector("#bingo-cells-grid")');assert.equal(await page.eval(storage),saved);await info(page);await check(page);assert.equal(await page.eval('document.querySelector("#update-status").dataset.phase'),'error');assert.deepEqual(page.errors,[]);
	}finally{try{await page?.close();}finally{await browser.close();}}
});
test('R-21: 新precache取得失敗では旧controllerと保存を保ち、再試行できる',async()=>{
	const {browser,release}=await updateBrowser();let page;
	try{
		page=await browser.page({setup:savedSetup});
		await page.wait('!!navigator.serviceWorker.controller',10000);await page.wait('!!document.querySelector("#bingo-cells-grid")');const saved=await page.eval(storage);await info(page);await check(page);release.next=true;release.fail=true;await check(page);assert.equal(await page.eval('document.querySelector("#update-status").dataset.phase'),'error');assert.equal(await page.eval('document.querySelector("#app-version").textContent'),APP_VERSION);assert.equal(await page.eval(storage),saved);
		release.fail=false;await check(page);assert.equal(await page.eval('document.querySelector("#update-status").dataset.phase'),'available');
	}finally{try{await page?.close();}finally{await browser.close();}}
});
test('R-21: 別タブの適用で閲覧中タブを自動reloadしない',async()=>{
	const {browser,release}=await updateBrowser();let first,second;
	try{
		first=await browser.page({setup:savedSetup});
		await first.wait('!!navigator.serviceWorker.controller',10000);second=await browser.page({contextId:first.contextId});await second.wait('!!navigator.serviceWorker.controller');const token=await second.eval('window.documentToken=crypto.randomUUID()');await first.cdp.send('Target.activateTarget',{targetId:(await first.cdp.send('Target.getTargetInfo')).targetInfo.targetId});await info(first);release.next=true;await check(first);await first.click('#btn-apply-update');await first.wait('!!document.querySelector("#bingo-cells-grid") && !document.querySelector("#license-modal")',10000);assert.equal(await second.eval('window.documentToken'),token);await second.cdp.send('Target.activateTarget',{targetId:(await second.cdp.send('Target.getTargetInfo')).targetInfo.targetId});await info(second);await check(second);assert.equal(await second.eval('document.querySelector("#update-status").dataset.phase'),'available');await second.click('#btn-apply-update');await second.wait('!window.documentToken',10000);assert.deepEqual(second.errors,[]);
	}finally{try{await second?.close();await first?.close();}finally{await browser.close();}}
});
test('R-21: 更新UIのない旧版は全タブ終了後に自然更新し保存を復元する',async()=>{
	const {browser,release}=await updateBrowser();release.legacy=true;let page;
	try{
		page=await browser.page();
		await page.eval(savedSetup);const versions=new Map();page.cdp.on('ServiceWorker.workerVersionUpdated',event=>{for(const value of event.versions)versions.set(value.versionId,value)});await page.cdp.send('ServiceWorker.enable');
		await page.wait('!!navigator.serviceWorker.controller',10000);const saved=await page.eval(storage);release.next=true;await page.eval('(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update()})()');await page.wait('(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting)()',10000);
		const waitWorker=async(predicate)=>{const until=Date.now()+10000;while(Date.now()<until){const result=[...versions.values()].find(predicate);if(result)return result;await delay(25);}assert.fail('Expected worker lifecycle notification')};
		const waiting=await waitWorker(v=>v.status==='installed');await page.cdp.send('Page.navigate',{url:'about:blank'});await waitWorker(v=>v.versionId===waiting.versionId&&v.status==='activated');
		await page.cdp.send('Page.navigate',{url:browser.origin});await page.wait('!!document.querySelector("#bingo-cells-grid")',10000);assert.equal(await page.eval(storage),saved);await info(page);assert.equal(await page.eval('document.querySelector("#app-version").textContent'),NEXT_VERSION);assert.deepEqual(page.errors,[]);
	}finally{try{await page?.close();}finally{await browser.close();}}
});
