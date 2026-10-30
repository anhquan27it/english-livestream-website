// Shared lexical checks. These check word boundaries/data availability, not sentence meaning.
(function (root) {
  const letter = /[\p{L}\p{M}\p{N}]/u;
  const connector = /['’ʼ\-‐‑]/u;
  function splitsWord(left, right) {
    if (!left || !right) return false;
    const a = [...left], b = [...right];
    if (letter.test(a.at(-1)) && letter.test(b[0])) return true;
    if (connector.test(a.at(-1)) && letter.test(a.at(-2) || '') && letter.test(b[0])) return true;
    return letter.test(a.at(-1)) && connector.test(b[0]) && letter.test(b[1] || '');
  }
  function tokens(text) {
    const normalized = String(text).toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/[‐‑]/g, '-');
    const chunks = normalized.match(/[\p{L}\p{M}\p{N}_]+(?:['-][\p{L}\p{M}\p{N}_]+)*/gu) || [];
    return [...new Set(chunks.filter(chunk => /^[a-z]+(?:['-][a-z]+)*$/.test(chunk)))];
  }
  function analyze(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) return { valid: false, reason: 'length', words: [] };
    const words = tokens(text);
    if (!words.length || (words.length === 1 && words[0].length === 1 && !['a', 'i'].includes(words[0]))) return { valid: false, reason: 'not-word', words };
    if (/^(?:https?:\/\/|www\.)\S+$/i.test(text.trim()) || /^\S+@\S+\.\S+$/.test(text.trim())) return { valid: false, reason: 'not-text', words };
    return { valid: true, words };
  }
  const api = { analyze, tokens, splitsWord };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SelectionText = api;
})(typeof window === 'object' ? window : globalThis);
