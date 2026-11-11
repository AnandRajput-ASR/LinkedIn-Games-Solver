import { autoSolve, getGridColumns } from 'wend/dom.js';
import { getGridDiv } from 'util.js';
import { loadLocalLexicon } from 'dictionary.js';
import { solveWendGrid } from 'localDictionarySolver.js';

jest.mock('util.js', () => ({ getGridDiv: jest.fn() }));
jest.mock('dictionary.js', () => ({ loadLocalLexicon: jest.fn() }));
jest.mock('localDictionarySolver.js', () => ({ solveWendGrid: jest.fn() }));

function makeGrid({
  inline = {}, computed = {}, indices = [], columns = 5,
  wordLengths = [3, 4, 5, 7], locked = false
} = {}) {
  const cells = indices.map(idx => ({
    getAttribute: name => name === 'data-cell-idx' ? String(idx) : null,
    textContent: 'A',
    getBoundingClientRect: () => ({
      left: (idx % columns) * 42,
      top: Math.floor(idx / columns) * 42,
      width: 40,
      height: 40
    })
  }));
  return {
    style: { getPropertyValue: name => inline[name] ?? '' },
    ownerDocument: {
      querySelectorAll: () => wordLengths.map(length => ({
        querySelectorAll: () => Array.from({ length }, () => ({})),
        getAttribute: name => name === 'data-locked' && locked ? 'true' : null
      })),
      defaultView: {
        getComputedStyle: jest.fn(() => ({
          getPropertyValue: name => computed[name] ?? ''
        }))
      }
    },
    querySelectorAll: () => cells,
    querySelector: () => null
  };
}

test.each(['--igtm7c', '--cols', '--grid-cols'])(
  'reads the existing inline %s property', property => {
    expect(getGridColumns(makeGrid({ inline: { [property]: '5' } }))).toBe(5);
  }
);

test.each(['--igtm7c', '--cols', '--grid-cols'])(
  'reads the computed %s property from the grid document', property => {
    const grid = makeGrid({ computed: { [property]: ' 6 ' } });
    expect(getGridColumns(grid)).toBe(6);
    expect(grid.ownerDocument.defaultView.getComputedStyle).toHaveBeenCalledWith(grid);
  }
);

test('preserves inline dimensions before consulting computed properties', () => {
  expect(getGridColumns(makeGrid({
    inline: { '--cols': '5' },
    computed: { '--igtm7c': '6' }
  }))).toBe(5);
});

test.each(['grid', 'inline-grid'])(
  'reads resolved %s tracks when CSS variable names change', display => {
    expect(getGridColumns(makeGrid({
      computed: {
        display,
        'grid-template-columns': '[start] 40px 40.5px [middle] 40px 40px 40px [end]'
      }
    }))).toBe(5);
  }
);

test('infers a sparse, non-square board from rendered cells and their indices', () => {
  expect(getGridColumns(makeGrid({
    indices: [1, 2, 3, 5, 6, 8, 9, 10, 12, 14, 16, 17, 18]
  }))).toBe(5);
});

test('tolerates subpixel differences within a rendered column', () => {
  const grid = makeGrid({ indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
  const cell = grid.querySelectorAll()[5];
  const rect = cell.getBoundingClientRect();
  cell.getBoundingClientRect = () => ({ ...rect, left: rect.left + 0.4 });
  expect(getGridColumns(grid)).toBe(5);
});

test('rejects incomplete column evidence that disagrees with the cell indices', () => {
  expect(() => getGridColumns(makeGrid({ indices: [0, 1, 5, 6] })))
    .toThrow('Wend: could not read the grid column count');
});

test.each(['', 'none', 'repeat(5, 1fr)', '40px garbage'])(
  'does not guess from an unresolved grid template: %s', template => {
    expect(() => getGridColumns(makeGrid({
      computed: { display: 'grid', 'grid-template-columns': template }
    }))).toThrow('Wend: could not read the grid column count');
  }
);

test.each(['0', '-5', '5px', '5.5', 'NaN'])(
  'rejects invalid custom property values: %s', value => {
    expect(() => getGridColumns(makeGrid({ inline: { '--cols': value } })))
      .toThrow('Wend: could not read the grid column count');
  }
);

test('does not infer dimensions from hidden cells', () => {
  const grid = makeGrid({ indices: [0, 1, 2, 3, 4] });
  for (const cell of grid.querySelectorAll()) {
    cell.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
  }
  expect(() => getGridColumns(grid)).toThrow('Wend: could not read the grid column count');
});

beforeEach(() => jest.clearAllMocks());

test.each([[3, 4, 5, 7], [4, 5, 6, 7], [4, 4, 6, 8]])(
  'autoSolve reads variable word lengths %j from slots outside the grid',
  async (...wordLengths) => {
  const tileCount = wordLengths.reduce((sum, length) => sum + length, 0);
  const grid = makeGrid({
    computed: { display: 'grid', 'grid-template-columns': '40px 40px 40px 40px 40px' },
    indices: Array.from({ length: tileCount }, (_, idx) => idx),
    wordLengths
  });
  const lexicon = { words: [] };
  const stop = new Error('stop before keyboard entry');
  getGridDiv.mockReturnValue(grid);
  loadLocalLexicon.mockResolvedValue(lexicon);
  solveWendGrid.mockImplementation(() => { throw stop; });

  await expect(autoSolve()).rejects.toBe(stop);
  expect(solveWendGrid).toHaveBeenCalledWith(
    Array.from({ length: tileCount }, (_, idx) => ({ idx, letter: 'a' })),
    5, wordLengths, lexicon
  );
});

test.each([[], [4, 0, 6, 7]])('rejects missing word slots %j', (...wordLengths) => {
  getGridDiv.mockReturnValue(makeGrid({
    inline: { '--cols': '5' }, wordLengths
  }));
  return expect(autoSolve()).rejects.toThrow('could not read the required word lengths');
});

test('reports the expected tile count from the current word slots', async () => {
  getGridDiv.mockReturnValue(makeGrid({
    inline: { '--cols': '5' },
    wordLengths: [4, 5, 6, 7],
    indices: Array.from({ length: 21 }, (_, idx) => idx)
  }));
  await expect(autoSolve()).rejects.toThrow('expected 22 letter tiles, found 21');
  expect(loadLocalLexicon).not.toHaveBeenCalled();
});

test('rejects locked word rows outside the grid before loading the dictionary', async () => {
  getGridDiv.mockReturnValue(makeGrid({
    inline: { '--cols': '5' }, locked: true
  }));
  await expect(autoSolve()).rejects.toThrow('reset the board before solving a partial game');
  expect(loadLocalLexicon).not.toHaveBeenCalled();
});
