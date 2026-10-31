import { readFile } from 'node:fs/promises';
import { codeFiles } from './files.js';

let failures = 0;
for (const file of await codeFiles()) {
	const lines = (await readFile(file, 'utf8')).split('\n');
	lines.forEach((line, index) => {
		if (/^\s*\S/.test(line) && /^\t* +/.test(line) && !/^\t* \*(?:[ /]|$)/.test(line)) {
			console.error(`${file}:${index + 1}: space indentation`);
			failures++;
		}
	});
}
if (failures) process.exitCode = 1;
else console.log('Tab indentation checks passed');
