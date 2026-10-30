import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, createCipheriv } from 'node:crypto';
import * as base32 from '../../js/core/base32.js';
import { deriveKey, deriveParentKey, deriveChildKey } from '../../js/core/crypto.js';
import { ChaCha20PRNG } from '../../js/core/chacha20.js';
import { generateBingoCard, generateDrawSequence } from '../../js/core/bingo.js';

test('R-02: Crockford補正と妥当性の境界', () => {
	for (const [input, expected] of [[' o-il ', '011'], ['abcd9', 'ABCD'], ['u!?', ''], ['', ''], [null, ''], ['o1l2', '0112']]) {
		assert.equal(base32.sanitizeSeedInput(input), expected);
	}
	for (const invalid of [null, undefined, 1234, '', 'ABC', 'ABCDE', 'abcd', 'OILU', 'AB C']) assert.equal(base32.isValidSeed(invalid), false);
	assert.equal(base32.CROCKFORD_ALPHABET.length, 32);
	for (const char of base32.CROCKFORD_ALPHABET) assert.equal(base32.isValidSeed(char.repeat(4)), true);
});

test('R-02: 32進数変換とランダムID', () => {
	for (const number of [0, 1, 31, 32, 1024, 1048575, 1048576, 2097153]) {
		assert.equal(base32.seedToNumber(base32.numberToSeed(number)), number % 1048576);
	}
	assert.equal(base32.numberToSeed(0), '0000');
	assert.equal(base32.numberToSeed(1048575), 'ZZZZ');
	assert.throws(() => base32.seedToNumber('ABU1'), /Invalid seed/);
	for (let n = 0; n < 100; n++) assert.ok(base32.isValidSeed(base32.generateRandomSeed()));
});

test('R-03: KDFをNode標準cryptoの独立計算と比較する', async () => {
	for (const context of ['mobingo:draw', 'mobingo:card']) {
		const expected = pbkdf2Sync('ABCD', `mobingo-salt-v1:${context}`, 30000, 32, 'sha256');
		assert.deepEqual(Buffer.from(await deriveKey('ABCD', context)), expected);
		assert.deepEqual(Buffer.from(await deriveKey('ABCD', context)), expected);
	}
	assert.notDeepEqual(await deriveParentKey('ABCD'), await deriveChildKey('ABCD'));
});

test('R-03: ChaCha20ゼロ鍵既知ベクトルと複数ブロックを独立実装と比較する', () => {
	const prng = new ChaCha20PRNG(new Uint8Array(32));
	const bytes = Buffer.alloc(192);
	for (let i = 0; i < 48; i++) bytes.writeUInt32LE(prng.nextUint32(), i * 4);
	assert.equal(bytes.subarray(0, 16).toString('hex'), '76b8e0ada0f13d90405d6ae55386bd28');
	const cipher = createCipheriv('chacha20', Buffer.alloc(32), Buffer.alloc(16));
	assert.deepEqual(bytes, cipher.update(Buffer.alloc(192)));
	const key = Uint8Array.from({ length: 32 }, (_, i) => i);
	const nonce = Uint8Array.from({ length: 12 }, (_, i) => i + 20);
	const noncePRNG = new ChaCha20PRNG(key, nonce);
	const iv = Buffer.concat([Buffer.alloc(4), nonce]);
	assert.equal(noncePRNG.nextUint32(), createCipheriv('chacha20', key, iv).update(Buffer.alloc(4)).readUInt32LE());
	assert.throws(() => new ChaCha20PRNG(new Uint8Array(31)), /32 bytes/);
});

test('R-03: 棄却法・最小値・シャッフルを固定入力で検証する', () => {
	const prng = new ChaCha20PRNG(new Uint8Array(32));
	assert.equal(prng.nextInt(0), 0);
	assert.equal(prng.nextInt(1), 0);
	const samples = [4294967295, 8];
	prng.nextUint32 = () => samples.shift();
	assert.equal(prng.nextInt(3), 2);
	assert.equal(samples.length, 0);
	prng.nextUint32 = () => 0;
	assert.deepEqual(prng.shuffle([1, 2, 3]), [2, 3, 1]);
	assert.deepEqual(prng.shuffle([]), []);
});

for (const seed of ['0000', 'ABCD', 'ZZZZ', '1234']) {
	test(`R-03/04/07: ${seed}のカード・出目不変条件と再現性`, async () => {
		const sequence = await generateDrawSequence(seed);
		assert.equal(sequence.length, 75);
		assert.deepEqual([...sequence].sort((a, b) => a - b), Array.from({ length: 75 }, (_, i) => i + 1));
		assert.deepEqual(await generateDrawSequence(seed), sequence);
		const card = await generateBingoCard(seed);
		assert.deepEqual(await generateBingoCard(seed), card);
		assert.equal(card.grid.length, 5);
		assert.equal(card.cells.length, 25);
		assert.equal(card.valueToCellMap.size, 24);
		assert.equal(card.grid[2][2].value, 0);
		for (const cell of card.cells) {
			assert.equal(card.grid[cell.row][cell.col], cell);
			if (cell.value === 0) continue;
			assert.ok(cell.value >= cell.col * 15 + 1 && cell.value <= cell.col * 15 + 15);
			assert.deepEqual(card.valueToCellMap.get(cell.value), { row: cell.row, col: cell.col });
		}
		assert.equal(new Set(card.cells.map((cell) => cell.value)).size, 25);
	});
}

test('R-03: 基準コミット061f8afのv1カード・75球ベクトルを維持する', async () => {
	const { readFile } = await import('node:fs/promises');
	const vectors = JSON.parse(await readFile(new URL('../helpers/v1-vectors.json', import.meta.url), 'utf8'));
	assert.deepEqual((await generateBingoCard(vectors.seed)).cells.map((cell) => cell.value), vectors.card);
	assert.deepEqual(await generateDrawSequence(vectors.seed), vectors.draw);
});
