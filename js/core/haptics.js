/**
 * Vibration API Helper
 */

export function vibratePunch() {
	if (typeof navigator !== "undefined" && "vibrate" in navigator) {
		try { navigator.vibrate(30); } catch {}
	}
}

export function vibrateRestore() {
	if (typeof navigator !== "undefined" && "vibrate" in navigator) {
		try { navigator.vibrate([40, 30, 40]); } catch {}
	}
}

export function vibrateReach(level) {
	if (typeof navigator !== "undefined" && "vibrate" in navigator) {
		try {
			if (level === "single") navigator.vibrate(60);
			else if (level === "double") navigator.vibrate([60, 40, 60]);
			else if (level === "triple_or_more") navigator.vibrate([80, 40, 80, 40, 100]);
		} catch {}
	}
}

export function vibrateBingo() {
	if (typeof navigator !== "undefined" && "vibrate" in navigator) {
		try { navigator.vibrate([100, 50, 100, 50, 250]); } catch {}
	}
}

