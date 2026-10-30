import { deriveParentKey, deriveChildKey } from "./crypto.js";
import { ChaCha20PRNG } from "./chacha20.js";

export const FREE_CELL = 0;
export const CARD_SIZE = 5;

// Standard 12 Bingo lines
export const STANDARD_LINES = [
	// Rows
	...[0, 1, 2, 3, 4].map((r) => ({
		id: `row-${r}`,
		name: `横 ${r + 1}行目`,
		indices: [0, 1, 2, 3, 4].map((c) => [r, c]),
	})),
	// Cols
	...[0, 1, 2, 3, 4].map((c) => ({
		id: `col-${c}`,
		name: `縦 ${["B", "I", "N", "G", "O"][c]}列`,
		indices: [0, 1, 2, 3, 4].map((r) => [r, c]),
	})),
	// Diagonals
	{
		id: "diag-topleft-bottomright",
		name: "斜め (左上→右下)",
		indices: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]],
	},
	{
		id: "diag-topright-bottomleft",
		name: "斜め (右上→左下)",
		indices: [[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]],
	},
];

// Special Patterns (Req 5.1)
export const SPECIAL_PATTERNS = {
	four_corners: {
		id: "special-four-corners",
		name: "四隅 (Four Corners)",
		isSpecial: true,
		indices: [[0, 0], [0, 4], [4, 0], [4, 4]],
	},
	x_shape: {
		id: "special-x-shape",
		name: "クロス (X-Shape)",
		isSpecial: true,
		indices: [
			[0, 0], [1, 1], [2, 2], [3, 3], [4, 4],
			[0, 4], [1, 3],         [3, 1], [4, 0],
		],
	},
	plus_cross: {
		id: "special-plus-cross",
		name: "プラス (+ Cross)",
		isSpecial: true,
		indices: [
			[0, 2], [1, 2], [2, 2], [3, 2], [4, 2],
			[2, 0], [2, 1],         [2, 3], [2, 4],
		],
	},
};

export async function generateDrawSequence(parentSeed) {
	const keyBytes = await deriveParentKey(parentSeed);
	const prng = new ChaCha20PRNG(keyBytes);
	const balls = Array.from({ length: 75 }, (_, i) => i + 1);
	return prng.shuffle(balls);
}

export async function generateBingoCard(childSeed) {
	const keyBytes = await deriveChildKey(childSeed);
	const prng = new ChaCha20PRNG(keyBytes);

	const bPool = prng.shuffle(Array.from({ length: 15 }, (_, i) => i + 1)).slice(0, 5);
	const iPool = prng.shuffle(Array.from({ length: 15 }, (_, i) => i + 16)).slice(0, 5);
	const nPool = prng.shuffle(Array.from({ length: 15 }, (_, i) => i + 31)).slice(0, 4);
	const gPool = prng.shuffle(Array.from({ length: 15 }, (_, i) => i + 46)).slice(0, 5);
	const oPool = prng.shuffle(Array.from({ length: 15 }, (_, i) => i + 61)).slice(0, 5);

	const letters = ["B", "I", "N", "G", "O"];
	const grid = [];
	const cells = [];
	const valueToCellMap = new Map();

	for (let r = 0; r < CARD_SIZE; r++) {
		const row = [];
		for (let c = 0; c < CARD_SIZE; c++) {
			let val;
			if (c === 0) val = bPool[r];
			else if (c === 1) val = iPool[r];
			else if (c === 2) {
				if (r === 2) val = FREE_CELL;
				else val = r > 2 ? nPool[r - 1] : nPool[r];
			} else if (c === 3) val = gPool[r];
			else val = oPool[r];

			const cell = { row: r, col: c, value: val, letter: letters[c] };
			row.push(cell);
			cells.push(cell);
			if (val !== FREE_CELL) {
				valueToCellMap.set(val, { row: r, col: c });
			}
		}
		grid.push(row);
	}

	return { seed: childSeed, grid, cells, valueToCellMap };
}

