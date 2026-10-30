const assert = require('node:assert/strict');
const { analyze, tokens, splitsWord } = require('../public/js/text-selection');
for (const [left, right] of [
  ['rr', 'y,'], ['or', 'ry'], ['y', 'ing'], ['n', "'t"], ["n'", 't'],
  ['ll', '-k'], ['l-', 'kn'], ['n', '’t'], ['n’', 't'], ['ab', '12'], ['ê', 'a'],
]) assert.equal(splitsWord(left, right), true, JSON.stringify([left, right]));
for (const [left, right] of [
  ['', 'wo'], [' ', 'wo'], [" '", 'wo'], ['y', ', '], ['y', "' "], ['y ', 'to'],
  ['go', '—t'], ['!', 'Hi'], ['a', ' '], ['I', '.'],
]) assert.equal(splitsWord(left, right), false, JSON.stringify([left, right]));
for (const text of ['y,', 'r', '123', '!!!', '___', 'abc123', 'foo_bar', 'https://example.com', 'name@example.com']) assert.equal(analyze(text).valid, false, text);
for (const text of ['I', 'a', 'am', 'at', 'ry', "Don't worry,", 'Official timetables, scheduled public events.', 'A ____ concert at 8 pm.']) assert.equal(analyze(text).valid, true, text);
assert.deepEqual(tokens('“Let’s” learn, well‑known words—again!'), ["let's", 'learn', 'well-known', 'words', 'again']);
console.log('Selection checks passed: partial words, contractions, compounds, punctuation, single letters, identifiers, URLs, valid short words and paragraph tokens.');
