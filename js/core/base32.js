/**
 * Crockford's Base32 Implementation
 * Characters: 0123456789ABCDEFGHJKMNPQRSTVWXYZ (32 chars)
 * Excludes: I, L, O, U
 */

export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SEED_LENGTH = 4;

export function sanitizeSeedInput(input) {
	if (!input) return "";
	let sanitized = input.toUpperCase().replace(/[\s-]/g, "");
	// Crockford normalization: O->0, I/L->1
	sanitized = sanitized.replace(/O/g, "0").replace(/[IL]/g, "1");

	let result = "";
	for (const char of sanitized) {
		if (CROCKFORD_ALPHABET.includes(char)) {
			result += char;
		}
	}
	return result.slice(0, SEED_LENGTH);
}

export function isValidSeed(seed) {
	if (typeof seed !== "string" || seed.length !== SEED_LENGTH) return false;
	for (const char of seed) {
		if (!CROCKFORD_ALPHABET.includes(char)) return false;
	}
	return true;
}

export function generateRandomSeed() {
	const randomBytes = new Uint8Array(SEED_LENGTH);
	const cryptoObj = globalThis.crypto;
	cryptoObj.getRandomValues(randomBytes);
	let seed = "";
	for (let i = 0; i < SEED_LENGTH; i++) {
		seed += CROCKFORD_ALPHABET[randomBytes[i] % 32];
	}
	return seed;
}

export function seedToNumber(seed) {
	let num = 0;
	for (const char of seed) {
		const val = CROCKFORD_ALPHABET.indexOf(char);
		if (val === -1) throw new Error(`Invalid seed char: ${char}`);
		num = num * 32 + val;
	}
	return num;
}

export function numberToSeed(num) {
	let n = num % (32 ** SEED_LENGTH);
	let res = "";
	for (let i = 0; i < SEED_LENGTH; i++) {
		const rem = n % 32;
		res = CROCKFORD_ALPHABET[rem] + res;
		n = Math.floor(n / 32);
	}
	return res;
}


/** QR payloads are complete identifiers, never lossy manual-input normalization. */
export function parseQrSeed(input) {
	if (typeof input !== "string") return null;
	const seed = input.startsWith("mobingo:child:") ? input.slice("mobingo:child:".length) : input;
	return isValidSeed(seed) ? seed : null;
}
