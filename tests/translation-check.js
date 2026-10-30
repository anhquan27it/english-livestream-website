const assert = require('node:assert/strict');
const { createTranslator } = require('../translation');
const { createRouter } = require('../translationRoutes');

(async () => {
  let calls = 0, time = 0;
  const translate = createTranslator({ now: () => time, fetcher: async (url, options) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get('sl'), 'en'); assert.equal(query.get('tl'), 'vi');
    assert.ok(options.headers['User-Agent']);
    calls++;
    return { ok: true, data: [query.get('q') === 'Good afternoon' ? 'Chào buổi chiều' : 'Bản dịch kiểm thử'] };
  } });
  assert.equal(await translate('Good afternoon'), 'Chào buổi chiều');
  assert.equal(await translate('Good  afternoon'), 'Chào buổi chiều');
  assert.equal(calls, 1, 'Reuse cached translation');
  time += 3600001;
  await translate('Good afternoon');
  assert.equal(calls, 2, 'Expire server cache');
  await Promise.all([translate('take off'), translate('take off')]);
  assert.equal(calls, 3, 'Deduplicate simultaneous provider calls');
  for (const data of [[], [''], ['<script>bad</script>'], { error: 'bad response' }]) {
    await assert.rejects(createTranslator({ fetcher: async () => ({ ok: true, data }) })('test'));
  }
  let attempts = 0;
  const retry = createTranslator({ fetcher: async () => {
    if (++attempts === 1) throw Error('network');
    return { ok: true, data: ['kiểm tra'] };
  } });
  await assert.rejects(retry('test'));
  assert.equal(await retry('test'), 'kiểm tra', 'Never cache provider failures');
  const paragraph = 'English has no single future tense, but several flexible future forms.\n"Will" or "going to"? Let\'s practise: I\'ll call at 5:30 (after work)!';
  let sent;
  const punctuation = createTranslator({ fetcher: async url => {
    sent = new URL(url).searchParams.get('q');
    return { ok: true, data: ['Bản dịch cả đoạn.'] };
  } });
  await punctuation(paragraph);
  assert.equal(sent, paragraph, 'Preserve commas, quotes, apostrophes, parentheses, times and paragraph breaks');
  await punctuation('English text. '.repeat(60));
  await assert.rejects(translate('a'.repeat(2001)));
  let failing = false, translationRequests = 0;
  const app = require('express')();
  app.use(require('express').json());
  app.use(createRouter({ now: () => time, pronounce: async text => ({ recognized: text !== 'qzxunknown' }),
    auth: () => (req, res, next) => {
      if (!req.headers.authorization) return res.sendStatus(401);
      req.user = { id: 'translation-test' }; next();
    },
    translate: async text => {
      translationRequests++;
      if (failing) throw Error('private provider details');
      return translate(text);
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/api/translate';
  const post = (body, loggedIn = true) => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(loggedIn ? { Authorization: 'Bearer test' } : {}) }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await post({ text: 'bank' }, false)).status, 401);
    for (const text of ['', 'a'.repeat(2001), 123, 'y,', '12345', '!!!', 'abc123']) assert.equal((await post({ text })).status, 400);
    const response = await post({ text: 'Good afternoon' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { translation: 'Chào buổi chiều', provider: 'linguist-google' });
    failing = true;
    const failure = await post({ text: 'unavailable' });
    assert.equal(failure.status, 502);
    assert.ok(!(await failure.text()).includes('private provider details'));
    failing = false;
    for (let i = 0; i < 28; i++) assert.equal((await post({ text: 'Good afternoon' })).status, 200);
    assert.equal((await post({ text: 'quota' })).status, 429);
    time += 60001;
    assert.equal((await post({ text: 'Good afternoon' })).status, 200);
    const requestsBeforeUnknown = translationRequests;
    const unknown = await post({ text: 'qzxunknown' });
    assert.equal(unknown.status, 422);
    assert.equal(translationRequests, requestsBeforeUnknown, 'Unknown text must not be sent to the translation provider');
    assert.equal((await fetch(url.replace('/api/translate', '/api/ai/translate'), { method: 'POST' })).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('AnyLang checks passed: real provider parser, language pair, cache expiry, deduplication, bad responses and retry.');
  console.log('Translation API checks passed: authentication, input, success, failure, independent rate limits and reset.');
})().catch(error => { console.error(error); process.exitCode = 1; });
