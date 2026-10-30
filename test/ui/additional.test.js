import test,{before,after}from'node:test';
import assert from'node:assert/strict';
import{startBrowser,delay}from'../helpers/browser.js';
let browser;
before(async()=>{browser=await startBrowser();});after(async()=>{await browser?.close();});
const childSetup=state=>`localStorage.setItem('mobingo_app_mode','child');localStorage.setItem('mobingo_child_state',${JSON.stringify(JSON.stringify(state))});`;

test('R-01/15: ロゴ確認取消・承認と音声往復、SW登録拒否',async()=>{
	const page=await browser.page({setup:`navigator.serviceWorker.register=()=>Promise.reject(new Error('registration denied'));`});
	try{
		await page.click('#header-logo-btn');await page.click('#header-sound-btn');
		assert.equal(await page.eval('document.querySelector("#header-sound-btn").title'),'ミュート解除');
		assert.equal(await page.eval('(async()=>{const {soundManager}=await import("/js/core/audio.js");return soundManager.getMuted();})()'),true);
		assert.equal(await page.eval('document.querySelectorAll("#header-sound-btn line").length'),2);
		await page.click('#header-sound-btn');
		assert.equal(await page.eval('document.querySelector("#header-sound-btn").title'),'ミュート');
		assert.equal(await page.eval('(async()=>{const {soundManager}=await import("/js/core/audio.js");return soundManager.getMuted();})()'),false);
		assert.equal(await page.eval('document.querySelectorAll("#header-sound-btn line").length'),0);
		await page.click('#btn-select-child');await page.click('#btn-regen-seed');
		assert.match(await page.eval('document.querySelector("#child-seed-input").value'),/^[0-9A-HJKMNP-TV-Z]{4}$/);
		page.dialog(false);await page.click('#header-logo-btn');assert.ok(await page.eval('!!document.querySelector("#child-seed-input")'));
		page.dialog(true);await page.click('#header-logo-btn');assert.ok(await page.eval('!!document.querySelector("#btn-select-host")'));
		await page.click('#btn-select-host');await page.click('#btn-host-regen');await page.input('#host-seed-input','ABC');await page.click('#btn-host-proceed');
		assert.ok(await page.eval('!!document.querySelector("#host-seed-input")'));assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

for(const [rows,level]of[[2,'double'],[3,'triple']]){
	test(`R-06: ${level}リーチ表示・QR背景終了・リセット取消と承認`,async()=>{
		const opened=['2,2'];for(let r=0;r<rows;r++)for(let c=0;c<4;c++)opened.push(`${r},${c}`);
		const state={childSeed:'ABCD',openedCellCoords:[...new Set(opened)],specialRuleActive:false};
		const page=await browser.page({setup:childSetup(state)});
		try{
			await page.wait(`!!document.querySelector('.reach-${level}')`);await page.click('.child-portrait-footer .btn-action-show-qr');
			await page.cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:2,y:2,button:'left',clickCount:1});await page.cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:2,y:2,button:'left',clickCount:1});
			assert.equal(await page.eval('!!document.querySelector("#child-qr-modal")'),false);
			page.dialog(false);await page.click('.child-portrait-footer .btn-action-reset-card');assert.ok(await page.eval('!!document.querySelector("#bingo-cells-grid")'));
			page.dialog(true);await page.click('.child-portrait-footer .btn-action-reset-card');assert.ok(await page.eval('!!document.querySelector("#child-seed-input")'));assert.equal(await page.eval('localStorage.getItem("mobingo_child_state")'),null);
			assert.deepEqual(page.errors,[]);
		}finally{await page.close();}
	});
}

test('R-06: ビンゴ演出・自動QR・追加タップ・長押し復元',async()=>{
	const page=await browser.page({setup:childSetup({childSeed:'ABCD',openedCellCoords:['2,2','0,0','0,1','0,2','0,3'],specialRuleActive:false})});
	try{
		await page.wait('!!document.querySelector("#bingo-cells-grid")');await page.click('[data-coord="0,4"]');
		await page.wait('!!document.querySelector("#child-qr-modal")');assert.match(await page.eval('document.querySelector("#child-qr-modal").textContent'),/BINGO達成中/);
		await page.click('#close-qr-bottom-btn');
		await page.pointer('[data-coord="0,4"]','pointerdown');await delay(650);await page.pointer('[data-coord="0,4"]','pointerup');
		await page.wait('!document.querySelector(".bingo-board-glow")');assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

test('R-16: ビンゴ直後のカード再作成で紙吹雪Canvasを解放する',async()=>{
	const page=await browser.page({setup:childSetup({childSeed:'ABCD',openedCellCoords:['2,2','0,0','0,1','0,2','0,3'],specialRuleActive:false})});
	try{
		await page.wait('!!document.querySelector("#bingo-cells-grid")');await page.click('[data-coord="0,4"]');await page.wait('document.querySelectorAll("body > canvas").length>0');
		await page.click('.child-portrait-footer .btn-action-reset-card');assert.ok(await page.eval('!!document.querySelector("#child-seed-input")'));
		assert.equal(await page.eval('document.querySelectorAll("body > canvas").length'),0);assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

test('R-05: pointerなしの移動と縦10px移動をキャンセルする',async()=>{
	const page=await browser.page({setup:childSetup({childSeed:'ABCD',openedCellCoords:['2,2'],specialRuleActive:false})});
	try{
		await page.wait('!!document.querySelector("#bingo-cells-grid")');
		const cell='[data-coord="0,0"]';await page.pointer(cell,'pointermove');await page.pointer(cell,'pointerdown');await page.pointer(cell,'pointermove',{y:30});await page.pointer(cell,'pointerup',{y:30});
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_child_state).openedCellCoords.includes("0,0")'),false);assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});
