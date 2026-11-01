import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser } from '../helpers/browser.js';
import { visible, tap, reveal } from '../helpers/layout.js';

let browser;
before(async () => { browser = await startBrowser(); });
after(async () => { await browser?.close(); });
const mockApis = `window.copied=[];window.shared=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{copied.push(text)}},configurable:true});Object.defineProperty(navigator,'share',{value:async data=>{shared.push({data,active:navigator.userActivation.isActive})},configurable:true,writable:true});`;
const child = { childSeed: 'ABCD', displayName: '参加者', openedCellCoords: ['2,2', '0,0'], specialRuleActive: false };
const parent = { parentSeed: '1234', mode: 'mode_b', currentTurn: 1, specialRuleTurn: null, registeredChildSeeds: [] };
const state = mode => `localStorage.setItem('mobingo_app_mode','${mode}');localStorage.setItem('mobingo_child_state',${JSON.stringify(JSON.stringify(child))});localStorage.setItem('mobingo_parent_state',${JSON.stringify(JSON.stringify(parent))});`;
async function open(page) {
	assert.ok(await page.eval('!!document.querySelector("#header-share-btn")'));
	await page.click('#header-share-btn');
	await page.wait('!!document.querySelector("#app-share-modal")');
}
const decodeQr = `(()=>{const c=document.querySelector('#share-qr-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height);return jsQR(d.data,d.width,d.height).data;})()`;

