import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { codeFiles } from './files.js';

let failures = 0;
for (const file of await codeFiles()) {
	if (file.endsWith('.js')) {
		const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
		if (result.status !== 0) {
			console.error(file, result.stderr || result.error);
			failures++;
		}
	} else if (file.endsWith('.json')) {
		try { JSON.parse(await readFile(file, 'utf8')); }
		catch (error) { console.error(file, error.message); failures++; }
	}
}
if (failures) process.exitCode = 1;
else console.log('Syntax checks passed');
