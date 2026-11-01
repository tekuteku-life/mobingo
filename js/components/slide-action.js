import { renderIcon } from "../core/icons.js";
import { soundManager } from "../core/audio.js";
import { createScope } from "../core/lifecycle.js";

export function createSlideAction(container, { text = "スライドして実行", onSuccess, onTap = () => {}, disabled = false }) {
	const scope = createScope();
	container.innerHTML = `
		<div id="slide-track" class="slide-track ${disabled ? 'disabled' : ''}">
			<div id="slide-progress" class="slide-progress"></div>
			<span id="slide-text" class="slide-text">${text}</span>
			<div id="slide-thumb" class="slide-thumb">${renderIcon("arrow-right", 24)}</div>
		</div>
	`;
	const track = container.querySelector("#slide-track");
	const progress = container.querySelector("#slide-progress");
	const thumb = container.querySelector("#slide-thumb");
	const textEl = container.querySelector("#slide-text");
	let pointerId = null;
	let startX = 0;
	let ratio = 0;
	let moved = false;
	let resetTimer = null;
	const distance = () => Math.max(0, track.clientWidth - thumb.clientWidth - 8);
	function setProgress(value) {
		ratio = Math.max(0, Math.min(1, value));
		thumb.style.left = `${4 + ratio * distance()}px`;
		progress.style.width = `${ratio * 100}%`;
		textEl.style.opacity = `${Math.max(0, 1 - ratio * 1.5)}`;
	}
	function reset() {
		if (!scope.active) return;
		clearTimeout(resetTimer);
		thumb.classList.add("animating");
		setProgress(0);
		resetTimer = scope.timeout(() => thumb.classList.remove("animating"), 260);
	}
	function cancel() {
		const id = pointerId;
		pointerId = null;
		if (id !== null && thumb.hasPointerCapture(id)) thumb.releasePointerCapture(id);
		reset();
	}
	function onDown(event) {
		if (disabled || pointerId !== null) return;
		soundManager.unlock();
		pointerId = event.pointerId;
		startX = event.clientX;
		moved = false;
		clearTimeout(resetTimer);
		thumb.classList.remove("animating");
		setProgress(0);
		if (event.isTrusted) thumb.setPointerCapture(pointerId);
	}
	function onMove(event) {
		if (event.pointerId !== pointerId) return;
		if (Math.abs(event.clientX - startX) >= 10) moved = true;
		const max = distance();
		setProgress(max > 0 ? (event.clientX - startX) / max : 0);
	}
	function onUp(event) {
		if (event.pointerId !== pointerId) return;
		const success = ratio >= 0.85;
		const tapped = !moved;
		cancel();
		if (success && !disabled) {
			if (typeof onSuccess === "function") onSuccess();
		} else if (tapped && !disabled) onTap();
	}
	function onCancel(event) {
		if (event.pointerId === pointerId) cancel();
	}
	for (const [type, listener] of [["pointerdown", onDown], ["pointermove", onMove], ["pointerup", onUp], ["pointercancel", onCancel], ["lostpointercapture", onCancel]]) {
		thumb.addEventListener(type, listener);
		scope.add(() => thumb.removeEventListener(type, listener));
	}
	return {
		reset,
		setDisabled(value) { disabled = value; if (value) cancel(); track.classList.toggle("disabled", value); },
		destroy() { cancel(); scope.dispose(); },
	};
}
