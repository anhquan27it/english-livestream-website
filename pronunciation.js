// CMUdict supplies recorded lexical pronunciations in ARPABET; convert to broad US IPA.
const dictionaryReady = import('cmu-pronouncing-dictionary').then(module => module.dictionary);
const selectionText = require('./public/js/text-selection');
const phones = {
  AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', EH: 'ɛ', ER: 'ɝ',
  EY: 'eɪ', IH: 'ɪ', IY: 'i', OW: 'oʊ', OY: 'ɔɪ', UH: 'ʊ', UW: 'u',
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f', G: 'ɡ', HH: 'h', JH: 'dʒ',
  K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ', P: 'p', R: 'ɹ', S: 's', SH: 'ʃ',
  T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
};
const onsets = new Set([
  'P L','P R','P Y','B L','B R','B Y','T R','T W','T Y','D R','D W','D Y',
  'K L','K R','K W','K Y','G L','G R','G W','G Y','F L','F R','F Y',
  'V R','V Y','TH R','TH W','TH Y','SH R','SH W','HH Y','M Y','N Y','L Y',
  'S P','S T','S K','S F','S M','S N','S L','S W','S Y',
  'S P L','S P R','S P Y','S T R','S T W','S T Y','S K L','S K R','S K W','S K Y',
]);
function toIPA(arpabet) {
  const tokens = arpabet.split('#')[0].trim().split(/\s+/), marks = new Map();
  let previousVowel = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (!/[012]$/.test(tokens[i])) continue;
    const stress = tokens[i].slice(-1);
    if (stress !== '0') {
      let start = previousVowel < 0 ? 0 : i;
      if (previousVowel >= 0) {
        for (let j = i - 1; j > previousVowel; j--) {
          const cluster = tokens.slice(j, i).join(' ');
          if ((i - j === 1 && tokens[j] !== 'NG') || onsets.has(cluster)) start = j;
        }
      }
      marks.set(start, stress === '1' ? 'ˈ' : 'ˌ');
    }
    previousVowel = i;
  }
  return '/' + tokens.map((token, i) => {
    const base = token.replace(/[012]$/, '');
    if (!phones[base]) throw new Error('Unknown CMU phoneme');
    const sound = token === 'AH0' ? 'ə' : token === 'ER0' ? 'ɚ' : phones[base];
    return (marks.get(i) || '') + sound;
  }).join('') + '/';
}
function tokenize(text) {
  return selectionText.tokens(text);
}
function createPronunciation({ fetcher = fetch } = {}) {
  const remoteCache = new Map();
  async function remote(word, signal) {
    if (remoteCache.has(word)) return remoteCache.get(word);
    try {
      const response = await fetcher('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word), {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2500)]) : AbortSignal.timeout(2500),
      });
      if (!response.ok) return null;
      const entries = await response.json();
      if (!Array.isArray(entries)) return null;
      const exact = entries.filter(entry => typeof entry?.word === 'string' && entry.word.toLowerCase().replace(/[‘’ʼ]/g, "'") === word);
      const phonetics = exact.flatMap(entry => entry.phonetics || []);
      const ipa = [...new Set([...phonetics.map(item => item.text), ...exact.map(entry => entry.phonetic)].filter(value => typeof value === 'string' && value.trim()))].join(' · ');
      if (!ipa) return null;
      const candidate = phonetics.find(item => typeof item.audio === 'string' && /^(https:)?\/\//.test(item.audio))?.audio || '';
      const result = { ipa, audio: candidate.startsWith('//') ? 'https:' + candidate : candidate, source: 'dictionaryapi' };
      if (remoteCache.size >= 500) remoteCache.delete(remoteCache.keys().next().value);
      remoteCache.set(word, result);
      return result;
    } catch { return null; }
  }
  return async function pronounce(text, { signal, lookupUnknown = true } = {}) {
    if (!selectionText.analyze(text).valid) throw new Error('Invalid pronunciation input');
    const dictionary = await dictionaryReady;
    const words = tokenize(text);
    const entries = words.map(word => {
      const variants = [];
      for (const key of [word, ...Array.from({ length: 5 }, (_, i) => word + '(' + (i + 1) + ')')]) {
        if (Object.hasOwn(dictionary, key)) {
          try { variants.push(toIPA(dictionary[key])); } catch { /* Ignore a malformed variant, not the entire selection. */ }
        }
      }
      return { word, ipa: [...new Set(variants)].join(' · '), source: variants.length ? 'cmu' : null };
    });
    // Independent fallbacks: a missing word or failed request never erases other words.
    const missing = lookupUnknown ? entries.filter(entry => !entry.ipa).slice(0, 12) : [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, missing.length) }, async () => {
      while (next < missing.length && !signal?.aborted) {
        const entry = missing[next++];
        const result = await remote(entry.word, signal);
        if (result) Object.assign(entry, result);
      }
    }));
    return { entries, dialect: 'en-US', partial: entries.some(entry => !entry.ipa), recognized: entries.some(entry => entry.ipa && (entry.word.length > 1 || ['a', 'i'].includes(entry.word))) };
  };
}
module.exports = { createPronunciation, toIPA, tokenize };
