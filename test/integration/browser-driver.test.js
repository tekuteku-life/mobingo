import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {startBrowser} from '../helpers/browser.js';
test('R-16/21 driver: 初期化失敗を解放し、同じブラウザでCanvas2D描画と終了を実行する',async()=>{
	let requests=0,stall=false,broken=true,browser,page;
	const slow=createServer(()=>{requests++}),nativeFetch=globalThis.fetch;
	try{
		await new Promise(r=>slow.listen(0,'127.0.0.1',r));
		globalThis.fetch=(url,options)=>nativeFetch(stall&&String(url).endsWith('/json/list')?`http://127.0.0.1:${slow.address().port}`:url,options);
		browser=await startBrowser({route:async()=>({type:'text/html',body:broken?'<!doctype html><p>broken</p>':'<!doctype html><div id="app-main">ready</div><canvas id="probe" width="8" height="8"></canvas>'})});
		assert.equal(await browser.contextCount(),0);await assert.rejects(browser.page({readyTimeout:100}),/Browser condition timed out/);assert.equal(await browser.contextCount(),0);
		stall=true;await assert.rejects(browser.page({connectionTimeout:50}),/timeout|aborted/i);assert.ok(requests>0);assert.equal(await browser.contextCount(),0);stall=false;
		broken=false;page=await browser.page();assert.equal(await browser.contextCount(),1);assert.deepEqual(await page.eval(`(()=>{const ctx=document.querySelector('#probe').getContext('2d');ctx.resetTransform();ctx.fillRect(0,0,4,4);return [...ctx.getImageData(0,0,1,1).data]})()`),[0,0,0,255]);await page.close();page=null;assert.equal(await browser.contextCount(),0);
	}finally{
		try{await page?.close()}finally{
			try{await browser?.close()}finally{
				globalThis.fetch=nativeFetch;slow.closeAllConnections();if(slow.listening)await new Promise(r=>slow.close(r));
			}
		}
	}
	await assert.rejects(fetch(browser.origin,{signal:AbortSignal.timeout(500)}));
});
