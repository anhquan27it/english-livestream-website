const assert = require('node:assert/strict');
const express = require('express');
const { createRouter } = require('../ttsRoutes');
(async () => {
  let text, fail = false, preloaded = false;
  const app = express(); app.use(express.json());
  app.use(createRouter({ preload: true, auth: () => (req, res, next) => req.headers.authorization ? next() : res.sendStatus(401), engine: {
    warmup: async () => { preloaded = true; },
    status: () => 'ready', synthesize: async value => {
      text = value;
      if (fail) throw Error('Giọng đọc đang bận. Hãy thử lại.');
      return Buffer.from('RIFF0000WAVE');
    },
  } }));
  assert.equal(preloaded, true, 'Start background loading when enabled');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (value, login = true) => fetch(base + '/api/tts', { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(login ? { Authorization: 'Bearer test' } : {}),
  }, body: JSON.stringify({ text: value }) });
  try {
    assert.equal((await post('hello', false)).status, 401);
    for (const value of ['', 'a'.repeat(2001), 123, '!!!']) assert.equal((await post(value)).status, 400);
    const input = 'Hello, world!\nLet’s learn English.';
    const response = await post(input);
    assert.equal(response.status, 200); assert.equal(text, input);
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    assert.equal(response.headers.get('x-tts-provider'), 'chatterbox');
    assert.equal(response.headers.get('x-tts-model'), 'nano');
    assert.ok(Buffer.from(await response.arrayBuffer()).subarray(0, 4).equals(Buffer.from('RIFF')));
    fail = true; assert.equal((await post('hello')).status, 503);
    const status = await fetch(base + '/api/tts/status', { headers: { Authorization: 'Bearer test' } });
    assert.deepEqual(await status.json(), { provider: 'chatterbox', model: 'nano', state: 'ready' });
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('TTS API checks passed: auth, input, punctuation, WAV response, provider status and generation failure.');
})().catch(error => { console.error(error); process.exitCode = 1; });
