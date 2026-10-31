import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { buildCoverage } from '../../scripts/coverage_report.js';

test('カバレッジ合算で未実行分岐をトップレベル実行数から補完しない',async()=>{
	const dir=await mkdtemp(`${tmpdir()}/mobingo-coverage-`);
	try{
		const path=`${dir}/fixture.js`,missing=`${dir}/missing.js`;
		const source='export function choose(flag) {\n\tif (flag) return 1;\n\treturn 2;\n}\nexport const value=1;\n';
		await writeFile(path,source);await writeFile(missing,'export const never=1;\n');
		const fnStart=source.indexOf('function'),fnEnd=source.indexOf('}')+1,branchStart=source.indexOf('\n\treturn 2;');
		const top={functionName:'',isBlockCoverage:true,ranges:[{startOffset:0,endOffset:source.length,count:1}]};
		const payloads=[{result:[{url:path,scriptId:'1',functions:[top,{functionName:'choose',isBlockCoverage:true,ranges:[
			{startOffset:fnStart,endOffset:fnEnd,count:1},{startOffset:branchStart,endOffset:fnEnd-1,count:0},
		]}]}]}, {result:[{url:path,scriptId:'2',functions:[top,{functionName:'choose',isBlockCoverage:false,ranges:[{startOffset:fnStart,endOffset:fnEnd,count:0}]}]}]}];
		const map=await buildCoverage(payloads,new Set([path,missing]));
		assert.equal(map.fileCoverageFor(path).getLineCoverage()[3],0);
		assert.ok(map.fileCoverageFor(path).toSummary().branches.pct<100);
		assert.equal(map.fileCoverageFor(missing).toSummary().lines.pct,0);
		assert.equal(map.fileCoverageFor(missing).toSummary().branches.pct,0);
	}finally{await rm(dir,{recursive:true,force:true});}
});
