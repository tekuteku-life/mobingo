import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import v8toIstanbul from 'v8-to-istanbul';
import istanbul from 'istanbul-lib-coverage';
import { mergeScriptCovs } from '@bcoe/v8-coverage';

export async function buildCoverage(payloads, targets) {
	const byPath = new Map([...targets].map((path) => [path, []]));
	for (const payload of payloads) {
		for (const entry of payload.result || []) {
			let path;
			if (entry.url.startsWith('file:')) path = fileURLToPath(entry.url.split('?')[0]);
			else if (payload.origin && entry.url.startsWith(`${payload.origin}/`)) path = resolve(`.${new URL(entry.url).pathname}`);
			else if (entry.url.startsWith('/')) path = entry.url;
			if (byPath.has(path)) byPath.get(path).push({ ...entry, url: path });
		}
	}
	const map = istanbul.createCoverageMap({});
	for (const [path, entries] of byPath) {
		const source = await readFile(path, 'utf8');
		const functions = entries.length ? mergeScriptCovs(entries).functions : [{
			functionName: '', isBlockCoverage: true,
			ranges: [{ startOffset: 0, endOffset: source.length, count: 0 }],
		}];
		const converter = v8toIstanbul(path);
		await converter.load();
		converter.applyCoverage(functions);
		for (const coverage of Object.values(converter.toIstanbul())) map.addFileCoverage(coverage);
	}
	return map;
}
