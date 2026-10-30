const assert = require('node:assert/strict');
const { createPronunciation, toIPA, tokenize } = require('../pronunciation');
const { createRouter } = require('../translationRoutes');

(async () => {
  assert.equal(toIPA('AH0 F IH1 SH AH0 L'), '/əˈfɪʃəl/');
  assert.equal(toIPA('T AY1 M T EY2 B AH0 L Z'), '/ˈtaɪmˌteɪbəlz/');
  assert.equal(toIPA('IH0 V EH1 N T S'), '/ɪˈvɛnts/');
  assert.deepEqual(tokenize('“Let’s” learn, well‑known events! Events.'), ["let's", 'learn', 'well-known', 'events']);
  let remoteCalls = 0;
  const offline = createPronunciation({ fetcher: async () => { remoteCalls++; throw Error('network unavailable'); } });
  const screenshot = await offline('Official timetables,\nscheduled public events');
  assert.equal(screenshot.entries.length, 5);
  assert.ok(screenshot.entries.every(entry => entry.ipa && entry.source === 'cmu'));
  assert.equal(remoteCalls, 0, 'Common words must work without any external request');
  const inflected = await offline("children studied wanted boxes timetables scheduled events let's well-known");
  assert.ok(inflected.entries.every(entry => entry.ipa));
  const long = await offline('English has no single future tense, but several flexible future forms. We learn English every day.');
  assert.ok(long.entries.length > 12 && long.entries.every(entry => entry.ipa));
  const partial = await offline('official qzxunknown events');
  assert.equal(partial.partial, true);
  assert.ok(partial.entries[0].ipa && partial.entries[2].ipa);
  assert.equal(partial.entries[1].ipa, '', 'Never invent IPA for unknown words');
  let attempts = 0;
  const retry = createPronunciation({ fetcher: async () => {
    if (++attempts === 1) throw Error('network');
    return { ok: true, json: async () => [{ word: 'qzxunknown', phonetic: '/test/' }] };
  } });
  assert.equal((await retry('qzxunknown')).partial, true);
  assert.equal((await retry('qzxunknown')).entries[0].ipa, '/test/');
  await retry('qzxunknown'); assert.equal(attempts, 2, 'Cache success, not network errors');
  const mismatch = createPronunciation({ fetcher: async () => ({ ok: true, json: async () => [{ word: 'worry', phonetic: '/ˈwʌɹi/' }] }) });
  assert.equal((await mismatch('qzxunknown')).recognized, false, 'Never use IPA from an unrelated dictionary headword');
  assert.equal((await offline('qzxunknown')).recognized, false);
  assert.equal((await offline('ry')).recognized, false);
  assert.equal((await offline('worry')).recognized, true);
  await assert.rejects(offline('y,'));
  assert.deepEqual(tokenize('hello—world; abc123; Lê; foo_bar'), ['hello', 'world']);
  // Every dictionary record must contain supported phonemes.
  const { dictionary } = await import('cmu-pronouncing-dictionary');
  for (const record of Object.values(dictionary)) assert.ok(toIPA(record).startsWith('/'));
  const app = require('express')(); app.use(require('express').json());
  app.use(createRouter({ pronounce: offline, auth: () => (req, res, next) => {
    if (!req.headers.authorization) return res.sendStatus(401);
    req.user = { id: 'pronunciation-test' }; next();
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/api/pronunciation';
  const post = (text, login = true) => fetch(url, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(login ? { Authorization: 'Bearer test' } : {}),
  }, body: JSON.stringify({ text }) });
  try {
    assert.equal((await post('official', false)).status, 401);
    assert.equal((await post('a'.repeat(2001))).status, 400);
    const result = await post('Official timetables, scheduled public events');
    assert.equal(result.status, 200);
    assert.equal((await result.json()).partial, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('Pronunciation checks passed: screenshot, inflections, punctuation, long text, offline lookup, partial failures, retries, cache, all ' + Object.keys(dictionary).length + ' CMU records and API validation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
