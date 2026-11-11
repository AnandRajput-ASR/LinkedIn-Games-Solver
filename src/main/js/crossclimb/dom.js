import { findWordLadder } from '../localDictionarySolver.js';
import { doOneClick } from '../util.js';

export async function autoSolve() {
  const gameDocument = getGameDocument();
  dismissTutorial(gameDocument);
  const rows = await revealRows(gameDocument, isMiddleRow);
  if (rows.length !== 5) {
    throw new Error(`Crossclimb: Reveal row returned ${rows.length} of 5 middle answers`);
  }

  const ladder = findWordLadder(rows.map(row => [row.word]), 1);
  if (!ladder) {
    throw new Error(`Crossclimb: revealed answers do not form a one-letter ladder: ${rows.map(row => row.word).join(', ')}`);
  }

  const orderedWords = ladder.map(item => rows[item.groupIndex].word);
  console.info('Crossclimb revealed ladder:', orderedWords);
  await reorderRows(gameDocument, orderedWords);
  await revealEndRows(gameDocument);
}

function getGameDocument() {
  if (document.querySelector('[aria-label*="Active row"]')) return document;
  const frame = [...document.querySelectorAll('iframe')]
    .find(candidate => candidate.src.includes('/games/view/crossclimb/'));
  return frame?.contentDocument ?? document;
}

async function revealRows(gameDocument, shouldRevealRow) {
  const revealed = [];
  const completedRows = new Set();
  for (let attempt = 0; attempt < 7; attempt++) {
    const active = getActiveRow(gameDocument);
    if (!active) break;
    const rowNumber = getRowNumber(active);
    if (!shouldRevealRow(rowNumber)) break;

    const inputs = getRowInputs(active);
    const existingWord = readRowWord(inputs);
    if (isRowComplete(active, inputs)) {
      revealed.push({ row: rowNumber, word: existingWord });
      completedRows.add(rowNumber);
      const next = gameDocument.querySelector('button[aria-label="Go to next row"]');
      if (!next) break;
      doOneClick(next);
      await delay(100);
      continue;
    }

    const reveal = gameDocument.querySelector('button[data-control-btn="reveal"]');
    if (!reveal) throw new Error(`Crossclimb: Reveal row control missing for row ${rowNumber}`);
    doOneClick(reveal);
    await waitForRowComplete(gameDocument, rowNumber);
    const revealedRow = getRowByNumber(gameDocument, rowNumber);
    const word = readRowWord(getRowInputs(revealedRow));
    revealed.push({ row: rowNumber, word });
    completedRows.add(rowNumber);
  }
  return revealed.sort((a, b) => a.row - b.row);
}

function dismissTutorial(gameDocument) {
  const dismiss = gameDocument.querySelector('button[aria-label="Dismiss"]');
  if (dismiss) doOneClick(dismiss);
}

function isMiddleRow(rowNumber) {
  return rowNumber >= 2 && rowNumber <= 6;
}

function getActiveRow(gameDocument) {
  return gameDocument.querySelector('.crossclimb__guess--active');
}

function getRowNumber(row) {
  const guessId = Number.parseInt(row?.getAttribute('data-guess-id'), 10);
  if (Number.isInteger(guessId)) return guessId + 1;
  return Number.parseInt(row?.getAttribute('aria-label')?.match(/row (\d+)/i)?.[1], 10);
}

function getRowByNumber(gameDocument, number) {
  return [...gameDocument.querySelectorAll('[data-guess-id], .crossclimb__guess')]
    .find(row => getRowNumber(row) === number
      && row.querySelector('input[aria-label*="First letter"]'));
}

function getRowInputs(row) {
  return [...(row?.querySelectorAll('input[aria-label*="letter of"]') ?? [])];
}

function readRowWord(inputs) {
  return inputs.map(input => input.value).join('').toLowerCase();
}

function isRowComplete(row, inputs) {
  return inputs.length > 0 && inputs.every(input => input.value.length === 1)
    && /all characters guessed/i.test(row.getAttribute('aria-label') ?? '');
}

async function waitForRowComplete(gameDocument, number) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const row = getRowByNumber(gameDocument, number);
    if (row && isRowComplete(row, getRowInputs(row))) return;
    await delay(100);
  }
  throw new Error(`Crossclimb: Reveal row did not complete row ${number}`);
}

