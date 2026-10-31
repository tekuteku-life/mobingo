import { isValidSeed, parseQrSeed } from "./base32.js";

const PREFIX = "mobingo:child:v2:";

export function normalizeDisplayName(value) {
	if (typeof value !== "string" || value.length > 256 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]|\p{Bidi_Control}/u.test(value)) return null;
	const name = value.trim().normalize("NFC");
	return Array.from(name).length <= 32 ? name : null;
}

export function buildParticipantQr(seed, displayName) {
	const name = normalizeDisplayName(displayName);
	if (!isValidSeed(seed) || name === null) throw new Error("Invalid participant identity");
	return PREFIX + JSON.stringify({ seed, displayName: name });
}

export function parseParticipantQr(input) {
	if (typeof input !== "string" || input.length > 512) return null;
	if (!input.startsWith(PREFIX)) {
		const seed = parseQrSeed(input);
		return seed === null ? null : { seed, displayName: null };
	}
	try {
		const value = JSON.parse(input.slice(PREFIX.length));
		if (!value || Array.isArray(value) || typeof value !== "object"
			|| Object.keys(value).length !== 2 || !Object.hasOwn(value, "seed") || !Object.hasOwn(value, "displayName")
			|| !isValidSeed(value.seed)) return null;
		const displayName = normalizeDisplayName(value.displayName);
		return displayName === null ? null : { seed: value.seed, displayName };
	} catch { return null; }
}

export function escapeHtml(value) {
	return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
