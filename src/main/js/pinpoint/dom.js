import { loadLocalLexicon } from '../dictionary.js';
import { rankPinpointProbeGuesses } from '../localDictionarySolver.js';
import { doOneClick } from '../util.js';

const MAX_PROBE_GUESSES = 3;

export async function autoSolve(providedClues = []) {
  let gameDocument = getGameDocument();
  let clues = mergeClues(readVisibleTextClues(gameDocument), providedClues);
  const lexicon = await loadLocalLexicon();
  const input = gameDocument.querySelector(
    'input.pinpoint__input, input[placeholder*="Guess the category"]');
  if (!input) throw new Error('Pinpoint: category input was not found');

  const attemptedGuesses = new Set();
  let lastGuess = '';
  for (let attempt = 0; attempt < MAX_PROBE_GUESSES; attempt++) {
    const candidate = rankPinpointProbeGuesses(clues, lexicon, 20)
      .find(entry => !attemptedGuesses.has(normalizeClue(entry.guess)));
    if (!candidate) {
      return {
        solved: false,
        reason: 'needs-more-clues',
        clueCount: clues.length,
        guessesTried: attemptedGuesses.size
      };
    }

    lastGuess = candidate.guess;
    attemptedGuesses.add(normalizeClue(lastGuess));
    console.info('Pinpoint local probe guess:', lastGuess, 'from clues:', clues);
    gameDocument = getGameDocument();
    const activeInput = gameDocument.querySelector(
      'input.pinpoint__input, input[placeholder*="Guess the category"]');
    if (!activeInput) throw new Error('Pinpoint: category input was not found');
    setInputValue(activeInput, lastGuess);
    const submit = await waitForGuessButton(gameDocument);
    if (!submit) throw new Error('Pinpoint: Guess button did not appear after entering a category');
    doOneClick(submit);

    const outcome = await waitForGuessOutcome(clues.length);
    gameDocument = getGameDocument();
    if (outcome.solved) return { solved: true, category: lastGuess };

    const updatedClues = mergeClues(
      readVisibleTextClues(gameDocument), providedClues);
    if (updatedClues.length > clues.length) {
      clues = updatedClues;
      continue;
    }

    return {
      solved: false,
      reason: 'guess-did-not-reveal-clue',
      clueCount: clues.length,
      guessesTried: attemptedGuesses.size,
      lastGuess
    };
  }

  return {
    solved: false,
    reason: 'probe-limit-reached',
    clueCount: clues.length,
    guessesTried: attemptedGuesses.size,
    lastGuess
  };
}

async function waitForGuessButton(gameDocument) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const button = gameDocument.querySelector('.pinpoint__submit-btn');
    if (button && !button.disabled) return button;
    await delay(100);
  }
  return null;
}

function getGameDocument() {
  if (document.querySelector('.pinpoint__card__answer')) return document;
  const frame = [...document.querySelectorAll('iframe')]
    .find(candidate => candidate.src.includes('/games/view/pinpoint/'));
  return frame?.contentDocument ?? document;
}

function readVisibleTextClues(gameDocument) {
  const selectors = [
    '.pinpoint__card--clue',
    '[data-testid*="pinpoint-clue"]',
    '[aria-label*="clue" i]'
  ];
  const elements = selectors.flatMap(selector =>
    [...gameDocument.querySelectorAll(selector)]);
  return mergeClues(elements.map(element => {
    const imageText = [...element.querySelectorAll('img')]
      .map(image => image.alt || image.getAttribute('aria-label') || '')
      .join(' ');
    return (element.innerText || element.textContent || imageText).trim();
  }).filter(text => text && !/^clue\s*\d+$/i.test(text) && text !== 'Aha!'));
}

function mergeClues(...groups) {
  const unique = new Map();
  for (const clue of groups.flat()) {
    const text = String(clue ?? '').trim();
    const key = normalizeClue(text);
    if (key && !unique.has(key)) unique.set(key, text);
  }
  return [...unique.values()];
}

function normalizeClue(clue) {
  return String(clue ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function waitForGuessOutcome(previousClueCount) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const gameDocument = getGameDocument();
    const text = gameDocument.body?.innerText ?? '';
    const href = gameDocument.defaultView?.location?.href ?? '';
    if (href.includes('/results/') || /Solved in \d+ guesses?/i.test(text)) {
      return { solved: true };
    }
    if (readVisibleTextClues(gameDocument).length > previousClueCount) {
      return { solved: false, revealed: true };
    }
    await delay(100);
  }
  return { solved: false, revealed: false };
}

function setInputValue(input, value) {
  const view = input.ownerDocument.defaultView;
  const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype,
    'value').set;
  setter.call(input, value);
  input.dispatchEvent(new view.InputEvent('input', {
    bubbles: true,
    data: value,
    inputType: 'insertText'
  }));
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
