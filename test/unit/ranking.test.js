import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWinnerRanking } from '../../js/core/ranking.js';
const card=(values)=>({grid:Array.from({length:5},(_,r)=>Array.from({length:5},(_,c)=>({value:r===2&&c===2?0:values[r*5+c]})))});
const seq=Array.from({length:75},(_,i)=>i+1);
const early=card(Array.from({length:25},(_,i)=>i+1));
const late=card(Array.from({length:25},(_,i)=>i+26));
test('R-18: 同手番競技順位・ID安定順・未達成・Undo',()=>{
	const cards=new Map([['ZZZZ',early],['ABCD',early],['1234',late]]);
	assert.deepEqual(buildWinnerRanking(cards,seq,0,null),[]);
	assert.deepEqual(buildWinnerRanking(cards,seq,4,null),[]);
	assert.deepEqual(buildWinnerRanking(cards,seq,75,null),[{rank:1,seed:'ABCD',firstBingoTurn:5},{rank:1,seed:'ZZZZ',firstBingoTurn:5},{rank:3,seed:'1234',firstBingoTurn:30}]);
	assert.equal(buildWinnerRanking(cards,seq,29,null).length,2);
	assert.equal(buildWinnerRanking(cards,seq,30,null).length,3);
	assert.deepEqual(buildWinnerRanking(new Map([['ABCD',early]]),[],75,0),[]);
});
test('R-18: 特殊役の自然成立と解禁の遅い方・未来解禁',()=>{
	const values=Array(25).fill(75);[0,4,20,24].forEach((n,i)=>values[n]=i+1);
	const cards=new Map([['ABCD',card(values)]]);
	for(const [turn,unlock,expected] of [[4,null,null],[4,0,4],[4,3,4],[4,5,null],[7,7,7],[75,75,75]]){
		assert.equal(buildWinnerRanking(cards,seq,turn,unlock)[0]?.firstBingoTurn??null,expected);
	}
});
