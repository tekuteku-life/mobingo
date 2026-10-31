import test from 'node:test';
import assert from 'node:assert/strict';
import { startBrowser } from '../helpers/browser.js';
import { generateDrawSequence, verifyChildCard } from '../../js/core/bingo.js';
test('R-18: モードA順位・Undo消失・再読込保持・新ゲーム初期化',async()=>{
	const result=await verifyChildCard('ABCD',await generateDrawSequence('1234'),75,null);
	const state={parentSeed:'1234',mode:'mode_a',currentTurn:result.firstBingoTurn,specialRuleTurn:null,registeredChildSeeds:['ABCD'],participantNames:{ABCD:'同名'},verifiedChildSeeds:[]};
	const browser=await startBrowser(),page=await browser.page({setup:`if(!localStorage.mobingo_app_mode){localStorage.setItem('mobingo_app_mode','host');localStorage.setItem('mobingo_parent_state',${JSON.stringify(JSON.stringify(state))})}`});
	try{
		await page.wait('!!document.querySelector("#btn-winner-ranking")');await page.click('#btn-winner-ranking');assert.match(await page.eval('document.querySelector("[data-winner-seed=ABCD]").textContent'),/同名/);await page.click('#close-ranking-btn');
		await page.click('#btn-undo-ball');await page.click('#btn-winner-ranking');assert.equal(await page.eval('document.querySelectorAll("[data-winner-seed]").length'),0);await page.click('#close-ranking-btn');
		await page.reload();await page.wait('!!document.querySelector("#btn-winner-ranking")');await page.click('#btn-winner-ranking');assert.equal(await page.eval('document.querySelectorAll("[data-winner-seed]").length'),0);await page.click('#close-ranking-btn');
		await page.click('#btn-reset-game');assert.equal(await page.eval('localStorage.getItem("mobingo_parent_state")'),null);
	}finally{await page.close();await browser.close();}
});
