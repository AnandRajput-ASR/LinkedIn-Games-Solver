import { solvePatches } from './solver.js';

export async function autoSolve() {
  const { cellEls, clues, gridSize } = readGrid();
  console.info('Patches gridSize:', gridSize, 'clues:', clues);

  if (clues.length === 0) {
    throw new Error('Patches: No clue cells found in DOM');
  }

  const solution = solvePatches(clues, gridSize);
  if (!solution) {
    throw new Error('Patches: Solver could not find a valid partition');
  }
  console.info('Patches solution:', solution);

  await applyRectangles(cellEls, solution, gridSize);
}

// ---------------------------------------------------------------------------
// DOM reading
// ---------------------------------------------------------------------------

function readGrid() {
  let doc = document;
  let cells = Array.from(doc.querySelectorAll('[data-testid^="cell-"]'));

  // Fallback: game might be inside an iframe
  if (cells.length === 0) {
    const frame = document.querySelector('iframe');
    if (frame) {
      doc = frame.contentDocument || frame.contentWindow.document;
      cells = Array.from(doc.querySelectorAll('[data-testid^="cell-"]'));
    }
  }

  if (cells.length === 0) {
    throw new Error('Patches: Could not find any grid cells');
  }

  const N = Math.round(Math.sqrt(cells.length));
  const cellEls = new Array(N * N).fill(null);
  const clues = [];

  for (const cell of cells) {
    const testId = cell.getAttribute('data-testid'); // "cell-{idx}"
    const idx = parseInt(testId.replace('cell-', ''), 10);
    if (isNaN(idx) || idx < 0 || idx >= N * N) continue;

    cellEls[idx] = cell;

    const shapeEl = cell.querySelector('[data-shape]');
    if (!shapeEl) continue; // not a clue cell

    const row = Math.floor(idx / N);
    const col = idx % N;
    const shape = shapeEl.getAttribute('data-shape');

    // Optional size number, e.g. data-testid="patches-clue-number-9"
    const sizeEl = cell.querySelector('[data-testid^="patches-clue-number-"]');
    const size = sizeEl ? parseInt(sizeEl.textContent.trim(), 10) : 0;

    clues.push({ row, col, shape, size });
  }

  return { cellEls, clues, gridSize: N };
}

// ---------------------------------------------------------------------------
// Solution application
// ---------------------------------------------------------------------------

async function applyRectangles(cellEls, solution, N) {
  for (const rect of solution) {
    await drawRectangle(cellEls, rect, N);
  }
}

/**
 * Draws one rectangle by simulating a realistic mouse drag.
 * LinkedIn Patches uses React's onMouseDown/onMouseMove/onMouseUp on the grid
 * container and onMouseEnter on each cell, and the handlers read clientX/clientY
 * to determine which cell is being hovered — so events must carry real coordinates.
 */
async function drawRectangle(cellEls, { r1, c1, r2, c2 }, N) {
  const startCell = cellEls[r1 * N + c1];
  const endCell   = cellEls[r2 * N + c2];

  if (!startCell || !endCell) {
    console.error('Patches: Missing cell element for rect', { r1, c1, r2, c2 });
    return;
  }

  // The grid container holds the onMouseDown/onMouseMove/onMouseUp handlers.
  const grid = startCell.closest('[data-testid="interactive-grid"]')
    ?? startCell.parentElement;

  function coordEvent(el, type) {
    const box = el.getBoundingClientRect();
    const cx  = box.left + box.width  / 2;
    const cy  = box.top  + box.height / 2;
    return new MouseEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy });
  }

  // mousedown on start cell (bubbles to grid)
  startCell.dispatchEvent(coordEvent(startCell, 'mousedown'));
  await new Promise(resolve => setTimeout(resolve, 30));

  // For every cell in the rectangle: mouseenter + mousemove on grid
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = cellEls[r * N + c];
      if (!cell) continue;
      const box = cell.getBoundingClientRect();
      const cx  = box.left + box.width  / 2;
      const cy  = box.top  + box.height / 2;
      const args = { bubbles: true, cancelable: true, clientX: cx, clientY: cy };
      cell.dispatchEvent(new MouseEvent('mouseenter', args));
      cell.dispatchEvent(new MouseEvent('mousemove',  args));
      grid.dispatchEvent(new MouseEvent('mousemove',  args));
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  }

  // mouseup on end cell (bubbles to grid)
  endCell.dispatchEvent(coordEvent(endCell, 'mouseup'));

  // Let React process the state update before the next rectangle
  await new Promise(resolve => setTimeout(resolve, 200));
}
