import { createScope } from "../core/lifecycle.js";
import { renderIcon } from "../core/icons.js";

let disposeShareModal = () => {};

export function showShareModal() {
	disposeShareModal();
	const scope = createScope();
	const close = () => scope.dispose();
	disposeShareModal = close;
	const previousFocus = document.activeElement;
	const url = new URL(window.location.href);
	url.search = "";
	url.hash = "";
	const shareUrl = url.href;
	const canShare = typeof navigator.share === "function";
	let pending = false;
	let qrBusy = false;
	let qrReady = false;

	const modal = document.createElement("div");
	modal.id = "app-share-modal";
	modal.className = "modal-overlay";
	modal.setAttribute("role", "dialog");
	modal.setAttribute("aria-modal", "true");
	modal.setAttribute("aria-labelledby", "share-heading");
	modal.innerHTML = `
		<div class="modal-content share-modal-content">
			<div class="share-heading-row">
				<h2 id="share-heading">${renderIcon("share", 20)} アプリのURLを共有</h2>
				<button id="close-share-btn" class="header-btn" aria-label="共有画面を閉じる">${renderIcon("close", 20)}</button>
			</div>
			<p>Mobingoを開くためのURLです。</p>
			<label for="share-url">共有するURL</label>
			<input id="share-url" class="name-input" type="text" readonly spellcheck="false" />
			<button id="btn-copy-url" class="btn-primary">URLをコピー</button>
			<button id="btn-native-share" class="btn-secondary">端末の共有メニュー</button>
			<p id="share-unsupported" ${canShare ? "hidden" : ""}>このブラウザーでは共有メニューを利用できません。コピーかQRコードをご利用ください。</p>
			<button id="btn-share-qr" class="btn-secondary" aria-expanded="false" aria-controls="share-qr-panel">URLのQRコードを表示</button>
			<p id="share-status" role="status" aria-live="polite"></p>
			<div id="share-qr-panel" hidden>
				<p>このQRコードからMobingoを開けます。</p>
				<p id="share-qr-status" role="status" aria-live="polite"></p>
				<canvas id="share-qr-canvas" aria-label="アプリURLのQRコード" hidden></canvas>
			</div>
		</div>
	`;
	document.body.appendChild(modal);
	const field = /** @type {HTMLInputElement} */ (modal.querySelector("#share-url"));
	const copyButton = /** @type {HTMLButtonElement} */ (modal.querySelector("#btn-copy-url"));
	const shareButton = /** @type {HTMLButtonElement} */ (modal.querySelector("#btn-native-share"));
	const qrButton = modal.querySelector("#btn-share-qr");
	const qrPanel = /** @type {HTMLElement} */ (modal.querySelector("#share-qr-panel"));
	const qrStatus = modal.querySelector("#share-qr-status");
	const canvas = /** @type {HTMLCanvasElement} */ (modal.querySelector("#share-qr-canvas"));
	const status = modal.querySelector("#share-status");
	field.value = shareUrl;
	shareButton.disabled = !canShare;

	async function perform(kind) {
		if (!scope.active || pending) return;
		pending = true;
		copyButton.disabled = true;
		shareButton.disabled = true;
		status.textContent = kind === "copy" ? "URLをコピーしています..." : "共有メニューを開いています...";
		try {
			if (kind === "copy") {
				if (typeof navigator.clipboard?.writeText !== "function") throw new Error("Clipboard unavailable");
				await navigator.clipboard.writeText(shareUrl);
			} else {
				// Keep this call within the button's user activation, before any await.
				await navigator.share({ title: "Mobingo", url: shareUrl });
			}
			if (scope.active) status.textContent = kind === "copy" ? "URLをコピーしました。" : "共有メニューの操作が完了しました。";
		} catch (error) {
			if (!scope.active) return;
			if (kind === "copy") {
				field.focus({ preventScroll: true });
				field.select();
				status.textContent = "コピーできませんでした。表示中のURLを長押ししてコピーしてください。";
			} else {
				status.textContent = error?.name === "AbortError" ? "共有をキャンセルしました。" : "共有できませんでした。コピーかQRコードをご利用ください。";
			}
		} finally {
			if (scope.active) {
				pending = false;
				copyButton.disabled = false;
				shareButton.disabled = !canShare;
			}
		}
	}
	copyButton.addEventListener("click", () => perform("copy"));
	shareButton.addEventListener("click", () => perform("native"));
	qrButton.addEventListener("click", async () => {
		if (!scope.active) return;
		qrPanel.hidden = !qrPanel.hidden;
		qrButton.setAttribute("aria-expanded", String(!qrPanel.hidden));
		qrButton.textContent = qrPanel.hidden ? "URLのQRコードを表示" : "URLのQRコードを閉じる";
		if (qrPanel.hidden || qrReady || qrBusy) return;
		qrBusy = true;
		qrStatus.textContent = "QRコードを作成しています...";
		try {
			if (!window.QRCode) throw new Error("QR library unavailable");
			// Render offscreen so delayed library work cannot change a closed modal.
			const generated = document.createElement("canvas");
			await window.QRCode.toCanvas(generated, shareUrl, {
				width: 220, margin: 2, color: { dark: "#0f172a", light: "#ffffff" },
			});
			if (!scope.active) return;
			canvas.width = generated.width;
			canvas.height = generated.height;
			canvas.getContext("2d").drawImage(generated, 0, 0);
			canvas.hidden = false;
			qrReady = true;
			qrStatus.textContent = "";
		} catch {
			if (scope.active) qrStatus.textContent = "QRコードを作成できませんでした。URLのコピーをご利用ください。";
		} finally {
			if (scope.active) qrBusy = false;
		}
	});
	modal.querySelector("#close-share-btn").addEventListener("click", close);
	modal.addEventListener("click", event => { if (event.target === modal) close(); });
	const onKeyDown = event => { if (event.key === "Escape") close(); };
	document.addEventListener("keydown", onKeyDown);
	scope.add(() => {
		document.removeEventListener("keydown", onKeyDown);
		modal.remove();
		if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
	});
	/** @type {HTMLButtonElement} */ (modal.querySelector("#close-share-btn")).focus({ preventScroll: true });
	return close;
}
