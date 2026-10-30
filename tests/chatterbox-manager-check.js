const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { createChatterbox } = require('../chatterbox');
(async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'englive-tts-'));
  const executable = path.join(home, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  fs.mkdirSync(path.dirname(executable), { recursive: true }); fs.writeFileSync(executable, '');
  fs.writeFileSync(path.join(home, 'runtime.json'), JSON.stringify({ model: 'nano' }));
  fs.mkdirSync(path.join(home, 'audio'));
  const file = 'a'.repeat(64) + '.wav';
  fs.writeFileSync(path.join(home, 'audio', file), 'RIFF0000WAVE');
  let starts = 0, warms = 0, generations = 0;
  const engine = createChatterbox({ home, spawnProcess: () => {
    starts++;
    const child = new EventEmitter(); child.stdout = new PassThrough();
    const send = message => child.stdout.write(JSON.stringify(message) + '\n');
    child.stdin = new Writable({ write(chunk, encoding, done) {
      const request = JSON.parse(chunk.toString());
      if (request.command === 'warmup') {
        warms++; send({ type: 'model', state: 'warming', model: 'nano' });
        setTimeout(() => { send({ type: 'model', state: 'ready', model: 'nano', loadMs: 8 }); send({ id: request.id, ok: true, warmed: true }); }, 10);
      } else {
        generations++; setTimeout(() => send({ id: request.id, ok: true, file }), 10);
      }
      done();
    } });
    child.kill = () => child.emit('exit', 0);
    setImmediate(() => send({ type: 'ready', model: 'nano' }));
    return child;
  } });
  try {
    const warm = engine.warmup();
    assert.strictEqual(engine.warmup(), warm, 'Deduplicate background model loading');
    await warm;
    assert.equal(engine.model(), 'nano'); assert.equal(engine.status(), 'ready');
    assert.equal(engine.details().loadMs, 8);
    const [a, b] = await Promise.all([engine.synthesize('hello'), engine.synthesize('hello')]);
    assert.ok(a.equals(b)); assert.equal(generations, 1);
    await engine.warmup();
    assert.equal(warms, 1, 'Do not reload a warm model');
    assert.equal(starts, 1, 'Keep one persistent worker');
  } finally { engine.close(); }
  console.log('Chatterbox manager checks passed: Nano identity, background load, state/timing, deduplication and persistent worker reuse.');
})().catch(error => { console.error(error); process.exitCode = 1; });
