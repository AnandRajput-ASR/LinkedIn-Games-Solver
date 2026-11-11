const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of',
  'on', 'or', 'the', 'to', 'up', 'with'
]);
const LOW_SIGNAL_PROBE_ADJECTIVES = new Set([
  'able', 'available', 'certain', 'different', 'english', 'general', 'good',
  'great', 'large', 'last', 'likely', 'little', 'major', 'many', 'more', 'most',
  'new', 'old', 'one', 'other', 'own', 'possible', 'public', 'same', 'small',
  'social', 'special', 'true', 'whole'
]);

export function normalizeWord(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

function letterCounts(value) {
  const counts = new Array(26).fill(0);
  for (const char of normalizeWord(value)) {
    counts[char.charCodeAt(0) - 97]++;
  }
  return counts;
}

function subtractCounts(remaining, word) {
  const counts = letterCounts(word);
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > remaining[i]) return null;
  }
  return remaining.map((count, i) => count - counts[i]);
}

function wordForms(word) {
  const forms = new Set([word, stem(word)]);
  if (word.endsWith('ies') && word.length > 4) {
    forms.add(word.slice(0, -3) + 'y');
  }
  if (word.endsWith('es') && word.length > 4) {
    forms.add(word.slice(0, -2));
  }
  if (word.endsWith('s') && word.length > 3) {
    forms.add(word.slice(0, -1));
  }
  if (word.endsWith('ed') && word.length > 4) {
    forms.add(word.slice(0, -2));
    forms.add(word.slice(0, -1));
  }
  if (word.endsWith('ing') && word.length > 5) {
    forms.add(word.slice(0, -3));
    forms.add(word.slice(0, -3) + 'e');
  }
  return [...forms];
}

function wordSenseScore(word, lexicon) {
  const senses = wordForms(word).reduce((total, form) =>
    total + (lexicon.senses[form]?.length ?? 0), 0);
  const frequency = Math.max(0, ...wordForms(word)
    .map(form => lexicon.frequencies?.[form] ?? 0));
  return Math.log1p(frequency) + senses * 0.05;
}

export function partitionWendLetters(letters, wordLengths, lexicon,
    maxSearchStates = 250000) {
  const normalizedLetters = letters.map(normalizeWord);
  if (normalizedLetters.some(letter => letter.length !== 1)) {
    throw new Error('Wend: expected one letter per tile');
  }
  if (wordLengths.reduce((total, length) => total + length, 0)
      !== normalizedLetters.length) {
    throw new Error('Wend: word lengths do not account for every tile');
  }

  const initialCounts = letterCounts(normalizedLetters.join(''));
  const groups = wordLengths.map((length, originalIndex) => ({
    length,
    originalIndex,
    candidates: lexicon.words
      .filter(word => word.length === length && lexicon.senses[word])
      .map(word => ({ word, score: wordSenseScore(word, lexicon) }))
      .filter(({ word }) => subtractCounts(initialCounts, word) !== null)
      .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
  })).sort((a, b) => a.candidates.length - b.candidates.length);

  let explored = 0;
  let bestScore = -1;
  let bestWords;
  const chosen = new Array(groups.length);
  const memo = new Map();

  function search(depth, remainingCounts, score) {
    if (++explored > maxSearchStates) return;
    if (score + (groups.length - depth) * 8 < bestScore) return;

    if (depth === groups.length) {
      if (remainingCounts.every(count => count === 0) && score > bestScore) {
        bestScore = score;
        bestWords = [...chosen];
      }
      return;
    }

    const state = `${depth}:${remainingCounts.join('')}`;
    if ((memo.get(state) ?? -1) >= score) return;
    memo.set(state, score);

    const group = groups[depth];
    for (const candidate of group.candidates) {
      const nextCounts = subtractCounts(remainingCounts, candidate.word);
      if (!nextCounts) continue;
      chosen[depth] = { ...candidate, originalIndex: group.originalIndex };
      search(depth + 1, nextCounts, score + candidate.score);
    }
  }

  search(0, initialCounts, 0);
  if (!bestWords) {
    throw new Error(explored > maxSearchStates
      ? 'Wend: search limit reached before finding a complete partition'
      : 'Wend: no dictionary partition uses every tile exactly once');
  }

  return bestWords.sort((a, b) => a.originalIndex - b.originalIndex)
    .map(({ word }) => word);
}

