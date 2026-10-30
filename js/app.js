/**
 * Mobingo App Main Entrypoint (Pure JS / ES Modules, No Build Step)
 */

import { renderIcon } from "./core/icons.js";
import { soundManager } from "./core/audio.js";
import { wakeLockManager } from "./core/wakelock.js";
import { loadAppMode, saveAppMode } from "./core/storage.js";
import { showLicenseModal } from "./views/license-modal.js";
import { renderModeSelect } from "./views/mode-select.js";
import { renderChildView } from "./views/child.js";
import { renderHostView } from "./views/host.js";

// Register Service Worker for PWA / offline support
if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("./sw.js")
			.then((reg) => {
				console.log("Mobingo Service Worker active:", reg.scope);
			})
			.catch((err) => {
				console.warn("Service Worker registration failed:", err);
			});
	});
}

class MobingoApp {
	constructor() {
		this.appEl = document.getElementById("app");
		this.disposeView = () => {};
		this.currentMode = loadAppMode(); // "select", "child", or "host"
	}

	init() {
		// Prevent screen sleep
		wakeLockManager.request();

		// iOS AudioContext unlock on first touch
		const unlockListener = () => {
			soundManager.unlock();
			window.removeEventListener("pointerdown", unlockListener);
		};
		window.addEventListener("pointerdown", unlockListener);

		this.render();
	}

	switchMode(mode) {
		this.currentMode = mode;
		saveAppMode(mode);
		this.render();
	}

	renderHeader() {
		const isMuted = soundManager.getMuted();

		let badgeText = "";
		if (this.currentMode === "host") badgeText = "開催者";
		else if (this.currentMode === "child") badgeText = "参加者";

		return `
			<header class="app-header">
				<div style="display:flex; align-items:center; gap:0.5rem;">
					<button id="header-logo-btn" class="logo-btn">
						<div class="logo-icon">M</div>
						<span>Mobingo</span>
					</button>
					${badgeText ? `<span class="badge">${badgeText}</span>` : ""}
				</div>

				<div style="display:flex; align-items:center; gap:0.35rem;">
					<button id="header-sound-btn" class="header-btn" title="${isMuted ? 'ミュート解除' : 'ミュート'}">
						<span style="color:${isMuted ? '#f43f5e' : '#94a3b8'};">
							${renderIcon(isMuted ? "volume-x" : "volume", 20)}
						</span>
					</button>

					${
						this.currentMode !== "select"
							? `<button id="header-switch-mode-btn" class="header-btn" title="モード選択に戻る">
									${renderIcon("refresh", 16)}
									</button>`
							: ""
					}

					<button id="header-license-btn" class="header-btn" title="ライセンス＆情報">
						${renderIcon("shield", 18)}
					</button>
				</div>
			</header>
		`;
	}

	bindHeaderEvents() {
		const logoBtn = this.appEl.querySelector("#header-logo-btn");
		const soundBtn = /** @type {HTMLButtonElement} */ (this.appEl.querySelector("#header-sound-btn"));
		const switchBtn = this.appEl.querySelector("#header-switch-mode-btn");
		const licenseBtn = this.appEl.querySelector("#header-license-btn");

		if (logoBtn) {
			logoBtn.addEventListener("click", () => {
				if (this.currentMode !== "select") {
					if (confirm("モード選択画面に戻りますか？現在のゲーム状態は自動保存されます。")) {
						this.switchMode("select");
					}
				}
			});
		}

		if (soundBtn) {
			soundBtn.addEventListener("click", () => {
				soundManager.unlock();
				const next = !soundManager.getMuted();
				soundManager.setMuted(next);
				soundBtn.innerHTML = renderIcon(next ? "volume-x" : "volume", 20);
				soundBtn.title = next ? "ミュート解除" : "ミュート";
			});
		}

		if (switchBtn) {
			switchBtn.addEventListener("click", () => {
				if (confirm("モード選択画面に戻りますか？")) {
					this.switchMode("select");
				}
			});
		}

		if (licenseBtn) {
			licenseBtn.addEventListener("click", () => {
				showLicenseModal();
			});
		}
	}

	render() {
		this.disposeView();
		this.disposeView = () => {};
		this.appEl.innerHTML = `
			${this.renderHeader()}
			<main id="app-main" style="flex:1; display:flex; flex-direction:column; min-height:0; overflow:hidden;"></main>
		`;

		this.bindHeaderEvents();

		const mainContainer = this.appEl.querySelector("#app-main");

		if (this.currentMode === "child") {
			this.disposeView = renderChildView(mainContainer);
		} else if (this.currentMode === "host") {
			this.disposeView = renderHostView(mainContainer);
		} else {
			renderModeSelect(mainContainer, {
				onSelectChild: () => this.switchMode("child"),
				onSelectHost: () => this.switchMode("host"),
			});
		}
	}
}

// Bootstrap
document.addEventListener("DOMContentLoaded", () => {
	const app = new MobingoApp();
	app.init();
});

