import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser, delay } from '../helpers/browser.js';
import { generateDrawSequence, generateBingoCard } from '../../js/core/bingo.js';

let browser;
before(async()=>{browser=await startBrowser();});
after(async()=>{await browser?.close();});
const hostState=(turn=0,extra={})=>({parentSeed:'1234',mode:'mode_b',currentTurn:turn,specialRuleTurn:null,registeredChildSeeds:[],...extra});
async function host(state, options={}) {
	const page=await browser.page({...options,setup:`localStorage.setItem('mobingo_app_mode','select'); localStorage.setItem('mobingo_parent_state',${JSON.stringify(JSON.stringify(state))}); ${options.setup||''}`});
	await page.click('#btn-select-host');
	await page.wait('!!document.querySelector("#slide-track")'); return page;
}

test('R-07/08/11: 自然抽選完了・連打抑止・Undo取消・解禁後Undo',async()=>{
	const page=await host(hostState());
	try {
		await page.drag({ratio:0.3}); assert.doesNotMatch(await page.eval('document.querySelector("#barrel-status-hint").textContent'),/回転中/);
		await page.drag(); await page.drag();
		await page.wait('JSON.parse(localStorage.mobingo_parent_state).currentTurn===1',8500);
		assert.equal(await page.eval('document.querySelectorAll(".history-chips-list > div").length'),1);
		page.dialog(false); await page.click('#btn-undo-ball'); assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).currentTurn'),1);
		await page.click('#btn-reset-game'); assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).currentTurn'),1);
		await page.click('#btn-unlock-special'); assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).specialRuleTurn'),null);
		page.dialog(true); await page.click('#btn-unlock-special');
		await page.wait('!document.querySelector(".modal-overlay")',5000);
		await page.click('#btn-undo-ball'); assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).specialRuleTurn'),1);
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).currentTurn'),0);
		assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

for(const turn of [0,75]) {
	test(`R-08/10/14: ${turn}手の照合・履歴・出目ボード・投影`,async()=>{
		const page=await host(hostState(turn),{width:844,height:390});
		try {
			assert.equal(await page.eval('document.querySelectorAll(".host-board-cell.cell-drawn,.host-board-cell.cell-latest").length'),turn);
			assert.equal(await page.eval('document.querySelectorAll(".history-chips-list > div").length'),Math.min(turn,20));
			if(turn===75) assert.ok(await page.eval('document.querySelector("#slide-track").classList.contains("disabled")'));
			await page.click('#btn-projector'); assert.equal(await page.eval('!!document.querySelector("#projector-view")'),true); await page.click('#close-proj-btn');
			await page.click('#btn-verify-qr'); await page.click('#tab-manual-btn');
			await page.input('#v-manual-input','ABCD'); await page.click('#verify-manual-form button');
			await page.wait('!!document.querySelector("#v-recheck-btn")');
			assert.match(await page.eval('document.querySelector("#verify-body").textContent'),turn===75?/有効なビンゴ/:/未達成または無効/);
			await page.click('#v-recheck-btn'); await page.click('#tab-camera-btn'); await page.click('#tab-manual-btn'); await page.click('#close-verify-btn');
			assert.deepEqual(page.errors,[]);
		}finally{await page.close();}
	});
}

test('R-09: モードAの集計・次球予告・成立者ID・逆ビンゴ賞',async()=>{
	const sequence=await generateDrawSequence('1234');
	const seeds=['ABCD','ZZZZ','0000','1111'];
	const cards=await Promise.all(seeds.map(generateBingoCard));
	// Productionのライン定義・判定関数を使わず12本を直接組み立てる。
	function stats(card,turn){
		const lines=[];
		for(let i=0;i<5;i++){lines.push(card.grid[i]);lines.push(card.grid.map(row=>row[i]));}
		lines.push(card.grid.map((row,i)=>row[i]),card.grid.map((row,i)=>row[4-i]));
		const drawn=new Set(sequence.slice(0,turn));
		const missing=lines.map(line=>line.filter(cell=>cell.value!==0&&!drawn.has(cell.value)));
		const bingo=missing.some(cells=>cells.length===0);
		return {bingo,reach:bingo?0:missing.filter(cells=>cells.length===1).length,
			hot:!bingo&&missing.some(cells=>cells.length===1&&cells[0].value===sequence[turn]),
			count:card.cells.filter(cell=>cell.value!==0&&drawn.has(cell.value)).length};
	}
	const hotTurn=Array.from({length:74},(_,i)=>i+1).find(turn=>cards.some(card=>stats(card,turn).hot));
	for(const turn of [hotTurn,75]){
		const page=await host(hostState(turn,{mode:'mode_a',registeredChildSeeds:seeds}));
		try{
			const expected=cards.map(card=>stats(card,turn));
			const text=await page.eval('document.querySelector("#app-main").textContent');
			assert.match(text,new RegExp(`総リーチ[^0-9]*${expected.reduce((sum,s)=>sum+s.reach,0)}`));
			for(let i=0;i<seeds.length;i++){
				if(expected[i].hot) assert.match(text,new RegExp(`予告.*\\(${expected.filter(s=>s.hot).length}名\\)`));
				if(expected[i].bingo) assert.match(text,new RegExp(seeds[i]));
			}
			await page.click('#btn-dobe-award');
			const order=seeds.map((seed,i)=>({seed,count:expected[i].count})).sort((a,b)=>a.count-b.count).slice(0,3);
			const modal=await page.eval('document.querySelector(".modal-overlay").textContent');
			let last=-1;for(const item of order){assert.ok(modal.indexOf(item.seed)>last);last=modal.indexOf(item.seed);assert.match(modal,new RegExp(`${item.count} マス開`));}
			await page.click('#close-dobe-btn');assert.deepEqual(page.errors,[]);
		}finally{await page.close();}
	}
});

