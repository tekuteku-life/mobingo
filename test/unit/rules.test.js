import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBingoCard, calculateReachAndBingo, STANDARD_LINES, SPECIAL_PATTERNS } from '../../js/core/bingo.js';

const card = await generateBingoCard('ABCD');
const coords = (indices) => indices.map(([r, c]) => `${r},${c}`);

for (const pattern of [...STANDARD_LINES, ...Object.values(SPECIAL_PATTERNS)]) {
	test(`R-06/11: ${pattern.id}の成立と待ち数字`, () => {
		const opened = new Set(coords(pattern.indices));
		assert.ok(calculateReachAndBingo(card, opened, true).completedLines.some((line) => line.id === pattern.id));
		const [r, c] = pattern.indices.find(([r, c]) => r !== 2 || c !== 2);
		opened.delete(`${r},${c}`);
		const status = calculateReachAndBingo(card, opened, true);
		assert.ok(status.reach.reachLines.some((line) => line.id === pattern.id));
		assert.ok(status.reach.waitingNumbers.includes(card.grid[r][c].value));
		assert.ok(!status.completedLines.some((line) => line.id === pattern.id));
		if (pattern.isSpecial) assert.ok(!calculateReachAndBingo(card, coords(pattern.indices), false).completedLines.some((line) => line.id === pattern.id));
	});
}

test('R-06: FREE自動開封、待ち数字の一意性・昇順と全リーチレベル', () => {
	assert.equal(calculateReachAndBingo(card, []).isBingo, false);
	assert.equal(calculateReachAndBingo(card, []).reach.reachLevel, 'none');
	for (const [n, level] of [[1, 'single'], [2, 'double'], [3, 'triple_or_more']]) {
		const opened = new Set();
		for (let r = 0; r < n; r++) for (let c = 0; c < 4; c++) opened.add(`${r},${c}`);
		const result = calculateReachAndBingo(card, opened);
		assert.equal(result.reach.reachLevel, level);
		assert.deepEqual(result.reach.waitingNumbers, [...new Set(result.reach.waitingNumbers)].sort((a, b) => a - b));
	}
	const all = card.cells.map((cell) => `${cell.row},${cell.col}`);
	assert.equal(calculateReachAndBingo(card, all).completedLines.length, 12);
	assert.equal(calculateReachAndBingo(card, all, true).completedLines.length, 15);
});
