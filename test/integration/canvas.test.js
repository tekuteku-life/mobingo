import test from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser } from '../helpers/browser.js';

test('R-16: Canvas破棄でRAFとResizeObserverを解放する', async()=>{
	const browser=await startBrowser();const page=await browser.page();
	try{
		const actual=await page.eval(`(async()=>{
			const {BingoBarrel}=await import('/js/components/bingo-barrel.js');
			let disconnected=0,canceled=0;
			const Observer=window.ResizeObserver,raf=window.requestAnimationFrame,caf=window.cancelAnimationFrame;
			window.ResizeObserver=class{observe(){}disconnect(){disconnected++;}};
			window.requestAnimationFrame=()=>123;window.cancelAnimationFrame=()=>canceled++;
			const canvas=document.createElement('canvas');const barrel=new BingoBarrel(canvas);
			barrel.startSpin();barrel.destroy();barrel.destroy();
			window.ResizeObserver=Observer;window.requestAnimationFrame=raf;window.cancelAnimationFrame=caf;
			return {disconnected,canceled};
		})()`);
		assert.deepEqual(actual,{disconnected:1,canceled:1});assert.deepEqual(page.errors,[]);
	}finally{await page.close();await browser.close();}
});
