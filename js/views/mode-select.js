import { renderIcon } from "../core/icons.js";
import { soundManager } from "../core/audio.js";

export function renderModeSelect(container, { onSelectChild, onSelectHost }) {
	container.innerHTML = `
		<div class="flex-1 flex flex-col items-center justify-center" style="padding:1rem; max-width:24rem; margin:0 auto; width:100%; text-align:center;">
			<div style="width:5rem; height:5rem; border-radius:1.5rem; background:linear-gradient(135deg, #f59e0b, #ec4899, #4f46e5); display:flex; align-items:center; justify-content:center; box-shadow:0 20px 25px -5px rgba(79, 70, 229, 0.4); margin-bottom:1.5rem;">
				<span style="font-size:2.5rem; font-weight:900; color:#fff;">M</span>
			</div>

			<h1 style="font-size:2rem; font-weight:900; color:#fff; margin-bottom:0.5rem; letter-spacing:-0.025em;">Mobingo</h1>
			<p style="font-size:0.8rem; color:#94a3b8; margin-bottom:2rem; line-height:1.5;">
				電波いらずでどこでも動作する、完全オフライン対応のデジタルビンゴ
			</p>

			<div style="width:100%; display:flex; flex-direction:column; gap:1rem;">
				<button id="btn-select-child" class="btn-primary" style="padding:1.1rem; border-radius:1rem; display:flex; align-items:center; justify-content:between; width:100%; text-align:left; box-shadow:0 10px 15px -3px rgba(79, 70, 229, 0.3);">
					<div style="display:flex; align-items:center; gap:0.75rem;">
						<div style="width:2.5rem; height:2.5rem; border-radius:0.75rem; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center;">
							${renderIcon("smartphone", 24)}
						</div>
						<div>
							<div style="font-size:1.05rem; font-weight:900;">参加者モード</div>
							<div style="font-size:0.75rem; color:#c7d2fe;">カードを開いてビンゴに参加</div>
						</div>
					</div>
					<div style="color:#c7d2fe;">${renderIcon("sparkles", 20)}</div>
				</button>

				<button id="btn-select-host" class="btn-secondary" style="padding:1.1rem; border-radius:1rem; display:flex; align-items:center; justify-content:between; width:100%; text-align:left;">
					<div style="display:flex; align-items:center; gap:0.75rem;">
						<div style="width:2.5rem; height:2.5rem; border-radius:0.75rem; background:rgba(245, 158, 11, 0.2); border:1px solid rgba(245, 158, 11, 0.3); display:flex; align-items:center; justify-content:center; color:#fbbf24;">
							${renderIcon("trophy", 22)}
						</div>
						<div>
							<div style="font-size:1.05rem; font-weight:900; color:#fff;">開催者モード</div>
							<div style="font-size:0.75rem; color:#94a3b8;">出目の抽選・履歴・当選照合</div>
						</div>
					</div>
					<div style="color:#64748b;">${renderIcon("users", 20)}</div>
				</button>
			</div>
		</div>
	`;

	container.querySelector("#btn-select-child").addEventListener("click", () => {
		soundManager.unlock();
		onSelectChild();
	});

	container.querySelector("#btn-select-host").addEventListener("click", () => {
		soundManager.unlock();
		onSelectHost();
	});
}

