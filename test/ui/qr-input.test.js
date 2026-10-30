import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, delay } from '../helpers/browser.js';
let browser;
before(async()=>{browser=await startBrowser();});
after(async()=>{await browser?.close();});
// 光学認識を代替し、カメラ映像→復号文字列からの入力境界を試験する。
const fakeCamera=`navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;c.getContext('2d').fillRect(0,0,640,480);return c.captureStream(10);};`;
for(const mode of ['registration','verification']){
	test(`R-10: ${mode}のQR完全形式検査`,async()=>{
		const page=await browser.page({setup:fakeCamera});
		try{
			await page.eval('window.nextPayload=null;window.qrSeen=[];window.jsQR=()=>{window.qrSeen.push(window.nextPayload);return window.nextPayload===null?null:{data:window.nextPayload};}');
			await page.click('#btn-select-host');
			if(mode==='registration')await page.click('#opt-mode-a');
			await page.click('#btn-host-proceed');
			if(mode==='verification'){await page.wait('!!document.querySelector("#slide-track")');await page.click('#btn-verify-qr');}
			await page.wait(`document.querySelector('${mode==='registration'?'#scanner-video':'#v-video'}').readyState===4`);
			for(const payload of ['https://example.com/ABCD','mobingo:child:ABCDextra','ABCDextra','AB!D','<svg onload=alert(1)>']){
				await page.eval(`window.nextPayload=${JSON.stringify(payload)}`);
				await page.wait(`window.qrSeen.includes(${JSON.stringify(payload)})`);
				if(mode==='registration')assert.equal(await page.eval('document.querySelector("#scanner-count").textContent'),'0');
				else assert.equal(await page.eval('!!document.querySelector("#v-recheck-btn")'),false);
			}
			for(const payload of ['mobingo:child:ABCD','ZZZZ']){
				await page.eval(`window.nextPayload=${JSON.stringify(payload)}`);
				if(mode==='registration'){
					await page.wait(`document.querySelector('#scanner-count').textContent==='${payload==='ZZZZ'?2:1}'`,3000);await delay(1250);
				}else{
					await page.wait('!!document.querySelector("#v-recheck-btn")');assert.match(await page.eval('document.querySelector("#verify-body").textContent'),new RegExp(payload.slice(-4)));
					await page.eval('window.nextPayload=null');await page.click('#v-recheck-btn');
				}
			}
			assert.deepEqual(page.errors,[]);
		}finally{await page.close();}
	});
}