export function solveWendGrid(tiles, columns, wordLengths, lexicon,
    maxSearchStates = 250000) {
  if (!Number.isInteger(columns) || columns < 1) {
    throw new Error('Wend: invalid grid column count');
  }
  if (wordLengths.reduce((total, length) => total + length, 0) !== tiles.length) {
    throw new Error('Wend: word lengths do not account for every tile');
  }

  const tileLetters = new Map(tiles.map(({ idx, letter }) => {
    const normalized = normalizeWord(letter);
    if (!Number.isInteger(idx) || normalized.length !== 1) {
      throw new Error('Wend: invalid tile index or letter');
    }
    return [idx, normalized];
  }));
  const neighbors = new Map();
  for (const idx of tileLetters.keys()) {
    const row = Math.floor(idx / columns);
    const col = idx % columns;
    const adjacent = [];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const neighborRow = row + dr;
      const neighborCol = col + dc;
      const neighborIdx = neighborRow * columns + neighborCol;
      if (neighborRow >= 0 && neighborCol >= 0 && neighborCol < columns
          && tileLetters.has(neighborIdx)) {
        adjacent.push(neighborIdx);
      }
    }
    neighbors.set(idx, adjacent);
  }

  const groups = wordLengths.map((length, originalIndex) => {
    const dictionary = new Set(lexicon.words.filter(word => word.length === length));
    const candidates = [];
    const seenPaths = new Set();

    function walk(idx, path, letters) {
      const nextLetters = letters + tileLetters.get(idx);
      const nextPath = [...path, idx];
      if (nextPath.length === length) {
        if (dictionary.has(nextLetters)) {
          const pathKey = [...nextPath].sort((a, b) => a - b).join(',');
          const candidateKey = `${nextLetters}:${pathKey}`;
          if (!seenPaths.has(candidateKey)) {
            seenPaths.add(candidateKey);
            candidates.push({
              word: nextLetters,
              cellIndices: nextPath,
              mask: nextPath.reduce((value, cellIdx) => value | (1 << cellIdx), 0),
              score: wordSenseScore(nextLetters, lexicon)
            });
          }
        }
        return;
      }
      for (const nextIdx of neighbors.get(idx)) {
        if (!nextPath.includes(nextIdx)) walk(nextIdx, nextPath, nextLetters);
      }
    }

    for (const idx of tileLetters.keys()) walk(idx, [], '');
    return { length, originalIndex, candidates };
  }).sort((a, b) => a.candidates.length - b.candidates.length);

  if (groups.some(group => group.candidates.length === 0)) {
    throw new Error('Wend: no dictionary paths found for one or more word lengths');
  }

  const fullMask = [...tileLetters.keys()]
    .reduce((mask, idx) => mask | (1 << idx), 0);
  const chosen = new Array(groups.length);
  const memo = new Map();
  let bestScore = -1;
  let bestSolution;
  let explored = 0;

  function search(depth, occupiedMask, score) {
    if (++explored > maxSearchStates) return;
    if (depth === groups.length) {
      if (occupiedMask === fullMask && score > bestScore) {
        bestScore = score;
        bestSolution = [...chosen];
      }
      return;
    }
    if (score + (groups.length - depth) * 20 < bestScore) return;
    const state = `${depth}:${occupiedMask}`;
    if ((memo.get(state) ?? -1) >= score) return;
    memo.set(state, score);

    for (const candidate of groups[depth].candidates) {
      if ((occupiedMask & candidate.mask) !== 0) continue;
      chosen[depth] = { ...candidate, originalIndex: groups[depth].originalIndex };
      search(depth + 1, occupiedMask | candidate.mask, score + candidate.score);
    }
  }

  search(0, 0, 0);
  if (!bestSolution) {
    throw new Error(explored > maxSearchStates
      ? 'Wend: search limit reached before finding a complete tile partition'
      : 'Wend: no disjoint dictionary paths cover every tile');
  }
  return bestSolution.sort((a, b) => a.originalIndex - b.originalIndex)
    .map(({ word, cellIndices }) => ({ word, cellIndices }));
}

function tokenize(value) {
  return String(value ?? '').toLowerCase().match(/[a-z]+/g) ?? [];
}

