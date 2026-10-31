import { APP_VERSION } from "./version.js";

const VERSION_PATTERN = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const CHECK_ERROR = "更新を確認できませんでした。通信環境を確認して、もう一度お試しください。";

export function compareVersions(left, right) {
	if (typeof left !== "string" || typeof right !== "string" || !VERSION_PATTERN.test(left) || !VERSION_PATTERN.test(right)) return null;
	const a = left.split(".").map(Number), b = right.split(".").map(Number);
	for (let index = 0; index < 3; index++) {
		if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
	}
	return 0;
}

function bounded(promise, timeout) {
	let timer;
	return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Update timed out")), timeout); })])
		.finally(() => clearTimeout(timer));
}

export function requestWorkerVersion(worker, timeout = 3000) {
	return new Promise((resolve, reject) => {
		const channel = new MessageChannel();
		const finish = (error, version = null) => {
			clearTimeout(timer);
			channel.port1.onmessage = null;
			channel.port1.onmessageerror = null;
			channel.port1.close();
			channel.port2.close();
			if (error) reject(error); else resolve(version);
		};
		const timer = setTimeout(() => finish(new Error("No worker version")), timeout);
		channel.port1.onmessage = ({ data }) => {
			if (data?.type !== "MOBINGO_VERSION" || compareVersions(data.version, APP_VERSION) === null) finish(new Error("Invalid worker version"));
			else finish(null, data.version);
		};
		channel.port1.onmessageerror = () => finish(new Error("Invalid worker message"));
		try { worker.postMessage({ type: "MOBINGO_GET_VERSION" }, [channel.port2]); }
		catch (error) { finish(error); }
	});
}

function installed(worker, timeout) {
	return new Promise((resolve, reject) => {
		const finish = (error = null) => {
			clearTimeout(timer);
			worker.removeEventListener("statechange", change);
			if (error) reject(error); else resolve(undefined);
		};
		const change = () => {
			if (["installed", "activating", "activated"].includes(worker.state)) finish();
			else if (worker.state === "redundant") finish(new Error("Installation failed"));
		};
		const timer = setTimeout(() => finish(new Error("Installation timed out")), timeout);
		worker.addEventListener("statechange", change);
		change();
	});
}

function controlledBy(serviceWorker, worker, version, timeout) {
	return new Promise((resolve, reject) => {
		const finish = (error = null) => {
			clearTimeout(timer);
			serviceWorker.removeEventListener("controllerchange", change);
			if (error) reject(error); else resolve(undefined);
		};
		const change = () => { if (serviceWorker.controller === worker) finish(); };
		const timer = setTimeout(() => finish(new Error("Activation timed out")), timeout);
		serviceWorker.addEventListener("controllerchange", change);
		try {
			if (serviceWorker.controller === worker) finish();
			else worker.postMessage({ type: "MOBINGO_SKIP_WAITING", version });
		} catch (error) { finish(error); }
	});
}

export function createUpdateManager({ serviceWorker = globalThis.navigator?.serviceWorker, reload = () => location.reload(),
	confirm = (message) => window.confirm(message), canApply = () => null, timeout = 10000, messageTimeout = 3000 } = {}) {
	let state = { phase: serviceWorker ? "idle" : "unsupported", currentVersion: APP_VERSION, latestVersion: null,
		message: serviceWorker ? "更新はまだ確認していません。" : "この環境ではアプリ内の更新確認を利用できません。" };
	let registration = null, registrationPromise = null, busy = false;
	const listeners = new Set();
	const publish = (phase, message, latestVersion = null) => {
		state = { ...state, phase, message, latestVersion };
		for (const listener of listeners) listener({ ...state });
	};
	function start() {
		if (!serviceWorker) return Promise.resolve(null);
		if (registration) return Promise.resolve(registration);
		if (!registrationPromise) {
			registrationPromise = bounded(Promise.resolve().then(() => serviceWorker.register("./sw.js", { updateViaCache: "none" })), timeout)
				.then((value) => { registration = value; return value; })
				.catch(() => { publish("error", CHECK_ERROR); return null; })
				.finally(() => { registrationPromise = null; });
		}
		return registrationPromise;
	}
	return {
		get state() { return { ...state }; },
		subscribe(listener) { listeners.add(listener); listener({ ...state }); return () => listeners.delete(listener); },
		start,
		async check() {
			if (!serviceWorker || busy || state.phase === "applying") return;
			busy = true;
			publish("checking", "更新を確認しています。");
			try {
				const reg = await start();
				if (!reg) return;
				await bounded(Promise.resolve().then(() => reg.update()), timeout);
				const installing = reg.installing;
				if (installing) await installed(installing, timeout);
				const worker = reg.waiting || reg.active;
				if (!worker) throw new Error("No worker");
				const version = await requestWorkerVersion(worker, messageTimeout);
				const difference = compareVersions(version, APP_VERSION);
				if (difference < 0 || (difference === 0 && reg.waiting)) throw new Error("Version mismatch");
				if (difference > 0) publish("available", `バージョン ${version} を準備できました。更新を適用できます。`, version);
				else publish("current", "最新のバージョンを使用しています。");
			} catch { publish("error", CHECK_ERROR); }
			finally { busy = false; }
		},
		async apply() {
			if (busy || state.phase !== "available") return;
			const latestVersion = state.latestVersion;
			const blocked = canApply();
			if (blocked) { publish("available", blocked, latestVersion); return; }
			if (!confirm("保存済みのゲーム状態を保ってアプリを更新・再読み込みします。入力途中の内容は失われます。更新しますか？")) return;
			busy = true;
			publish("applying", "更新を適用しています。画面が再読み込みされます。", latestVersion);
			try {
				const reg = await start();
				const worker = reg.waiting || serviceWorker.controller;
				if (await requestWorkerVersion(worker, messageTimeout) !== latestVersion) throw new Error("Update changed");
				const lateBlock = canApply();
				if (lateBlock) { publish("available", lateBlock, latestVersion); return; }
				await controlledBy(serviceWorker, worker, latestVersion, timeout);
				if (await requestWorkerVersion(serviceWorker.controller, messageTimeout) !== latestVersion) throw new Error("Controller mismatch");
				const reloadBlock = canApply();
				if (reloadBlock) { publish("available", reloadBlock, latestVersion); return; }
				reload();
			} catch { publish("error", "更新を完了できませんでした。もう一度更新を確認してください。"); }
			finally { busy = false; }
		},
	};
}
