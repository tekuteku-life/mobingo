/**
 * ChaCha20 Deterministic PRNG implementation (RFC 8439)
 */

export class ChaCha20PRNG {
	constructor(keyBytes, nonceBytes) {
		if (keyBytes.length !== 32) {
			throw new Error("ChaCha20 key must be 32 bytes");
		}

		this.state = new Uint32Array(16);
		this.block = new Uint8Array(64);
		this.blockIndex = 64;
		this.counter = 0;
		this.key = new Uint32Array(8);
		this.nonce = new Uint32Array(3);

		for (let i = 0; i < 8; i++) {
			this.key[i] =
				keyBytes[i * 4] |
				(keyBytes[i * 4 + 1] << 8) |
				(keyBytes[i * 4 + 2] << 16) |
				(keyBytes[i * 4 + 3] << 24);
		}

		if (nonceBytes && nonceBytes.length === 12) {
			for (let i = 0; i < 3; i++) {
				this.nonce[i] =
					nonceBytes[i * 4] |
					(nonceBytes[i * 4 + 1] << 8) |
					(nonceBytes[i * 4 + 2] << 16) |
					(nonceBytes[i * 4 + 3] << 24);
			}
		} else {
			this.nonce.fill(0);
		}
	}

	static rotl(v, n) {
		return ((v << n) | (v >>> (32 - n))) >>> 0;
	}

	static quarterRound(x, a, b, c, d) {
		x[a] = (x[a] + x[b]) >>> 0;
		x[d] = ChaCha20PRNG.rotl((x[d] ^ x[a]) >>> 0, 16);

		x[c] = (x[c] + x[d]) >>> 0;
		x[b] = ChaCha20PRNG.rotl((x[b] ^ x[c]) >>> 0, 12);

		x[a] = (x[a] + x[b]) >>> 0;
		x[d] = ChaCha20PRNG.rotl((x[d] ^ x[a]) >>> 0, 8);

		x[c] = (x[c] + x[d]) >>> 0;
		x[b] = ChaCha20PRNG.rotl((x[b] ^ x[c]) >>> 0, 7);
	}

	generateBlock() {
		this.state[0] = 0x61707865;
		this.state[1] = 0x3320646e;
		this.state[2] = 0x79622d32;
		this.state[3] = 0x6b206574;

		for (let i = 0; i < 8; i++) {
			this.state[4 + i] = this.key[i];
		}

		this.state[12] = this.counter >>> 0;
		this.state[13] = this.nonce[0];
		this.state[14] = this.nonce[1];
		this.state[15] = this.nonce[2];

		const working = new Uint32Array(this.state);

		for (let i = 0; i < 10; i++) {
			ChaCha20PRNG.quarterRound(working, 0, 4, 8, 12);
			ChaCha20PRNG.quarterRound(working, 1, 5, 9, 13);
			ChaCha20PRNG.quarterRound(working, 2, 6, 10, 14);
			ChaCha20PRNG.quarterRound(working, 3, 7, 11, 15);

			ChaCha20PRNG.quarterRound(working, 0, 5, 10, 15);
			ChaCha20PRNG.quarterRound(working, 1, 6, 11, 12);
			ChaCha20PRNG.quarterRound(working, 2, 7, 8, 13);
			ChaCha20PRNG.quarterRound(working, 3, 4, 9, 14);
		}

		for (let i = 0; i < 16; i++) {
			const val = (working[i] + this.state[i]) >>> 0;
			this.block[i * 4] = val & 0xff;
			this.block[i * 4 + 1] = (val >>> 8) & 0xff;
			this.block[i * 4 + 2] = (val >>> 16) & 0xff;
			this.block[i * 4 + 3] = (val >>> 24) & 0xff;
		}

		this.counter = (this.counter + 1) >>> 0;
		this.blockIndex = 0;
	}

	nextUint32() {
		if (this.blockIndex >= 64) {
			this.generateBlock();
		}
		const val =
			this.block[this.blockIndex] |
			(this.block[this.blockIndex + 1] << 8) |
			(this.block[this.blockIndex + 2] << 16) |
			(this.block[this.blockIndex + 3] << 24);
		this.blockIndex += 4;
		return val >>> 0;
	}

	nextInt(maxExclusive) {
		if (maxExclusive <= 1) return 0;
		const range = 4294967296;
		const limit = range - (range % maxExclusive);
		let rand;
		do {
			rand = this.nextUint32();
		} while (rand >= limit);
		return rand % maxExclusive;
	}

	shuffle(array) {
		for (let i = array.length - 1; i > 0; i--) {
			const j = this.nextInt(i + 1);
			const temp = array[i];
			array[i] = array[j];
			array[j] = temp;
		}
		return array;
	}
}