export function calculateReachAndBingo(card, openedCoords, enableSpecialRules = false) {
	const opened = new Set(openedCoords);
	opened.add("2,2");

	const patternsToCheck = [...STANDARD_LINES];
	if (enableSpecialRules) {
		patternsToCheck.push(
			SPECIAL_PATTERNS.four_corners,
			SPECIAL_PATTERNS.x_shape,
			SPECIAL_PATTERNS.plus_cross
		);
	}

	const completedLines = [];
	const reachLines = [];
	const waitingNumbersSet = new Set();

	for (const pattern of patternsToCheck) {
		let unOpenedCount = 0;
		let waitingVal = null;

		for (const [r, c] of pattern.indices) {
			if (!opened.has(`${r},${c}`)) {
				unOpenedCount++;
				const cellVal = card.grid[r][c].value;
				if (cellVal !== FREE_CELL) {
					waitingVal = cellVal;
				}
			}
		}

		if (unOpenedCount === 0) {
			completedLines.push({
				id: pattern.id,
				name: pattern.name,
				isSpecial: "isSpecial" in pattern && !!pattern.isSpecial,
				cells: pattern.indices,
			});
		} else if (unOpenedCount === 1 && waitingVal !== null) {
			reachLines.push(pattern);
			waitingNumbersSet.add(waitingVal);
		}
	}

	const reachCount = reachLines.length;
	let reachLevel = "none";
	if (reachCount === 1) reachLevel = "single";
	else if (reachCount === 2) reachLevel = "double";
	else if (reachCount >= 3) reachLevel = "triple_or_more";

	return {
		reach: {
			reachCount,
			waitingNumbers: Array.from(waitingNumbersSet).sort((a, b) => a - b),
			reachLines,
			reachLevel,
		},
		completedLines,
		isBingo: completedLines.length > 0,
	};
}

export async function verifyChildCard(childSeed, drawSequence, currentTurn, specialRuleTurn) {
	const card = await generateBingoCard(childSeed);
	const drawnNumbersUpToCurrent = new Set(drawSequence.slice(0, currentTurn));

	const matchedCellIndices = new Set();
	matchedCellIndices.add("2,2");

	let openedNumbersCount = 0;
	for (const cell of card.cells) {
		if (cell.value === FREE_CELL) continue;
		if (drawnNumbersUpToCurrent.has(cell.value)) {
			matchedCellIndices.add(`${cell.row},${cell.col}`);
			openedNumbersCount++;
		}
	}

	const runningDrawnNumbers = new Set();
	let firstBingoTurn = null;
	const firstBingoPatterns = [];
	const allCompletedPatterns = [];

	for (let turn = 1; turn <= currentTurn; turn++) {
		const ball = drawSequence[turn - 1];
		runningDrawnNumbers.add(ball);

		const activeSpecialRules = specialRuleTurn !== null && turn >= specialRuleTurn;

		const openedSet = new Set();
		openedSet.add("2,2");
		for (const cell of card.cells) {
			if (cell.value !== FREE_CELL && runningDrawnNumbers.has(cell.value)) {
				openedSet.add(`${cell.row},${cell.col}`);
			}
		}

		const { completedLines } = calculateReachAndBingo(card, openedSet, activeSpecialRules);

		for (const comp of completedLines) {
			if (!allCompletedPatterns.some((p) => p.id === comp.id)) {
				const withTurn = { ...comp, turnAchieved: turn };
				allCompletedPatterns.push(withTurn);
				if (firstBingoTurn === null) {
					firstBingoTurn = turn;
					firstBingoPatterns.push(withTurn);
				} else if (firstBingoTurn === turn) {
					firstBingoPatterns.push(withTurn);
				}
			}
		}
	}

	const isCurrentlyBingo = allCompletedPatterns.length > 0;
	const isValidWin = isCurrentlyBingo;
	let message = "";

	if (isCurrentlyBingo && firstBingoTurn !== null) {
		const patternNames = firstBingoPatterns.map((p) => p.name).join(", ");
		message = `第${firstBingoTurn}手目にビンゴ成立！ (${patternNames})`;
	} else {
		message = "現在の手番ではビンゴは成立していません。";
	}

	return {
		childSeed,
		card,
		isCurrentlyBingo,
		firstBingoTurn,
		firstBingoPatterns,
		allCompletedPatterns,
		openedNumbersCount,
		matchedCellIndices,
		isValidWin,
		message,
	};
}

