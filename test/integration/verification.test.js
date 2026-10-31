import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBingoCard, generateDrawSequence, verifyChildCard } from '../../js/core/bingo.js';

// Production STANDARD_LINESを使わず、行・列・対角線から参照解を構成する。
function oracle(card, sequence, turn, unlock) {
	const lines = [];
	for (let n = 0; n < 5; n++) {
		lines.push({ id: `row-${n}`, cells: card.grid[n] });
		lines.push({ id: `col-${n}`, cells: card.grid.map((row) => row[n]) });
	}
	lines.push({ id: 'diag-topleft-bottomright', cells: card.grid.map((row, i) => row[i]) });
	lines.push({ id: 'diag-topright-bottomleft', cells: card.grid.map((row, i) => row[4 - i]) });
	if (unlock !== null) {
		lines.push({ id: 'special-four-corners', cells: [card.grid[0][0], card.grid[0][4], card.grid[4][0], card.grid[4][4]] });
		lines.push({ id: 'special-x-shape', cells: card.cells.filter(({ row, col }) => row === col || row + col === 4) });
		lines.push({ id: 'special-plus-cross', cells: card.cells.filter(({ row, col }) => row === 2 || col === 2) });
	}
	return lines.map(({ id, cells }) => ({ id, turnAchieved: Math.max(
		...cells.filter((cell) => cell.value !== 0).map((cell) => sequence.indexOf(cell.value) + 1),
		id.startsWith('special') ? unlock : 0,
	) })).filter((line) => line.turnAchieved <= turn);
}

for (const childSeed of ['ABCD', '0000', 'ZZZZ']) {
	for (const unlock of [null, 0, 25, 75]) {
		test(`R-10/11: ${childSeed}・解禁${unlock}を独立成立手番と照合する`, async () => {
			const card = await generateBingoCard(childSeed);
			const sequence = await generateDrawSequence('1234');
			for (const turn of [0, 1, 24, 25, 50, 74, 75]) {
				const actual = await verifyChildCard(childSeed, sequence, turn, unlock);
				const expected = oracle(card, sequence, turn, unlock);
				const first = expected.length ? Math.min(...expected.map((line) => line.turnAchieved)) : null;
				assert.equal(actual.firstBingoTurn, first);
				assert.equal(actual.isValidWin, expected.length > 0);
				assert.deepEqual(actual.allCompletedPatterns.map(({ id, turnAchieved }) => ({ id, turnAchieved })).sort((a, b) => a.id.localeCompare(b.id)), expected.sort((a, b) => a.id.localeCompare(b.id)));
				assert.deepEqual(actual.firstBingoPatterns.map((line) => line.id).sort(), expected.filter((line) => line.turnAchieved === first).map((line) => line.id).sort());
				assert.equal(actual.openedNumbersCount, card.cells.filter((cell) => cell.value !== 0 && sequence.slice(0, turn).includes(cell.value)).length);
				assert.equal(actual.matchedCellIndices.size, actual.openedNumbersCount + 1);
			}
		});
	}
}
