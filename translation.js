// AnyLang is the translation library used by Linguist (translate-tools/linguist).
// This integration uses its Google provider, not the browser extension UI.
const { GoogleTranslatorTokenFree } = require('anylang/translators/GoogleTranslator');

async function providerFetch(url, { responseType, ...options }) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Translation provider unavailable');
  return {
    ok: response.ok, status: response.status, statusText: response.statusText,
    headers: new Map(response.headers), data: await response[responseType](),
  };
}

function createTranslator({ fetcher = providerFetch, now = Date.now } = {}) {
  const provider = new GoogleTranslatorTokenFree({
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
    fetcher,
  });
  const cache = new Map(), pending = new Map();
  return async function translate(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new Error('Invalid translation input');
    const key = text.trim().replace(/[^\S\r\n]+/g, ' ');
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.translation;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      const translation = await provider.translate(key, 'en', 'vi');
      if (typeof translation !== 'string' || !translation.trim() || translation.length > 6000 || /[<>]/.test(translation)) throw new Error('Invalid translation result');
      const result = translation.trim().normalize('NFC');
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(key, { translation: result, expires: now() + 3600000 });
      return result;
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  };
}
module.exports = { createTranslator };
