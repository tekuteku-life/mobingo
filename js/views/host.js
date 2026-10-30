import { createScope } from "../core/lifecycle.js";
import { sanitizeSeedInput, isValidSeed, generateRandomSeed, parseQrSeed } from "../core/base32.js";
import {
	generateDrawSequence,
	generateBingoCard,
	calculateReachAndBingo,
	verifyChildCard,
	FREE_CELL,
} from "../core/bingo.js";
import { soundManager } from "../core/audio.js";
import { renderIcon } from "../core/icons.js";
import { saveParentState, loadParentState, clearParentState } from "../core/storage.js";
import { BingoBarrel } from "../components/bingo-barrel.js";
import { createSlideAction } from "../components/slide-action.js";

function getBallLetter(n) {
	if (n <= 15) return "B";
	if (n <= 30) return "I";
	if (n <= 45) return "N";
	if (n <= 60) return "G";
	return "O";
}

export function renderHostView(container) {
	const viewScope = createScope();
	let screenScope = viewScope.child();
	function beginScreen() {
		screenScope.dispose();
		screenScope = viewScope.child();
		return screenScope;
	}
	let saved = loadParentState();
	let parentSeed = saved ? saved.parentSeed : "";
	let gameMode = saved ? saved.mode : "mode_b";
	let currentTurn = saved ? saved.currentTurn : 0;
	let specialRuleTurn = saved ? saved.specialRuleTurn : null;
	let registeredSeeds = saved && saved.registeredChildSeeds ? saved.registeredChildSeeds : [];
	let drawSequence = [];
	let isGameStarted = false;

	// Cached cards for Mode A
	let childCardsMap = new Map();

	function init() {
		if (parentSeed && saved && currentTurn >= 0) {
			generateDrawSequence(parentSeed).then((seq) => {
				if (!viewScope.active) return;
				drawSequence = seq;
				isGameStarted = true;
				if (gameMode === "mode_a") {
					loadChildCards().then(() => render());
				} else {
					render();
				}
			});
		} else {
			render();
		}
	}

	async function loadChildCards(scope = viewScope) {
		const cards = new Map();
		for (const seed of registeredSeeds) {
			const card = await generateBingoCard(seed);
			if (!scope.active) return;
			cards.set(seed, card);
		}
		childCardsMap = cards;
	}

	function render() {
		if (!viewScope.active) return;
		if (!isGameStarted) {
			renderSetup();
		} else {
			renderDashboard();
		}
	}

	// 1. Setup Screen
	function renderSetup() {
		const scope = beginScreen();
		let requestId = 0;
		let inputSeed = parentSeed || generateRandomSeed();

		container.innerHTML = `
			<div class="setup-screen flex-1 flex flex-col justify-center" style="padding:1rem; max-width:28rem; margin:0 auto; width:100%; overflow-y:auto;">
				<div style="text-align:center; margin-bottom:1.5rem;">
					<div style="width:4.5rem; height:4.5rem; border-radius:1.5rem; background:linear-gradient(135deg, #f43f5e, #f59e0b); display:flex; align-items:center; justify-content:center; box-shadow:0 15px 25px -5px rgba(244, 63, 94, 0.3); margin:0 auto 0.75rem auto; color:#fff;">
						${renderIcon("trophy", 32)}
					</div>
					<h1 style="font-size:1.75rem; font-weight:900; color:#fff;">開催者セットアップ</h1>
					<p style="font-size:0.75rem; color:#94a3b8; margin-top:0.25rem;">イベント規模に合わせてモードを選択してください</p>
				</div>

				<!-- Mode Selection -->
				<div style="display:flex; flex-direction:column; gap:0.75rem; margin-bottom:1.25rem;">
					<div
						id="opt-mode-b"
						class="mode-card"
						style="padding:1rem; border-radius:1rem; border:2px solid ${gameMode === 'mode_b' ? '#f59e0b' : '#1e293b'}; background:${gameMode === 'mode_b' ? '#0f172a' : 'rgba(15,23,42,0.6)'}; cursor:pointer; transition:all 0.15s;"
					>
						<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.35rem;">
							<div style="display:flex; align-items:center; gap:0.5rem;">
								<span style="color:${gameMode === 'mode_b' ? '#fbbf24' : '#64748b'};">${renderIcon("sparkles", 18)}</span>
								<span style="font-size:0.9rem; font-weight:800; color:#fff;">モードB：事後検証モード（推奨）</span>
							</div>
							<span class="badge" style="background:rgba(245,158,11,0.2); color:#fbbf24; border-color:rgba(245,158,11,0.4);">
								大規模〜即開始
							</span>
						</div>
						<p style="font-size:0.75rem; color:#94a3b8; line-height:1.5;">
							事前受付不要で今すぐ開始。参加者が「ビンゴ！」と名乗り出た際に、開催者カメラでQRを照合して当選判定を行います。
						</p>
					</div>

					<div
						id="opt-mode-a"
						class="mode-card"
						style="padding:1rem; border-radius:1rem; border:2px solid ${gameMode === 'mode_a' ? '#6366f1' : '#1e293b'}; background:${gameMode === 'mode_a' ? '#0f172a' : 'rgba(15,23,42,0.6)'}; cursor:pointer; transition:all 0.15s;"
					>
						<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.35rem;">
							<div style="display:flex; align-items:center; gap:0.5rem;">
								<span style="color:${gameMode === 'mode_a' ? '#818cf8' : '#64748b'};">${renderIcon("users", 18)}</span>
								<span style="font-size:0.9rem; font-weight:800; color:#fff;">モードA：事前登録モード</span>
							</div>
							<span class="badge" style="background:rgba(99,102,241,0.2); color:#a5b4fc; border-color:rgba(99,102,241,0.4);">
								少人数〜50人
							</span>
						</div>
						<p style="font-size:0.75rem; color:#94a3b8; line-height:1.5;">
							全員のカードQRを連続スキャン。ボール排出ごとに全員のリーチ・ビンゴを自動検知＆激アツ数字予告が作動します。
						</p>
					</div>
				</div>

				<!-- Parent Seed -->
				<div style="background:#0f172a; border:1px solid #1e293b; border-radius:1rem; padding:1rem; margin-bottom:1.25rem; width:100%; box-sizing:border-box;">
					<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
						<label style="font-size:0.75rem; font-weight:700; color:#cbd5e1; display:flex; align-items:center; gap:0.35rem;">
							<span style="color:#10b981;">${renderIcon("shield", 16)}</span>
							<span>開催シード（出目順の決定乱数）</span>
						</label>
						<span style="font-size:0.7rem; color:#64748b;">Crockford 4文字</span>
					</div>
					<div style="display:flex; align-items:center; gap:0.5rem; width:100%; box-sizing:border-box;">
						<input
							id="host-seed-input"
							type="text"
							value="${inputSeed}"
							maxlength="4"
							placeholder="P1A9"
							class="seed-input flex-1"
							style="flex:1 1 0%; min-width:0; width:0; box-sizing:border-box;"
							autocomplete="off"
							spellcheck="false"
						/>
						<button
							id="btn-host-regen"
							type="button"
							class="btn-reseed"
							style="flex:0 0 3.5rem; width:3.5rem; box-sizing:border-box;"
							title="別のシードをランダム生成"
						>
							${renderIcon("dices", 22)}
						</button>
					</div>
				</div>

				<button
					id="btn-host-proceed"
					class="btn-primary w-full"
					style="padding:1rem; border-radius:1rem; font-size:1rem; display:flex; align-items:center; justify-content:center; gap:0.5rem;"
				>
					<span>${gameMode === 'mode_a' ? '参加者QRの事前受付へ進む' : 'ビンゴゲームを開始する'}</span>
					${renderIcon("arrow-right", 20)}
				</button>
			</div>
		`;

		const seedInput = container.querySelector("#host-seed-input");
		const regenBtn = container.querySelector("#btn-host-regen");
		const modeA = container.querySelector("#opt-mode-a");
		const modeB = container.querySelector("#opt-mode-b");
		const proceedBtn = container.querySelector("#btn-host-proceed");

		modeA.addEventListener("click", () => {
			parentSeed = seedInput.value;
			gameMode = "mode_a";
			renderSetup();
		});
		modeB.addEventListener("click", () => {
			parentSeed = seedInput.value;
			gameMode = "mode_b";
			renderSetup();
		});

		seedInput.addEventListener("input", (e) => {
			e.target.value = sanitizeSeedInput(e.target.value);
		});

		regenBtn.addEventListener("click", () => {
			soundManager.unlock();
			soundManager.playBallEjected();
			seedInput.value = generateRandomSeed();
		});

		proceedBtn.addEventListener("click", async () => {
			soundManager.unlock();
			const seed = sanitizeSeedInput(seedInput.value);
			if (!isValidSeed(seed)) return;

			parentSeed = seed;
			if (gameMode === "mode_a") {
				renderContinuousScanner();
			} else {
				const request = ++requestId;
				const sequence = await generateDrawSequence(parentSeed);
				if (!scope.active || request !== requestId) return;
				drawSequence = sequence;
				currentTurn = 0;
				specialRuleTurn = null;
				isGameStarted = true;
				saveParent();
				render();
			}
		});
	}

	// 2. Mode A Continuous Scanner
	function renderContinuousScanner() {
		const scope = beginScreen();
		let cameraActive = true;
		let finishing = false;
		let videoStream = null;
		let animFrame = null;
		let scanCoolDown = 0;

		container.innerHTML = `
			<div style="flex:1; display:flex; flex-direction:column; justify-content:space-between; max-width:28rem; margin:0 auto; width:100%; padding:1rem; height:100%; overflow:hidden;">
				<!-- Top bar -->
				<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; flex-shrink:0;">
					<button id="scanner-back-btn" class="header-btn" style="background:#0f172a; padding:0.4rem 0.75rem; border:1px solid #1e293b; border-radius:0.5rem; font-size:0.75rem; color:#cbd5e1;">
						← 戻る
					</button>
					<div style="display:flex; align-items:center; gap:0.4rem;">
						<span style="color:#10b981;">${renderIcon("check", 18)}</span>
						<span style="font-size:0.85rem; font-weight:700; color:#fff;">
							事前受付: <span class="font-mono" style="color:#fbbf24; font-size:1.05rem;" id="scanner-count">${registeredSeeds.length}</span> 名
						</span>
					</div>
				</div>

				<!-- Camera Feed -->
				<div style="position:relative; width:100%; aspect-ratio:16/9; background:#000; border-radius:1.25rem; overflow:hidden; border:1px solid #334155; margin-bottom:0.75rem; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
					<video id="scanner-video" style="width:100%; height:100%; object-fit:cover;" playsinline></video>
					<canvas id="scanner-canvas" style="display:none;"></canvas>

					<!-- Framing guide -->
					<div style="position:absolute; inset:0; border:2px solid rgba(99,102,241,0.4); border-radius:1.25rem; pointer-events:none; display:flex; align-items:center; justify-content:center;">
						<div style="width:12rem; height:8rem; border:2px dashed rgba(16,185,129,0.8); border-radius:1rem; display:flex; align-items:center; justify-content:center;">
							<span style="font-size:0.7rem; font-weight:700; color:#6ee7b7; background:rgba(3,7,18,0.8); padding:0.2rem 0.5rem; border-radius:0.35rem;">
								参加者QRをかざす
							</span>
						</div>
					</div>

					<div id="scanner-toast" style="display:none; position:absolute; bottom:0.5rem; left:0.5rem; right:0.5rem; padding:0.4rem 0.75rem; border-radius:0.75rem; font-size:0.75rem; font-weight:700; align-items:center; justify-content:space-between; backdrop-filter:blur(4px);"></div>
				</div>

				<!-- Manual Seed Form -->
				<form id="scanner-manual-form" style="display:flex; gap:0.5rem; margin-bottom:0.75rem; flex-shrink:0;">
					<input
						id="scanner-manual-input"
						type="text"
						maxlength="4"
						placeholder="手入力 4文字ID"
						class="seed-input flex-1"
						style="font-size:1rem; padding:0.4rem; letter-spacing:0.1em; height:2.5rem;"
					/>
					<button
						type="submit"
						class="btn-primary"
						style="padding:0 1rem; border-radius:0.75rem; font-size:0.75rem; font-weight:700;"
					>
						追加
					</button>
				</form>

				<!-- Registered Chips List -->
				<div style="flex:1; background:rgba(15,23,42,0.8); border:1px solid #1e293b; border-radius:1rem; padding:0.6rem; overflow-y:auto; min-height:0; margin-bottom:0.75rem;">
					<div style="font-size:0.7rem; font-weight:700; color:#94a3b8; margin-bottom:0.4rem;">登録済み一覧</div>
					<div id="scanner-chips" style="display:flex; flex-wrap:wrap; gap:0.35rem;"></div>
				</div>

				<!-- Finish Button -->
				<button
					id="scanner-finish-btn"
					class="btn-primary w-full"
					style="padding:0.9rem; border-radius:1rem; font-size:0.95rem; display:flex; align-items:center; justify-content:center; gap:0.5rem; flex-shrink:0; background:linear-gradient(135deg, #059669, #0d9488);"
					${registeredSeeds.length === 0 ? 'disabled style="opacity:0.5;"' : ''}
				>
					<span>受付を終了して親シード確定へ</span>
					${renderIcon("arrow-right", 18)}
				</button>
			</div>
		`;

		const video = container.querySelector("#scanner-video");
		const canvas = container.querySelector("#scanner-canvas");
		const chipsContainer = container.querySelector("#scanner-chips");
		const toast = container.querySelector("#scanner-toast");
		const countEl = container.querySelector("#scanner-count");
		const finishBtn = container.querySelector("#scanner-finish-btn");
		const backBtn = container.querySelector("#scanner-back-btn");
		const manualForm = container.querySelector("#scanner-manual-form");
		const manualInput = container.querySelector("#scanner-manual-input");

		function renderChips() {
			chipsContainer.innerHTML = registeredSeeds
				.map(
					(seed) => `
					<div style="background:#030712; border:1px solid #1e293b; border-radius:0.5rem; padding:0.2rem 0.5rem; display:flex; align-items:center; gap:0.35rem; font-size:0.75rem;">
						<span class="font-mono" style="font-weight:700; color:#fbbf24;">${seed}</span>
						<button class="remove-chip-btn" data-seed="${seed}" style="background:none; border:none; color:#64748b; cursor:pointer; padding:0.1rem;">
							${renderIcon("close", 14)}
						</button>
					</div>
				`
				)
				.join("");

			countEl.textContent = registeredSeeds.length;
			finishBtn.disabled = registeredSeeds.length === 0;
			finishBtn.style.opacity = registeredSeeds.length === 0 ? "0.5" : "1";

			chipsContainer.querySelectorAll(".remove-chip-btn").forEach((btn) => {
				btn.addEventListener("click", () => {
					if (finishing) return;
					const s = btn.getAttribute("data-seed");
					registeredSeeds = registeredSeeds.filter((item) => item !== s);
					renderChips();
				});
			});
		}

		renderChips();

		function showToast(seed, isDup) {
			toast.style.display = "flex";
			if (isDup) {
				toast.style.background = "rgba(136, 19, 55, 0.9)";
				toast.style.color = "#fecdd3";
				toast.style.border = "1px solid #f43f5e";
				toast.innerHTML = `<span>⚠️ 既に登録済み: <strong class="font-mono">${seed}</strong></span><span style="font-size:0.65rem;">次をどうぞ</span>`;
			} else {
				toast.style.background = "rgba(6, 78, 59, 0.9)";
				toast.style.color = "#a7f3d0";
				toast.style.border = "1px solid #10b981";
				toast.innerHTML = `<span>✅ 登録成功: <strong class="font-mono">${seed}</strong></span><span style="font-size:0.65rem;">次をどうぞ</span>`;
			}
		}

		function addSeed(seed) {
			if (finishing || !isValidSeed(seed)) return;
			const isDup = registeredSeeds.includes(seed);
			showToast(seed, isDup);
			if (!isDup) {
				soundManager.playScanBeep();
				registeredSeeds.push(seed);
				renderChips();
			} else {
				soundManager.playBallEjected();
			}
		}

		// Camera loop
		async function startCamera() {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
				});
				if (!scope.active || !cameraActive) { stream.getTracks().forEach((track) => track.stop()); return; }
				videoStream = stream;
				video.srcObject = stream;
				await video.play();
				if (scope.active && cameraActive) scanLoop();
			} catch (err) {
				console.warn("Camera start failed:", err);
			}
		}

		function scanLoop() {
			if (!scope.active || !cameraActive) return;
			if (video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;
				const ctx = canvas.getContext("2d", { willReadFrequently: true });
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
				const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
				const code = window.jsQR(imgData.data, imgData.width, imgData.height, {
					inversionAttempts: "dontInvert",
				});

				const now = Date.now();
				if (code && code.data && now > scanCoolDown) {
					const s = parseQrSeed(code.data);
					if (s !== null) {
						scanCoolDown = now + 1200;
						addSeed(s);
					}
				}
			}
			animFrame = requestAnimationFrame(scanLoop);
		}

		function stopCamera() {
			cameraActive = false;
			if (animFrame) cancelAnimationFrame(animFrame);
			if (videoStream) {
				videoStream.getTracks().forEach((track) => track.stop());
				videoStream = null;
			}
		}

		scope.add(stopCamera);
		startCamera();

		manualInput.addEventListener("input", (e) => {
			e.target.value = sanitizeSeedInput(e.target.value);
		});

		manualForm.addEventListener("submit", (e) => {
			e.preventDefault();
			const s = sanitizeSeedInput(manualInput.value);
			if (isValidSeed(s)) {
				addSeed(s);
				manualInput.value = "";
			}
		});

		backBtn.addEventListener("click", () => {
			if (finishing) return;
			stopCamera();
			renderSetup();
		});

		finishBtn.addEventListener("click", async () => {
			if (finishing || registeredSeeds.length === 0) return;
			finishing = true;
			manualInput.disabled = true;
			manualForm.querySelector("button").disabled = true;
			backBtn.disabled = true;
			chipsContainer.querySelectorAll("button").forEach((button) => { button.disabled = true; });
			registeredSeeds = [...registeredSeeds];
			stopCamera();
			finishBtn.disabled = true;
			const sequence = await generateDrawSequence(parentSeed);
			if (!scope.active) return;
			drawSequence = sequence;
			currentTurn = 0;
			specialRuleTurn = null;
			await loadChildCards(scope);
			if (!scope.active) return;
			isGameStarted = true;
			saveParent();
			render();
		});
	}

	// 3. Parent Game Dashboard
	function renderDashboard() {
		const scope = beginScreen();
		const currentBall = currentTurn > 0 ? drawSequence[currentTurn - 1] : null;
		const history = drawSequence.slice(0, currentTurn);
		const drawnSet = new Set(history);

		// Mode A Stats
		let totalReach = 0;
		const bingoSeeds = [];
		let nextBallHotSeeds = [];
		let leastOpened = [];

		if (gameMode === "mode_a" && childCardsMap.size > 0) {
			const nextBall = currentTurn < 75 ? drawSequence[currentTurn] : null;

			childCardsMap.forEach((card, seed) => {
				const opened = new Set(["2,2"]);
				let count = 0;
				for (const cell of card.cells) {
					if (cell.value !== FREE_CELL && drawnSet.has(cell.value)) {
						opened.add(`${cell.row},${cell.col}`);
						count++;
					}
				}
				leastOpened.push({ seed, count });

				const isSpecial = specialRuleTurn !== null && currentTurn >= specialRuleTurn;
				const { reach, isBingo } = calculateReachAndBingo(card, opened, isSpecial);

				if (isBingo) bingoSeeds.push(seed);
				if (!isBingo) {
					totalReach += reach.reachCount;
					if (nextBall !== null && reach.waitingNumbers.includes(nextBall)) {
						nextBallHotSeeds.push(seed);
					}
				}
			});

			leastOpened.sort((a, b) => a.count - b.count);
		}


		const getBallBg = (n) => {
			if (n <= 15) return "linear-gradient(135deg, #ef4444, #b91c1c)";
			if (n <= 30) return "linear-gradient(135deg, #f97316, #c2410c)";
			if (n <= 45) return "linear-gradient(135deg, #eab308, #a16207)";
			if (n <= 60) return "linear-gradient(135deg, #22c55e, #15803d)";
			return "linear-gradient(135deg, #3b82f6, #1d4ed8)";
		};

		const columns = [
			{ label: "B", range: [1, 15], color: "#f87171" },
			{ label: "I", range: [16, 30], color: "#fb923c" },
			{ label: "N", range: [31, 45], color: "#facc15" },
			{ label: "G", range: [46, 60], color: "#4ade80" },
			{ label: "O", range: [61, 75], color: "#60a5fa" },
		];

		container.innerHTML = `
			<div class="host-dashboard-container">
				<!-- Left Column: Controls & Drum -->
				<div class="host-dashboard-left">
				${gameMode === "mode_a" && bingoSeeds.length > 0 ? `<div id="host-bingo-winners" style="flex-shrink:0;max-height:3rem;overflow-y:auto;background:#064e3b;border-radius:0.5rem;padding:0.25rem;font-size:0.75rem;">ビンゴ成立者: ${bingoSeeds.join(", ")}</div>` : ""}
					<!-- Top Info -->
					<div style="display:flex; flex-direction:column; gap:0.35rem; margin-bottom:0.25rem; flex-shrink:0;">
						<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.35rem; background:#0f172a; border:1px solid #1e293b; border-radius:1rem; padding:0.4rem 0.65rem; width:100%; box-sizing:border-box;">
							<div style="display:flex; align-items:center; gap:0.35rem; min-width:0;">
								<span style="font-size:0.7rem; color:#94a3b8; font-weight:700; white-space:nowrap;">開催シード:</span>
								<span class="font-mono" style="font-weight:900; font-size:1.05rem; color:#fbbf24; background:#030712; padding:0.1rem 0.45rem; border-radius:0.5rem; border:1px solid #1e293b; letter-spacing:0.05em;">
									${parentSeed}
								</span>
							</div>

							<div style="display:flex; align-items:center; gap:0.35rem; flex-shrink:0;">
								${
									gameMode === "mode_a"
										? `<div style="display:flex; align-items:center; gap:0.25rem; font-size:0.7rem; background:rgba(99,102,241,0.2); color:#a5b4fc; border:1px solid rgba(99,102,241,0.4); padding:0.15rem 0.4rem; border-radius:0.5rem; font-weight:700; white-space:nowrap;">
												<span style="color:#f43f5e;">${renderIcon("flame", 12)}</span>
												<span>総リーチ: ${totalReach}</span>
												</div>`
										: ""
								}
								<span class="font-mono" style="font-size:0.75rem; font-weight:700; color:#cbd5e1; background:#030712; padding:0.15rem 0.45rem; border-radius:0.5rem; border:1px solid #1e293b; white-space:nowrap;">
									${currentTurn} / 75手
								</span>
								<button id="btn-reset-game" title="ゲームをリセットして最初からやり直す" class="header-btn" style="padding:0.25rem; color:#f87171; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); border-radius:0.4rem;">
									${renderIcon("refresh", 14)}
								</button>
							</div>
						</div>

						<!-- Hot Alert Notice (Mode A) -->
						${
							gameMode === "mode_a" && nextBallHotSeeds.length > 0
								? `<div style="background:linear-gradient(135deg, #dc2626, #b91c1c); color:#fff; font-weight:900; font-size:0.75rem; padding:0.4rem 0.75rem; border-radius:0.75rem; display:flex; align-items:center; justify-content:space-between; animation:pulse 1s infinite;">
										<span>🔥 激アツ予告！ 次の出目でビンゴ達成者が出ます (${nextBallHotSeeds.length}名)</span>
										</div>`
								: ""
						}
					</div>

					<!-- Wheel Arena with Realistic Bingo Drum & Slide to Action -->
					<div id="wheel-arena" style="flex:1; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#0f172a; border:1px solid #1e293b; border-radius:1.5rem; padding:0.5rem 0.75rem; margin:0.25rem 0; box-shadow:0 20px 25px -5px rgba(0,0,0,0.5); cursor:pointer;">
						<div style="display:flex; justify-content:space-between; align-items:center; width:100%; max-width:18rem; margin-bottom:0.25rem;">
							<span style="font-size:0.75rem; font-weight:800; color:#94a3b8; font-family:var(--font-mono);">
								${currentTurn >= 75 ? "FINISHED" : `BALL #${currentTurn + 1}`}
							</span>
							<span id="barrel-status-hint" style="font-size:0.7rem; font-weight:700; color:#fbbf24;">
								${currentTurn >= 75 ? "排出完了" : "スライドして抽選"}
							</span>
						</div>

						<!-- Realistic Wire-mesh Bingo Drum Canvas -->
						<div class="barrel-cage-container">
							<canvas id="barrel-canvas" class="barrel-canvas"></canvas>
						</div>

						<!-- Ball Ejected Result Tag -->
						<div id="latest-ball-tag" style="min-height:2rem; display:flex; align-items:center; justify-content:center; margin-top:0.25rem;">
							${
								currentBall !== null
									? `<div style="display:flex; align-items:center; gap:0.5rem; background:#030712; padding:0.2rem 0.75rem; border-radius:9999px; border:1px solid #334155;">
											<span style="font-size:0.7rem; color:#94a3b8; font-weight:700;">第${currentTurn}手:</span>
											<span style="font-weight:900; font-size:0.95rem; color:#fff; display:flex; align-items:center; gap:0.25rem;">
												<span style="color:#fbbf24;">${getBallLetter(currentBall)}</span>
												<span class="font-mono">${currentBall}</span>
											</span>
											</div>`
									: `<span style="font-size:0.75rem; color:#64748b;">まだ排出されていません</span>`
							}
						</div>

						<!-- Slide to Action Container -->
						<div id="slide-action-box" style="width:100%; max-width:18rem; margin-top:0.5rem;" onclick="event.stopPropagation();"></div>
					</div>

					<!-- History Chips & 1-75 Matrix Toggle -->
					<div class="history-chips-container" style="background:#0f172a; border:1px solid #1e293b; border-radius:1rem; padding:0.5rem 0.75rem; margin:0.25rem 0; flex-shrink:0;">
						<div style="display:flex; justify-content:space-between; align-items:center; font-size:0.7rem; font-weight:700; color:#94a3b8; margin-bottom:0.35rem;">
							<span>排出履歴 (直近20個)</span>
							<button id="btn-toggle-matrix" class="host-matrix-toggle-btn" style="background:none; border:none; color:#fbbf24; font-size:0.7rem; font-weight:700; cursor:pointer;">
								1〜75 点灯ボード
							</button>
						</div>

						<div class="history-chips-list" style="display:flex; gap:0.35rem; overflow-x:auto; padding:0.15rem 0; min-height:2.25rem;">
							${
								history.length === 0
									? `<span style="font-size:0.75rem; color:#64748b;">まだ履歴はありません</span>`
									: history
											.slice(-20)
											.reverse()
											.map(
												(num, idx) => `
											<div style="width:2rem; height:2rem; border-radius:9999px; background:${getBallBg(num)}; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:900; color:#fff; flex-shrink:0; ${
													idx === 0 ? 'border:2px solid #fbbf24;' : ''
												}">
												${num}
											</div>
										`
											)
											.join("")
							}
						</div>

						<!-- Collapsible 1-75 Matrix (Portrait) -->
						<div id="full-matrix-panel" style="display:none; margin-top:0.5rem; padding-top:0.5rem; border-top:1px solid #1e293b; grid-template-columns:repeat(15, 1fr); gap:0.2rem; font-size:0.65rem; text-align:center;">
							${Array.from({ length: 75 }, (_, i) => i + 1)
								.map((n) => {
									const isDrawn = drawnSet.has(n);
									const isLatest = currentBall === n;
									return `
									<div style="height:1.4rem; border-radius:0.25rem; display:flex; align-items:center; justify-content:center; font-weight:700; ${
										isLatest
											? 'background:#fbbf24; color:#030712; font-weight:900;'
											: isDrawn
											? 'background:#4f46e5; color:#fff;'
											: 'background:#030712; color:#475569;'
									}">
										${n}
									</div>
								`;
								})
								.join("")}
						</div>
					</div>

					<!-- Controls Toolbar -->
					<div class="host-controls-toolbar" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:0.35rem; flex-shrink:0;">
						<button id="btn-undo-ball" class="btn-secondary" style="padding:0.6rem 0.2rem; border-radius:0.75rem; font-size:0.7rem; display:flex; flex-direction:column; align-items:center; gap:0.2rem;" ${currentTurn === 0 ? 'disabled style="opacity:0.4;"' : ''}>
							<span style="color:#fbbf24;">${renderIcon("undo", 16)}</span>
							<span>1手戻す</span>
						</button>

						<button id="btn-unlock-special" class="btn-secondary" style="padding:0.6rem 0.2rem; border-radius:0.75rem; font-size:0.7rem; display:flex; flex-direction:column; align-items:center; gap:0.2rem; ${specialRuleTurn !== null ? 'background:rgba(245,158,11,0.2); border-color:#fbbf24; color:#fde047;' : ''}">
							<span style="color:${specialRuleTurn !== null ? '#facc15' : '#94a3b8'};">${renderIcon("star", 16)}</span>
							<span>${specialRuleTurn !== null ? `解禁(${specialRuleTurn}手)` : "特殊役解禁"}</span>
						</button>

						<button id="btn-verify-qr" class="btn-primary" style="padding:0.6rem 0.2rem; border-radius:0.75rem; font-size:0.7rem; display:flex; flex-direction:column; align-items:center; gap:0.2rem;">
							${renderIcon("qrcode", 16)}
							<span>当選照合</span>
						</button>

						<button id="btn-projector" class="btn-secondary" style="padding:0.6rem 0.2rem; border-radius:0.75rem; font-size:0.7rem; display:flex; flex-direction:column; align-items:center; gap:0.2rem;">
							<span style="color:#818cf8;">${renderIcon("tv", 16)}</span>
							<span>外部投影</span>
						</button>
					</div>

					${
						gameMode === "mode_a" && currentTurn >= 15
							? `<div style="margin-top:0.35rem; flex-shrink:0;">
									<button id="btn-dobe-award" class="btn-secondary w-full" style="padding:0.4rem; border-radius:0.75rem; font-size:0.75rem; color:#c084fc; border-color:rgba(192,132,252,0.4); display:flex; align-items:center; justify-content:center; gap:0.35rem;">
										${renderIcon("award", 16)}
										<span>逆ビンゴ賞（ドベ賞）を算出</span>
									</button>
									</div>`
							: ""
					}
				</div>

				<!-- Right Column: Permanent 1-75 Matrix Board (Visible on Landscape) -->
				<div class="host-dashboard-board">
					<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; flex-shrink:0;">
						<div style="display:flex; align-items:center; gap:0.4rem; font-weight:800; font-size:0.9rem; color:#cbd5e1;">
							<span style="color:#fbbf24;">${renderIcon("grid", 18)}</span>
							<span>出目ボード (1〜75 点灯マトリクス)</span>
						</div>
						<div style="display:flex; align-items:center; gap:0.5rem;">
							${
								specialRuleTurn !== null
									? `<span class="badge" style="background:rgba(245,158,11,0.2); color:#fbbf24; border-color:rgba(245,158,11,0.4); font-size:0.65rem;">★特殊役解禁中</span>`
									: ""
							}
							<span class="font-mono" style="font-weight:900; color:#fbbf24; font-size:0.85rem; background:#030712; padding:0.15rem 0.5rem; border-radius:0.5rem; border:1px solid #1e293b;">
								${history.length} / 75
							</span>
						</div>
					</div>

					<div class="host-board-grid">
						${columns
							.map((col) => {
								const nums = Array.from({ length: 15 }, (_, i) => col.range[0] + i);
								return `
								<div class="host-board-col">
									<div class="host-board-col-header" style="color:${col.color};">${col.label}</div>
									<div class="host-board-col-cells">
										${nums
											.map((n) => {
												const isDrawn = drawnSet.has(n);
												const isLatest = currentBall === n;
												return `
												<div class="host-board-cell ${isLatest ? 'cell-latest' : isDrawn ? 'cell-drawn' : ''}" data-ball="${n}">
													${n}
												</div>
											`;
											})
											.join("")}
									</div>
								</div>
							`;
							})
							.join("")}
					</div>
				</div>
			</div>
		`;

		bindDashboardEvents({ leastOpened, scope });
	}

	function bindDashboardEvents({ leastOpened, scope }) {
		const undoBtn = container.querySelector("#btn-undo-ball");
		const matrixToggle = container.querySelector("#btn-toggle-matrix");
		const matrixPanel = container.querySelector("#full-matrix-panel");
		const specialBtn = container.querySelector("#btn-unlock-special");
		const verifyBtn = container.querySelector("#btn-verify-qr");
		const projectorBtn = container.querySelector("#btn-projector");
		const resetBtn = container.querySelector("#btn-reset-game");
		const dobeBtn = container.querySelector("#btn-dobe-award");
		const wheelArena = container.querySelector("#wheel-arena");
		const barrelCanvas = container.querySelector("#barrel-canvas");
		const slideBox = container.querySelector("#slide-action-box");
		const hintEl = container.querySelector("#barrel-status-hint");

		let isSpinning = false;
		let isShowingEjected = false;
		let spinTimer = null;
		let ejectTimer = null;

		// Initialize realistic Rotary Bingo Cage
		const barrel = new BingoBarrel(barrelCanvas);
		scope.add(() => barrel.destroy());
		if (currentTurn > 0) {
			barrel.stopSpin(drawSequence[currentTurn - 1]);
		}

		function completeEjection() {
			if (!scope.active || !isShowingEjected) return;
			if (ejectTimer) clearTimeout(ejectTimer);
			ejectTimer = null;
			isShowingEjected = false;
			currentTurn++;
			saveParent();
			render();
		}

		function finishSpin() {
			if (!scope.active || !isSpinning) return;
			if (spinTimer) clearTimeout(spinTimer);
			spinTimer = null;
			isSpinning = false;
			isShowingEjected = true;

			const nextBall = drawSequence[currentTurn];
			barrel.stopSpin(nextBall);
			soundManager.playBallEjected();

			if (hintEl) hintEl.textContent = "ボール確定！ (タップで次へ)";

			// Update latest-ball-tag immediately
			const latestTag = container.querySelector("#latest-ball-tag");
			if (latestTag) {
				latestTag.innerHTML = `
					<div style="display:flex; align-items:center; gap:0.5rem; background:#030712; padding:0.2rem 0.75rem; border-radius:9999px; border:1px solid #334155;">
						<span style="font-size:0.7rem; color:#94a3b8; font-weight:700;">第${currentTurn + 1}手:</span>
						<span style="font-weight:900; font-size:0.95rem; color:#fff; display:flex; align-items:center; gap:0.25rem;">
							<span style="color:#fbbf24;">${getBallLetter(nextBall)}</span>
							<span class="font-mono">${nextBall}</span>
						</span>
					</div>
				`;
			}

			// Update landscape board cell immediately
			const boardCell = container.querySelector(`.host-board-cell[data-ball="${nextBall}"]`);
			if (boardCell) {
				boardCell.classList.add("cell-latest");
			}

			// Keep the ejected ball displayed for 5 seconds (Req 3.1)
			ejectTimer = scope.timeout(completeEjection, 5000);
		}

		// Slide to Action for ball drawing (Req 3.1)
		const slide = createSlideAction(slideBox, {
			text: "スライドしてボールを引く ➔➔",
			disabled: currentTurn >= 75,
			onSuccess: () => {
				if (currentTurn >= 75 || isSpinning || isShowingEjected) return;
				isSpinning = true;
				soundManager.unlock();
				soundManager.playRoll(1800);
				barrel.startSpin();

				if (hintEl) hintEl.textContent = "回転中... (タップで確定)";

				spinTimer = scope.timeout(finishSpin, 1800);
			},
		});

		scope.add(() => slide.destroy());

		// Tap to skip tempo control (both during spin and during ball display)
		wheelArena.addEventListener("click", () => {
			if (isSpinning) {
				finishSpin();
			} else if (isShowingEjected) {
				completeEjection();
			}
		});

		// Undo
		undoBtn.addEventListener("click", () => {
			if (currentTurn <= 0) return;
			if (confirm("直近の出目を1手戻しますか？")) {
				soundManager.unlock();
				soundManager.playBallEjected();
				currentTurn--;
				saveParent();
				render();
			}
		});

		// Reset Game
		resetBtn.addEventListener("click", () => {
			if (confirm("進行中のゲームをリセットして新しく開始しますか？")) {
				clearParentState();
				isGameStarted = false;
				currentTurn = 0;
				specialRuleTurn = null;
				render();
			}
		});

		// Matrix Toggle
		matrixToggle.addEventListener("click", () => {
			const show = matrixPanel.style.display === "none";
			matrixPanel.style.display = show ? "grid" : "none";
			matrixToggle.textContent = show ? "出目ボードを閉じる" : "1〜75 点灯ボード";
		});

		// Special Rule Unlock (Req 5.1)
		specialBtn.addEventListener("click", () => {
			if (specialRuleTurn !== null) return;
			if (confirm(`現在の手番（第${currentTurn}手）で特殊役（四隅・クロス・プラス）を解禁しますか？`)) {
				soundManager.unlock();
				soundManager.playSpecialUnlock();
				specialRuleTurn = currentTurn;
				saveParent();
				showSpecialCutIn();
			}
		});

		// Verification Modal
		verifyBtn.addEventListener("click", () => {
			soundManager.unlock();
			showVerificationModal();
		});

		// Projector View
		projectorBtn.addEventListener("click", () => {
			showProjectorView();
		});

		// Dobe Award
		if (dobeBtn) {
			dobeBtn.addEventListener("click", () => {
				showDobeModal(leastOpened);
			});
		}
	}

	// 4. Verification Modal (Req 3.3)
	function showVerificationModal() {
		const scope = screenScope.child();
		let cameraScope = scope.child();
		let verificationId = 0;
		const existing = document.getElementById("host-verify-modal");
		if (existing) existing.remove();

		let tab = "camera"; // camera or manual
		let videoStream = null;
		let animFrame = null;

		const modal = document.createElement("div");
		modal.id = "host-verify-modal";
		modal.className = "modal-overlay";
		modal.innerHTML = `
			<div class="modal-content animate-fade-in" style="max-height:92vh; overflow-y:auto;">
				<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding-bottom:0.75rem; margin-bottom:0.75rem;">
					<div style="display:flex; align-items:center; gap:0.4rem; font-weight:800; color:#fbbf24;">
						${renderIcon("trophy", 20)}
						<span style="color:#fff; font-size:1.05rem;">当選検証・カード照合</span>
					</div>
					<button id="close-verify-btn" class="header-btn">${renderIcon("close", 20)}</button>
				</div>

				<div id="verify-body"></div>
			</div>
		`;

		document.body.appendChild(modal);
		scope.add(() => modal.remove());

		const body = modal.querySelector("#verify-body");

		function renderVerifyTabs() {
			body.innerHTML = `
				<div style="display:flex; background:#030712; padding:0.25rem; border-radius:0.75rem; margin-bottom:0.75rem;">
					<button id="tab-camera-btn" style="flex:1; padding:0.5rem; font-size:0.75rem; font-weight:700; border:none; border-radius:0.5rem; cursor:pointer; background:${tab === 'camera' ? '#4f46e5' : 'none'}; color:${tab === 'camera' ? '#fff' : '#94a3b8'}; display:flex; align-items:center; justify-content:center; gap:0.35rem;">
						${renderIcon("camera", 16)}
						<span>QRカメラ照合</span>
					</button>
					<button id="tab-manual-btn" style="flex:1; padding:0.5rem; font-size:0.75rem; font-weight:700; border:none; border-radius:0.5rem; cursor:pointer; background:${tab === 'manual' ? '#4f46e5' : 'none'}; color:${tab === 'manual' ? '#fff' : '#94a3b8'}; display:flex; align-items:center; justify-content:center; gap:0.35rem;">
						${renderIcon("keyboard", 16)}
						<span>4文字手入力</span>
					</button>
				</div>

				<div id="verify-tab-content"></div>
			`;

			body.querySelector("#tab-camera-btn").addEventListener("click", () => {
				tab = "camera";
				renderVerifyTabs();
			});
			body.querySelector("#tab-manual-btn").addEventListener("click", () => {
				stopCam();
				tab = "manual";
				renderVerifyTabs();
			});

			renderTabContent();
		}

		function renderTabContent() {
			const content = body.querySelector("#verify-tab-content");
			if (tab === "camera") {
				content.innerHTML = `
					<div style="position:relative; width:100%; aspect-ratio:4/3; background:#000; border-radius:1rem; overflow:hidden; border:1px solid #334155; display:flex; align-items:center; justify-content:center;">
						<video id="v-video" style="width:100%; height:100%; object-fit:cover;" playsinline></video>
						<canvas id="v-canvas" style="display:none;"></canvas>
						<div style="position:absolute; inset:0; border:2px solid rgba(99,102,241,0.5); border-radius:1rem; pointer-events:none; display:flex; align-items:center; justify-content:center;">
							<div style="width:11rem; height:11rem; border:2px solid #fbbf24; border-radius:0.75rem; animation:pulse 1.5s infinite;"></div>
						</div>
						<span style="position:absolute; bottom:0.5rem; font-size:0.7rem; color:#e2e8f0; background:rgba(3,7,18,0.8); padding:0.2rem 0.6rem; border-radius:9999px;">
							参加者の検証用QRをかざしてください
						</span>
					</div>
				`;
				startCam();
			} else {
				content.innerHTML = `
					<form id="verify-manual-form" style="display:flex; flex-direction:column; gap:0.75rem; text-align:center; padding:1rem 0;">
						<label style="font-size:0.75rem; color:#94a3b8; font-weight:700;">参加者のカードID（4文字）</label>
						<input id="v-manual-input" type="text" maxlength="4" placeholder="ABCD" class="seed-input w-full" autofocus />
						<button type="submit" class="btn-primary w-full" style="padding:0.75rem; border-radius:0.75rem; font-size:0.85rem;">
							カードを再現・照合する
						</button>
					</form>
				`;
				const form = content.querySelector("#verify-manual-form");
				const inp = /** @type {HTMLInputElement} */ (content.querySelector("#v-manual-input"));
				inp.addEventListener("input", () => (inp.value = sanitizeSeedInput(inp.value)));
				form.addEventListener("submit", (e) => {
					e.preventDefault();
					const s = sanitizeSeedInput(inp.value);
					if (isValidSeed(s)) doVerify(s);
				});
			}
		}

		async function startCam() {
			stopCam();
			cameraScope = scope.child();
			const requestScope = cameraScope;
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
				});
				if (!requestScope.active) { stream.getTracks().forEach((track) => track.stop()); return; }
				videoStream = stream;
				const video = /** @type {HTMLVideoElement} */ (modal.querySelector("#v-video"));
				if (video) {
					video.srcObject = stream;
					await video.play();
					if (requestScope.active) loopCam();
				}
			} catch (err) {
				console.warn("Verify cam failed:", err);
			}
		}

		function loopCam() {
			if (!scope.active || !cameraScope.active) return;
			const video = /** @type {HTMLVideoElement} */ (modal.querySelector("#v-video"));
			const canvas = /** @type {HTMLCanvasElement} */ (modal.querySelector("#v-canvas"));
			if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;
				const ctx = canvas.getContext("2d", { willReadFrequently: true });
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
				const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
				const code = window.jsQR(img.data, img.width, img.height);
				if (code && code.data) {
					const s = parseQrSeed(code.data);
					if (s !== null) {
						soundManager.playScanBeep();
						stopCam();
						doVerify(s);
						return;
					}
				}
			}
			animFrame = requestAnimationFrame(loopCam);
		}

		function stopCam() {
			cameraScope.dispose();
			if (animFrame) cancelAnimationFrame(animFrame);
			if (videoStream) {
				videoStream.getTracks().forEach((track) => track.stop());
				videoStream = null;
			}
		}
		scope.add(stopCam);

		async function doVerify(seed) {
			stopCam();
			const request = ++verificationId;
			body.innerHTML = `
				<div style="text-align:center; padding:2rem 0;">
					<div style="width:2.5rem; height:2.5rem; border:3px solid #6366f1; border-top-color:transparent; border-radius:9999px; animation:spin 1s linear infinite; margin:0 auto 0.75rem auto;"></div>
					<span style="font-size:0.85rem; color:#cbd5e1;">カードを逆算照合中...</span>
				</div>
			`;

			const result = await verifyChildCard(seed, drawSequence, currentTurn, specialRuleTurn);
			if (!scope.active || request !== verificationId) return;

			if (result.isValidWin) {
				soundManager.playFanfare();
			} else {
				soundManager.playBallEjected();
			}

			body.innerHTML = `
				<div style="display:flex; flex-direction:column; gap:0.75rem;">
					<!-- Status Banner -->
					<div style="padding:0.75rem; border-radius:1rem; border:1px solid ${
						result.isValidWin ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'
					}; background:${result.isValidWin ? 'rgba(6,78,59,0.3)' : 'rgba(136,19,55,0.3)'}; color:${
						result.isValidWin ? '#6ee7b7' : '#fca5a5'
					}; display:flex; gap:0.5rem; font-size:0.8rem;">
						<div>${renderIcon(result.isValidWin ? "check" : "close", 20)}</div>
						<div>
							<div style="font-weight:900; font-size:0.95rem; margin-bottom:0.15rem;">
								${result.isValidWin ? '🎉 有効なビンゴです！' : '❌ 未達成または無効'}
							</div>
							<div>${result.message}</div>
							${
								result.firstBingoTurn
									? `<div style="margin-top:0.25rem; color:#cbd5e1; font-size:0.75rem;">
											現在の手番: <strong>${currentTurn}手目</strong> / 成立手番: <strong style="color:#fde047;">${result.firstBingoTurn}手目</strong>
											</div>`
									: ""
							}
						</div>
					</div>

					<!-- Participant Info -->
					<div style="display:flex; justify-content:space-between; align-items:center; background:#030712; padding:0.5rem 0.75rem; border-radius:0.75rem; border:1px solid #1e293b; font-size:0.75rem;">
						<span style="color:#94a3b8;">カードID:</span>
						<span class="font-mono" style="font-weight:900; color:#fbbf24; font-size:1.1rem;">${result.childSeed}</span>
						<span style="color:#94a3b8;">出目一致: <strong style="color:#fff;">${result.openedNumbersCount}</strong>/24</span>
					</div>

					<!-- Reconstructed Card Grid -->
					<div style="background:#030712; padding:0.5rem; border-radius:1rem; border:1px solid #1e293b;">
						<div style="text-align:center; font-size:0.7rem; font-weight:700; color:#94a3b8; margin-bottom:0.35rem;">
							再現された5×5カード（緑＝出目一致・成立ライン）
						</div>
						<div style="display:grid; grid-template-columns:repeat(5, 1fr); text-align:center; font-size:0.75rem; font-weight:900; color:#94a3b8; margin-bottom:0.25rem;">
							<span>B</span><span>I</span><span>N</span><span>G</span><span>O</span>
						</div>
						<div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:0.25rem; font-family:var(--font-mono); font-size:0.75rem; font-weight:800; text-align:center;">
							${result.card.cells
								.map((cell) => {
									const coord = `${cell.row},${cell.col}`;
									const isFree = cell.value === FREE_CELL;
									const isMatched = result.matchedCellIndices.has(coord);

									return `
										<div style="height:2rem; border-radius:0.35rem; display:flex; align-items:center; justify-content:center; border:1px solid ${
											isFree
												? '#fbbf24'
												: isMatched
												? '#34d399'
												: '#1e293b'
										}; background:${
											isFree
												? 'rgba(245,158,11,0.2)'
												: isMatched
												? 'rgba(5,150,105,0.4)'
												: '#0f172a'
										}; color:${isFree ? '#fde047' : isMatched ? '#fff' : '#475569'}; font-size:${isFree ? '0.6rem' : '0.8rem'};">
											${isFree ? 'FREE' : cell.value}
										</div>
									`;
								})
								.join("")}
						</div>
					</div>

					<button id="v-recheck-btn" class="btn-secondary w-full" style="padding:0.6rem; border-radius:0.75rem; font-size:0.8rem;">
						別の参加者を照合する
					</button>
				</div>
			`;

			body.querySelector("#v-recheck-btn").addEventListener("click", () => {
				renderVerifyTabs();
			});
		}

		const close = () => scope.dispose();

		modal.querySelector("#close-verify-btn").addEventListener("click", close);
		modal.addEventListener("click", (e) => {
			if (e.target === modal) close();
		});

		renderVerifyTabs();
	}

	// 5. Projector View (Req 3.2)
	function showProjectorView() {
		const scope = screenScope.child();
		const existing = document.getElementById("projector-view");
		if (existing) existing.remove();

		const currentBall = currentTurn > 0 ? drawSequence[currentTurn - 1] : null;
		const history = drawSequence.slice(0, currentTurn);
		const drawnSet = new Set(history);


		const getBallBg = (n) => {
			if (n <= 15) return "linear-gradient(135deg, #ef4444, #b91c1c)";
			if (n <= 30) return "linear-gradient(135deg, #f97316, #c2410c)";
			if (n <= 45) return "linear-gradient(135deg, #eab308, #a16207)";
			if (n <= 60) return "linear-gradient(135deg, #22c55e, #15803d)";
			return "linear-gradient(135deg, #3b82f6, #1d4ed8)";
		};

		const proj = document.createElement("div");
		proj.id = "projector-view";
		proj.style.position = "fixed";
		proj.style.inset = "0";
		proj.style.zIndex = "100";
		proj.style.background = "#030712";
		proj.style.color = "#fff";
		proj.style.display = "flex";
		proj.style.flexDirection = "column";
		proj.style.padding = "1rem";
		proj.style.overflow = "hidden";

		const columns = [
			{ label: "B", range: [1, 15], color: "#f87171" },
			{ label: "I", range: [16, 30], color: "#fb923c" },
			{ label: "N", range: [31, 45], color: "#facc15" },
			{ label: "G", range: [46, 60], color: "#4ade80" },
			{ label: "O", range: [61, 75], color: "#60a5fa" },
		];

		proj.innerHTML = `
			<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding-bottom:0.75rem; margin-bottom:1rem; flex-shrink:0;">
				<div style="display:flex; align-items:center; gap:0.75rem;">
					<div class="logo-icon" style="width:2.25rem; height:2.25rem; font-size:1.1rem;">M</div>
					<h1 style="font-size:1.5rem; font-weight:900; letter-spacing:0.05em; background:linear-gradient(135deg, #fbbf24, #818cf8); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">
						MOBINGO ライブ出目
					</h1>
					${
						specialRuleTurn !== null
							? `<span class="badge" style="background:rgba(245,158,11,0.2); color:#fbbf24; border-color:rgba(245,158,11,0.4);">
									★特殊役解禁中
									</span>`
							: ""
					}
				</div>

				<button id="close-proj-btn" class="btn-secondary" style="padding:0.4rem 0.75rem; border-radius:0.5rem; font-size:0.75rem;">
					操作画面へ戻る
				</button>
			</div>

			<div style="flex:1; display:grid; grid-template-columns:5fr 7fr; gap:1.5rem; min-height:0; align-items:center;">
				<!-- Left: Bingo Drum & Giant Ball on Projector -->
				<div style="background:#0f172a; border:1px solid #1e293b; border-radius:2rem; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:1.5rem;">
					<span style="font-size:0.85rem; font-weight:800; color:#94a3b8; margin-bottom:0.5rem; letter-spacing:0.05em;">
						${history.length > 0 ? `第 ${history.length} 手` : "抽選待機中"}
					</span>

					<div class="barrel-cage-container" style="max-width:300px; max-height:240px; margin-bottom:0.75rem;">
						<canvas id="proj-barrel-canvas" class="barrel-canvas"></canvas>
					</div>

					<div style="display:flex; align-items:center; gap:0.5rem; background:#030712; padding:0.35rem 1rem; border-radius:9999px; border:1px solid #334155; margin-bottom:0.5rem;">
						${
							currentBall !== null
								? `<span style="font-weight:900; font-size:1.25rem; color:#fff; display:flex; align-items:center; gap:0.4rem;">
										<span style="color:#fbbf24;">${getBallLetter(currentBall)}</span>
										<span class="font-mono">${currentBall}</span>
										</span>`
								: `<span style="font-size:0.85rem; color:#64748b;">まだ排出されていません</span>`
						}
					</div>

					<div style="margin-top:1.5rem; display:flex; align-items:center; gap:0.5rem;">
						<span style="font-size:0.8rem; color:#64748b;">直近履歴:</span>
						<div style="display:flex; gap:0.4rem;">
							${history
								.slice(-6, -1)
								.reverse()
								.map(
									(n) => `
								<div style="width:2.25rem; height:2.25rem; border-radius:9999px; background:#1e293b; border:1px solid #334155; display:flex; align-items:center; justify-content:center; font-family:var(--font-mono); font-weight:800; font-size:0.8rem; color:#fde047;">
									${n}
								</div>
							`
								)
								.join("")}
						</div>
					</div>
				</div>

				<!-- Right: 1-75 Matrix -->
				<div style="background:#0f172a; border:1px solid #1e293b; border-radius:2rem; height:100%; display:flex; flex-direction:column; padding:1.25rem; overflow-y:auto;">
					<div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; font-weight:800; color:#94a3b8; margin-bottom:0.75rem;">
						<span>出目ボード (1〜75 点灯マトリクス)</span>
						<span class="font-mono" style="color:#fbbf24;">${history.length} / 75</span>
					</div>

					<div style="flex:1; display:grid; grid-template-columns:repeat(5, 1fr); gap:0.5rem; min-height:0;">
						${columns
							.map((col) => {
								const nums = Array.from({ length: 15 }, (_, i) => col.range[0] + i);
								return `
								<div style="background:#030712; border-radius:1rem; border:1px solid #1e293b; padding:0.4rem; display:flex; flex-direction:column;">
									<div style="text-align:center; font-weight:900; font-size:1.15rem; color:${col.color}; border-bottom:1px solid #1e293b; padding-bottom:0.25rem; margin-bottom:0.35rem;">
										${col.label}
									</div>
									<div style="flex:1; display:grid; grid-template-rows:repeat(15, 1fr); gap:0.2rem;">
										${nums
											.map((n) => {
												const isDrawn = drawnSet.has(n);
												const isLatest = currentBall === n;
												return `
												<div style="display:flex; align-items:center; justify-content:center; border-radius:0.25rem; font-family:var(--font-mono); font-size:0.8rem; font-weight:800; ${
													isLatest
														? 'background:#fbbf24; color:#030712; font-weight:900; transform:scale(1.05); box-shadow:0 0 10px rgba(251,191,36,0.6);'
														: isDrawn
														? 'background:#4f46e5; color:#fff;'
														: 'background:rgba(15,23,42,0.4); color:#475569;'
												}">
													${n}
												</div>
											`;
											})
											.join("")}
									</div>
								</div>
							`;
							})
							.join("")}
					</div>
				</div>
			</div>
		`;

		document.body.appendChild(proj);
		scope.add(() => proj.remove());

		const projCanvas = proj.querySelector("#proj-barrel-canvas");
		if (projCanvas) {
			const projBarrel = new BingoBarrel(projCanvas);
			scope.add(() => projBarrel.destroy());
			if (currentBall !== null) {
				projBarrel.stopSpin(currentBall);
			}
		}

		proj.querySelector("#close-proj-btn").addEventListener("click", () => scope.dispose());
	}

	// 6. Special Cut-in Splash Animation
	function showSpecialCutIn() {
		const scope = beginScreen();
		const splash = document.createElement("div");
		splash.className = "modal-overlay animate-fade-in";
		splash.style.zIndex = "100";
		splash.innerHTML = `
			<div style="text-align:center; animation:bounce 1s infinite;">
				<div style="width:6rem; height:6rem; border-radius:9999px; background:linear-gradient(135deg, #f59e0b, #eab308); display:flex; align-items:center; justify-content:center; margin:0 auto 1rem auto; box-shadow:0 0 40px rgba(245,158,11,0.6); color:#030712;">
					${renderIcon("star", 48)}
				</div>
				<h2 style="font-size:2.25rem; font-weight:900; color:#fde047; margin-bottom:0.5rem; text-shadow:0 4px 10px rgba(0,0,0,0.8);">
					★ 特殊役 解禁！
				</h2>
				<p style="font-size:1rem; font-weight:800; color:#fff; max-width:20rem; margin:0 auto; line-height:1.5;">
					【四隅】【クロス】【プラス】が有効になりました！参加者は手元のカードの「★特殊役」をONにしてください！
				</p>
			</div>
		`;
		document.body.appendChild(splash);
		scope.add(() => splash.remove());
		scope.timeout(() => {
			splash.remove();
			render();
		}, 3200);
	}

	// 7. Dobe / Reverse Bingo Modal
	function showDobeModal(leastOpened) {
		const scope = screenScope.child();
		const modal = document.createElement("div");
		modal.className = "modal-overlay animate-fade-in";
		modal.innerHTML = `
			<div class="modal-content text-center">
				<div style="width:3.5rem; height:3.5rem; border-radius:1rem; background:rgba(192,132,252,0.2); border:1px solid rgba(192,132,252,0.4); display:flex; align-items:center; justify-content:center; margin:0 auto 0.75rem auto; color:#c084fc;">
					${renderIcon("award", 28)}
				</div>
				<h3 style="font-size:1.25rem; font-weight:900; color:#fff; margin-bottom:0.25rem;">逆ビンゴ賞（ドベ賞）</h3>
				<p style="font-size:0.75rem; color:#94a3b8; margin-bottom:1rem;">
					現時点で最も穴が開いていない（最も不運だった）参加者です！
				</p>

				<div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1.25rem;">
					${leastOpened
						.slice(0, 3)
						.map(
							(item, idx) => `
						<div style="background:#030712; border:1px solid #1e293b; border-radius:0.75rem; padding:0.6rem 0.75rem; display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; font-weight:800;">
							<span style="color:#94a3b8;">第 ${idx + 1} 位</span>
							<span class="font-mono" style="font-size:1.2rem; color:#fbbf24;">${item.seed}</span>
							<span style="color:#e2e8f0;">${item.count} マス開</span>
						</div>
					`
						)
						.join("")}
				</div>

				<button id="close-dobe-btn" class="btn-secondary w-full" style="padding:0.6rem; border-radius:0.75rem; font-size:0.8rem;">
					閉じる
				</button>
			</div>
		`;
		document.body.appendChild(modal);
		scope.add(() => modal.remove());
		modal.querySelector("#close-dobe-btn").addEventListener("click", () => scope.dispose());
	}

	function saveParent() {
		saveParentState({
			parentSeed,
			mode: gameMode,
			currentTurn,
			specialRuleTurn,
			registeredChildSeeds: registeredSeeds,
		});
	}

	init();
	return () => viewScope.dispose();
}

