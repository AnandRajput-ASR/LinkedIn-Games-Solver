import { solveWendGrid } from 'localDictionarySolver.js';

const lexicon = {
  words: ['ab', 'ba', 'cd', 'dc'],
  senses: {
    ab: [{words: ['ab'], definition: 'test word'}],
    ba: [{words: ['ba'], definition: 'test word'}],
    cd: [{words: ['cd'], definition: 'test word'}],
    dc: [{words: ['dc'], definition: 'test word'}]
  },
  frequencies: {}
};

test('should partition adjacent word paths when all tiles must be used', () => {
  const solution = solveWendGrid([
    {idx: 0, letter: 'A'},
    {idx: 1, letter: 'B'},
    {idx: 2, letter: 'C'},
    {idx: 3, letter: 'D'}
  ], 2, [2, 2], lexicon);

  expect(solution.map(({word}) => word)).toEqual(['ab', 'cd']);
  expect(solution.flatMap(({cellIndices}) => cellIndices).sort())
    .toEqual([0, 1, 2, 3]);
});

test('should reject a grid when the requested lengths cannot cover every tile', () => {
  expect(() => solveWendGrid([
    {idx: 0, letter: 'A'},
    {idx: 1, letter: 'B'}
  ], 2, [3], lexicon)).toThrow('word lengths do not account for every tile');
});