test('R-02/09: モード切替で入力中の開催IDを保持する',async()=>{
	const page=await browser.page();
	try{
		await page.click('#btn-select-host');await page.input('#host-seed-input','ABCD');await page.click('#opt-mode-a');
		assert.equal(await page.eval('document.querySelector("#host-seed-input").value'),'ABCD');
		await page.click('#opt-mode-b');assert.equal(await page.eval('document.querySelector("#host-seed-input").value'),'ABCD');
	}finally{await page.close();}
});

test('R-09/16: 受付確定中は一覧を固定し導出完了後だけ保存する',async()=>{
	const page=await browser.page({setup:`window.cardPending=[];const derive=crypto.subtle.deriveBits.bind(crypto.subtle);crypto.subtle.deriveBits=async(...args)=>{const result=await derive(...args);if(!new TextDecoder().decode(args[0].salt).includes('mobingo:card'))return result;return new Promise(resolve=>window.cardPending.push(()=>resolve(result)));};`});
	try{
		await page.click('#btn-select-host');await page.click('#opt-mode-a');await page.click('#btn-host-proceed');
		await page.input('#scanner-manual-input','ABCD');await page.click('#scanner-manual-form button');await page.click('#scanner-finish-btn');
		await page.wait('window.cardPending.length===1');
		for(const selector of ['#scanner-manual-input','#scanner-manual-form button','.remove-chip-btn','#scanner-back-btn','#scanner-finish-btn'])assert.equal(await page.eval(`document.querySelector('${selector}').disabled`),true,selector);
		assert.equal(await page.eval('localStorage.getItem("mobingo_parent_state")'),null);
		await page.eval('window.cardPending.shift()()');await page.wait('!!document.querySelector("#slide-thumb")');
		assert.deepEqual(await page.eval('JSON.parse(localStorage.mobingo_parent_state).registeredChildSeeds'),['ABCD']);assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});

for(const [letter,min,max]of[['B',1,15],['I',16,30]]){
	test(`R-08: ${letter}列の球・特殊役解禁済み投影`,async()=>{
		const sequence=await generateDrawSequence('1234');const turn=sequence.findIndex(number=>number>=min&&number<=max)+1;
		const page=await host(hostState(turn,{specialRuleTurn:0}));
		try{
			assert.match(await page.eval('document.querySelector("#latest-ball-tag").textContent'),new RegExp(letter));
			await page.click('#btn-unlock-special');assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).specialRuleTurn'),0);
			await page.click('#btn-projector');assert.match(await page.eval('document.querySelector("#projector-view").textContent'),/特殊役解禁中/);await page.click('#close-proj-btn');
			await page.click('#btn-toggle-matrix');assert.equal(await page.eval('document.querySelector("#full-matrix-panel").style.display'),'grid');await page.click('#btn-toggle-matrix');
			assert.deepEqual(page.errors,[]);
		}finally{await page.close();}
	});
}

test('R-09/11: 特殊役解禁済みのモードAを再開する',async()=>{
	const page=await host(hostState(75,{mode:'mode_a',specialRuleTurn:0,registeredChildSeeds:['ABCD']}));
	try{assert.match(await page.eval('document.querySelector("#host-bingo-winners").textContent'),/ABCD/);assert.match(await page.eval('document.querySelector("#app-main").textContent'),/総リーチ: 0/);assert.deepEqual(page.errors,[]);}finally{await page.close();}
});

test('R-08: Undo完了後の旧ボタンへ再配送しても0手未満に戻さない',async()=>{
	const page=await host(hostState(1));
	try{
		await page.eval('window.oldUndo=document.querySelector("#btn-undo-ball")');await page.click('#btn-undo-ball');await page.eval('oldUndo.click()');
		assert.equal(await page.eval('JSON.parse(localStorage.mobingo_parent_state).currentTurn'),0);assert.deepEqual(page.errors,[]);
	}finally{await page.close();}
});
