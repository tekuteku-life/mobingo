import { normalizeDisplayName, buildParticipantQr, escapeHtml } from "../core/identity.js";
import { createScope } from "../core/lifecycle.js";
import { sanitizeSeedInput, isValidSeed, generateRandomSeed } from "../core/base32.js";
import { generateBingoCard, calculateReachAndBingo, FREE_CELL, SPECIAL_PATTERNS } from "../core/bingo.js";
import { soundManager } from "../core/audio.js";
import { vibratePunch, vibrateRestore, vibrateReach, vibrateBingo } from "../core/haptics.js";
import { renderIcon } from "../core/icons.js";
import { saveChildState, loadChildState, clearChildState } from "../core/storage.js";

export function renderChildView(container) {
	const viewScope = createScope();
	let bingoScope = viewScope.child();
	function resetConfetti() {
		if (typeof window.confetti === "function") window.confetti.reset();
	}
	viewScope.add(resetConfetti);
	let screenScope = viewScope.child();
	function beginScreen() {
		screenScope.dispose();
		screenScope = viewScope.child();
		return screenScope;
	}
	let saved = loadChildState();
	let currentSeed = saved ? saved.childSeed : "";
	let openedCoords = new Set(saved ? saved.openedCellCoords : ["2,2"]);
	let specialRuleActive = saved ? !!saved.specialRuleActive : false;
	let displayName = saved?.displayName ?? "";
	let currentCard = null;
	let isBingoAchieved = false;

	function render() {
		if (!viewScope.active) return;
		if (!currentSeed || !currentCard) {
			renderSetup();
		} else {
			renderCardScreen();
		}
	}

	// 1. Setup / Seed Input Screen
	function renderSetup() {
		resetConfetti();
		bingoScope.dispose();
		bingoScope = viewScope.child();
		const scope = beginScreen();
		let requestId = 0;
		let inputSeed = currentSeed || generateRandomSeed();

		container.innerHTML = `
			<div class="setup-screen child-setup-screen">
				<div class="setup-intro">
				<div class="setup-logo" style="width:4.5rem; height:4.5rem; border-radius:1.5rem; background:linear-gradient(135deg, #f59e0b, #4f46e5); display:flex; align-items:center; justify-content:center; box-shadow:0 15px 25px -5px rgba(79, 70, 229, 0.3); margin-bottom:1.25rem;">
					${renderIcon("sparkles", 32)}
				</div>

				<h1 style="font-size:1.75rem; font-weight:900; color:#fff; margin-bottom:0.5rem;">ビンゴカードを準備</h1>
				<p style="font-size:0.75rem; color:#94a3b8; margin-bottom:1.5rem; line-height:1.5;">
					あなた専用の4文字ID（シード値）から暗号学的にビンゴカードを生成します。
				</p>

				</div>
				<form id="child-setup-form" style="width:100%; display:flex; flex-direction:column; gap:1rem;">
					<div class="child-seed-field" style="background:#0f172a; border:1px solid #1e293b; border-radius:1rem; padding:1.25rem; box-shadow:0 10px 15px -3px rgba(0,0,0,0.5);">
						<label style="font-size:0.75rem; font-weight:700; color:#94a3b8; display:block; margin-bottom:0.5rem;">
							あなたのカードID（Crockford 4文字）
						</label>
						<div style="display:flex; align-items:center; gap:0.5rem; width:100%; box-sizing:border-box;">
							<input
								id="child-seed-input"
								type="text"
								value="${inputSeed}"
								maxlength="4"
								placeholder="A1B2"
								class="seed-input flex-1"
								style="flex:1 1 0%; min-width:0; width:0; box-sizing:border-box;"
								autofocus
								autocomplete="off"
								spellcheck="false"
							/>
							<button
								id="btn-regen-seed"
								type="button"
								class="btn-reseed"
								style="flex:0 0 3.5rem; width:3.5rem; box-sizing:border-box;"
								title="別のIDをランダム生成"
							>
								${renderIcon("dices", 22)}
							</button>
						</div>
						<span style="font-size:0.7rem; color:#64748b; display:block; margin-top:0.5rem;">
							※ O/I/L などの紛らわしい文字は自動補正されます
						</span>
					</div>

					<label class="name-field">表示名（任意・32文字まで）
						<input id="child-name-input" class="name-input" type="text" maxlength="256" autocomplete="nickname" value="${escapeHtml(displayName)}" />
					</label>
					<p id="setup-name-error" class="form-error" role="alert"></p>
					<button
						id="btn-start-card"
						type="submit"
						class="btn-primary"
						style="padding:1rem; border-radius:1rem; font-size:1rem; display:flex; align-items:center; justify-content:center; gap:0.5rem; width:100%;"
					>
						<span>ゲームに参加する</span>
						${renderIcon("arrow-right", 20)}
					</button>
				</form>
			</div>
		`;

		const input = container.querySelector("#child-seed-input");
		const regenBtn = container.querySelector("#btn-regen-seed");
		const form = container.querySelector("#child-setup-form");

		input.addEventListener("input", (e) => {
			e.target.value = sanitizeSeedInput(e.target.value);
		});

		regenBtn.addEventListener("click", () => {
			soundManager.unlock();
			soundManager.playBallEjected();
			input.value = generateRandomSeed();
		});

		form.addEventListener("submit", async (e) => {
			e.preventDefault();
			soundManager.unlock();
			const seed = sanitizeSeedInput(input.value);
			const name = normalizeDisplayName(container.querySelector("#child-name-input").value);
			if (name === null) {
				container.querySelector("#setup-name-error").textContent = "表示名は制御文字を含めず32文字以内で入力してください。";
				return;
			}
			if (isValidSeed(seed)) {
				soundManager.playPunch();
				const request = ++requestId;
				const card = await generateBingoCard(seed);
				if (!scope.active || request !== requestId) return;
				currentSeed = seed;
				displayName = name;
				openedCoords = new Set(["2,2"]);
				currentCard = card;
				saveState();
				render();
			}
		});
	}

	// 2. Main 1-Screen Card View
	function renderCardScreen() {
		const scope = beginScreen();
		const { reach, completedLines, isBingo } = calculateReachAndBingo(
			currentCard,
			openedCoords,
			specialRuleActive
		);

		// Bingo Fanfare & Confetti
		if (isBingo && !isBingoAchieved) {
			isBingoAchieved = true;
			soundManager.playFanfare();
			vibrateBingo();
			if (typeof window.confetti === "function") {
				window.confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
				scope.timeout(() => {
					window.confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 } });
					window.confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 } });
				}, 250);
			}
			bingoScope.timeout(() => {
				showQrModal();
			}, 700);
		} else if (!isBingo) {
			isBingoAchieved = false;
			bingoScope.dispose();
			bingoScope = viewScope.child();
		}

		// Reach Border glow class
		let boardGlowClass = "";
		if (isBingo) boardGlowClass = "bingo-board-glow";
		else if (reach.reachLevel === "single") boardGlowClass = "reach-single";
		else if (reach.reachLevel === "double") boardGlowClass = "reach-double";
		else if (reach.reachLevel === "triple_or_more") boardGlowClass = "reach-triple";

		// Special candidate cells
		const specialCells = new Set();
		if (specialRuleActive) {
			[SPECIAL_PATTERNS.four_corners, SPECIAL_PATTERNS.x_shape, SPECIAL_PATTERNS.plus_cross].forEach(pat => {
				pat.indices.forEach(([r, c]) => specialCells.add(`${r},${c}`));
			});
		}

		// Winning cells
		const winningCells = new Set();
		completedLines.forEach(line => {
			line.cells.forEach(([r, c]) => winningCells.add(`${r},${c}`));
		});

		// Reach / Bingo badge HTML for portrait header
		const reachBadgePortrait = isBingo
			? `<div style="display:flex; align-items:center; gap:0.25rem; background:linear-gradient(135deg, #10b981, #059669); color:#fff; padding:0.2rem 0.5rem; border-radius:9999px; font-size:0.75rem; font-weight:900; animation:pulse 1s infinite;">
					${renderIcon("trophy", 14)}
					<span>BINGO!</span>
				</div>`
			: `<div style="display:flex; align-items:center; gap:0.3rem; background:#030712; padding:0.2rem 0.5rem; border-radius:0.6rem; border:1px solid #1e293b;">
					<span style="color:${reach.reachCount > 0 ? '#fbbf24' : '#64748b'};">${renderIcon("bell", 13)}</span>
					<span style="font-size:0.75rem; font-weight:700; color:#e2e8f0;">
						リーチ: <span class="font-mono" style="color:#fbbf24; font-size:0.85rem;">${reach.reachCount}</span>
					</span>
				</div>`;

		// Assist bar text
		const assistBarContent = reach.reachCount > 0 && !isBingo
			? `<div style="width:100%; background:rgba(15,23,42,0.9); border:1px solid rgba(245,158,11,0.4); border-radius:0.75rem; padding:0.35rem 0.6rem; display:flex; align-items:center; justify-content:center; gap:0.35rem; font-size:0.75rem; color:#fde68a;">
					<span style="font-weight:700;">🔔 あと</span>
					<div style="display:flex; flex-wrap:wrap; gap:0.25rem;">
						${reach.waitingNumbers
							.map(
								(num) =>
									`<span class="font-mono" style="background:rgba(245,158,11,0.25); color:#fef08a; border:1px solid rgba(245,158,11,0.5); padding:0.05rem 0.35rem; border-radius:0.35rem; font-weight:800; font-size:0.75rem;">${num}</span>`
							)
							.join("")}
					</div>
					<span style="font-weight:700;">でビンゴ！</span>
				</div>`
			: isBingo
			? `<div style="width:100%; background:rgba(16,185,129,0.2); border:1px solid rgba(16,185,129,0.4); border-radius:0.75rem; padding:0.35rem; text-align:center; font-size:0.75rem; color:#6ee7b7; font-weight:800;">
					🎉 ビンゴ達成！司会者に申告してください
				</div>`
			: `<div style="font-size:0.7rem; color:#64748b; text-align:center;">
					タップで穴を開ける / 長押しで元に戻す
				</div>`;

		container.innerHTML = `
			<div class="child-dashboard-container">
				<!-- Left Area: Card & Portrait Header/Footer -->
				<div class="child-card-area">
					<div class="child-portrait-name participant-name-row">
						<span class="name-text" title="${escapeHtml(displayName)}">${escapeHtml(displayName) || "表示名なし"}</span>
						<button class="btn-edit-name btn-secondary">名前を編集</button>
					</div>
					<!-- Header: Seed ID & Reach (Portrait only) -->
					<div class="child-portrait-header">
						<div style="display:flex; align-items:center; gap:0.4rem;">
							<span style="font-size:0.7rem; color:#94a3b8; font-weight:700;">カードID</span>
							<span class="font-mono" style="font-weight:900; font-size:1.1rem; color:#fbbf24; background:#030712; padding:0.1rem 0.5rem; border-radius:0.5rem; border:1px solid #1e293b; letter-spacing:0.1em;">
								${currentSeed}
							</span>
						</div>
						<div style="display:flex; align-items:center; gap:0.35rem;">
							${reachBadgePortrait}
						</div>
					</div>

					<!-- Main 5x5 Grid Box -->
					<div class="child-card-box ${boardGlowClass}">
						<!-- B-I-N-G-O letters -->
						<div style="display:grid; grid-template-columns:repeat(5, 1fr); text-align:center; font-weight:900; font-size:1.15rem; padding:0.2rem 0; flex-shrink:0;">
							<span style="color:#f87171;">B</span>
							<span style="color:#fb923c;">I</span>
							<span style="color:#facc15;">N</span>
							<span style="color:#4ade80;">G</span>
							<span style="color:#60a5fa;">O</span>
						</div>

						<!-- 5x5 Cells -->
						<div id="bingo-cells-grid" style="flex:1; display:grid; grid-template-columns:repeat(5, 1fr); grid-template-rows:repeat(5, 1fr); gap:0.35rem; padding-top:0.2rem; min-height:0;">
							${currentCard.cells
								.map((cell) => {
									const coord = `${cell.row},${cell.col}`;
									const isFree = cell.value === FREE_CELL;
									const isOpened = isFree || openedCoords.has(coord);
									const isSpecial = specialCells.has(coord) && !isOpened;
									const isWinning = winningCells.has(coord);

									return `
										<div
											class="bingo-cell ${isOpened ? 'bingo-cell-opened' : 'bingo-cell-unopened'} ${isSpecial ? 'special-highlight' : ''}"
											data-coord="${coord}"
											data-free="${isFree}"
											style="position:relative; border-radius:0.75rem; display:flex; flex-direction:column; align-items:center; justify-content:center; ${isWinning ? 'border-color:#34d399 !important; background:rgba(6,78,59,0.4);' : ''}"
										>
											${
												isFree
													? `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fbbf24;">
															${renderIcon("star", 18)}
															<span style="font-size:0.6rem; font-weight:800; letter-spacing:0.05em; margin-top:0.1rem;">FREE</span>
															</div>`
													: `<span class="font-mono" style="font-size:1.35rem; font-weight:900; ${
															isOpened
																? isWinning
																	? 'color:#34d399;'
																	: 'color:#475569; text-decoration:line-through; opacity:0.7;'
																: 'color:#f8fafc;'
														}">${cell.value}</span>`
											}
										</div>
									`;
								})
								.join("")}
						</div>
					</div>

					<!-- Footer (Portrait only) -->
					<div class="child-portrait-footer">
						<!-- Assist Bar -->
						<div style="min-height:2.25rem; display:flex; align-items:center; justify-content:center; margin:0.25rem 0; flex-shrink:0;">
							${assistBarContent}
						</div>

						<!-- Special Rules Toggle & QR presentation -->
						<div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; flex-shrink:0; margin-bottom:0.35rem;">
							<button
								class="btn-action-toggle-special btn-secondary"
								style="padding:0.65rem 0.5rem; border-radius:0.75rem; font-size:0.75rem; font-weight:700; display:flex; align-items:center; justify-content:center; gap:0.35rem; ${
									specialRuleActive ? 'background:rgba(245,158,11,0.2); border-color:#fbbf24; color:#fde047;' : ''
								}"
							>
								<span style="color:${specialRuleActive ? '#facc15' : '#94a3b8'};">${renderIcon("star", 16)}</span>
								<span>★特殊役 ${specialRuleActive ? "ON" : "OFF"}</span>
							</button>

							<button
								class="btn-action-show-qr btn-primary"
								style="padding:0.65rem 0.5rem; border-radius:0.75rem; font-size:0.75rem; font-weight:700; display:flex; align-items:center; justify-content:center; gap:0.35rem;"
							>
								${renderIcon("qrcode", 16)}
								<span>🎫 検証用QR</span>
							</button>
						</div>

						<!-- Bottom Visible Reset Button (Portrait) -->
						<button class="btn-action-reset-card btn-child-reset-visible" style="justify-content:center; padding:0.3rem 0.55rem; font-size:0.7rem; border-radius:0.6rem;">
							${renderIcon("refresh", 13)}
							<span>カードを作り直す（リセット）</span>
						</button>
					</div>
				</div>

				<!-- Right Area: Information & Controls (Landscape only) -->
				<div class="child-landscape-panel">
					<div>
						<!-- Top: Card ID & Status -->
						<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; padding-bottom:0.5rem; border-bottom:1px solid #1e293b;">
							<div>
								<span style="font-size:0.7rem; color:#94a3b8; font-weight:700; display:block; margin-bottom:0.15rem;">あなたのカードID</span>
								<span class="font-mono" style="font-weight:900; font-size:1.4rem; color:#fbbf24; background:#030712; padding:0.15rem 0.6rem; border-radius:0.5rem; border:1px solid #1e293b; letter-spacing:0.1em; display:inline-block;">
									${currentSeed}
								</span>
							</div>
							<div>
								${
									isBingo
										? `<div style="display:flex; align-items:center; gap:0.3rem; background:linear-gradient(135deg, #10b981, #059669); color:#fff; padding:0.3rem 0.75rem; border-radius:9999px; font-size:0.85rem; font-weight:900; animation:pulse 1s infinite;">
												${renderIcon("trophy", 16)}
												<span>BINGO!!</span>
											</div>`
										: `<div style="display:flex; align-items:center; gap:0.35rem; background:#030712; padding:0.3rem 0.75rem; border-radius:0.75rem; border:1px solid #1e293b;">
												<span style="color:${reach.reachCount > 0 ? '#fbbf24' : '#64748b'};">${renderIcon("bell", 16)}</span>
												<span style="font-size:0.85rem; font-weight:700; color:#e2e8f0;">
													リーチ: <span class="font-mono" style="color:#fbbf24; font-size:1rem;">${reach.reachCount}</span>
												</span>
											</div>`
								}
							</div>
						</div>

						<div class="participant-name-row">
							<span class="name-text" title="${escapeHtml(displayName)}">${escapeHtml(displayName) || "表示名なし"}</span>
							<button class="btn-edit-name btn-secondary">名前を編集</button>
						</div>
						<!-- Assist Bar in Landscape -->
						<div style="background:rgba(3,7,18,0.7); border:1px solid #1e293b; border-radius:0.75rem; padding:0.6rem; margin-bottom:0.6rem;">
							${assistBarContent}
						</div>

						<div style="font-size:0.7rem; color:#64748b; line-height:1.4; padding:0 0.2rem;">
							💡 タップで穴あけ / 長押し(0.6秒)で元に戻せます
						</div>
					</div>

					<!-- Bottom: Action Buttons in Landscape -->
					<div style="display:flex; flex-direction:column; gap:0.4rem; margin-top:0.5rem;">
						<button
							class="btn-action-show-qr btn-primary"
							style="padding:0.75rem; border-radius:0.75rem; font-size:0.8rem; font-weight:800; display:flex; align-items:center; justify-content:center; gap:0.4rem;"
						>
							${renderIcon("qrcode", 18)}
							<span>🎫 当選照合用QRを表示</span>
						</button>

						<button
							class="btn-action-toggle-special btn-secondary"
							style="padding:0.65rem; border-radius:0.75rem; font-size:0.75rem; font-weight:700; display:flex; align-items:center; justify-content:center; gap:0.4rem; ${
								specialRuleActive ? 'background:rgba(245,158,11,0.2); border-color:#fbbf24; color:#fde047;' : ''
							}"
						>
							<span style="color:${specialRuleActive ? '#facc15' : '#94a3b8'};">${renderIcon("star", 16)}</span>
							<span>★特殊役: ${specialRuleActive ? "有効 (4隅/X/十)" : "無効"}</span>
						</button>

						<button
							class="btn-action-reset-card btn-child-reset-visible"
							style="padding:0.3rem 0.55rem; border-radius:0.6rem; font-size:0.7rem; display:flex; align-items:center; justify-content:center; gap:0.4rem; margin-top:0.2rem; align-self:flex-end;"
						>
							${renderIcon("refresh", 14)}
							<span>カードを作り直す（リセット）</span>
						</button>
					</div>
				</div>
			</div>
		`;

		bindCardEvents(scope);
	}

	// Bind Asymmetric Touch (Tap < 400ms to open, Long press >= 600ms to restore)
	function bindCardEvents(scope) {
		const grid = container.querySelector("#bingo-cells-grid");

		let pointer = null;
		let longPressTimer = null;
		let progressSvg = null;
		function cancelPointer() {
			clearTimeout(longPressTimer);
			longPressTimer = null;
			progressSvg?.remove();
			progressSvg = null;
			const previous = pointer;
			pointer = null;
			if (previous && previous.el.hasPointerCapture(previous.id)) previous.el.releasePointerCapture(previous.id);
		}
		scope.add(cancelPointer);
		grid.querySelectorAll(".bingo-cell").forEach((el) => {
			const coord = el.getAttribute("data-coord");
			if (el.getAttribute("data-free") === "true") return;
			el.addEventListener("pointerdown", (event) => {
				if (pointer || !scope.active) return;
				soundManager.unlock();
				pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, time: Date.now(), el, coord, restored: false };
				if (event.isTrusted) el.setPointerCapture(event.pointerId);
				if (!openedCoords.has(coord)) return;
				progressSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
				progressSvg.setAttribute("class", "animate-ring");
				progressSvg.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;pointer-events:none");
				progressSvg.setAttribute("viewBox", "0 0 100 100");
				progressSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
				progressSvg.innerHTML = '<circle cx="50" cy="50" r="42" pathLength="100" transform="rotate(-90 50 50)" fill="none" stroke="#f43f5e" stroke-width="4" />';
				el.appendChild(progressSvg);
				longPressTimer = scope.timeout(() => {
					if (!pointer) return;
					pointer.restored = true;
					openedCoords.delete(coord);
					soundManager.playRestore();
					vibrateRestore();
					saveState();
					progressSvg?.remove();
					el.classList.add("animate-pop");
					scope.timeout(render, 200);
				}, 600);
			});
			el.addEventListener("pointermove", (event) => {
				if (!pointer || event.pointerId !== pointer.id) return;
				if (Math.abs(event.clientX - pointer.x) >= 10 || Math.abs(event.clientY - pointer.y) >= 10) cancelPointer();
			});
			el.addEventListener("pointerup", (event) => {
				if (!pointer || event.pointerId !== pointer.id || pointer.coord !== coord) return;
				const shouldOpen = !pointer.restored && !openedCoords.has(coord) && Date.now() - pointer.time < 400;
				cancelPointer();
				if (!shouldOpen) return;
				openedCoords.add(coord);
				soundManager.playPunch();
				vibratePunch();
				saveState();
				el.classList.add("animate-punch");
				scope.timeout(render, 150);
			});
			for (const type of ["pointercancel", "lostpointercapture"]) {
				el.addEventListener(type, (event) => {
					if (pointer && event.pointerId === pointer.id) cancelPointer();
				});
			}
		});

		// Reset Card Buttons (All instances in portrait and landscape)
		const resetButtons = container.querySelectorAll(".btn-action-reset-card");
		resetButtons.forEach((btn) => {
			btn.addEventListener("click", () => {
				soundManager.unlock();
				if (confirm("カードを破棄して、参加者IDの入力（新規カード作成）に戻りますか？\n（現在の穴あけ状態はリセットされます）")) {
					clearChildState();
					currentSeed = "";
					displayName = "";
					currentCard = null;
					openedCoords = new Set(["2,2"]);
					isBingoAchieved = false;
					specialRuleActive = false;
					render();
				}
			});
		});

		// Toggle Special Rules (Both portrait and landscape)
		const specialButtons = container.querySelectorAll(".btn-action-toggle-special");
		specialButtons.forEach((btn) => {
			btn.addEventListener("click", () => {
				soundManager.unlock();
				specialRuleActive = !specialRuleActive;
				saveState();
				render();
			});
		});

		container.querySelectorAll(".btn-edit-name").forEach((button) => {
			button.addEventListener("click", () => { if (scope.active) showNameModal(); });
		});

		// Show QR Modal (Both portrait and landscape)
		const qrButtons = container.querySelectorAll(".btn-action-show-qr");
		qrButtons.forEach((btn) => {
			btn.addEventListener("click", () => {
				soundManager.unlock();
				showQrModal();
			});
		});
	}

	function showNameModal() {
		const scope = screenScope.child();
		const modal = document.createElement("div");
		modal.id = "child-name-modal";
		modal.className = "modal-overlay";
		modal.innerHTML = `<form class="modal-content" id="edit-name-form">
			<h2>表示名を編集</h2>
			<label class="name-field">表示名（任意・32文字まで）<input id="edit-name-input" class="name-input" type="text" maxlength="256" autocomplete="nickname" value="${escapeHtml(displayName)}" /></label>
			<p id="name-error" class="form-error" role="alert"></p>
			<button id="save-name-btn" type="submit" class="btn-primary">保存する</button>
			<button id="cancel-name-btn" type="button" class="btn-secondary">キャンセル</button>
		</form>`;
		document.body.appendChild(modal);
		scope.add(() => modal.remove());
		modal.querySelector("#edit-name-form").addEventListener("submit", (event) => {
			event.preventDefault();
			if (!scope.active) return;
			const name = normalizeDisplayName((/** @type {HTMLInputElement} */ (modal.querySelector("#edit-name-input"))).value);
			if (name === null) {
				modal.querySelector("#name-error").textContent = "表示名は制御文字を含めず32文字以内で入力してください。";
				return;
			}
			displayName = name;
			saveState();
			scope.dispose();
			render();
		});
		modal.querySelector("#cancel-name-btn").addEventListener("click", () => scope.dispose());
		modal.addEventListener("click", (event) => { if (event.target === modal) scope.dispose(); });
	}

	// QR Modal Presentation
	function showQrModal() {
		if (!screenScope.active) return;
		const scope = screenScope.child();
		const existing = document.getElementById("child-qr-modal");
		if (existing) existing.remove();

		const modal = document.createElement("div");
		modal.id = "child-qr-modal";
		modal.className = "modal-overlay";
		modal.innerHTML = `
			<div class="modal-content text-center animate-fade-in" style="align-items:center;">
				<div style="width:100%; display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
					<div style="display:flex; align-items:center; gap:0.4rem; color:#818cf8; font-weight:700; font-size:0.85rem;">
						${renderIcon("qrcode", 18)}
						<span>当選照合・受付用QR</span>
					</div>
					<button id="close-qr-btn" class="header-btn">${renderIcon("close", 20)}</button>
				</div>

				${
					isBingoAchieved
						? `<div style="width:100%; margin-bottom:0.75rem; padding:0.4rem; background:rgba(16,185,129,0.2); border:1px solid rgba(16,185,129,0.4); border-radius:0.75rem; color:#6ee7b7; font-weight:800; font-size:0.8rem; display:flex; align-items:center; justify-content:center; gap:0.4rem;">
								${renderIcon("check", 16)}
								<span>BINGO達成中！司会に見せてください</span>
								</div>`
						: ""
				}

				<div style="background:#fff; padding:0.75rem; border-radius:1rem; margin-bottom:1rem; display:flex; align-items:center; justify-content:center; width:220px; height:220px;">
					<canvas id="qr-canvas"></canvas>
				</div>

				<div class="identity-label">${escapeHtml(displayName)}</div>
				<div style="margin-bottom:1rem;">
					<span style="font-size:0.75rem; color:#94a3b8; display:block; margin-bottom:0.25rem;">あなたのカードID（手入力用）</span>
					<span class="font-mono" style="font-size:2rem; font-weight:900; letter-spacing:0.15em; color:#fbbf24; background:#030712; padding:0.25rem 1rem; border-radius:0.75rem; border:1px solid #1e293b; display:inline-block;">
						${currentSeed}
					</span>
				</div>

				<button id="close-qr-bottom-btn" class="btn-primary w-full" style="padding:0.75rem; border-radius:0.75rem; font-size:0.85rem;">
					カードに戻る
				</button>
			</div>
		`;

		document.body.appendChild(modal);
		scope.add(() => modal.remove());

		// Draw QR code with local qrcode.min.js
		const canvas = /** @type {HTMLCanvasElement} */ (modal.querySelector("#qr-canvas"));
		if (window.QRCode && canvas) {
			window.QRCode.toCanvas(canvas, buildParticipantQr(currentSeed, displayName), {
				width: 200,
				margin: 1,
				color: { dark: "#0f172a", light: "#ffffff" },
			});
		}

		const close = () => scope.dispose();
		modal.querySelector("#close-qr-btn").addEventListener("click", close);
		modal.querySelector("#close-qr-bottom-btn").addEventListener("click", close);
		modal.addEventListener("click", (e) => {
			if (e.target === modal) close();
		});
	}

	function saveState() {
		saveChildState({
			childSeed: currentSeed,
			displayName,
			openedCellCoords: Array.from(openedCoords),
			specialRuleActive,
		});
	}

	// Initial load
	if (currentSeed) {
		generateBingoCard(currentSeed).then((card) => {
			if (!viewScope.active) return;
			currentCard = card;
			render();
		});
	} else {
		render();
	}
	return () => viewScope.dispose();
}

