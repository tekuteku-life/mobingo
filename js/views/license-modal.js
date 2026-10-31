import { createScope } from "../core/lifecycle.js";
import { APP_VERSION } from "../core/version.js";
import { renderIcon } from "../core/icons.js";

let disposeLicenseModal = () => {};

export function showLicenseModal(updateManager = null) {
	disposeLicenseModal();
	const scope = createScope();
	disposeLicenseModal = () => scope.dispose();

	const modal = document.createElement("div");
	modal.id = "license-modal";
	modal.className = "modal-overlay";
	modal.innerHTML = `
		<div class="modal-content animate-fade-in" style="max-height: 85vh; overflow-y: auto;">
			<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem; margin-bottom:1rem;">
				<div style="display:flex; align-items:center; gap:0.5rem; font-weight:700; color:#34d399;">
					${renderIcon("shield", 22)}
					<span style="color:#fff; font-size:1.1rem;">アプリ情報・更新</span>
				</div>
				<button id="close-license-btn" class="header-btn" style="padding:0.25rem;">
					${renderIcon("close", 20)}
				</button>
			</div>

			<div style="font-size:0.8rem; line-height:1.6; color:#cbd5e1; display:flex; flex-direction:column; gap:1rem;">
				<section class="app-update-panel" aria-labelledby="update-heading">
					<h2 id="update-heading">バージョンと更新</h2>
					<p>現在のバージョン: <strong id="app-version">${APP_VERSION}</strong></p>
					<p id="update-status" role="status" aria-live="polite"></p>
					<div class="update-actions">
						<button id="btn-check-update" class="btn-secondary">更新を確認</button>
						<button id="btn-apply-update" class="btn-primary" hidden>更新して再読み込み</button>
					</div>
					<p class="update-help">更新の確認には通信が必要です。保存済みのゲーム状態は更新後も引き継がれます。</p>
				</section>
				<!-- Trademark Notice -->
				<div style="background:rgba(30,41,59,0.8); border:1px solid rgba(245,158,11,0.4); border-radius:0.75rem; padding:0.75rem;">
					<div style="color:#fbbf24; font-weight:700; margin-bottom:0.25rem;">商標に関する表示</div>
					<p style="font-weight:600; color:#f8fafc;">QRコードは株式会社デンソーウェーブの登録商標です。</p>
				</div>

				<div>
					<div style="font-weight:700; color:#fff; margin-bottom:0.25rem;">Mobingo（モビンゴ）について</div>
					<p style="color:#94a3b8; font-size:0.75rem;">
						Mobingoは、同じIDから同じカードと出目を再現するビンゴアプリです。
						初回の読み込みと更新には通信が必要です。取得後のカード表示・抽選・照合はオフラインで利用できます。
					</p>
				</div>

				<div>
					<div style="font-weight:700; color:#fff; margin-bottom:0.5rem;">同梱オープンソースライブラリ</div>
					<div style="display:flex; flex-direction:column; gap:0.5rem; font-size:0.75rem;">
						<div style="background:#030712; padding:0.5rem; border-radius:0.5rem; border:1px solid #1e293b;">
							<div style="font-weight:700; color:#e2e8f0;">qrcode</div>
							<div style="color:#64748b;">MIT License - Copyright (c) 2012 Ryan Day</div>
						</div>
						<div style="background:#030712; padding:0.5rem; border-radius:0.5rem; border:1px solid #1e293b;">
							<div style="font-weight:700; color:#e2e8f0;">jsQR</div>
							<div style="color:#64748b;">Apache License 2.0 - Copyright 2017 Cosmotron Inc.</div>
						</div>
						<div style="background:#030712; padding:0.5rem; border-radius:0.5rem; border:1px solid #1e293b;">
							<div style="font-weight:700; color:#e2e8f0;">canvas-confetti</div>
							<div style="color:#64748b;">ISC License - Copyright (c) 2020 Kiril Vatev</div>
						</div>
					</div>
				</div>
			</div>

			<div style="margin-top:1.25rem; padding-top:0.75rem; border-top:1px solid var(--border-light);">
				<button id="close-license-bottom-btn" class="btn-secondary w-full" style="padding:0.6rem; border-radius:0.75rem; font-size:0.85rem;">
					閉じる
				</button>
			</div>
		</div>
	`;

	document.body.appendChild(modal);

	scope.add(() => modal.remove());
	const checkButton = /** @type {HTMLButtonElement} */ (modal.querySelector("#btn-check-update"));
	const applyButton = /** @type {HTMLButtonElement} */ (modal.querySelector("#btn-apply-update"));
	function renderUpdate(state) {
		const status = /** @type {HTMLElement} */ (modal.querySelector("#update-status"));
		status.textContent = state.message;
		status.dataset.phase = state.phase;
		const busy = state.phase === "checking" || state.phase === "applying";
		checkButton.disabled = busy || state.phase === "unsupported";
		applyButton.hidden = !["available", "applying"].includes(state.phase);
		applyButton.disabled = busy;
	}
	if (updateManager) scope.add(updateManager.subscribe(renderUpdate));
	else renderUpdate({ phase: "unsupported", message: "この画面では更新確認を利用できません。" });
	checkButton.addEventListener("click", () => { if (scope.active) updateManager?.check(); });
	applyButton.addEventListener("click", () => { if (scope.active) updateManager?.apply(); });
	const close = () => scope.dispose();
	modal.querySelector("#close-license-btn").addEventListener("click", close);
	modal.querySelector("#close-license-bottom-btn").addEventListener("click", close);
	modal.addEventListener("click", (e) => {
		if (e.target === modal) close();
	});
}

