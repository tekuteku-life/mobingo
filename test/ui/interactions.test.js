import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, delay } from '../helpers/browser.js';

let browser;
before(async () => { browser = await startBrowser(); });
after(async () => { await browser?.close(); });
const cell = '[data-coord="0,0"]';
async function participant(options) {
	const page = await browser.page(options);
	await page.click('#btn-select-child'); await page.input('#child-seed-input', 'ABCD');
	await page.click('#btn-start-card'); await page.wait('!!document.querySelector("#bingo-cells-grid")');
	return page;
}

test('R-05: pointercancelで未開封セルを開けない', async () => {
	const page = await participant();
	try {
		await page.pointer(cell, 'pointerdown'); await page.pointer(cell, 'pointercancel');
		await delay(200);
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_child_state).openedCellCoords.includes("0,0")'), false);
	} finally { await page.close(); }
});

test('R-05: 10px移動したタップをキャンセルする', async () => {
	const page = await participant();
	try {
		await page.pointer(cell, 'pointerdown'); await page.pointer(cell, 'pointermove', { x:30 }); await page.pointer(cell, 'pointerup', { x:30 });
		await delay(200);
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_child_state).openedCellCoords.includes("0,0")'), false);
	} finally { await page.close(); }
});

test('R-05/06/12: タップ・短押し・長押し・FREE・リロード', async () => {
	const page = await participant();
	try {
		await page.click(cell); await page.wait('document.querySelector(\'[data-coord="0,0"]\').classList.contains("bingo-cell-opened")');
		await page.click(cell); await delay(180);
		assert.ok(await page.eval('document.querySelector(\'[data-coord="0,0"]\').classList.contains("bingo-cell-opened")'));
		await page.pointer(cell, 'pointerdown'); await delay(650); await page.pointer(cell, 'pointerup');
		await page.wait('document.querySelector(\'[data-coord="0,0"]\').classList.contains("bingo-cell-unopened")');
		await page.click('[data-free="true"]');
		assert.ok(await page.eval('document.querySelector(\'[data-free="true"]\').classList.contains("bingo-cell-opened")'));
		await page.click('.child-portrait-footer .btn-action-toggle-special');
		await page.reload(); await page.wait('!!document.querySelector("#bingo-cells-grid")');
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_child_state).specialRuleActive'), true);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

test('R-07: スライドpointercancelで抽選を開始しない', async () => {
	const page = await browser.page();
	try {
		await page.click('#btn-select-host'); await page.click('#btn-host-proceed');
		await page.wait('!!document.querySelector("#slide-thumb")');
		await page.drag({ cancel: true });
		assert.doesNotMatch(await page.eval('document.querySelector("#barrel-status-hint").textContent'), /回転中/);
	} finally { await page.close(); }
});

for (const [width, height] of [[390,844], [844,390]]) {
	test(`R-14/15: ${width}×${height}のカード・主要操作とQR/情報モーダル`, async () => {
		const page = await participant({ width, height });
		try {
			const prefix = width > height ? '.child-landscape-panel' : '.child-portrait-footer';
			for (const selector of ['#bingo-cells-grid', `${prefix} .btn-action-show-qr`, `${prefix} .btn-action-reset-card`]) {
				assert.ok(await page.eval(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return r.width>0 && r.height>0 && r.left>=0 && r.top>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1; })()`), selector);
			}
			await page.click(`${prefix} .btn-action-show-qr`);
			assert.equal(await page.eval('document.querySelector("#qr-canvas").width'), 200);
			const decoded = await page.eval('(() => { const c=document.querySelector("#qr-canvas"), d=c.getContext("2d").getImageData(0,0,c.width,c.height); return jsQR(d.data,d.width,d.height).data; })()');
			assert.equal(decoded, 'mobingo:child:ABCD');
			await page.click('#close-qr-bottom-btn'); await page.click('#header-license-btn');
			assert.match(await page.eval('document.querySelector("#license-modal").textContent'), /デンソーウェーブ/);
			await page.click('#close-license-btn'); assert.equal(await page.eval('!!document.querySelector("#license-modal")'), false);
			assert.deepEqual(page.errors, []);
		} finally { await page.close(); }
	});
}

test('R-12: 不正保存値をDOMに描画しない', async () => {
	const page = await browser.page({ setup: `localStorage.setItem('mobingo_app_mode','child'); localStorage.setItem('mobingo_child_state',JSON.stringify({childSeed:'<svg onload="window.pwned=1">',openedCellCoords:[],specialRuleActive:false}));` });
	try {
		await page.wait('!!document.querySelector("#child-seed-input")');
		assert.equal(await page.eval('window.pwned'), undefined);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

test('R-14: 844×390のセットアップに実wheelでスクロール到達できる',async()=>{
	const page=await browser.page({width:844,height:390});
	try{
		for(const selector of ['#btn-select-host','#btn-host-proceed']){
			await page.wait('!!document.querySelector(".setup-screen")');
			await page.cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:420,y:250,deltaX:0,deltaY:800});
			await page.wait('document.querySelector(".setup-screen").scrollTop>0');
			assert.ok(await page.eval(`(()=>{const e=document.querySelector('${selector}'),r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=48&&r.bottom<=innerHeight&&(h===e||e.contains(h));})()`));
			await page.click(selector);
		}
		await page.wait('!!document.querySelector("#slide-thumb")');assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});