function stem(token) {
  if (token.length > 7 && token.endsWith('ically')) {
    return token.slice(0, -6) + 'ic';
  }
  if (token.length > 5 && token.endsWith('ly')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('ies')) return token.slice(0, -3) + 'y';
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')
      && !token.endsWith('ous') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

function clueTerms(clue, senses) {
  const terms = new Set();
  for (const rawToken of tokenize(clue)) {
    const token = stem(rawToken);
    if (!token || STOP_WORDS.has(token)) continue;
    terms.add(token);
    for (const sense of senses[token] ?? []) {
      for (const synonym of sense.words) terms.add(synonym);
      for (const definitionToken of tokenize(sense.definition)) {
        if (!STOP_WORDS.has(definitionToken)) terms.add(stem(definitionToken));
      }
    }
  }
  return terms;
}

function scoreWord(word, literalTerms, relatedTerms, lexicon) {
  let bestScore = 0;
  for (const form of wordForms(word)) {
    for (const sense of lexicon.senses[form] ?? []) {
      let score = 0;
      for (const synonym of sense.words) {
        if (literalTerms.has(synonym)) score += synonym === form ? 8 : 5;
        else if (relatedTerms.has(synonym)) score += 2;
      }
      for (const token of tokenize(sense.definition)) {
        const normalized = stem(token);
        if (literalTerms.has(normalized)) score += 4;
        else if (relatedTerms.has(normalized)) score += 1;
      }
      score += Math.log1p(Math.max(0, lexicon.frequencies?.[form] ?? 0)) * 0.1;
      bestScore = Math.max(bestScore, score);
    }
  }
  return bestScore;
}

export function rankWordsForClue(clue, length, lexicon, limit = 20) {
  const literalTerms = new Set(tokenize(clue).map(stem)
    .filter(token => !STOP_WORDS.has(token)));
  const expandedClue = clueTerms(clue, lexicon.senses);
  return lexicon.words
    .filter(word => word.length === length)
    .map(word => ({
      word,
      score: scoreWord(word, literalTerms, expandedClue, lexicon)
    }))
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
    .slice(0, limit);
}

export function findWordLadder(candidateGroups, maxCandidatesPerClue = 300,
  maxSearchStates = 100000) {
  const groups = candidateGroups.map(group => group
    .slice(0, maxCandidatesPerClue)
    .map(candidate => typeof candidate === 'string'
      ? candidate.toLowerCase()
      : candidate.word.toLowerCase()));
  const path = [];
  const used = new Set();
  let explored = 0;

  function search() {
    if (++explored > maxSearchStates) return null;
    if (path.length === groups.length) return [...path];
    const candidates = path.length === 0
      ? groups.flatMap((group, groupIndex) => group.map(word => ({ word, groupIndex })))
      : groups.flatMap((group, groupIndex) => group
        .filter(word => differsByOne(path[path.length - 1].word, word))
        .map(word => ({ word, groupIndex })));

    for (const candidate of candidates) {
      if (used.has(candidate.groupIndex) || used.has(`${candidate.groupIndex}:${candidate.word}`)) {
        continue;
      }
      used.add(candidate.groupIndex);
      used.add(`${candidate.groupIndex}:${candidate.word}`);
      path.push(candidate);
      const result = search();
      if (result) return result;
      path.pop();
      used.delete(candidate.groupIndex);
      used.delete(`${candidate.groupIndex}:${candidate.word}`);
    }
    return null;
  }

  return search();
}

function differsByOne(first, second) {
  if (first.length !== second.length) return false;
  let differences = 0;
  for (let i = 0; i < first.length; i++) {
    if (first[i] !== second[i] && ++differences > 1) return false;
  }
  return differences === 1;
}

export function inferCommonTerms(clues, lexicon, limit = 20) {
  if (clues.length === 0) return [];
  const expanded = clues.map(clue => clueTerms(clue, lexicon.senses));
  const candidates = new Set(expanded[0]);
  for (const terms of expanded.slice(1)) {
    for (const candidate of candidates) {
      if (!terms.has(candidate)) candidates.delete(candidate);
    }
  }
  return [...candidates]
    .map(word => ({
      word,
      score: expanded.reduce((sum, terms) => sum + (terms.has(word) ? 1 : 0), 0)
        + wordSenseScore(word, lexicon) / 10
    }))
    .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
    .slice(0, limit);
}

export function rankPinpointProbeGuesses(clues, lexicon, limit = 10) {
  const candidates = inferCommonTerms(clues, lexicon, 80);
  const guesses = new Map();
  for (const candidate of candidates) {
    if (LOW_SIGNAL_PROBE_ADJECTIVES.has(candidate.word)) continue;
    const senses = lexicon.senses[candidate.word] ?? [];
    if (!senses.some(sense => sense.partOfSpeech === 'adj')) continue;
    const phrases = [
      { guess: `${candidate.word} things`, bonus: 0.01 },
      { guess: `things that are ${candidate.word}`, bonus: 0 }
    ];
    for (const {guess, bonus} of phrases) {
      if (!guesses.has(guess)) {
        guesses.set(guess, { guess, score: candidate.score + bonus });
      }
    }
  }
  return [...guesses.values()]
    .sort((a, b) => b.score - a.score || a.guess.localeCompare(b.guess))
    .slice(0, limit);
}
