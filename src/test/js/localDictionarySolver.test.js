import {
  findWordLadder,
  inferCommonTerms,
  rankPinpointProbeGuesses,
  rankWordsForClue
} from 'localDictionarySolver.js';

const lexicon = {
  words: ['woo', 'woos', 'amorous', 'romantic', 'cold', 'cord', 'card', 'ward',
    'snow', 'white'],
  senses: {
    snow: [{
      words: ['snow'],
      definition: 'precipitation of white ice crystals',
      partOfSpeech: 'noun'
    }],
    white: [{
      words: ['white'],
      definition: 'of the color of snow',
      partOfSpeech: 'adj'
    }],
    romantic: [{
      words: ['romantic', 'amorous'],
      definition: 'expressive of or exciting sexual love or romance'
    }],
    woo: [{
      words: ['woo', 'court'],
      definition: 'make amorous advances towards'
    }],
    amorous: [{
      words: ['amorous', 'romantic'],
      definition: 'inclined toward or displaying love'
    }]
  },
  frequencies: {}
};

test('should rank a local synonym when clue wording is inflected', () => {
  const candidates = rankWordsForClue(
    'Tries to win over romantically', 4, lexicon, 20);

  expect(candidates.map(candidate => candidate.word)).toContain('woos');
});

test('should find a one-letter ladder when each clue has one candidate', () => {
  const ladder = findWordLadder([
    ['cold'], ['cord'], ['card'], ['ward']
  ]);

  expect(ladder.map(candidate => candidate.word))
    .toEqual(['cold', 'cord', 'card', 'ward']);
});

test('should retain common local terms across clue expansions', () => {
  const candidates = inferCommonTerms(['romantic', 'amorous'], lexicon);

  expect(candidates.map(candidate => candidate.word))
    .toEqual(expect.arrayContaining(['romantic', 'amorous']));
});

test('should rank a local category probe from a single readable clue', () => {
  const guesses = rankPinpointProbeGuesses(['Snow'], lexicon);

  expect(guesses[0].guess).toBe('white things');
});
