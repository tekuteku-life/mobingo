import { renderIcon } from "../core/icons.js";

export function showLicenseModal() {
	const existing = document.getElementById("license-modal");
	if (existing) existing.remove();

	const modal = document.createElement("div");
	modal.id = "license-modal";
	modal.className = "modal-overlay";
	modal.innerHTML = `
		<div class="modal-content animate-fade-in" style="max-height: 85vh; overflow-y: auto;">
			<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem; margin-bottom:1rem;">
				<div style="display:flex; align-items:center; gap:0.5rem; font-weight:700; color:#34d399;">
					${renderIcon("shield", 22)}
					<span style="color:#fff; font-size:1.1rem;">ライセンス＆商標表記</span>
				</div>
				<button id="close-license-btn" class="header-btn" style="padding:0.25rem;">
					${renderIcon("close", 20)}
				</button>
			</div>

			<div style="font-size:0.8rem; line-height:1.6; color:#cbd5e1; display:flex; flex-direction:column; gap:1rem;">
				<!-- Trademark Notice -->
				<div style="background:rgba(30,41,59,0.8); border:1px solid rgba(245,158,11,0.4); border-radius:0.75rem; padding:0.75rem;">
					<div style="color:#fbbf24; font-weight:700; margin-bottom:0.25rem;">商標に関する表示</div>
					<p style="font-weight:600; color:#f8fafc;">QRコードは株式会社デンソーウェーブの登録商標です。</p>
				</div>

				<div>
					<div style="font-weight:700; color:#fff; margin-bottom:0.25rem;">Mobingo（モビンゴ）について</div>
					<p style="color:#94a3b8; font-size:0.75rem;">
						Mobingoは、完全オフライン環境で動作する決定論的デジタルビンゴシステムです。
						Web Crypto API (PBKDF2-SHA256) と自前ChaCha20 PRNGにより、通信を一切使用せず高信頼な同期と検証を実現します。
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

	const close = () => modal.remove();
	modal.querySelector("#close-license-btn").addEventListener("click", close);
	modal.querySelector("#close-license-bottom-btn").addEventListener("click", close);
	modal.addEventListener("click", (e) => {
		if (e.target === modal) close();
	});
}

