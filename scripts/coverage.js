import { spawn } from 'node:child_process';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { buildCoverage } from './coverage_report.js';
import { filesUnder, productionFiles } from './files.js';

const sources = await productionFiles();
const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const fingerprints = new Map(await Promise.all(sources.map(async (file) => [file, await hash(file)])));
await rm('.coverage', { recursive: true, force: true });
await mkdir('.coverage/raw', { recursive: true });
let failed = false;
for (const script of ['test', 'test:ui']) {
	const code = await new Promise((finish) => {
		const child = spawn('npm', ['run', script], { stdio: 'inherit', env: {
			...process.env, NODE_V8_COVERAGE: resolve('.coverage/raw'), MOBINGO_COVERAGE: '1',
		} });
		child.once('error', () => finish(1)); child.once('exit', finish);
	});
	if (code !== 0) failed = true;
}
for (const [file, before] of fingerprints) {
	if (await hash(file) !== before) throw new Error(`Source changed during coverage collection: ${file}`);
}
const targets = new Set(sources.map((file) => resolve(file)));
const payloads = [];
for (const directory of ['.coverage/raw', '.coverage/browser']) {
	for (const file of await filesUnder(directory)) {
		if (file.endsWith('.json')) payloads.push(JSON.parse(await readFile(file, 'utf8')));
	}
}
const map = await buildCoverage(payloads, targets);
const rows = ['# カバレッジ実測', '', 'Node V8とChromium CDPのraw範囲を位置で合算した後、各ソースを1回だけIstanbulへ変換した結果である。', '', '| ファイル | Line | Branch | 判定 |', '| --- | ---: | ---: | --- |'];
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
