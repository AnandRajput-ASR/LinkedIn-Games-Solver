import { loadLocalLexicon } from '../dictionary.js';
import { solveWendGrid } from '../localDictionarySolver.js';
import { getGridDiv } from '../util.js';

const WORD_LENGTHS = [3, 4, 5, 7];

export async function autoSolve() {
  const gridDiv = getWendGridDiv();
  const columns = getGridColumns(gridDiv);
  const cellEls = new Map();
  const tiles = [];

  for (const cell of gridDiv.querySelectorAll('[data-testid^="cell-"]')) {
    const idx = Number.parseInt(cell.getAttribute('data-cell-idx'), 10);
    const letter = cell.textContent.trim().toLowerCase();
    if (!Number.isInteger(idx) || letter.length !== 1) continue;
    cellEls.set(idx, cell);
    tiles.push({ idx, letter });
  }
  if (tiles.length !== WORD_LENGTHS.reduce((sum, length) => sum + length, 0)) {
    throw new Error(`Wend: expected 19 letter tiles, found ${tiles.length}`);
  }
  if (gridDiv.querySelector('[data-cell-selecting="true"]')
      || gridDiv.querySelector('[data-testid^="wend-word-list-row-"][data-locked="true"]')) {
    throw new Error('Wend: reset the board before solving a partial game');
  }

  const lexicon = await loadLocalLexicon();
  const solution = solveWendGrid(tiles, columns, WORD_LENGTHS, lexicon);
  console.info('Wend local dictionary solution:', solution.map(({word}) => word));
  await enterWords(gridDiv, cellEls, solution, columns);
}

function getWendGridDiv() {
  return getGridDiv(doc => doc.querySelector('[data-testid="interactive-grid"]'));
}

function getGridColumns(gridDiv) {
  const props = ['--igtm7c', '--cols', '--grid-cols'];
  for (const property of props) {
    const columns = Number.parseInt(gridDiv.style.getPropertyValue(property), 10);
    if (Number.isInteger(columns) && columns > 0) return columns;
  }
  throw new Error('Wend: could not read the grid column count');
}

async function enterWords(gridDiv, cellEls, solution, columns) {
  const document = gridDiv.ownerDocument;
  const view = document.defaultView;
  const countLockedRows = () => document.querySelectorAll(
    '[data-testid^="wend-word-list-row-"][data-locked="true"]'
  ).length;
  const getFocusedIndex = () => {
    const focused = gridDiv.querySelector('[data-cell-focused="true"]');
    const active = focused ?? document.activeElement;
    const index = Number.parseInt(active?.getAttribute('data-cell-idx'), 10);
    return Number.isInteger(index) && cellEls.has(index) ? index : null;
  };
  const getSelectingIndex = () => {
    const selected = gridDiv.querySelector('[data-cell-selecting="true"]');
    return selected ? Number.parseInt(selected.getAttribute('data-cell-idx'), 10) : null;
  };
  const pressKey = async (key) => {
    const target = document.activeElement;
    if (!gridDiv.contains(target)) {
      throw new Error(`Wend: no tile focused before ${key}`);
    }
    target.dispatchEvent(new view.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 40));
  };

  let currentIndex = Math.min(...cellEls.keys());
  cellEls.get(currentIndex).focus();

  for (const {word, cellIndices} of solution) {
    const startIndex = cellIndices[0];
    if (!cellEls.has(startIndex)) throw new Error(`Wend: missing tile for ${word}`);
    const startRoute = findMovementPath(currentIndex, startIndex, cellEls, columns);
    for (const nextIndex of startRoute) {
      await pressKey(directionFor(currentIndex, nextIndex, columns));
      currentIndex = getFocusedIndex();
      if (currentIndex !== nextIndex) {
        throw new Error(`Wend: focus moved to ${currentIndex}, expected ${nextIndex}`);
      }
    }

    await pressKey('Enter');
    if (getSelectingIndex() !== startIndex) {
      throw new Error(`Wend: failed to start selecting ${word}`);
    }

    const previousLockedCount = countLockedRows();
    let committedOnLastTile = false;
    for (let i = 1; i < cellIndices.length; i++) {
      const nextIndex = cellIndices[i];
      await pressKey(directionFor(currentIndex, nextIndex, columns));
      currentIndex = getFocusedIndex();
      const selectedIndex = getSelectingIndex();
      const lockedCount = countLockedRows();
      if (currentIndex !== nextIndex) {
        throw new Error(`Wend: failed to extend ${word} to tile ${nextIndex}`);
      }
      if (selectedIndex === null && lockedCount === previousLockedCount + 1
          && i === cellIndices.length - 1) {
        committedOnLastTile = true;
        break;
      }
      if (selectedIndex !== nextIndex) {
        throw new Error(`Wend: failed to extend ${word} to tile ${nextIndex}`);
      }
    }

    if (!committedOnLastTile) {
      await pressKey('Enter');
      await new Promise(resolve => setTimeout(resolve, 100));
      if (getSelectingIndex() !== null
          || countLockedRows() !== previousLockedCount + 1) {
        throw new Error(`Wend: failed to commit the word ${word}`);
      }
    }
  }
}

function findMovementPath(startIndex, targetIndex, cellEls, columns) {
  if (startIndex === targetIndex) return [];
  const queue = [startIndex];
  const previous = new Map([[startIndex, null]]);
  while (queue.length > 0) {
    const current = queue.shift();
    const row = Math.floor(current / columns);
    const col = current % columns;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      const next = nextRow * columns + nextCol;
      if (nextRow < 0 || nextCol < 0 || nextCol >= columns
          || !cellEls.has(next) || previous.has(next)) continue;
      previous.set(next, current);
      if (next === targetIndex) {
        const path = [next];
        let parent = current;
        while (parent !== startIndex) {
          path.push(parent);
          parent = previous.get(parent);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  throw new Error(`Wend: cannot navigate from tile ${startIndex} to ${targetIndex}`);
}

function directionFor(from, to, columns) {
  const difference = to - from;
  if (difference === 1) return 'ArrowRight';
  if (difference === -1) return 'ArrowLeft';
  if (difference === columns) return 'ArrowDown';
  if (difference === -columns) return 'ArrowUp';
  throw new Error(`Wend: non-adjacent keyboard move ${from} to ${to}`);
}
