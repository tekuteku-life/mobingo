import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {productionFiles} from '../../scripts/files.js';
test('R-20: アプリの案内に常体の文末を残さない',async()=>{
	const findings=[];
	for(const file of [...await productionFiles(),'index.html','manifest.json']){
		const lines=(await readFile(file,'utf8')).split('\n');
		for(const [i,line] of lines.entries()){
			if(/^\s*(?:\/\/|\*)/.test(line))continue;
			if(/(?:である|であった|ではない|が対象だ|当選者はいない|を行う|を開始|を連続スキャン)[。！]|タップで穴を開ける|長押しで元に戻す/.test(line))findings.push(`${file}:${i+1}`);
		}
	}
	assert.deepEqual(findings,[]);
});
