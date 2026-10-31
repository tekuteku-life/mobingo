import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBingoCard, generateDrawSequence } from '../../js/core/bingo.js';
import { buildWinnerRanking } from '../../js/core/ranking.js';
// 独立した座標定義と各手番の再生を期待値に用いる。
function firstTurn(card,seq,current,unlock){
	const rows=Array.from({length:5},(_,r)=>Array.from({length:5},(_,c)=>[r,c]));
	const cols=Array.from({length:5},(_,c)=>Array.from({length:5},(_,r)=>[r,c]));
	const diag=[Array.from({length:5},(_,i)=>[i,i]),Array.from({length:5},(_,i)=>[i,4-i])];
	const specials=[[[0,0],[0,4],[4,0],[4,4]],[...diag[0],...diag[1]], [...rows[2],...cols[2]]];
	for(let t=1;t<=current;t++){
		const drawn=new Set([0,...seq.slice(0,t)]),lines=[...rows,...cols,...diag,...(unlock!==null&&t>=unlock?specials:[])];
		if(lines.some(line=>line.every(([r,c])=>drawn.has(card.grid[r][c].value))))return t;
	}return null;
}
test('R-18: 決定論カードの成立手番を独立再生と照合する',async()=>{
	const seq=await generateDrawSequence('1234'),cards=new Map();
	for(const id of ['ABCD','ZZZZ','0000','9999'])cards.set(id,await generateBingoCard(id));
	for(const turn of [0,25,50,75])for(const unlock of [null,0,25,75]){
		const expected=[...cards].map(([seed,card])=>({seed,firstBingoTurn:firstTurn(card,seq,turn,unlock)})).filter(v=>v.firstBingoTurn!==null).sort((a,b)=>a.firstBingoTurn-b.firstBingoTurn||a.seed.localeCompare(b.seed));
		let rank=0;assert.deepEqual(buildWinnerRanking(cards,seq,turn,unlock),expected.map((v,i)=>({...v,rank:rank=i&&v.firstBingoTurn===expected[i-1].firstBingoTurn?rank:i+1})));
	}
});
