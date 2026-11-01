/** Vibration feedback with an independent, persistent preference. */
let enabled = true;
try { enabled = localStorage.getItem("mobingo_haptics_enabled") !== "false"; } catch {}

function vibrate(pattern) {
	if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
		try { navigator.vibrate(pattern); } catch {}
	}
}

export const hapticsManager = {
	getEnabled() { return enabled; },
	setEnabled(value) {
		enabled = !!value;
		if (!enabled) stopVibration();
		try { localStorage.setItem("mobingo_haptics_enabled", String(enabled)); } catch {}
	},
};

export function stopVibration() { vibrate(0); }
export function vibratePunch() { if (enabled) vibrate(30); }
export function vibrateRestore() { if (enabled) vibrate([40, 30, 40]); }
export function vibrateRoll() {
	if (enabled) vibrate([...Array.from({ length: 11 }, () => [35, 165]).flat(), 35]);
}
export function vibrateBallEjected() { if (enabled) vibrate([60, 40, 100]); }

export function vibrateReach(level) {
	if (!enabled) return;
	if (level === "single") vibrate(60);
	else if (level === "double") vibrate([60, 40, 60]);
	else if (level === "triple_or_more") vibrate([80, 40, 80, 40, 100]);
}

export function vibrateBingo() {
	if (enabled) vibrate([100, 50, 100, 50, 250]);
}

