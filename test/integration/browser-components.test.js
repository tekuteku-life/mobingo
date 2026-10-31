import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {startBrowser} from '../helpers/browser.js';
let browser;
before(async()=>{browser=await startBrowser();});
after(async()=>{await browser?.close();});

test('R-07: スライダー公開APIの無効化・再有効化・破棄と複数pointer',async()=>{
	const page=await browser.page();
	try{
		await page.eval(`(async()=>{const {createSlideAction}=await import('/js/components/slide-action.js');const div=document.createElement('div');div.style='position:fixed;left:100px;top:100px;width:300px';document.body.append(div);window.slideCalls=0;window.slide=createSlideAction(div,{onSuccess:()=>window.slideCalls++});})()`);
		await page.eval('slide.setDisabled(true)');await page.pointer('#slide-thumb','pointerdown');assert.equal(await page.eval('slideCalls'),0);
		await page.eval('slide.setDisabled(false)');await page.pointer('#slide-thumb','pointerdown');await page.pointer('#slide-thumb','pointerdown',{id:2});
		await page.pointer('#slide-thumb','pointermove',{id:2,x:400});await page.pointer('#slide-thumb','pointerup',{id:2,x:400});assert.equal(await page.eval('slideCalls'),0);
		await page.pointer('#slide-thumb','pointercancel');await page.drag();assert.equal(await page.eval('slideCalls'),1);
		await page.eval('document.querySelector("#slide-track").style.width="1px"');
		await page.pointer('#slide-thumb','pointerdown');await page.pointer('#slide-thumb','pointermove',{x:400});await page.pointer('#slide-thumb','pointerup',{x:400});assert.equal(await page.eval('slideCalls'),1);
		await page.eval('slide.destroy();slide.reset();document.querySelector("#slide-track").style.width="300px"');
		await page.pointer('#slide-thumb','pointerdown');await page.pointer('#slide-thumb','pointermove',{x:400});await page.pointer('#slide-thumb','pointerup',{x:400});
		assert.equal(await page.eval('slideCalls'),1);assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

test('R-14/16: Canvas球の全5列描画と監視なし環境の破棄',async()=>{
	const page=await browser.page();
	try{
		const result=await page.eval(`(async()=>{const {BingoBarrel}=await import('/js/components/bingo-barrel.js');const canvas=document.createElement('canvas');canvas.style='width:300px;height:300px';document.body.append(canvas);const observer=window.ResizeObserver;delete window.ResizeObserver;Object.defineProperty(window,'devicePixelRatio',{value:0,configurable:true});const barrel=new BingoBarrel(canvas);const values=[];for(const number of [1,16,31,46,61]){barrel.stopSpin(number);for(let i=0;i<30;i++)barrel.update();barrel.draw();values.push([barrel.ejectedBall.value,barrel.ejectedBall.letter,barrel.ejectedBall.opacity]);}barrel.destroy();window.ResizeObserver=observer;return values;})()`);
		assert.deepEqual(result,[[1,'B',1],[16,'I',1],[31,'N',1],[46,'G',1],[61,'O',1]]);assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

test('R-15: 情報モーダルの多重呼出しと背景終了',async()=>{
	const page=await browser.page();
	try{
		await page.click('#header-license-btn');
		await page.eval('(async()=>{const {showLicenseModal}=await import("/js/views/license-modal.js");showLicenseModal();})()');
		assert.equal(await page.eval('document.querySelectorAll("#license-modal").length'),1);
		await page.cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:2,y:2,button:'left',clickCount:1});
		await page.cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:2,y:2,button:'left',clickCount:1});
		assert.equal(await page.eval('!!document.querySelector("#license-modal")'),false);assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});
