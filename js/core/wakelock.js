/**
 * Screen Wake Lock API helper to prevent screen sleep
 */

class WakeLockManager {
	constructor() {
		this.sentinel = null;
		this.isActive = false;
	}

	async request() {
		this.isActive = true;
		if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
			try {
				this.sentinel = await navigator.wakeLock.request("screen");
				this.sentinel.addEventListener("release", () => {
					this.sentinel = null;
				});
			} catch (err) {
				console.warn("Screen Wake Lock failed:", err);
			}
		}
	}

	release() {
		this.isActive = false;
		if (this.sentinel) {
			this.sentinel.release().catch(() => {});
			this.sentinel = null;
		}
	}

	handleVisibilityChange = async () => {
		if (this.isActive && document.visibilityState === "visible") {
			await this.request();
		}
	};
}

export const wakeLockManager = new WakeLockManager();

if (typeof document !== "undefined") {
	document.addEventListener("visibilitychange", wakeLockManager.handleVisibilityChange);
}

