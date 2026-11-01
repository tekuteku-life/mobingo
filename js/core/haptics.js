/** Vibration feedback with an independent, persistent preference. */
let enabled = true;
try { enabled = localStorage.getItem("mobingo_haptics_enabled") !== "false"; } catch {}
let lastResult = { state: "not-requested" };

function vibrate(pattern) {
	if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return { state: "unsupported" };
	try { return { state: navigator.vibrate(pattern) === false ? "rejected" : "requested" }; }
	catch { return { state: "failed" }; }
}

function feedback(pattern) {
	lastResult = enabled ? vibrate(pattern) : { state: "disabled" };
	return { ...lastResult };
}

export const hapticsManager = {
	getEnabled() { return enabled; },
	getStatus() {
		return { enabled, supported: typeof navigator !== "undefined" && typeof navigator.vibrate === "function", lastResult: lastResult.state };
	},
	testVibration() { return feedback(200); },
	setEnabled(value) {
		enabled = !!value;
		if (!enabled) stopVibration();
		try { localStorage.setItem("mobingo_haptics_enabled", String(enabled)); } catch {}
	},
};

export function stopVibration() { vibrate(0); }
export function vibratePunch() { return feedback(30); }
export function vibrateRestore() { return feedback([40, 30, 40]); }
export function vibrateRoll() {
	return feedback([...Array.from({ length: 11 }, () => [35, 165]).flat(), 35]);
}
export function vibrateBallEjected() { return feedback([60, 40, 100]); }

export function vibrateReach(level) {
	if (!enabled) return;
	if (level === "single") feedback(60);
	else if (level === "double") feedback([60, 40, 60]);
	else if (level === "triple_or_more") feedback([80, 40, 80, 40, 100]);
}

export function vibrateBingo() {
	return feedback([100, 50, 100, 50, 250]);
}

