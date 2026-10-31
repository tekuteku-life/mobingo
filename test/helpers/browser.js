import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, relative } from 'node:path';
import assert from 'node:assert/strict';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function within(promise, ms) {
	let timer;
	try { return await Promise.race([promise, new Promise(resolve=>{timer=setTimeout(resolve,ms)})]); }
	finally { clearTimeout(timer); }
}

export async function stopBrowserProcess(child, client = null, graceMs = 1500) {
	let exited;
	const stopped=new Promise(resolve=>{exited=resolve;if(child.exitCode!==null||child.signalCode!==null)resolve();else child.once('exit',resolve)});
	try {
		if(client && child.exitCode===null && child.signalCode===null)await within(client.send('Browser.close').catch(()=>{}),graceMs);
		client?.close();
		if(child.exitCode===null && child.signalCode===null)child.kill('SIGTERM');
		await within(stopped,graceMs);
		if(child.pid){try{process.kill(-child.pid,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}}
		await within(stopped,graceMs);
	} finally {child.removeListener('exit',exited);child.stderr?.destroy();}
}

export class CDP {
	constructor(socket) {
		this.socket = socket;
		this.nextId = 0;
		this.pending = new Map();
		this.listeners = new Map();
		socket.addEventListener('close',()=>this.rejectPending());
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
	static async connect(url, timeoutMs = 10000) {
		const socket = new WebSocket(url);
		let timer, opened, failed;
		try {
			await new Promise((resolve,reject)=>{
				opened=resolve;failed=reject;
				socket.addEventListener('open',opened,{once:true});
				socket.addEventListener('error',failed,{once:true});
				timer=setTimeout(()=>reject(new Error('CDP connection timeout')),timeoutMs);
			});
		} catch(error) {socket.close();throw error;}
		finally {clearTimeout(timer);socket.removeEventListener('open',opened);socket.removeEventListener('error',failed);}
		return new CDP(socket);
	}
	send(method, params = {}, timeoutMs = 15000) {
		if(this.socket.readyState!==WebSocket.OPEN)return Promise.reject(new Error("CDP connection closed"));
		return new Promise((resolve, reject) => {
			const id = ++this.nextId;
			const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}${params.expression ? " expression=" + params.expression.slice(0,220) : ""}`)); }, timeoutMs);
			this.pending.set(id, { resolve: (result) => { clearTimeout(timer); resolve(result); },
				reject: (error) => { clearTimeout(timer); reject(error); } });
			this.socket.send(JSON.stringify({ id, method, params }));
		});
	}
	on(name, listener) {
		if (!this.listeners.has(name)) this.listeners.set(name, []);
		this.listeners.get(name).push(listener);
	}
	rejectPending(){for(const request of this.pending.values())request.reject(new Error('CDP connection closed'));this.pending.clear();}
	close() { this.rejectPending(); this.socket.close(); }
}

export async function startBrowser({ route = async () => null } = {}) {
	const root = process.cwd();
	const server = createServer(async (req, res) => {
		try {
			const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
			const custom = await route(pathname);
			if (custom) { res.writeHead(custom.status ?? 200, { 'Content-Type': custom.type ?? 'text/javascript', 'Cache-Control': 'no-store' }); res.end(custom.body ?? ''); return; }
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
		'--disable-gpu-compositing', '--disable-software-rasterizer', '--use-gl=disabled',
		'--disable-background-timer-throttling', '--disable-renderer-backgrounding',
		'--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank',
	], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
	let browserLog='';child.stderr.on('data',data=>{browserLog=(browserLog+data).slice(-6000)});
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
			async contextCount(){return (await browser.send('Target.getBrowserContexts')).browserContextIds.length;},
			async page({ width = 390, height = 844, mobile = false, setup = '', contextId, readyTimeout = 5000, connectionTimeout = 10000 } = {}) {
				const browserContextId = contextId || (await browser.send('Target.createBrowserContext')).browserContextId;
				let targetId,cdp;
				try {
				({ targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId }));
				await browser.send('Target.activateTarget', { targetId });
				const targets = await (await fetch(`${endpoint.replace(/^ws:/, 'http:').split('/devtools/')[0]}/json/list`,{signal:AbortSignal.timeout(connectionTimeout)})).json();
				cdp = await CDP.connect(targets.find((entry) => entry.id === targetId).webSocketDebuggerUrl,connectionTimeout);
				const errors = [], diagnostics = [];
				cdp.on('Network.responseReceived',({response})=>diagnostics.push(JSON.stringify({url:response.url,status:response.status,mime:response.mimeType})));
				cdp.on('Network.loadingFailed',event=>diagnostics.push(JSON.stringify(event)));
				cdp.on('Log.entryAdded',({entry})=>diagnostics.push(entry.text));
				cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => errors.push(exceptionDetails.exception?.description || exceptionDetails.text));
				let acceptDialog = true;
				cdp.on('Page.javascriptDialogOpening', () => cdp.send('Page.handleJavaScriptDialog', { accept: acceptDialog }).catch(()=>{}));
				await cdp.send('Runtime.enable');
				await cdp.send('Log.enable');
				await cdp.send('Page.enable');
				await cdp.send('Network.enable');
				const setViewport = async (width, height) => {
					await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile, screenOrientation: { type: width > height ? 'landscapePrimary' : 'portraitPrimary', angle: width > height ? 90 : 0 } });
				};
				await setViewport(width, height);
				if (mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
				await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: setup });
				if (process.env.MOBINGO_COVERAGE) {
					await cdp.send('Profiler.enable');
					await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
				}
				const page = {
					cdp, errors, contextId: browserContextId,
					dialog(accept) { acceptDialog = accept; },
					async eval(expression) {
						let result;try{result=await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });}catch(error){throw new Error(`${error.message} stderr=${browserLog}`)}
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
					async resize(width, height) {
						await setViewport(width, height);
						await page.wait(`Math.round(visualViewport.width) === ${width} && Math.round(visualViewport.height) === ${height}`);
					},
					async tap(selector) {
						const target = await page.eval(`(() => { const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return {x,y,w:r.width,h:r.height,disabled:e.disabled,hit:h===e||e.contains(h)};})()`);
						assert.ok(target && target.w > 0 && target.h > 0 && target.hit && !target.disabled, `Touch target must be visible: ${selector}`);
						await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:target.x,y:target.y,id:1}] });
						await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
					},
					async swipe(selector, toward = 'end', requestedDistance = 220) {
						const r = await page.eval(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();const top=Math.max(0,r.top),bottom=Math.min(visualViewport.height,r.bottom);return {x:Math.min(innerWidth-8,r.right-8),top,height:bottom-top};})()`);
						assert.ok(r.height > 40, `Scrollable area must be visible: ${selector}`);
						const distance = Math.min(requestedDistance, 220, r.height * 0.55);
						const startY=r.top+r.height*(toward==='end'?0.8:0.2);
						await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:r.x,y:startY,id:1}] });
						for(let step=1;step<=8;step++){
							await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:r.x,y:startY+(toward==='end'?-distance:distance)*step/8,id:1}] });
							await delay(20);
						}
						await delay(80);
						await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
						await page.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
					},
					async type(selector, value) {
						await page.tap(selector);
						await cdp.send('Input.dispatchKeyEvent', { type:'rawKeyDown', key:'a', code:'KeyA', windowsVirtualKeyCode:65, modifiers:2 });
						await cdp.send('Input.dispatchKeyEvent', { type:'keyUp', key:'a', code:'KeyA', windowsVirtualKeyCode:65 });
						await cdp.send('Input.dispatchKeyEvent', { type:'rawKeyDown', key:'Backspace', code:'Backspace', windowsVirtualKeyCode:8 });
						await cdp.send('Input.dispatchKeyEvent', { type:'keyUp', key:'Backspace', code:'Backspace', windowsVirtualKeyCode:8 });
						await cdp.send('Input.insertText', { text:value });
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
						await page.eval(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'center'})`);
						const rect = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const r = e.getBoundingClientRect(); return { x:r.x+r.width/2, y:r.y+r.height/2, w:r.width, h:r.height, disabled:e.disabled }; })()`);
						assert.ok(rect.w > 0 && rect.h > 0 && !rect.disabled && rect.x >= 0 && rect.y >= 0 && rect.x < await page.eval("innerWidth") && rect.y < await page.eval("innerHeight"), `Element must be visible and enabled: ${selector}`);
						assert.ok(await page.eval(`(() => {const e=document.querySelector(${JSON.stringify(selector)}),hit=document.elementFromPoint(${rect.x},${rect.y});return e===hit||e.contains(hit);})()`), `Element must receive the click: ${selector}`);
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
						try {await page.collect();}
						finally {cdp.close();if(contextId)await browser.send('Target.closeTarget',{targetId});else await browser.send('Target.disposeBrowserContext',{browserContextId});}
					},
				};
				const navigation=await cdp.send('Page.navigate', { url: origin });
				if(navigation.errorText)throw new Error(`Navigation failed: ${navigation.errorText} ${origin} events=${diagnostics.join(" | ")} stderr=${browserLog}`);
				try {await page.wait('document.readyState === "complete" && !!document.querySelector("#app-main")',readyTimeout);}
				catch(error){const state=await page.eval(`JSON.stringify({url:location.href,ready:document.readyState,body:document.body?.innerText.slice(0,300),html:document.documentElement.outerHTML.slice(0,500)})`);throw new Error(`${error.message} state=${state} runtime=${errors.join(' | ')} log=${diagnostics.join(' | ')}`)}
				return page;
				}catch(error){cdp?.close();await within(browser.send(contextId?'Target.closeTarget':'Target.disposeBrowserContext',contextId?{targetId}:{browserContextId}).catch(()=>{}),1500);throw error;}
			},
			async close() {
				await stopBrowserProcess(child,browser);
				server.closeAllConnections();
				await new Promise((resolve) => server.close(resolve));
				await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
			},
		};
	} catch (error) {
		await stopBrowserProcess(child); server.closeAllConnections(); server.close();
		await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		throw error;
	}
}

export { delay };
