import { spawn } from 'node:child_process';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import v8toIstanbul from 'v8-to-istanbul';
import istanbul from 'istanbul-lib-coverage';
import { filesUnder, productionFiles } from './files.js';

await rm('.coverage', { recursive: true, force: true });
await mkdir('.coverage/raw', { recursive: true });
let failed = false;
for (const script of ['test', 'test:ui']) {
	const code = await new Promise((resolve) => {
		const child = spawn('npm', ['run', script], { stdio: 'inherit', env: {
			...process.env, NODE_V8_COVERAGE: resolve('.coverage/raw'), MOBINGO_COVERAGE: '1',
		} });
		child.once('error', () => resolve(1)); child.once('exit', resolve);
	});
	if (code !== 0) failed = true;
}
const targets = new Set((await productionFiles()).map((file) => resolve(file)));
const map = istanbul.createCoverageMap({});
for (const file of await filesUnder('.coverage')) {
	if (!file.endsWith('.json')) continue;
	const payload = JSON.parse(await readFile(file, 'utf8'));
	for (const entry of payload.result || []) {
		let path;
		if (entry.url.startsWith('file:')) path = fileURLToPath(entry.url.split('?')[0]);
		else if (payload.origin && entry.url.startsWith(`${payload.origin}/`)) path = resolve(`.${new URL(entry.url).pathname}`);
		else if (entry.url.startsWith('/')) path = entry.url;
		if (!targets.has(path)) continue;
		const converter = v8toIstanbul(path);
		await converter.load(); converter.applyCoverage(entry.functions); map.merge(converter.toIstanbul());
	}
}
for (const path of targets) {
	if (map.files().includes(path)) continue;
	const source = await readFile(path, 'utf8');
	const converter = v8toIstanbul(path); await converter.load();
	converter.applyCoverage([{ functionName:'', isBlockCoverage:true, ranges:[{ startOffset:0, endOffset:source.length, count:0 }] }]);
	map.merge(converter.toIstanbul());
}
const rows = ['# カバレッジ実測', '', 'Node V8とChromium CDPの位置情報をIstanbulへ変換・合算した結果である。', '', '| ファイル | Line | Branch | 判定 |', '| --- | ---: | ---: | --- |'];
for (const path of map.files().sort()) {
	const summary = map.fileCoverageFor(path).toSummary();
	const pass = summary.lines.pct >= 97 && summary.branches.pct >= 97;
	rows.push(`| ${relative(process.cwd(), path)} | ${summary.lines.pct}% | ${summary.branches.pct}% | ${pass ? '合格' : '未達'} |`);
	if (!pass) failed = true;
}
await writeFile('.coverage/coverage.json', JSON.stringify(map.toJSON()));
await writeFile('.coverage/summary.md', `${rows.join('\n')}\n`);
console.log(rows.join('\n'));
if (failed) process.exitCode = 1;
