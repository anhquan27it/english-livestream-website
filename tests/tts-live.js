// Optional: exercises the installed local model and writes a real audio sample.
const fs = require('node:fs');
const path = require('node:path');
const { createChatterbox } = require('../chatterbox');
const engine = createChatterbox();
(async () => {
  const started = Date.now();
  const audio = await engine.synthesize("Good afternoon. Let's learn something new today.");
  if (audio.subarray(0, 4).toString() !== 'RIFF' || audio.length < 1000) throw new Error('Invalid WAV');
  const output = path.join(__dirname, '../data/chatterbox/sample.wav');
  fs.writeFileSync(output, audio);
  console.log(JSON.stringify({ provider: 'chatterbox', bytes: audio.length, elapsedMs: Date.now() - started, output }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => engine.close());