test('R-23: 共通ヘッダーから3方式を選び、同じアプリURLをコピー・共有・QRで渡す', async () => {
	const page = await browser.page({ setup: mockApis + state('child') });
	try {
		await page.wait('!!document.querySelector("#bingo-cells-grid")');
		const before = await page.eval('localStorage.mobingo_child_state');
		await page.eval(`history.replaceState(null,'','/events/bingo/index.html?seed=SECRET&name=private#hidden')`);
		await open(page);
		await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
		await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight' });
		assert.equal(await page.eval('!!document.querySelector("#app-share-modal")'), true);
		const expected = `${browser.origin}/events/bingo/index.html`;
		assert.equal(await page.eval('document.querySelector("#share-url").value'), expected);
		await page.click('#btn-copy-url');
		await page.wait('document.querySelector("#share-status").textContent.includes("コピーしました")');
		assert.deepEqual(await page.eval('copied'), [expected]);
		await page.click('#btn-native-share');
		await page.wait('document.querySelector("#share-status").textContent.includes("操作が完了")');
		assert.deepEqual(await page.eval('shared'), [{ data: { title: 'Mobingo', url: expected }, active: true }]);
		await page.click('#btn-share-qr');
		await page.wait('!document.querySelector("#share-qr-canvas").hidden');
		assert.equal(await page.eval(decodeQr), expected);
		await page.click('#btn-share-qr');
		assert.equal(await page.eval('document.querySelector("#share-qr-panel").hidden'), true);
		await page.click('#btn-share-qr');
		assert.equal(await page.eval(decodeQr), expected);
		await page.click('#close-share-btn');
		assert.equal(await page.eval('document.activeElement.id'), 'header-share-btn');
		assert.equal(await page.eval('localStorage.mobingo_child_state'), before);
		await page.click('.child-portrait-footer .btn-action-show-qr');
		await page.wait('document.querySelector("#qr-canvas").width===200');
		assert.match(await page.eval(`(()=>{const c=document.querySelector('#qr-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height);return jsQR(d.data,d.width,d.height).data;})()`), /^mobingo:child:v2:/);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

for (const mode of ['select', 'child', 'host']) for (const width of [320, 381]) {
	test(`R-23: ${width}pxの${mode}ヘッダーに全操作を収め、共有後もゲームを保持する`, async () => {
		const page = await browser.page({ width, height: 568, mobile: true, setup: mockApis + state(mode) });
		try {
			if (mode === 'child') await page.wait('!!document.querySelector("#bingo-cells-grid")');
			if (mode === 'host') await page.wait('!!document.querySelector("#slide-thumb")');
			const before = await page.eval('JSON.stringify({...localStorage})');
			for (const selector of ['#header-share-btn', '#header-sound-btn', '#header-haptics-btn', '#header-license-btn', ...(mode !== 'select' ? ['#header-switch-mode-btn'] : []), ...(mode === 'host' ? ['#btn-projector'] : [])]) await visible(page, selector, true);
			await tap(page, '#header-share-btn');
			await tap(page, '#btn-copy-url', '#app-share-modal .modal-content');
			await page.wait('copied.length===1');
			await tap(page, '#close-share-btn', '#app-share-modal .modal-content');
			assert.equal(await page.eval('JSON.stringify({...localStorage})'), before);
			assert.deepEqual(page.errors, []);
		} finally { await page.close(); }
	});
}

for (const [width, height] of [[390, 844], [568, 320], [640, 280], [844, 220], [820, 1180]]) {
	test(`R-23: ${width}×${height}の実touchで3方式・QR・閉じるへ到達する`, async () => {
		const page = await browser.page({ width, height, mobile: true, setup: mockApis });
		try {
			await tap(page, '#header-share-btn');
			for (const selector of ['#share-url', '#btn-copy-url', '#btn-native-share', '#btn-share-qr']) await tap(page, selector, '#app-share-modal .modal-content');
			await page.wait('!document.querySelector("#share-qr-canvas").hidden');
			await reveal(page, '#share-qr-canvas', '#app-share-modal .modal-content');
			assert.equal(await page.eval(decodeQr), `${browser.origin}/`);
			await tap(page, '#close-share-btn', '#app-share-modal .modal-content');
			assert.equal(await page.eval('!!document.querySelector("#app-share-modal")'), false);
			assert.deepEqual(page.errors, []);
		} finally { await page.close(); }
	});
}

for (const clipboard of ['undefined', `{writeText:async()=>{throw new DOMException('denied','NotAllowedError')}}`]) {
	test(`R-23: コピー非対応・拒否時は全選択と手動コピー案内、共有非対応でもQRを利用する ${clipboard}`, async () => {
		const page = await browser.page({ setup: `Object.defineProperty(navigator,'clipboard',{value:${clipboard},configurable:true});Object.defineProperty(navigator,'share',{value:undefined,configurable:true});` });
		try {
			await open(page);
			assert.equal(await page.eval('document.querySelector("#btn-native-share").disabled'), true);
			await page.click('#btn-copy-url');
			await page.wait('document.querySelector("#share-status").textContent.includes("長押し")');
			assert.deepEqual(await page.eval(`(()=>{const e=document.querySelector('#share-url');return [e.selectionStart,e.selectionEnd,e.value.length,document.activeElement===e]})()`), [0, `${browser.origin}/`.length, `${browser.origin}/`.length, true]);
			await page.click('#btn-share-qr'); await page.wait('!document.querySelector("#share-qr-canvas").hidden');
			assert.equal(await page.eval(decodeQr), `${browser.origin}/`);
			assert.deepEqual(page.errors, []);
		} finally { await page.close(); }
	});
}

test('R-23: 共有の取消・同期例外・再試行を区別する', async () => {
	const page = await browser.page({ setup: mockApis });
	try {
		await open(page);
		await page.eval(`navigator.share=async()=>{throw new DOMException('cancel','AbortError')}`);
		await page.click('#btn-native-share'); await page.wait('document.querySelector("#share-status").textContent.includes("キャンセル")');
		await page.eval(`navigator.share=()=>{throw new Error('denied')}`);
		await page.click('#btn-native-share'); await page.wait('document.querySelector("#share-status").textContent.includes("共有できません")');
		await page.eval(`navigator.share=async data=>shared.push(data)`);
		await page.click('#btn-native-share'); await page.wait('shared.length===1');
		assert.equal(await page.eval('document.querySelector("#btn-native-share").disabled'), false);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

for (const action of ['copy', 'native']) for (const outcome of ['resolve', 'reject']) {
	test(`R-23: ${action}/${outcome}保留中の連打・閉鎖・再表示・旧ボタン再配送を抑止する`, async () => {
		const page = await browser.page({ setup: mockApis });
		try {
			await open(page);
			await page.eval(`window.operationCalls=0;window.operationPromise=new Promise((resolve,reject)=>window.releaseOperation=${outcome});${action === 'copy' ? 'navigator.clipboard.writeText' : 'navigator.share'}=()=>{operationCalls++;return operationPromise};`);
			await page.click(action === 'copy' ? '#btn-copy-url' : '#btn-native-share');
			await page.eval(`window.oldModal=document.querySelector('#app-share-modal');window.oldText=oldModal.innerHTML;for(const selector of ['#btn-copy-url','#btn-native-share'])oldModal.querySelector(selector).dispatchEvent(new MouseEvent('click',{bubbles:true}));`);
			assert.equal(await page.eval('operationCalls'), 1);
			await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
			await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
			assert.equal(await page.eval('!!document.querySelector("#app-share-modal")'), false);
			await open(page);
			await page.eval(`releaseOperation(new Error('late failure'));operationPromise.catch(()=>{}).then(()=>new Promise(resolve=>setTimeout(resolve,0)))`);
			assert.equal(await page.eval('oldModal.innerHTML===oldText'), true);
			assert.equal(await page.eval('document.querySelector("#share-status").textContent'), '');
			await page.eval(`oldModal.querySelector('#btn-copy-url').dispatchEvent(new MouseEvent('click',{bubbles:true}));oldModal.querySelector('#btn-native-share').dispatchEvent(new MouseEvent('click',{bubbles:true}));oldModal.querySelector('#btn-share-qr').click()`);
			assert.equal(await page.eval('operationCalls'), 1);
			assert.deepEqual(page.errors, []);
		} finally { await page.close(); }
	});
}

test('R-23: QRの二重生成・失敗後の再試行・閉鎖後の完了を扱う', async () => {
	const page = await browser.page({ setup: mockApis });
	try {
		await open(page);
		await page.eval(`window.qrLibrary=QRCode;window.drawQr=QRCode.toCanvas.bind(QRCode);window.qrCalls=0;window.pendingQr=[];QRCode.toCanvas=(...args)=>{qrCalls++;return new Promise((resolve,reject)=>pendingQr.push({resolve:async()=>{await drawQr(...args);resolve()},reject}));}`);
		await page.click('#btn-share-qr'); await page.click('#btn-share-qr'); await page.click('#btn-share-qr');
		assert.equal(await page.eval('qrCalls'), 1);
		assert.equal(await page.eval('getComputedStyle(document.querySelector("#share-qr-canvas")).display'), 'none');
		await page.eval('pendingQr.shift().reject(new Error("failed"))');
		await page.wait('document.querySelector("#share-qr-status").textContent.includes("作成できません")');
		assert.equal(await page.eval('getComputedStyle(document.querySelector("#share-qr-canvas")).display'), 'none');
		await page.click('#btn-share-qr'); await page.click('#btn-share-qr');
		await page.eval('pendingQr.shift().resolve()'); await page.wait('!document.querySelector("#share-qr-canvas").hidden');
		assert.equal(await page.eval(decodeQr), `${browser.origin}/`);
		await page.click('#close-share-btn'); await open(page);
		await page.click('#btn-share-qr');
		await page.eval(`window.oldModal=document.querySelector('#app-share-modal');window.oldText=oldModal.innerHTML`);
		await page.click('#close-share-btn'); await open(page);
		await page.eval('pendingQr.shift().resolve().then(()=>new Promise(resolve=>setTimeout(resolve,0)))');
		assert.equal(await page.eval('oldModal.innerHTML===oldText'), true);
		assert.equal(await page.eval('document.querySelector("#share-qr-panel").hidden'), true);
		await page.click('#btn-share-qr');
		await page.eval(`window.oldModal=document.querySelector('#app-share-modal');window.oldText=oldModal.innerHTML`);
		await page.click('#close-share-btn');
		await page.eval(`pendingQr.shift().reject(new Error('late QR failure'));new Promise(resolve=>setTimeout(resolve,0))`);
		assert.equal(await page.eval('oldModal.innerHTML===oldText'), true);
		await open(page);
		await page.eval('window.QRCode=undefined'); await page.click('#btn-share-qr');
		await page.wait('document.querySelector("#share-qr-status").textContent.includes("作成できません")');
		await page.eval('window.QRCode=qrLibrary');
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

test('R-23: 再表示は1画面とし、背景閉鎖・役割変更で旧共有画面を破棄する', async () => {
	const page = await browser.page({ setup: mockApis });
	try {
		await open(page);
		await page.eval(`(async()=>{const {showShareModal}=await import('/js/views/share-modal.js');showShareModal();})()`);
		assert.equal(await page.eval('document.querySelectorAll("#app-share-modal").length'), 1);
		await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 2, y: 2, button: 'left', clickCount: 1 });
		await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 2, y: 2, button: 'left', clickCount: 1 });
		assert.equal(await page.eval('!!document.querySelector("#app-share-modal")'), false);
		await open(page);
		await page.eval('document.querySelector("#btn-select-child").click()');
		assert.equal(await page.eval('!!document.querySelector("#app-share-modal")'), false);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});

test('R-23: 実ClipboardへのコピーとオフラインSW再訪後の共有用QR', async () => {
	const page = await browser.page();
	try {
		await page.cdp.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: browser.origin, browserContextId: page.contextId });
		await open(page); await page.click('#btn-copy-url');
		await page.wait('document.querySelector("#share-status").textContent.includes("コピーしました")');
		assert.equal(await page.eval('navigator.clipboard.readText()'), `${browser.origin}/`);
		await page.click('#close-share-btn');
		await page.wait('!!navigator.serviceWorker.controller', 10000);
		await page.cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
		await page.reload(); await open(page);
		await page.click('#btn-share-qr'); await page.wait('!document.querySelector("#share-qr-canvas").hidden');
		assert.equal(await page.eval(decodeQr), `${browser.origin}/`);
		assert.deepEqual(page.errors, []);
	} finally { await page.close(); }
});
