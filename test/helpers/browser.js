import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, relative } from 'node:path';
import assert from 'node:assert/strict';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CDP {
	constructor(socket) {
		this.socket = socket;
		this.nextId = 0;
		this.pending = new Map();
		this.listeners = new Map();
		socket.addEventListener('message', ({ data }) => {
			const message = JSON.parse(data);
			if (message.id) {
				const request = this.pending.get(message.id);
				this.pending.delete(message.id);
				if (message.error) request?.reject(new Error(JSON.stringify(message.error)));
				else request?.resolve(message.result);
			} else {
				for (const listener of this.listeners.get(message.method) || []) listener(message.params);
			}
		});
	}
	static async connect(url) {
		const socket = new WebSocket(url);
		await new Promise((resolve, reject) => {
			socket.addEventListener('open', resolve, { once: true });
			socket.addEventListener('error', reject, { once: true });
		});
		return new CDP(socket);
	}
	send(method, params = {}) {
		return new Promise((resolve, reject) => {
			const id = ++this.nextId;
			const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
			this.pending.set(id, { resolve: (result) => { clearTimeout(timer); resolve(result); },
				reject: (error) => { clearTimeout(timer); reject(error); } });
			this.socket.send(JSON.stringify({ id, method, params }));
		});
	}
	on(name, listener) {
		if (!this.listeners.has(name)) this.listeners.set(name, []);
		this.listeners.get(name).push(listener);
	}
	close() { this.socket.close(); }
}

export async function startBrowser() {
	const root = process.cwd();
	const server = createServer(async (req, res) => {
		try {
			const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
			const path = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
			if (relative(root, path).startsWith('..')) { res.writeHead(403).end(); return; }
			const contents = await readFile(path);
			res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream');
			res.end(contents);
		} catch { res.writeHead(404).end(); }
	});
	await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
	const origin = `http://127.0.0.1:${server.address().port}`;
	const profile = await mkdtemp(`${tmpdir()}/mobingo-chrome-`);
	const child = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', [
		'--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
		'--disable-background-timer-throttling', '--disable-renderer-backgrounding',
		'--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank',
	], { stdio: ['ignore', 'ignore', 'pipe'] });
	try {
		let endpoint;
		const ready = new Promise((resolve, reject) => {
			let output = '';
			child.stderr.on('data', (data) => {
				output += data;
				const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
				if (match) { endpoint = match[1]; resolve(); }
			});
			child.once('error', reject);
			child.once('exit', (code) => reject(new Error(`Chromium exited ${code}: ${output.slice(-2000)}`)));
		});
		let startupTimer;
		try { await Promise.race([ready, new Promise((_, reject) => { startupTimer = setTimeout(() => reject(new Error('Chromium startup timeout')), 15000); })]); }
		finally { clearTimeout(startupTimer); }
		const browser = await CDP.connect(endpoint);
		return {
			origin,
			async page({ width = 390, height = 844, setup = '' } = {}) {
				const { browserContextId } = await browser.send('Target.createBrowserContext');
				const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
				await browser.send('Target.activateTarget', { targetId });
				const targets = await (await fetch(`${endpoint.replace(/^ws:/, 'http:').split('/devtools/')[0]}/json/list`)).json();
				const cdp = await CDP.connect(targets.find((entry) => entry.id === targetId).webSocketDebuggerUrl);
				const errors = [];
				cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => errors.push(exceptionDetails.exception?.description || exceptionDetails.text));
				let acceptDialog = true;
				cdp.on('Page.javascriptDialogOpening', () => cdp.send('Page.handleJavaScriptDialog', { accept: acceptDialog }));
				await cdp.send('Runtime.enable');
				await cdp.send('Page.enable');
				await cdp.send('Network.enable');
				await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
				await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: setup });
				if (process.env.MOBINGO_COVERAGE) {
					await cdp.send('Profiler.enable');
					await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
				}
				const page = {
					cdp, errors,
					dialog(accept) { acceptDialog = accept; },
					async eval(expression) {
						const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
						if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
						return result.result.value;
					},
					async wait(expression, timeout = 5000) {
						const start = Date.now();
						while (Date.now() - start < timeout) {
							if (await page.eval(expression)) return;
							await delay(25);
						}
						throw new Error(`Browser condition timed out: ${expression}`);
					},
					async collect() {
						if (!process.env.MOBINGO_COVERAGE) return;
						const { result } = await cdp.send('Profiler.takePreciseCoverage');
						await mkdir('.coverage/browser', { recursive: true });
						await writeFile(`.coverage/browser/${crypto.randomUUID()}.json`, JSON.stringify({ result, origin }));
					},
					async reload() {
						await page.collect();
						const oldDocument = await page.eval('window.__documentToken ||= crypto.randomUUID()');
						await cdp.send('Page.reload', { ignoreCache: false });
						await page.wait(`window.__documentToken !== ${JSON.stringify(oldDocument)}`);
						await page.wait('document.readyState === "complete" && !!document.querySelector("#app-main")');
					},
					async click(selector) {
						await page.wait(`!!document.querySelector(${JSON.stringify(selector)})`);
						const rect = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const r = e.getBoundingClientRect(); return { x:r.x+r.width/2, y:r.y+r.height/2, w:r.width, h:r.height, disabled:e.disabled }; })()`);
						assert.ok(rect.w > 0 && rect.h > 0 && !rect.disabled, `Element must be visible and enabled: ${selector}`);
						await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
						await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
					},
					async input(selector, value) {
						await page.eval(`document.querySelector(${JSON.stringify(selector)}).focus(); document.querySelector(${JSON.stringify(selector)}).value = ''`);
						await cdp.send('Input.insertText', { text: value });
					},
					async pointer(selector, type, { x = 20, y = 20, id = 1 } = {}) {
						await page.eval(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { bubbles:true, pointerId:${id}, clientX:${x}, clientY:${y}, isPrimary:true }))`);
					},
					async drag({ cancel = false, ratio = 1 } = {}) {
						const r = await page.eval(`(() => { const t=document.querySelector('#slide-track').getBoundingClientRect(), h=document.querySelector('#slide-thumb').getBoundingClientRect(); return { x:h.x+h.width/2, y:h.y+h.height/2, distance:t.width-h.width-8 }; })()`);
						await cdp.send('Input.dispatchMouseEvent', { type:'mousePressed', x:r.x, y:r.y, button:'left', clickCount:1 });
						await cdp.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:r.x+r.distance*ratio, y:r.y, button:'left', buttons:1 });
						if (cancel) await page.pointer('#slide-thumb', 'pointercancel');
						await cdp.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:r.x+r.distance*ratio, y:r.y, button:'left', clickCount:1 });
					},
					async close() {
						await page.collect();
						cdp.close();
						await browser.send('Target.disposeBrowserContext', { browserContextId });
					},
				};
				await cdp.send('Page.navigate', { url: origin });
				await page.wait('document.readyState === "complete" && !!document.querySelector("#app-main")');
				return page;
			},
			async close() {
				browser.close();
				const stopped = new Promise((resolve) => child.once('exit', resolve));
				child.kill();
				await stopped;
				server.closeAllConnections();
				await new Promise((resolve) => server.close(resolve));
				await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
			},
		};
	} catch (error) {
		child.kill(); server.close();
		await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		throw error;
	}
}

export { delay };
