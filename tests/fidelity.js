// Kiểm tra độ bám tài liệu + độ đa dạng với AI THẬT: node tests/fidelity.js [file] [số slide] [số game]
// Chạy trên BẢN SAO dữ liệu, dùng cài đặt AI hiện tại trong data/db.json.
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const file = process.argv[2] || path.join(__dirname, 'fixtures', 'airport-unit.txt');
const count = +process.argv[3] || 10, inter = +process.argv[4] || 4;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'englive-fid-'));
fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), path.join(dir, 'db.json'));
const PORT = 3950 + Math.floor(Math.random() * 40), B = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, DATA_DIR: dir }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (t, m, u, b) => (await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
(async () => {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(B + '/healthz')).ok) break; } catch {} await sleep(100); }
  const T = (await call(null, 'POST', '/api/login', { email: 'teacher@demo.com', password: '123456' })).token;
  if (process.env.MODEL) { const s = (await call(T, 'GET', '/api/ai/settings')).settings; await call(T, 'PUT', '/api/ai/settings', { ...s, active: { providerId: s.active.providerId, model: process.env.MODEL } }); }
  const src = fs.readFileSync(file, 'utf8');
  const l = (await call(T, 'POST', '/api/lessons', { title: 'Fidelity', level: 'A2', sourceText: src, sceneCount: count, interactive: inter })).lesson;
  const t0 = Date.now();
  const o = await call(T, 'POST', `/api/lessons/${l.id}/outline`, {});
  if (o.error) return console.log('OUTLINE ERROR', o.error);
  await call(T, 'POST', `/api/lessons/${l.id}/generate`);
  let les;
  while (true) { await sleep(500); les = (await call(T, 'GET', `/api/lessons/${l.id}`)).lesson; if (les.gen.state !== 'running') break; }
  console.log(`Thời gian: ${((Date.now() - t0) / 1000).toFixed(1)}s | trạng thái: ${les.gen.state} | lỗi slide: ${les.gen.failed}\n`);
  les.scenes.forEach((s, i) => {
    const detail = s.type === 'slide' ? `layout=${s.layout} ${s.rule ? 'rule ' : ''}${s.table ? 'table ' : ''}${s.dialogue && s.dialogue.length ? 'dialogue(' + s.dialogue.length + ') ' : ''}${s.passage ? 'passage ' : ''}${s.vocab.length ? 'vocab(' + s.vocab.length + ')' : ''}` : (s.question || s.sentence || s.instruction || '').slice(0, 70);
    console.log(`${String(i + 1).padStart(2)}. [${s.type}] ${s.title}  ← ${s.source || '(không có nguồn)'}\n      ${detail}`);
  });
  const all = JSON.stringify(les.scenes).toLowerCase();
  const must = ['boarding pass', 'check-in desk', 'departure gate', 'customs', 'carry-on bag', 'delayed', 'luggage cart', 'went', 'bought', 'did not', "tom", 'singapore', 'window seat', 'gate 12'];
  console.log('\nTừ/ý lấy từ tài liệu có mặt trong slide:', must.map((w) => `${w}:${all.includes(w) ? '✓' : '✗'}`).join('  '));
  const layouts = new Set(les.scenes.filter((s) => s.type === 'slide').map((s) => s.layout));
  console.log('Bố cục slide đã dùng:', [...layouts].join(', '), '| loại hoạt động:', [...new Set(les.scenes.map((s) => s.type))].join(', '));
})().finally(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(0); });
