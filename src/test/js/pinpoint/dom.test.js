import { autoSolve } from 'pinpoint/dom.js';
import { loadLocalLexicon } from 'dictionary.js';
import { doOneClick } from 'util.js';

jest.mock('dictionary.js', () => ({ loadLocalLexicon: jest.fn() }));
jest.mock('util.js', () => ({ doOneClick: jest.fn() }));

const lexicon = { words: [], senses: {}, frequencies: {} };

function gameDocument({ hasInput = true } = {}) {
  return {
    querySelector: selector => {
      if (selector === '.pinpoint__card__answer') return {};
      if (selector.startsWith('input')) return hasInput ? {} : null;
      return null;
    },
    querySelectorAll: selector => selector === '.pinpoint__card--clue' ? [{
      innerText: '{1, 2, 3, ...}',
      querySelectorAll: () => []
    }] : []
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  loadLocalLexicon.mockResolvedValue(lexicon);
});

afterEach(() => {
  delete global.document;
});

test('requests more clues without submitting a guess for the live symbolic clue', async () => {
  global.document = gameDocument();
  await expect(autoSolve()).resolves.toEqual({
    solved: false,
    reason: 'needs-more-clues',
    clueCount: 1,
    guessesTried: 0
  });
  expect(doOneClick).not.toHaveBeenCalled();
});

test('reads clues from the same-origin Pinpoint iframe', async () => {
  global.document = {
    querySelector: () => null,
    querySelectorAll: () => [{
      src: 'https://www.linkedin.com/games/view/pinpoint/desktop',
      contentDocument: gameDocument()
    }]
  };
  await expect(autoSolve(['{1, 2, 3, ...}', 'Additional clue'])).resolves.toEqual({
    solved: false,
    reason: 'needs-more-clues',
    clueCount: 2,
    guessesTried: 0
  });
  expect(doOneClick).not.toHaveBeenCalled();
});

test('reports a missing category input explicitly', async () => {
  global.document = gameDocument({ hasInput: false });
  await expect(autoSolve()).rejects.toThrow('Pinpoint: category input was not found');
  expect(doOneClick).not.toHaveBeenCalled();
});
