/**
 * LocalStorage persistence for Game State
 */

const STORAGE_KEY_APP_MODE = "mobingo_app_mode";
const STORAGE_KEY_PARENT = "mobingo_parent_state";
const STORAGE_KEY_CHILD = "mobingo_child_state";

export function loadAppMode() {
	try {
		const val = localStorage.getItem(STORAGE_KEY_APP_MODE);
		if (val === "parent" || val === "child") return val;
	} catch {}
	return "select";
}

export function saveAppMode(mode) {
	try { localStorage.setItem(STORAGE_KEY_APP_MODE, mode); } catch {}
}

export function loadParentState() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY_PARENT);
		if (raw) return JSON.parse(raw);
	} catch (e) {
		console.error("Failed to load parent state:", e);
	}
	return null;
}

export function saveParentState(state) {
	try {
		localStorage.setItem(STORAGE_KEY_PARENT, JSON.stringify(state));
	} catch (e) {
		console.error("Failed to save parent state:", e);
	}
}

export function clearParentState() {
	try { localStorage.removeItem(STORAGE_KEY_PARENT); } catch {}
}

export function loadChildState() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY_CHILD);
		if (raw) return JSON.parse(raw);
	} catch (e) {
		console.error("Failed to load child state:", e);
	}
	return null;
}

export function saveChildState(state) {
	try {
		localStorage.setItem(STORAGE_KEY_CHILD, JSON.stringify(state));
	} catch (e) {
		console.error("Failed to save child state:", e);
	}
}

export function clearChildState() {
	try { localStorage.removeItem(STORAGE_KEY_CHILD); } catch {}
}

