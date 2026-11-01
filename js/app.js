/**
 * Mobingo App Main Entrypoint (Pure JS / ES Modules, No Build Step)
 */

import { createUpdateManager } from "./core/updates.js";
import { renderIcon } from "./core/icons.js";
import { soundManager } from "./core/audio.js";
import { hapticsManager } from "./core/haptics.js";
import { wakeLockManager } from "./core/wakelock.js";
import { loadAppMode, saveAppMode } from "./core/storage.js";
import { showLicenseModal } from "./views/license-modal.js";
import { showShareModal } from "./views/share-modal.js";
import { renderModeSelect } from "./views/mode-select.js";
import { renderChildView } from "./views/child.js";
import { renderHostView } from "./views/host.js";

const updateManager = createUpdateManager({
	canApply: () => {
		if (document.querySelector(".scanner-screen")) return "受付を終えてから更新してください。";
		if (document.querySelector('[data-update-busy="true"]')) return "抽選が終わってから更新してください。";
		return null;
	},
});
window.addEventListener("load", () => { updateManager.start(); });

class MobingoApp {
	constructor() {
		this.appEl = document.getElementById("app");
		this.disposeView = () => {};
		this.disposeShare = () => {};
		this.currentMode = loadAppMode(); // "select", "child", or "host"
	}

	init() {
		// Prevent screen sleep
		wakeLockManager.request();

		// Retry on later gestures too: touchend and interruption recovery matter on mobile.
		for (const type of ["pointerdown", "pointerup", "touchstart", "touchend", "click", "keydown"]) {
			window.addEventListener(type, () => soundManager.unlock(), { capture: true, passive: true });
		}

		this.render();
	}

	switchMode(mode) {
		this.currentMode = mode;
		saveAppMode(mode);
		this.render();
	}

	renderHeader() {
		const isMuted = soundManager.getMuted();
		const hapticsEnabled = hapticsManager.getEnabled();

		let badgeText = "";
		if (this.currentMode === "host") badgeText = "開催者";
		else if (this.currentMode === "child") badgeText = "参加者";

		return `
			<header class="app-header ${this.currentMode === "host" ? "is-host" : ""}">
				<div style="display:flex; align-items:center; gap:0.5rem;">
					<button id="header-logo-btn" class="logo-btn">
						<div class="logo-icon">M</div>
						<span>Mobingo</span>
					</button>
					${badgeText ? `<span class="badge">${badgeText}</span>` : ""}
				</div>

				<div class="header-controls">
					<button id="header-share-btn" class="header-btn" title="アプリのURLを共有" aria-label="アプリのURLを共有">
						${renderIcon("share", 20)}
					</button>
					<button id="header-haptics-btn" class="header-btn" title="振動 ${hapticsEnabled ? 'オン' : 'オフ'}" aria-label="振動 ${hapticsEnabled ? 'オン' : 'オフ'}" aria-pressed="${hapticsEnabled}" style="color:${hapticsEnabled ? '#94a3b8' : '#f43f5e'};">
						${renderIcon("smartphone", 20)}
					</button>
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

					<button id="header-license-btn" class="header-btn" title="アプリ情報・更新・ライセンス">
						${renderIcon("shield", 18)}
					</button>
					${this.currentMode === "host" ? `<button id="btn-projector" class="header-btn projector-toggle" title="外部投影" disabled>${renderIcon("tv", 18)}<span>外部投影</span></button>` : ""}
				</div>
			</header>
		`;
	}

	bindHeaderEvents() {
		const logoBtn = this.appEl.querySelector("#header-logo-btn");
		const soundBtn = /** @type {HTMLButtonElement} */ (this.appEl.querySelector("#header-sound-btn"));
		const switchBtn = this.appEl.querySelector("#header-switch-mode-btn");
		const licenseBtn = this.appEl.querySelector("#header-license-btn");
		const hapticsBtn = this.appEl.querySelector("#header-haptics-btn");
		this.appEl.querySelector("#header-share-btn").addEventListener("click", () => {
			this.disposeShare = showShareModal();
		});
		hapticsBtn.addEventListener("click", () => {
			const next = !hapticsManager.getEnabled();
			hapticsManager.setEnabled(next);
			const label = `振動 ${next ? "オン" : "オフ"}`;
			hapticsBtn.setAttribute("aria-pressed", String(next));
			hapticsBtn.setAttribute("aria-label", label);
			hapticsBtn.setAttribute("title", label);
			/** @type {HTMLElement} */ (hapticsBtn).style.color = next ? "#94a3b8" : "#f43f5e";
		});

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
				showLicenseModal(updateManager);
			});
		}
	}

	render() {
		this.disposeShare();
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

