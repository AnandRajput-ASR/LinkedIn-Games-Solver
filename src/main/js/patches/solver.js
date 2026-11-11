// Constraint types from DOM data-shape attribute
const SHAPE = {
  SQUARE: 'PatchesShapeConstraint_SQUARE',
  VERTICAL_RECT: 'PatchesShapeConstraint_VERTICAL_RECT',
  HORIZONTAL_RECT: 'PatchesShapeConstraint_HORIZONTAL_RECT',
  UNKNOWN: 'PatchesShapeConstraint_UNKNOWN', // any rectangle shape (freeform)
};

/**
 * Solves the Patches puzzle using backtracking.
 *
 * @param {Array<{row: number, col: number, shape: string, size: number}>} clues
 *   0-indexed row/col. size=0 means unconstrained.
 * @param {number} gridSize defaults to 8
 * @returns {Array<{r1,c1,r2,c2}>|null} one rect per clue index, or null if no solution
 */
export function solvePatches(clues, gridSize = 8) {
  const N = gridSize;

  // Generate all valid candidate rectangles for each clue
  const candidates = clues.map(clue => generateCandidates(N, clue));

  // Process most-constrained clues first (fewest candidates)
  const order = clues.map((_, i) => i).sort(
    (a, b) => candidates[a].length - candidates[b].length,
  );

  const assignment = new Array(clues.length).fill(null);
  const occupied = new Uint8Array(N * N); // 1 = occupied

  function backtrack(step) {
    if (step === clues.length) {
      // All clues assigned — verify every cell is covered
      return occupied.every(Boolean);
    }
    const idx = order[step];
    for (const rect of candidates[idx]) {
      if (hasConflict(rect, occupied, N)) continue;

      const cells = rectCells(rect, N);
      for (const c of cells) occupied[c] = 1;
      assignment[idx] = rect;

      if (backtrack(step + 1)) return true;

      // Undo
      for (const c of cells) occupied[c] = 0;
      assignment[idx] = null;
    }
    return false;
  }

  return backtrack(0) ? assignment : null;
}

function generateCandidates(N, { row, col, shape, size }) {
  const candidates = [];
  // Enumerate all rectangles that contain (row, col)
  for (let r1 = 0; r1 <= row; r1++) {
    for (let r2 = row; r2 < N; r2++) {
      for (let c1 = 0; c1 <= col; c1++) {
        for (let c2 = col; c2 < N; c2++) {
          const h = r2 - r1 + 1;
          const w = c2 - c1 + 1;
          // Shape constraint (UNKNOWN / freeform accepts any rectangle)
          if (shape === SHAPE.SQUARE && h !== w) continue;
          if (shape === SHAPE.VERTICAL_RECT && h <= w) continue;
          if (shape === SHAPE.HORIZONTAL_RECT && w <= h) continue;
          // Size constraint (0 = unconstrained)
          if (size > 0 && h * w !== size) continue;
          candidates.push({ r1, c1, r2, c2 });
        }
      }
    }
  }
  return candidates;
}

function hasConflict({ r1, c1, r2, c2 }, occupied, N) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      if (occupied[r * N + c]) return true;
    }
  }
  return false;
}

function rectCells({ r1, c1, r2, c2 }, N) {
  const cells = [];
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      cells.push(r * N + c);
    }
  }
  return cells;
}
