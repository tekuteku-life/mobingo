/**
 * Key Derivation Function (KDF) using Web Crypto API PBKDF2 with SHA-256
 */

export const APP_SALT = "mobingo-salt-v1";
export const CONTEXT_DRAW = "mobingo:draw";
export const CONTEXT_CARD = "mobingo:card";
export const PBKDF2_ITERATIONS = 30000;

const kdfCache = new Map();

export async function deriveKey(seed, contextInfo) {
	const cacheKey = `${seed}:${contextInfo}`;
	if (kdfCache.has(cacheKey)) {
		return kdfCache.get(cacheKey);
	}

	const encoder = new TextEncoder();
	const passwordBuffer = encoder.encode(seed);
	const saltBuffer = encoder.encode(`${APP_SALT}:${contextInfo}`);

	const cryptoObj = globalThis.crypto;
	const subtle = cryptoObj.subtle;
	const baseKey = await subtle.importKey(
		"raw",
		passwordBuffer,
		{ name: "PBKDF2" },
		false,
		["deriveBits"]
	);

	const derivedBits = await subtle.deriveBits(
		{
			name: "PBKDF2",
			salt: saltBuffer,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		baseKey,
		256
	);

	const keyBytes = new Uint8Array(derivedBits);
	kdfCache.set(cacheKey, keyBytes);
	return keyBytes;
}

export async function deriveParentKey(parentSeed) {
	return deriveKey(parentSeed, CONTEXT_DRAW);
}

export async function deriveChildKey(childSeed) {
	return deriveKey(childSeed, CONTEXT_CARD);
}

