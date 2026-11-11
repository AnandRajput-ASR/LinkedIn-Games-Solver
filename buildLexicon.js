import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const wordsPath = require.resolve('an-array-of-english-words');
const wordNetPackagePath = require.resolve('wordnet-db');
const wordNetDir = join(dirname(wordNetPackagePath), 'dict');
const minWordLength = 2;
const maxWordLength = 12;

function normalizeWord(word) {
  return word.replaceAll('_', '').toLowerCase();
}

function parseSynset(line, wordSet, partOfSpeech) {
  const separator = line.indexOf('|');
  if (separator < 0) return null;

  const fields = line.slice(0, separator).trim().split(/\s+/);
  const wordCount = parseInt(fields[3], 16);
  if (!Number.isInteger(wordCount)) return null;

  const words = [];
  let cursor = 4;
  for (let i = 0; i < wordCount; i++) {
    const word = normalizeWord(fields[cursor++]);
    cursor++;
    if (wordSet.has(word) && !words.includes(word)) words.push(word);
  }
  if (words.length === 0) return null;

  const definition = line.slice(separator + 1).split(';')[0].trim();
  return { words, definition, partOfSpeech };
}

export async function buildLexicon(outputPath) {
  const allWords = JSON.parse(await fs.readFile(wordsPath, 'utf8'));
  const words = [...new Set(allWords.filter(word =>
    /^[a-z]+$/.test(word)
      && word.length >= minWordLength
      && word.length <= maxWordLength
  ))].sort();
  const wordSet = new Set(words);
  const senses = Object.create(null);
  const frequencies = Object.create(null);

  const senseIndex = await fs.readFile(join(wordNetDir, 'index.sense'), 'utf8');
  for (const line of senseIndex.split(/\r?\n/)) {
    const [senseKey, , , count] = line.split(/\s+/);
    if (!senseKey || !count) continue;
    const lemma = normalizeWord(senseKey.split('%')[0]);
    if (wordSet.has(lemma)) {
      frequencies[lemma] = (frequencies[lemma] ?? 0) + Number(count);
    }
  }

  for (const file of ['data.adj', 'data.adv', 'data.noun', 'data.verb']) {
    const partOfSpeech = file.slice('data.'.length);
    const contents = await fs.readFile(join(wordNetDir, file), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      if (!line || line.startsWith(' ')) continue;
      const synset = parseSynset(line, wordSet, partOfSpeech);
      if (!synset) continue;
      for (const word of synset.words) {
        const wordSenses = senses[word] ?? (senses[word] = []);
        if (wordSenses.length < 8) {
          wordSenses.push({
            words: synset.words,
            definition: synset.definition,
            partOfSpeech: synset.partOfSpeech
          });
        }
      }
    }
  }

  await fs.writeFile(outputPath, JSON.stringify({ words, senses, frequencies }));

  const wordListLicense = await fs.readFile(
    join(dirname(wordsPath), 'license'), 'utf8');
  const wordNetLicense = await fs.readFile(
    join(dirname(wordNetPackagePath), 'LICENSE'), 'utf8');
  await fs.writeFile(join(dirname(outputPath), 'DICTIONARY-LICENSES.txt'),
    `English word list (an-array-of-english-words)\n${wordListLicense}`
      + `\n\nWordNet database (Princeton University)\n${wordNetLicense}`);

  console.log(`Built local lexicon: ${words.length} words, `
    + `${Object.keys(senses).length} indexed entries`);
}
