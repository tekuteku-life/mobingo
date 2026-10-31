import { normalizeDisplayName } from "./identity.js";
import { isValidSeed } from "./base32.js";

/**
 * LocalStorage persistence for Game State
 */

const STORAGE_KEY_APP_MODE = "mobingo_app_mode";
const STORAGE_KEY_PARENT = "mobingo_parent_state";
const STORAGE_KEY_CHILD = "mobingo_child_state";

export function loadAppMode() {
	try {
		const val = localStorage.getItem(STORAGE_KEY_APP_MODE);
		if (val === "host" || val === "child") return val;
	} catch {}
	return "select";
}

export function saveAppMode(mode) {
	try { localStorage.setItem(STORAGE_KEY_APP_MODE, mode); } catch {}
}

export function loadParentState() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY_PARENT);
		if (raw) return validateParentState(JSON.parse(raw));
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
		if (raw) return validateChildState(JSON.parse(raw));
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


function uniqueArray(value, validate) {
	return Array.isArray(value) && value.every(validate) && new Set(value).size === value.length;
}

function validateChildState(value) {
	if (!value || !isValidSeed(value.childSeed)
		|| !uniqueArray(value.openedCellCoords, (coord) => typeof coord === "string" && /^[0-4],[0-4]$/.test(coord))
		|| typeof value.specialRuleActive !== "boolean") return null;
	if (Object.hasOwn(value, "displayName") && normalizeDisplayName(value.displayName) === null) return null;
	return { ...(Object.hasOwn(value, "displayName") ? { displayName: normalizeDisplayName(value.displayName) } : {}), childSeed: value.childSeed, openedCellCoords: [...value.openedCellCoords], specialRuleActive: value.specialRuleActive };
}

function validateParentState(value) {
	if (!value || !isValidSeed(value.parentSeed)
		|| !["mode_a", "mode_b"].includes(value.mode)
		|| !Number.isInteger(value.currentTurn) || value.currentTurn < 0 || value.currentTurn > 75
		|| !(value.specialRuleTurn === null || (Number.isInteger(value.specialRuleTurn) && value.specialRuleTurn >= 0 && value.specialRuleTurn <= 75))
		|| !uniqueArray(value.registeredChildSeeds, isValidSeed)) return null;
	const names = {};
	if (Object.hasOwn(value, "participantNames")) {
		if (!value.participantNames || typeof value.participantNames !== "object" || Array.isArray(value.participantNames)) return null;
		for (const [seed, rawName] of Object.entries(value.participantNames)) {
			const name = normalizeDisplayName(rawName);
			if (!isValidSeed(seed) || name === null) return null;
			names[seed] = name;
		}
	}
	if (Object.hasOwn(value, "verifiedChildSeeds") && !uniqueArray(value.verifiedChildSeeds, isValidSeed)) return null;
	return { ...(Object.hasOwn(value, "participantNames") ? { participantNames: names } : {}),
		...(Object.hasOwn(value, "verifiedChildSeeds") ? { verifiedChildSeeds: [...value.verifiedChildSeeds] } : {}), parentSeed: value.parentSeed, mode: value.mode, currentTurn: value.currentTurn,
		specialRuleTurn: value.specialRuleTurn, registeredChildSeeds: [...value.registeredChildSeeds] };
}
