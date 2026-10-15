/**
 * Slide to Action Component
 * Swipe-to-trigger component to prevent accidental double-ejections.
 */

import { renderIcon } from "../core/icons.js";
import { soundManager } from "../core/audio.js";
import { vibratePunch } from "../core/haptics.js";

export function createSlideAction(container, { text = "スライドしてボールを引く ➔➔", onSuccess, disabled = false }) {
	container.innerHTML = `
		<div class="slide-track ${disabled ? 'disabled' : ''}" id="slide-track">
			<div class="slide-progress" id="slide-progress"></div>
			<div class="slide-text" id="slide-text">${text}</div>
			<div class="slide-thumb" id="slide-thumb">
				${renderIcon("arrow-right", 20)}
			</div>
		</div>
	`;

	if (disabled) return { reset: () => {}, setDisabled: () => {} };

	const track = container.querySelector("#slide-track");
	const progress = container.querySelector("#slide-progress");
	const thumb = container.querySelector("#slide-thumb");
	const textEl = container.querySelector("#slide-text");

	let isDragging = false;
	let startX = 0;
	let currentLeft = 4; // px
	const minLeft = 4; // 0.25rem

	function getMaxSlide() {
		const trackWidth = track.clientWidth;
		const thumbWidth = thumb.clientWidth;
		return trackWidth - thumbWidth - 4;
	}

	function setProgress(px) {
		const max = getMaxSlide();
		const ratio = Math.max(0, Math.min(1, (px - minLeft) / max));
		thumb.style.left = `${px}px`;
		progress.style.width = `${ratio * 100}%`;
		textEl.style.opacity = `${Math.max(0, 1 - ratio * 1.5)}`;
	}

	function onPointerDown(e) {
		if (disabled) return;
		soundManager.unlock();
		isDragging = true;
		startX = e.clientX - (thumb.offsetLeft || minLeft);
		thumb.classList.remove("animating");
		thumb.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e) {
		if (!isDragging) return;
		const max = getMaxSlide();
		let nextLeft = e.clientX - startX;
		if (nextLeft < minLeft) nextLeft = minLeft;
		if (nextLeft > max) nextLeft = max;

		currentLeft = nextLeft;
		setProgress(nextLeft);
	}

	function onPointerUp(e) {
		if (!isDragging) return;
		isDragging = false;
		thumb.releasePointerCapture(e.pointerId);

		const max = getMaxSlide();
		const ratio = (currentLeft - minLeft) / max;

		if (ratio >= 0.85) {
			// Trigger Success!
			setProgress(max);
			soundManager.playPunch();
			vibratePunch();
			if (typeof onSuccess === "function") {
				onSuccess();
			}
			// Animate back after small delay
			setTimeout(() => {
				reset();
			}, 350);
		} else {
			// Spring back to left
			reset();
		}
	}

	function reset() {
		thumb.classList.add("animating");
		currentLeft = minLeft;
		setProgress(minLeft);
		setTimeout(() => {
			thumb.classList.remove("animating");
		}, 260);
	}

	thumb.addEventListener("pointerdown", onPointerDown);
	thumb.addEventListener("pointermove", onPointerMove);
	thumb.addEventListener("pointerup", onPointerUp);
	thumb.addEventListener("pointercancel", onPointerUp);

	return {
		reset,
		setDisabled: (val) => {
			disabled = val;
			if (val) {
				track.classList.add("disabled");
			} else {
				track.classList.remove("disabled");
			}
		},
	};
}

