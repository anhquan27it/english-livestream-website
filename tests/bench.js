// Đo thời gian tạo bài giảng với AI thật: node tests/bench.js [model] [sceneCount] [interactive]
// Chạy trên BẢN SAO dữ liệu, dùng cài đặt AI hiện tại trong data/db.json.
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const model = process.argv[2], count = +process.argv[3] || 10, inter = +process.argv[4] || 4;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'englive-bench-'));
fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), path.join(dir, 'db.json'));
const PORT = 3950 + Math.floor(Math.random() * 40), B = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, DATA_DIR: dir }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (t, m, u, b) => (await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
(async () => {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(B + '/healthz')).ok) break; } catch {} await sleep(100); }
  const T = (await call(null, 'POST', '/api/login', { email: 'teacher@demo.com', password: '123456' })).token;
  if (model) {
    const s = (await call(T, 'GET', '/api/ai/settings')).settings;
    await call(T, 'PUT', '/api/ai/settings', { ...s, providers: s.providers, active: { providerId: s.active.providerId, model } });
  }
  const src = 'Unit 3 - Daily routines. Vocabulary: wake up, get dressed, have breakfast, commute, usually, often, never. Grammar: Present Simple for habits; adverbs of frequency go before the main verb. Example: I usually wake up at 6 a.m. She never drinks coffee in the evening. Speaking: talk about your morning routine.';
  const l = (await call(T, 'POST', '/api/lessons', { title: 'Bench', level: 'B1', sourceText: src, sceneCount: count, interactive: inter })).lesson;
  let t0 = Date.now();
  const o = await call(T, 'POST', `/api/lessons/${l.id}/outline`, {});
  const tOutline = (Date.now() - t0) / 1000;
  if (o.error) { console.log('OUTLINE ERROR', o.error); return; }
  t0 = Date.now();
  await call(T, 'POST', `/api/lessons/${l.id}/generate`);
  let les;
  while (true) { await sleep(500); les = (await call(T, 'GET', `/api/lessons/${l.id}`)).lesson; if (les.gen.state !== 'running') break; }
  const tGen = (Date.now() - t0) / 1000;
  console.log(JSON.stringify({ model: model || '(đang dùng)', scenes: count, outlineSec: tOutline, generateSec: tGen, totalSec: +(tOutline + tGen).toFixed(1), state: les.gen.state, failed: les.gen.failed, error: les.gen.error }));
})().finally(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(0); });