async function reorderRows(gameDocument, desiredWords) {
  for (let targetIndex = 0; targetIndex < desiredWords.length; targetIndex++) {
    const currentRows = getMiddleRows(gameDocument);
    const sourceIndex = currentRows.findIndex(row => row.word === desiredWords[targetIndex]);
    if (sourceIndex === targetIndex) continue;
    if (sourceIndex < targetIndex) {
      throw new Error(`Crossclimb: unexpected word order while moving ${desiredWords[targetIndex]}`);
    }
    const steps = sourceIndex - targetIndex;
    await moveRowByKeyboard(gameDocument, currentRows[sourceIndex].element,
      'ArrowUp', steps);
    const reordered = getMiddleRows(gameDocument);
    if (reordered[targetIndex]?.word !== desiredWords[targetIndex]) {
      throw new Error(`Crossclimb: failed to move ${desiredWords[targetIndex]} into ladder position ${targetIndex + 1}`);
    }
  }

  const before = getMiddleRows(gameDocument);
  if (before.length !== desiredWords.length
      || before.some((row, index) => row.word !== desiredWords[index])) {
    throw new Error('Crossclimb: middle rows do not match the derived ladder');
  }
  const swapIndex = findInvalidAdjacentSwap(before.map(row => row.word));
  const sourceIndex = swapIndex + 1;
  await moveRowByKeyboard(gameDocument, before[sourceIndex].element, 'ArrowUp', 1);
  const bumped = getMiddleRows(gameDocument);
  if (bumped[swapIndex]?.word !== before[sourceIndex].word) {
    throw new Error('Crossclimb: could not trigger ladder validation');
  }
  await moveRowByKeyboard(gameDocument, bumped[swapIndex].element, 'ArrowDown', 1);
  const restored = getMiddleRows(gameDocument);
  if (restored.some((row, index) => row.word !== desiredWords[index])) {
    throw new Error('Crossclimb: failed to restore the validated ladder order');
  }
}

function findInvalidAdjacentSwap(words) {
  for (let index = 0; index < words.length - 1; index++) {
    const swapped = [...words];
    [swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]];
    if (!isOneLetterLadder(swapped)) return index;
  }
  return 0;
}

function isOneLetterLadder(words) {
  for (let index = 1; index < words.length; index++) {
    let differences = 0;
    for (let letter = 0; letter < words[index].length; letter++) {
      if (words[index][letter] !== words[index - 1][letter]
          && ++differences > 1) return false;
    }
    if (differences !== 1) return false;
  }
  return true;
}

async function moveRowByKeyboard(gameDocument, row, direction, steps) {
  const handle = row.querySelector('[data-sortable-handle]');
  if (!handle) throw new Error('Crossclimb: sortable row handle missing');
  handle.focus();
  await pressSortKey(gameDocument, handle, ' ', 'Space', 32);
  for (let i = 0; i < steps; i++) {
    await pressSortKey(gameDocument, handle, direction, direction, direction === 'ArrowUp' ? 38 : 40);
  }
  await pressSortKey(gameDocument, handle, ' ', 'Space', 32);
  await delay(150);
}

function getMiddleRows(gameDocument) {
  return [...gameDocument.querySelectorAll('[data-sortable-item="true"]')]
    .map(element => ({
      element,
      number: getRowNumber(element),
      word: readRowWord(getRowInputs(element))
    }))
    .filter(row => isMiddleRow(row.number));
}

async function pressSortKey(gameDocument, fallbackTarget, key, code, keyCode) {
  fallbackTarget.dispatchEvent(new gameDocument.defaultView.KeyboardEvent('keydown', {
    key,
    code,
    keyCode,
    which: keyCode,
    bubbles: true,
    cancelable: true,
    composed: true
  }));
  await delay(90);
}

async function revealEndRows(gameDocument) {
  for (const rowNumber of [1, 7]) {
    let row;
    for (let attempt = 0; attempt < 30; attempt++) {
      row = getRowByNumber(gameDocument, rowNumber);
      if (row && getRowInputs(row).length > 0) break;
      await delay(100);
    }
    const inputs = getRowInputs(row);
    if (!row || inputs.length === 0) {
      throw new Error(`Crossclimb: end row ${rowNumber} did not unlock`);
    }
    if (isRowComplete(row, inputs)) continue;

    inputs[0].focus();
    let active = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (getRowNumber(getActiveRow(gameDocument)) === rowNumber) {
        active = true;
        break;
      }
      await delay(100);
    }
    if (!active) {
      throw new Error(`Crossclimb: row ${rowNumber} did not become active within 3 seconds`);
    }
    const reveal = gameDocument.querySelector('button[data-control-btn="reveal"]');
    if (!reveal) throw new Error(`Crossclimb: Reveal row control missing for end row ${rowNumber}`);
    doOneClick(reveal);
    await waitForRowComplete(gameDocument, rowNumber);
    row = getRowByNumber(gameDocument, rowNumber);
    console.info('Crossclimb revealed end row:', rowNumber,
      readRowWord(getRowInputs(row)));
  }
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
