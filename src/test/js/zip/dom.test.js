import { autoSolve, readRenderedWalls } from 'zip/dom.js';
import { anticipateOneMutation, getGridDiv } from 'util.js';
import { solveZip } from 'zip/solver.js';

jest.mock('util.js', () => ({
  anticipateOneMutation: jest.fn().mockResolvedValue(),
  getGridDiv: jest.fn()
}));
jest.mock('zip/solver.js', () => ({
  compressSequence: jest.fn(),
  solveZip: jest.fn()
}));

function wallChild(sides = [], { content = '""', display = 'block' } = {}) {
  return { sides, content, display };
}

const view = {
  getComputedStyle: (child, pseudo) => ({
    content: pseudo === '::after' ? child.content : 'none',
    display: child.display,
    getPropertyValue: name => {
      if (name.endsWith('-width')) {
        return child.sides.some(side => name === `border-${side}-width`) ? '12px' : '0px';
      }
      return 'solid';
    }
  })
};

function cell(children = []) {
  return { children, ownerDocument: { defaultView: view } };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

test('reads live Zip pseudo-element walls, normalizing and deduplicating shared edges', () => {
  const cells = Array.from({ length: 36 }, () => cell());
  cells[3].children.push(wallChild(['bottom']));
  cells[8].children.push(wallChild(['right', 'bottom']));
  cells[9].children.push(wallChild(['left']));
  cells[13].children.push(wallChild(['right']));
  cells[14].children.push(wallChild(['left']));
  expect(readRenderedWalls(cells, 6, 6)).toEqual({
    downWalls: [3, 8], rightWalls: [8, 13]
  });
});

test('ignores absent, hidden and outer-border pseudo-elements', () => {
  const cells = [
    cell([wallChild(['top', 'left']), wallChild(['right'], { content: 'none' })]),
    cell([wallChild(['right']), wallChild(['bottom'], { display: 'none' })]),
    cell([wallChild(['bottom'])]),
    cell([wallChild(['bottom', 'right'])])
  ];
  expect(readRenderedWalls(cells, 2, 2)).toEqual({ downWalls: [], rightWalls: [] });
});

function fallbackGrid({ preselected = true, partial = false } = {}) {
  const grid = {
    style: { getPropertyValue: name => ['--rows', '--cols'].includes(name) ? '2' : '' },
    querySelectorAll: () => Array.from({ length: preselected ? (partial ? 2 : 1) : 0 }),
    children: []
  };
  grid.children = Array.from({ length: 4 }, (_, idx) => ({
    ...cell(),
    attributes: {
      getNamedItem: name => name === 'data-cell-idx' ? { value: String(idx) } : null
    },
    querySelector: selector => {
      if (selector === '[data-testid="filled-cell"]') return idx === 0 && preselected ? {} : null;
      if (selector === '.trail-cell-content') {
        return idx === 0 ? { textContent: '1' } : idx === 3 ? { textContent: '2' } : null;
      }
      return null;
    }
  }));
  return grid;
}

test.each([
  [true, false, [1, 3]],
  [false, false, [0, 1, 3]],
  [true, true, [0, 1, 3]]
])('handles preselected=%s partial=%s without waiting on a no-op first click',
  async (preselected, partial, expected) => {
    const grid = fallbackGrid({ preselected, partial });
    getGridDiv.mockImplementation(extract => extract({
      getElementById: () => null,
      querySelector: () => grid
    }));
    solveZip.mockReturnValue([0, 1, 3]);
    await autoSolve();
    expect(anticipateOneMutation.mock.calls.map(([, idx]) => idx)).toEqual(expected);
    expect(console.error).not.toHaveBeenCalled();
  }
);

test('passes rendered walls to the fallback solver', async () => {
  const grid = fallbackGrid();
  grid.children[0].children.push(wallChild(['bottom']));
  getGridDiv.mockImplementation(extract => extract({
    getElementById: () => null,
    querySelector: () => grid
  }));
  solveZip.mockReturnValue([0, 1, 3]);
  await autoSolve();
  expect(solveZip).toHaveBeenCalledWith(2, 2, [0, 3], [0], []);
});
