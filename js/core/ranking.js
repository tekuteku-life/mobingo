import { STANDARD_LINES, SPECIAL_PATTERNS, FREE_CELL } from "./bingo.js";

// Compute completion turns directly; names and scan order never affect ranking.
export function buildWinnerRanking(cards, drawSequence, currentTurn, specialRuleTurn) {
	const positions = new Map(drawSequence.map((value, index) => [value, index + 1]));
	const patterns = [...STANDARD_LINES, ...(specialRuleTurn === null ? [] : Object.values(SPECIAL_PATTERNS))];
	const winners = [];
	for (const [seed, card] of cards) {
		let firstBingoTurn = Infinity;
		for (const pattern of patterns) {
			const naturalTurn = Math.max(...pattern.indices.map(([r, c]) => {
				const value = card.grid[r][c].value;
				return value === FREE_CELL ? 0 : (positions.get(value) ?? Infinity);
			}));
			const turn = "isSpecial" in pattern ? Math.max(naturalTurn, specialRuleTurn) : naturalTurn;
			firstBingoTurn = Math.min(firstBingoTurn, turn);
		}
		if (firstBingoTurn <= currentTurn) winners.push({ seed, firstBingoTurn });
	}
	winners.sort((a, b) => a.firstBingoTurn - b.firstBingoTurn || a.seed.localeCompare(b.seed));
	let rank = 0;
	return winners.map((winner, index) => {
		if (index === 0 || winner.firstBingoTurn !== winners[index - 1].firstBingoTurn) rank = index + 1;
		return { ...winner, rank };
	});
}
