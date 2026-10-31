import { readdir } from 'node:fs/promises';

export async function filesUnder(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
		? filesUnder(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
	return nested.flat().sort();
}

export async function productionFiles() {
	return [...(await filesUnder('js')).filter((file) => !file.startsWith('js/lib/') && file.endsWith('.js')), 'sw.js'];
}

export async function codeFiles() {
	return [...await productionFiles(), ...await filesUnder('test'), ...await filesUnder('scripts'),
		'index.html', 'manifest.json', 'package.json', 'jsconfig.json', 'jsconfig.sw.json', 'css/style.css'];
}
