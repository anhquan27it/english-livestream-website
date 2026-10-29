// Smoke test end-to-end: mock LLM + server thật + socket.io-client.   Chạy: npm test
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { TokenVerifier } = require('livekit-server-sdk');
const LK_SECRET = 'smoke-test-livekit-secret-0123456789abcdef';
const lkVerify = async (jwt) => (await new TokenVerifier('testkey', LK_SECRET).verify(jwt)).video;
const { createServer } = require('./mock-llm');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'englive-'));
let server, mock, mediaMock, passed = 0;
const mediaCalls = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(token, method, url, body, raw) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(raw ? { 'X-Filename': raw.name } : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: raw ? raw.buffer : body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const login = async (email, password = '123456') => (await api(null, 'POST', '/api/login', { email, password })).body.token;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n', e); throw e; }
}
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(BASE, { auth: { token }, transports: ['websocket'] });
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});
const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));
const nextEvent = (s, ev, pred = () => true, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout waiting ' + ev)), ms);
  const h = (d) => { if (pred(d)) { clearTimeout(t); s.off(ev, h); resolve(d); } };
  s.on(ev, h);
});

// PDF tối giản chứa văn bản (pdf.js tự dựng lại xref nếu cần)
function tinyPdf(text) {
  const stream = `BT /F1 18 Tf 50 700 Td (${text}) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

async function main() {
  mock = createServer();
  await new Promise((r) => mock.listen(0, r));
  mediaMock = require('http').createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => { mediaCalls.push({ path: req.url, body: JSON.parse(body || '{}') }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); }); });
  await new Promise(r => mediaMock.listen(0, '127.0.0.1', r));
  const mediaUrl = 'ws://127.0.0.1:' + mediaMock.address().port;
  process.env.MOCK_KEY = 'secret-test-key';
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;
  const bootstrap = spawnSync(process.execPath, ['scripts/create-admin.js', 'admin@test.com'], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATA_DIR: dataDir, ADMIN_PASSWORD: 'admin-test-password' }, encoding: 'utf8' });
  assert.equal(bootstrap.status, 0, bootstrap.stderr);
  if(process.env.TEST_POSTGRES==='1') {
    const activation=spawnSync(process.execPath,['scripts/activate-postgres.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dataDir},encoding:'utf8',timeout:30000});
    assert.equal(activation.status,0,activation.stderr);
  }
  const serverOptions = {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT, DATA_DIR: dataDir, AI_BASE_URL: mockUrl, AI_API_KEY: 'secret-test-key', AI_MODEL: 'ag/gemini-3.8-flash-high', LIVEKIT_URL: mediaUrl, LIVEKIT_API_KEY: 'testkey', LIVEKIT_API_SECRET: LK_SECRET },
    stdio: ['ignore', 'inherit', 'inherit'],
  };
  server = spawn(process.execPath, ['server.js'], serverOptions);
  for (let i = 0; i < 200; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch {} await sleep(100); }

  const T = await login('teacher@demo.com');
  const A = await login('admin@test.com', 'admin-test-password');
  const S1 = await login('student1@demo.com');
  const S3 = await login('student3@demo.com'); // đang chờ duyệt ở lớp A2, không thuộc lớp IELTS
  const classes = (await api(T, 'GET', '/api/classes')).body.classes;
  const ielts = classes.find((c) => c.name.startsWith('IELTS'));

  console.log('Cài đặt AI');
  await test('học sinh không xem/sửa được cài đặt AI', async () => {
    assert.equal((await api(S1, 'GET', '/api/ai/settings')).status, 403);
    assert.equal((await api(S1, 'PUT', '/api/ai/settings', {})).status, 403);
  });
  await test('mặc định 9Router + model gemini-3.8-flash-high, không lộ khoá', async () => {
    const { settings } = (await api(A, 'GET', '/api/ai/settings')).body;
    assert.equal(settings.active.model, 'ag/gemini-3.8-flash-high');
    assert.equal(settings.providers[0].hasKey, true);
    assert.ok(!JSON.stringify(settings).includes('secret-test-key'));
  });
  await test('test kết nối + lấy danh sách model', async () => {
    const r = await api(A, 'POST', '/api/ai/test', { providerId: '9router', model: 'ag/gemini-3.8-flash-high' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.reply, 'OK');
    const m = await api(A, 'GET', '/api/ai/models/9router');
    assert.deepEqual(m.body.models, ['ag/gemini-3.8-flash-high', 'ag/gemini-3.8-flash-low']);
  });
  await test('sai khoá API báo lỗi rõ ràng; thêm nhà cung cấp thứ hai giữ nguyên khoá cũ', async () => {
    const { settings } = (await api(A, 'GET', '/api/ai/settings')).body;
    const bad = settings.providers.map((p) => ({ ...p, apiKey: 'wrong' }));
    const put = await api(A, 'PUT', '/api/ai/settings', { providers: bad, active: settings.active });
    assert.equal(put.status, 200);
    const r = await api(A, 'POST', '/api/ai/test', { providerId: '9router', model: 'x' });
    assert.equal(r.status, 502);
    assert.match(r.body.error, /khoá API/);
    // gửi lại không kèm apiKey -> giữ "wrong"; khôi phục khoá đúng và thêm provider
    const good = (await api(A, 'PUT', '/api/ai/settings', { providers: [{ id: '9router', name: '9Router', baseUrl: mockUrl, apiKey: 'secret-test-key', models: ['ag/gemini-3.8-flash-high'] }, { name: 'Khác', baseUrl: 'localhost:11434', models: ['llama'] }], active: settings.active })).body.settings;
    assert.equal(good.providers.length, 2);
    assert.equal(good.providers[1].baseUrl, 'http://localhost:11434/v1');
    assert.equal((await api(A, 'POST', '/api/ai/test', { providerId: '9router', model: 'x' })).status, 200);
  });

  console.log('Soạn bài giảng');
  let lessonId, scenes;
  await test('upload PDF → trích văn bản', async () => {
    const r = await api(T, 'POST', '/api/lessons/upload', null, { name: encodeURIComponent('travel.pdf'), buffer: tinyPdf('Travel vocabulary: airport ticket luggage') });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.text, /airport/);
    const bad = await api(T, 'POST', '/api/lessons/upload', null, { name: 'x.exe', buffer: Buffer.from('MZ...') });
    assert.equal(bad.status, 400);
  });
  await test('tạo bài → outline → sinh nội dung nền → lưu', async () => {
    const created = await api(T, 'POST', '/api/lessons', { title: 'Travel English', level: 'A2', topic: 'Du lịch', sourceText: 'Travel vocabulary: airport ticket luggage', sceneCount: 6, interactive: 3, classIds: [ielts.id] });
    assert.equal(created.status, 200);
    lessonId = created.body.lesson.id;
    const o = await api(T, 'POST', `/api/lessons/${lessonId}/outline`, {});
    assert.equal(o.status, 200, JSON.stringify(o.body));
    assert.equal(o.body.lesson.outline.length, 6);
    assert.equal((await api(T, 'POST', `/api/lessons/${lessonId}/generate`)).status, 202);
    let lesson;
    for (let i = 0; i < 50; i++) { lesson = (await api(T, 'GET', `/api/lessons/${lessonId}`)).body.lesson; if (lesson.gen.state !== 'running') break; await sleep(100); }
    assert.equal(lesson.gen.state, 'done');
    assert.equal(lesson.scenes.length, 6);
    assert.ok(lesson.scenes.some((s) => s.type === 'quiz') && lesson.scenes[0].type === 'slide');
    scenes = lesson.scenes;
  });
  await test('chủ đề không phải tiếng Anh bị từ chối ở bước outline (HTTP 422)', async () => {
    const l = (await api(T, 'POST', '/api/lessons', { title: 'Toán lớp 9', topic: 'OFFTOPIC dạy giải phương trình bậc hai', sceneCount: 6 })).body.lesson;
    const o = await api(T, 'POST', `/api/lessons/${l.id}/outline`, {});
    assert.equal(o.status, 422);
    assert.match(o.body.error, /không phải bài học tiếng Anh/);
    await api(T, 'DELETE', `/api/lessons/${l.id}`);
  });
  await test('bài giảng đa dạng bố cục, có nguồn, và mỗi slide chỉ nhận đúng phần tài liệu', async () => {
    const layouts = new Set(scenes.filter((s) => s.type === 'slide').map((s) => s.layout));
    assert.ok(layouts.size >= 3, 'nhiều bố cục khác nhau: ' + [...layouts]);
    const rule = scenes.find((s) => s.layout === 'rule');
    assert.ok(rule && rule.rule.formula && rule.rule.examples.length, 'slide quy tắc có công thức + ví dụ');
    // bảng/bài đọc được lưu và chuẩn hoá đúng qua PUT
    const custom = { id: 's_custom', type: 'slide', title: 'Table', layout: 'table', table: { headers: ['Verb', 'Past'], rows: [['go', 'went'], ['', ''], ['buy', 'bought']] }, passage: 'A **key** word', bullets: [] };
    const saved = (await api(T, 'PUT', `/api/lessons/${lessonId}`, { scenes: [...scenes, custom] })).body.lesson.scenes.pop();
    assert.deepEqual(saved.table.rows, [['go', 'went'], ['buy', 'bought']]);
    assert.equal(saved.passage, 'A **key** word');
    await api(T, 'PUT', `/api/lessons/${lessonId}`, { scenes });
    assert.ok(scenes.find((s) => s.layout === 'dialogue').dialogue.length >= 2);
    assert.ok(scenes.every((s) => s.source === 'Section 1'), 'mỗi slide ghi phần tài liệu nguồn');
    assert.ok(scenes.filter((s) => s.type === 'slide').every((s) => /[excerpt:true]/.test(s.note)), 'prompt từng slide chứa đoạn trích tài liệu');
  });
  await test('sinh lại một slide với yêu cầu riêng', async () => {
    const r = await api(T, 'POST', `/api/lessons/${lessonId}/scenes/${scenes[0].id}/regenerate`, { instruction: 'Làm dễ hơn' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.scene.id, scenes[0].id);
  });
  await test('giáo viên khác/học sinh không truy cập được bài giảng', async () => {
    assert.equal((await api(S1, 'GET', `/api/lessons/${lessonId}`)).status, 403);
    const registered = await api(null, 'POST', '/api/register', { name: 'Other T', email: 'other@t.com', password: '123456', role: 'teacher' });
    assert.equal(registered.status, 202);
    assert.equal((await api(null, 'POST', '/api/login', { email: 'other@t.com', password: '123456' })).status, 403);
    const overview = (await api(A, 'GET', '/api/admin/overview')).body;
    const pending = overview.users.find(u => u.email === 'other@t.com');
    await api(A, 'PATCH', '/api/admin/users/' + pending.id, { status: 'active' });
    const other = await login('other@t.com');
    assert.equal((await api(other, 'GET', `/api/lessons/${lessonId}`)).status, 404);
  });

  console.log('Trình chiếu & hoạt động trực tiếp');
  const quizIdx = scenes.findIndex((s) => s.type === 'quiz');
  const quiz = scenes[quizIdx];
  console.log('LiveKit (token & quyền)');
  await test('cấu hình LiveKit hiển thị cho trình duyệt; chưa lên sóng thì không cấp token', async () => {
    const cfg = (await api(S1, 'GET', '/api/config')).body.livekit;
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.url, mediaUrl);
    assert.equal((await api(S1, 'GET', '/api/config')).body.livekit.secret, undefined);
    assert.equal((await api(T, 'POST', '/api/livekit/token', { classId: ielts.id })).status, 409);
    assert.equal((await api(null, 'POST', '/api/livekit/token', { classId: ielts.id })).status, 401);
  });
  await test('học sinh ngoài lớp không vào được phòng/chat AI', async () => {
    await api(T, 'POST', `/api/classes/${ielts.id}/live`, { title: 'Live test' });
    const s3 = await connect(S3);
    const r = await emit(s3, 'room:join', { classId: ielts.id });
    assert.ok(r.error);
    s3.close();
    assert.equal((await api(S3, 'POST', '/api/ai/chat', { classId: ielts.id, message: 'hi' })).status, 403);
  });
  await test('token bị từ chối khi chưa tham gia phòng và khi không có socket cùng phiên', async () => {
    assert.equal((await api(T, 'POST', '/api/livekit/token', { classId: ielts.id })).status, 403);
    assert.equal((await api(S1, 'POST', '/api/livekit/token', { classId: ielts.id })).status, 403);
    assert.equal((await api(A, 'POST', '/api/livekit/token', { classId: ielts.id })).status, 403);
  });
  const ts = await connect(T);
  const ss = await connect(S1);
  const tj = await emit(ts, 'room:join', { classId: ielts.id });
  await test('học sinh chưa thấy bài giảng; giáo viên bắt đầu chiếu', async () => {
    assert.ok(tj.ok);
    const sj = await emit(ss, 'room:join', { classId: ielts.id });
    assert.equal(sj.lesson, null);
    const got = nextEvent(ss, 'lesson:state', (s) => s && s.index === 0);
    assert.ok((await emit(ts, 'lesson:present', { lessonId })).ok);
    const st = await got;
    assert.equal(st.total, 6);
    assert.equal(st.scene.type, 'slide');
    assert.equal((await emit(ss, 'lesson:present', { lessonId })).error !== undefined, true, 'học sinh không được điều khiển');
  });
  await test('token LiveKit: giáo viên được phát, học sinh chỉ xem; người ngoài lớp bị từ chối', async () => {
    const secondSession = await login('student1@demo.com');
    assert.equal((await api(secondSession, 'POST', '/api/livekit/token', { classId: ielts.id })).status, 403);
    const tt = (await api(T, 'POST', '/api/livekit/token', { classId: ielts.id })).body;
    const tc = await lkVerify(tt.token);
    assert.equal(tc.room, 'cls_' + ielts.id);
    assert.equal(tc.canPublish, true);
    const st = (await api(S1, 'POST', '/api/livekit/token', { classId: ielts.id })).body;
    const sc = await lkVerify(st.token);
    assert.equal(sc.room, 'cls_' + ielts.id);
    assert.ok(!sc.canPublish, 'học sinh không được phát khi chưa được cho phát biểu');
    assert.equal(sc.canSubscribe, true);
    assert.equal(st.identity, (await api(S1, 'GET', '/api/me')).body.user.id);
    assert.equal((await api(S3, 'POST', '/api/livekit/token', { classId: ielts.id })).status, 403);
    assert.equal((await api(S1, 'POST', '/api/livekit/token', { classId: ielts.id, groupId: 'g1' })).status, 404, 'chưa có phòng nhóm');
  });
  await test('giáo viên thấy trước slide tiếp theo (đầy đủ); học sinh không nhận nội dung slide sau', async () => {
    const tGot = nextEvent(ts, 'lesson:state', (s) => s && s.index === 1);
    const sGot = nextEvent(ss, 'lesson:state', (s) => s && s.index === 1);
    ts.emit('slide:goto', { index: 1 });
    const [tst, sst] = [await tGot, await sGot];
    assert.equal(tst.nextScene.id, scenes[2].id);
    assert.ok(!('nextScene' in sst) && !JSON.stringify(sst).includes(scenes[2].id), 'học sinh không nhận slide sau');
    const last = nextEvent(ts, 'lesson:state', (s) => s && s.index === 5);
    ts.emit('slide:goto', { index: 5 });
    assert.equal((await last).nextScene, null, 'slide cuối không có slide tiếp theo');
    const back = nextEvent(ts, 'lesson:state', (s) => s && s.index === 0);
    ts.emit('slide:goto', { index: 0 });
    await back;
  });
  await test('chat AI trong buổi live biết slide hiện tại và KHÔNG lộ đáp án quiz chưa chốt', async () => {
    const r = await api(S1, 'POST', '/api/ai/chat', { classId: ielts.id, message: 'What is luggage?' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.reply, /\[ctx:correct=0\]/);
    assert.match(r.body.reply, /\[slide:true\]/);
    assert.match(r.body.reply, /\[scope:true\]/, 'prompt phải có luật phạm vi (chỉ tiếng Anh/bài học)');
  });
  await test('quiz: bắt đầu → trả lời → học sinh không nhận đáp án trước khi chốt', async () => {
    const started = nextEvent(ss, 'lesson:state', (s) => s && s.activity && s.activity.phase === 'open');
    emit(ts, 'slide:goto', { index: quizIdx });
    await sleep(100);
    ts.emit('activity:start');
    const st = await started;
    assert.equal(st.scene.answer, undefined);
    assert.equal(st.activity.play.options.length, 4);
    assert.ok(!JSON.stringify(st).includes('"answer"') && !JSON.stringify(st).includes('explanation'));
    const stats = nextEvent(ts, 'activity:stats', (x) => x.answered === 1);
    const ack = await emit(ss, 'activity:answer', { answer: quiz.answer });
    assert.ok(ack.ok);
    assert.equal((await stats).distribution[quiz.answer], 1);
    assert.ok((await emit(ss, 'activity:answer', { answer: 1 })).error, 'không trả lời hai lần');
  });
  await test('chốt hoạt động → đáp án + điểm + bảng xếp hạng', async () => {
    const ended = nextEvent(ss, 'lesson:state', (s) => s && s.activity && s.activity.phase === 'ended');
    ts.emit('activity:end');
    const st = await ended;
    assert.equal(st.activity.result.reveal.answer, quiz.answer);
    assert.equal(st.activity.result.me.correct, true);
    assert.ok(st.activity.result.me.points >= 100);
    assert.equal(st.activity.result.me.rank, 1);
    assert.equal(st.leaderboard[0].name, 'Nguyễn Minh Anh');
  });
  await test('chat AI sau khi chốt mới có đáp án của slide đó', async () => {
    const r = await api(S1, 'POST', '/api/ai/chat', { classId: ielts.id, message: 'Why?' });
    assert.match(r.body.reply, /\[ctx:correct=1\]/);
  });
  await test('ghép cặp & xếp câu được chấm đúng', async () => {
    const mIdx = scenes.findIndex((s) => s.type === 'match');
    const oIdx = scenes.findIndex((s) => s.type === 'order');
    if (mIdx >= 0) {
      emit(ts, 'slide:goto', { index: mIdx }); await sleep(100);
      const started = nextEvent(ss, 'lesson:state', (s) => s && s.activity && s.activity.play && s.activity.play.lefts);
      ts.emit('activity:start');
      const st = await started;
      assert.equal(st.activity.play.lefts.length, scenes[mIdx].pairs.length);
      const answer = st.activity.play.lefts.map((l) => scenes[mIdx].pairs.find((p) => p.left === l).right);
      assert.ok((await emit(ss, 'activity:answer', { answer })).ok);
      const ended = nextEvent(ss, 'lesson:state', (s) => s && s.activity && s.activity.phase === 'ended');
      ts.emit('activity:end');
      assert.equal((await ended).activity.result.me.fraction, 1);
    }
    if (oIdx >= 0) {
      emit(ts, 'slide:goto', { index: oIdx }); await sleep(100);
      const started = nextEvent(ss, 'lesson:state', (s) => s && s.activity && s.activity.play && s.activity.play.words);
      ts.emit('activity:start');
      const st = await started;
      assert.deepEqual([...st.activity.play.words].sort(), scenes[oIdx].sentence.split(' ').sort());
      assert.ok((await emit(ss, 'activity:answer', { answer: scenes[oIdx].sentence.split(' ') })).ok);
      const ended = nextEvent(ss, 'lesson:state', (s) => s && s.activity && s.activity.phase === 'ended');
      ts.emit('activity:end');
      assert.equal((await ended).activity.result.me.correct, true);
    }
  });
  console.log('Tương tác lớp học (phát biểu, cảm xúc, sao, đếm ngược)');
  const S2 = await login('student2@demo.com');
  const s2 = await connect(S2);
  await emit(s2, 'room:join', { classId: ielts.id });
  await test('chỉ giáo viên được cho học sinh phát biểu; mỗi lúc một người; thu mic', async () => {
    assert.ok((await emit(ss, 'speak:grant', { socketId: ss.id })).error, 'học sinh không tự cấp quyền');
    const granted = nextEvent(ss, 'speak:granted');
    const spk = nextEvent(s2, 'speaker', (x) => x && x.name === 'Nguyễn Minh Anh');
    assert.ok((await emit(ts, 'speak:grant', { socketId: ss.id })).ok);
    await granted;
    assert.equal((await spk).socketId, ss.id);
    const spkClaims = await lkVerify((await api(S1, 'POST', '/api/livekit/token', { classId: ielts.id })).body.token);
    assert.equal(spkClaims.canPublish, true, 'người đang phát biểu được phép phát');
    assert.deepEqual(spkClaims.canPublishSources, ['microphone'], 'chỉ được phát micro');
    const revoked = nextEvent(ss, 'speak:revoked');
    const spk2 = nextEvent(s2, 'speaker', (x) => x && x.socketId === s2.id);
    await emit(ts, 'speak:grant', { socketId: s2.id });
    await revoked; // người trước bị thu mic khi giáo viên chọn người khác
    assert.equal((await spk2).socketId, s2.id);
    const none = nextEvent(ss, 'speaker', (x) => x === null);
    assert.ok((await emit(ts, 'speak:revoke')).ok);
    await none;
    assert.ok(!(await lkVerify((await api(S1, 'POST', '/api/livekit/token', { classId: ielts.id })).body.token)).canPublish, 'thu mic thì token mới không còn quyền phát');
    assert.ok((await emit(ss, 'speak:revoke')).error, 'học sinh không thu mic của người khác');
  });
  await test('giáo viên cấp thêm camera/chia sẻ màn hình cho người đang phát biểu; đổi người thì quyền về tắt', async () => {
    const tok = async () => lkVerify((await api(S1, 'POST', '/api/livekit/token', { classId: ielts.id })).body.token);
    assert.ok((await emit(ts, 'speak:perms', { camera: true })).error, 'chưa có ai phát biểu');
    await emit(ts, 'speak:grant', { socketId: ss.id });
    assert.ok((await emit(ss, 'speak:perms', { camera: true, screen: true })).error, 'học sinh không tự cấp quyền');
    assert.deepEqual((await tok()).canPublishSources, ['microphone']);
    const got = nextEvent(ss, 'speak:perms'), info = nextEvent(s2, 'speaker', (x) => x && x.perms && x.perms.camera);
    const r = await emit(ts, 'speak:perms', { camera: true });
    assert.ok(r.ok); assert.deepEqual(r.perms, { camera: true, screen: false });
    assert.deepEqual((await got).perms, { camera: true, screen: false });
    assert.equal((await info).socketId, ss.id, 'cả lớp biết ai đang được cấp camera');
    assert.deepEqual((await tok()).canPublishSources.sort(), ['camera', 'microphone']);
    assert.ok((await emit(ts, 'speak:perms', { screen: true })).ok);
    assert.deepEqual((await tok()).canPublishSources.sort(), ['camera', 'microphone', 'screen_share', 'screen_share_audio']);
    assert.ok((await emit(ts, 'speak:perms', { camera: false, screen: false })).ok);
    assert.deepEqual((await tok()).canPublishSources, ['microphone']);
    await emit(ts, 'speak:perms', { camera: true });
    await emit(ts, 'speak:grant', { socketId: s2.id }); // đổi người nói
    await emit(ts, 'speak:grant', { socketId: ss.id }); // quay lại người cũ: quyền thêm đã bị đặt lại
    assert.deepEqual((await tok()).canPublishSources, ['microphone']);
    assert.ok((await emit(ts, 'speak:revoke')).ok);
  });
  await test('học sinh đang phát biểu rời phòng thì mic được thu lại', async () => {
    await emit(ts, 'speak:grant', { socketId: s2.id });
    const none = nextEvent(ss, 'speaker', (x) => x === null);
    s2.close();
    await none;
  });
  await test('reactions: chỉ emoji hợp lệ, có giới hạn tần suất', async () => {
    const got = nextEvent(ts, 'reaction');
    ss.emit('reaction', { emoji: '🎉' });
    assert.equal((await got).emoji, '🎉');
    let extra = false;
    ts.once('reaction', () => (extra = true));
    ss.emit('reaction', { emoji: '💣' }); // không hợp lệ
    ss.emit('reaction', { emoji: '👍' }); // quá nhanh sau lần trước
    await sleep(300);
    assert.equal(extra, false);
  });
  await test('tặng sao cộng điểm và hiện trên bảng xếp hạng; học sinh không tự tặng', async () => {
    assert.ok((await emit(ss, 'star:give', { socketId: ss.id })).error);
    const got = nextEvent(ss, 'star:received');
    assert.ok((await emit(ts, 'star:give', { socketId: ss.id, count: 2 })).ok);
    assert.equal((await got).count, 2);
  });
  await test('hoạt động có đếm ngược tự chốt khi hết giờ', async () => {
    emit(ts, 'slide:goto', { index: quizIdx });
    await sleep(100);
    const open = nextEvent(ss, 'lesson:state', (s) => s && s.activity && s.activity.phase === 'open');
    ts.emit('activity:start', { seconds: 1 });
    const st = await open;
    assert.ok(st.activity.endsAt > Date.now() - 500 && st.activity.endsAt < Date.now() + 2000);
    const ended = await nextEvent(ss, 'lesson:state', (s) => s && s.activity && s.activity.phase === 'ended', 4000);
    assert.equal(ended.activity.result.me.answered, false);
    assert.ok(ended.leaderboard.some((r) => r.name === 'Nguyễn Minh Anh' && r.stars === 2), 'sao hiện trong bảng xếp hạng');
  });
  console.log('Điền từ & đọc to');
  const gameLesson = (await api(T, 'POST', '/api/lessons', { title: 'Games', sceneCount: 6 })).body.lesson;
  await test('điền từ: lưu/chuẩn hoá, học sinh không nhận đáp án, chấm không phân biệt hoa thường & dấu câu', async () => {
    const put = await api(T, 'PUT', `/api/lessons/${gameLesson.id}`, { scenes: [
      { id: 'f1', type: 'fill', title: 'Gap', sentence: 'I ____ to school and she ___ home.', answers: [['went'], ['stayed', 'stay']], hint: 'go / stay' },
      { id: 'bad', type: 'fill', title: 'Bad', sentence: 'No blank here', answers: [['x']] }, // bị loại
      { id: 'sp1', type: 'speak', title: 'Read', sentence: 'Where is the departure gate?', translation: 'Cổng khởi hành ở đâu?' },
    ] });
    assert.equal(put.body.lesson.scenes.length, 2, 'scene điền từ không có chỗ trống bị loại');
    assert.equal(put.body.lesson.scenes[0].sentence, 'I ___ to school and she ___ home.');
    const shown = nextEvent(ss, 'lesson:state', (s) => s && s.id === gameLesson.id);
    assert.ok((await emit(ts, 'lesson:present', { lessonId: gameLesson.id })).ok);
    const st0 = await shown;
    assert.equal(st0.scene.blanks, 2);
    const open = nextEvent(ss, 'lesson:state', (s) => s && s.activity && s.activity.phase === 'open');
    ts.emit('activity:start');
    const st = await open;
    assert.ok(!/went|stayed/.test(JSON.stringify(st)), 'đáp án không lộ trước khi chốt');
    assert.ok((await emit(ss, 'activity:answer', { answer: ['went'] })).error, 'thiếu ô thì bị từ chối');
    assert.ok((await emit(ss, 'activity:answer', { answer: ['Went.', ' STAYED '] })).ok);
    const ended = nextEvent(ss, 'lesson:state', (s) => s && s.activity && s.activity.phase === 'ended');
    ts.emit('activity:end');
    const r = (await ended).activity.result;
    assert.deepEqual(r.reveal.answers, ['went', 'stayed']);
    assert.equal(r.me.correct, true);
    assert.deepEqual(r.me.detail.blanks, [true, true]);
  });
  await test('đọc to: chấm theo từ nhận dạng được, chi tiết từng từ cho học sinh', async () => {
    emit(ts, 'slide:goto', { index: 1 });
    await sleep(100);
    const open = nextEvent(ss, 'lesson:state', (s) => s && s.activity && s.activity.phase === 'open' && s.scene.type === 'speak');
    ts.emit('activity:start');
    const st = await open;
    assert.equal(st.activity.play.sentence, 'Where is the departure gate?');
    assert.ok((await emit(ss, 'activity:answer', { answer: 'where is the gate' })).error, 'định dạng sai bị từ chối');
    assert.ok((await emit(ss, 'activity:answer', { answer: { transcript: 'where is departure gate' } })).ok);
    const ended = nextEvent(ss, 'lesson:state', (s) => s && s.activity && s.activity.phase === 'ended' && s.scene.type === 'speak');
    ts.emit('activity:end');
    const me = (await ended).activity.result.me;
    assert.equal(me.fraction, 0.8);
    assert.equal(me.correct, true);
    assert.deepEqual(me.detail.words.map((w) => w.ok), [true, true, false, true, true]);
    assert.ok(me.points >= 80);
  });
  // trả lại bài giảng chính + hoạt động đã chốt cho các kiểm tra sau
  assert.ok((await emit(ts, 'lesson:present', { lessonId })).ok);
  emit(ts, 'slide:goto', { index: quizIdx });
  await sleep(100);
  ts.emit('activity:start');
  await sleep(100);
  ts.emit('activity:end');
  await sleep(150);
  console.log('Phụ đề, bảng viết, PDF, phòng nhỏ');
  await test('phụ đề: chỉ giáo viên gửi, cả lớp nhận', async () => {
    const got = nextEvent(ss, 'caption', (c) => c.final === true);
    ts.emit('caption', { text: 'Hello class', final: true });
    assert.equal((await got).text, 'Hello class');
    let leaked = false;
    ts.once('caption', () => (leaked = true));
    ss.emit('caption', { text: 'học sinh gửi', final: true });
    await sleep(250);
    assert.equal(leaked, false);
  });
  await test('bảng viết: học sinh viết, giáo viên chiếu bài và tô màu sửa lỗi cho cả lớp', async () => {
    assert.ok((await emit(ss, 'pad:open', { prompt: 'x' })).error, 'học sinh không mở được bảng');
    const opened = nextEvent(ss, 'pad:state', (s) => s && s.prompt === 'Write about your trip.');
    assert.ok((await emit(ts, 'pad:open', { prompt: 'Write about your trip.' })).ok);
    assert.equal((await opened).mine, '');
    const entry = nextEvent(ts, 'pad:entry');
    assert.ok((await emit(ss, 'pad:write', { text: 'I goed to Japan yesterday.' })).ok);
    assert.equal((await entry).text, 'I goed to Japan yesterday.');
    assert.ok((await emit(ss, 'pad:feature', { userId: 'x' })).error, 'học sinh không chọn bài được');
    const feat = nextEvent(ss, 'pad:state', (s) => s && s.featured);
    const me = (await api(S1, 'GET', '/api/me')).body.user;
    assert.ok((await emit(ts, 'pad:feature', { userId: me.id })).ok);
    const f = (await feat).featured;
    assert.equal(f.name, 'Nguyễn Minh Anh');
    assert.deepEqual(f.marks, []);
    assert.ok((await emit(ts, 'pad:mark', { start: 0, end: 999, color: 'red' })).error, 'vùng chọn ngoài văn bản bị từ chối');
    assert.ok((await emit(ts, 'pad:mark', { start: 0, end: 4, color: 'pink' })).error, 'màu lạ bị từ chối');
    assert.ok((await emit(ss, 'pad:mark', { start: 0, end: 4, color: 'red' })).error, 'học sinh không tô màu được');
    const marks = nextEvent(ss, 'pad:marks', (m) => m.marks.length === 1);
    assert.ok((await emit(ts, 'pad:mark', { start: 2, end: 7, color: 'red', fix: 'went', note: 'Irregular verb' })).ok);
    assert.deepEqual((await marks).marks[0], { start: 2, end: 7, color: 'red', fix: 'went', note: 'Irregular verb' });
    const cleared = nextEvent(ss, 'pad:marks', (m) => m.marks.length === 0);
    ts.emit('pad:unmark', { index: 0 });
    await cleared;
    const closed = nextEvent(ss, 'pad:state', (s) => s === null);
    ts.emit('pad:close');
    await closed;
  });
  await test('chiếu PDF: tải lên, chỉ thành viên lớp tải được, đồng bộ trang, loại trừ với bài giảng', async () => {
    const pdf = tinyPdf('Page one text');
    const up = await fetch(BASE + `/api/classes/${ielts.id}/pdfs`, { method: 'POST', headers: { Authorization: 'Bearer ' + T, 'X-Filename': encodeURIComponent('handout.pdf') }, body: pdf });
    assert.equal(up.status, 200);
    const rec = (await up.json()).pdf;
    assert.equal(rec.name, 'handout.pdf');
    assert.equal((await fetch(BASE + `/api/classes/${ielts.id}/pdfs`, { method: 'POST', headers: { Authorization: 'Bearer ' + T }, body: Buffer.from('not a pdf') })).status, 400);
    assert.equal((await fetch(BASE + `/api/classes/${ielts.id}/pdfs`, { method: 'POST', headers: { Authorization: 'Bearer ' + S1 }, body: pdf })).status, 403);
    assert.equal((await api(T, 'GET', `/api/classes/${ielts.id}/pdfs`)).body.pdfs.length, 1);
    const file = await fetch(BASE + `/api/pdfs/${rec.id}/file?token=${S1}`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.equal((await fetch(BASE + `/api/pdfs/${rec.id}/file?token=${S3}`)).status, 404);
    const shown = nextEvent(ss, 'pdf:state', (p) => p && p.id === rec.id);
    const lessonOff = nextEvent(ss, 'lesson:state', (s) => s === null);
    assert.ok((await emit(ts, 'pdf:present', { fileId: rec.id })).ok);
    assert.equal((await shown).page, 1);
    await lessonOff; // chiếu PDF thì bài giảng dừng
    const p3 = nextEvent(ss, 'pdf:state', (p) => p && p.page === 3);
    ts.emit('pdf:goto', { page: 3 });
    assert.equal((await p3).page, 3);
    ss.emit('pdf:goto', { page: 9 }); // học sinh không điều khiển được
    await sleep(150);
    const stopped = nextEvent(ss, 'pdf:state', (p) => p === null);
    const lessonOn = nextEvent(ss, 'lesson:state', (s) => s && s.id === lessonId);
    assert.ok((await emit(ts, 'lesson:present', { lessonId })).ok);
    await stopped; // chiếu bài giảng thì PDF dừng
    await lessonOn;
    assert.equal((await api(S1, 'DELETE', `/api/pdfs/${rec.id}`)).status, 403);
    assert.equal((await api(T, 'DELETE', `/api/pdfs/${rec.id}`)).status, 200);
    // khôi phục hoạt động đã chốt cho kiểm tra sau
    emit(ts, 'slide:goto', { index: quizIdx });
    await sleep(100);
    ts.emit('activity:start');
    await sleep(100);
    ts.emit('activity:end');
    await sleep(150);
  });
  await test('phòng nhỏ: chia nhóm, chỉ nhóm mình trao đổi tín hiệu, giáo viên đi tuần, kết thúc', async () => {
    assert.ok((await emit(ts, 'breakout:start', { size: 2 })).error, 'một học sinh thì chưa chia nhóm được');
    const s2b = await connect(S2);
    await emit(s2b, 'room:join', { classId: ielts.id });
    assert.ok((await emit(ss, 'breakout:start', { size: 2 })).error, 'học sinh không chia nhóm được');
    const a1 = nextEvent(ss, 'breakout:assigned');
    const a2 = nextEvent(s2b, 'breakout:assigned');
    const st = nextEvent(ts, 'breakout:state', (b) => b && b.groups.length === 1);
    assert.ok((await emit(ts, 'breakout:start', { size: 2, minutes: 5 })).ok);
    const [g1, g2] = [await a1, await a2];
    assert.equal(g1.groupId, g2.groupId);
    assert.equal(g1.members.length, 2);
    assert.ok(g1.endsInMs > 250000);
    const gTeacher = await lkVerify((await api(T, 'POST', '/api/livekit/token', { classId: ielts.id, groupId: g1.groupId })).body.token);
    assert.equal(gTeacher.room, `cls_${ielts.id}__${g1.groupId}`);
    const gStudent = await lkVerify((await api(S1, 'POST', '/api/livekit/token', { classId: ielts.id, groupId: g1.groupId })).body.token);
    assert.equal(gStudent.canPublish, true);
    assert.deepEqual(gStudent.canPublishSources.sort(), ['camera', 'microphone']);
    assert.equal((await api(S3, 'POST', '/api/livekit/token', { classId: ielts.id, groupId: g1.groupId })).status, 403, 'người ngoài lớp không vào được phòng nhóm');
    assert.equal((await st).groups[0].members.length, 2);
    // tín hiệu giữa hai thành viên được chuyển; tới giáo viên (chưa ghé thăm) thì bị chặn
    const sig = nextEvent(s2b, 'bo:signal');
    ss.emit('bo:signal', { to: s2b.id, data: { hello: 1 } });
    assert.deepEqual((await sig).data, { hello: 1 });
    let blocked = true;
    ts.once('bo:signal', () => (blocked = false));
    ss.emit('bo:signal', { to: ts.id, data: { sneaky: 1 } });
    await sleep(250);
    assert.equal(blocked, true);
    // giáo viên đi tuần: các học sinh nhận thông báo, tín hiệu hai chiều được phép
    const v1 = nextEvent(ss, 'breakout:visitor');
    const visit = await emit(ts, 'breakout:visit', { groupId: g1.groupId });
    assert.ok(visit.ok);
    assert.equal(visit.members.length, 2);
    assert.equal((await v1).socketId, ts.id);
    const toT = nextEvent(ts, 'bo:signal');
    ss.emit('bo:signal', { to: ts.id, data: { fromStudent: 1 } });
    assert.deepEqual((await toT).data, { fromStudent: 1 });
    const toS = nextEvent(ss, 'bo:signal');
    ts.emit('bo:signal', { to: ss.id, data: { fromTeacher: 1 } });
    assert.deepEqual((await toS).data, { fromTeacher: 1 });
    // thành viên rời -> nhóm được báo
    const s2bId = s2b.id;
    const left = nextEvent(ss, 'breakout:member-left');
    s2b.close();
    assert.equal((await left).socketId, s2bId);
    const ended = nextEvent(ss, 'breakout:ended');
    ts.emit('breakout:end');
    await ended;
  });
  await test('học sinh vào muộn nhận đúng trạng thái; kết thúc buổi lưu điểm', async () => {
    ss.close();
    const s2 = await connect(S1);
    const sj = await emit(s2, 'room:join', { classId: ielts.id });
    assert.ok(sj.lesson && sj.lesson.total === 6 && sj.lesson.activity.phase === 'ended');
    s2.close();
    ts.close();
    await api(T, 'DELETE', `/api/classes/${ielts.id}/live`);
    const c = (await api(T, 'GET', '/api/classes')).body.classes.find((x) => x.id === ielts.id);
    assert.equal(c.history[0].lessonTitle, 'Travel English');
    assert.ok(c.history[0].scores[0].points > 0);
    const session = c.history[0];
    const review = await api(S1, 'GET', `/api/classes/${ielts.id}/sessions/${session.id}/review`);
    assert.equal(review.status, 200);
    assert.equal(review.body.session.lessons[0].slides[0].scene.id, scenes[0].id);
    assert.ok(review.body.session.lessons.every(l => l.slides.every(slide => slide.scene.type === 'slide')));
    assert.equal((await api(S3, 'GET', `/api/classes/${ielts.id}/sessions/${session.id}/review`)).status, 403);
    const report = (await api(S1, 'GET', '/api/learning')).body.reports.find(r => r.classId === ielts.id);
    assert.equal(report.history[0].hasReview, true);
    const teacherReport = (await api(T, 'GET', '/api/learning')).body.reports.find(r => r.classId === ielts.id);
    assert.ok(Object.values(teacherReport.history[0].attendance).some(a => a.name === 'Nguyễn Minh Anh'));
  });

  console.log('Bản ghi buổi học');
  await test('giáo viên tải bản ghi, thành viên lớp xem được qua token, người ngoài lớp không', async () => {
    const body = Buffer.alloc(20000, 7);
    const up = await fetch(BASE + `/api/classes/${ielts.id}/recordings`, { method: 'POST', headers: { Authorization: 'Bearer ' + T, 'X-Title': encodeURIComponent('Buổi 1'), 'X-Duration': '95' }, body });
    assert.equal(up.status, 200);
    const rec = (await up.json()).recording;
    assert.equal(rec.size, 20000);
    assert.equal(rec.durationSec, 95);
    const list = (await api(S1, 'GET', `/api/classes/${ielts.id}/recordings`)).body.recordings;
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'Buổi 1');
    const file = await fetch(BASE + `/api/recordings/${rec.id}/file?token=${S1}`);
    assert.equal(file.status, 200);
    assert.equal((await file.arrayBuffer()).byteLength, 20000);
    assert.equal((await fetch(BASE + `/api/recordings/${rec.id}/file?token=${S3}`)).status, 404);
    assert.equal((await fetch(BASE + `/api/recordings/${rec.id}/file`)).status, 401);
    assert.equal((await api(S3, 'GET', `/api/classes/${ielts.id}/recordings`)).status, 403);
    const tiny = await fetch(BASE + `/api/classes/${ielts.id}/recordings`, { method: 'POST', headers: { Authorization: 'Bearer ' + T }, body: Buffer.alloc(10) });
    assert.equal(tiny.status, 400);
    assert.equal((await fetch(BASE + `/api/classes/${ielts.id}/recordings`, { method: 'POST', headers: { Authorization: 'Bearer ' + S1 }, body })).status, 403);
    assert.equal((await api(S1, 'DELETE', `/api/recordings/${rec.id}`)).status, 403);
    assert.equal((await api(T, 'DELETE', `/api/recordings/${rec.id}`)).status, 200);
    assert.equal((await api(S1, 'GET', `/api/classes/${ielts.id}/recordings`)).body.recordings.length, 0);
  });

  await test('bản ghi tải lên theo từng phần, tiếp tục đúng vị trí, tải về được', async () => {
    const A1 = Buffer.alloc(30000, 1), A2 = Buffer.alloc(30000, 2), total = A1.length + A2.length;
    const jpost = (p, tok, body) => fetch(BASE + p, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const put = (uid, tok, off, buf) => fetch(BASE + '/api/recordings/uploads/' + uid, { method: 'PUT', headers: { Authorization: 'Bearer ' + tok, 'X-Offset': String(off), 'Content-Type': 'application/octet-stream' }, body: buf });
    assert.equal((await jpost(`/api/classes/${ielts.id}/recordings/start`, S1, { total })).status, 403);
    assert.equal((await jpost(`/api/classes/${ielts.id}/recordings/start`, T, { total: 5 })).status, 400);
    const st = await jpost(`/api/classes/${ielts.id}/recordings/start`, T, { total });
    assert.equal(st.status, 200);
    const { uploadId } = await st.json();
    assert.equal((await put(uploadId, S1, 0, A1)).status, 403);
    const p1 = await put(uploadId, T, 0, A1); assert.equal(p1.status, 200); assert.equal((await p1.json()).size, 30000);
    const bad = await put(uploadId, T, 0, A1); assert.equal(bad.status, 409); assert.equal((await bad.json()).size, 30000);
    const early = await jpost(`/api/recordings/uploads/${uploadId}/finish`, T, { title: 'x', durationSec: 1 }); assert.equal(early.status, 409);
    assert.equal((await put(uploadId, T, 30000, A2)).status, 200);
    const fin = await jpost(`/api/recordings/uploads/${uploadId}/finish`, T, { title: 'Phần: A/B', durationSec: 7 });
    assert.equal(fin.status, 200);
    const rec = (await fin.json()).recording; assert.equal(rec.size, total); assert.equal(rec.title, 'Phần: A/B');
    const file = await fetch(BASE + `/api/recordings/${rec.id}/file?token=${S1}`); assert.equal((await file.arrayBuffer()).byteLength, total);
    const dl = await fetch(BASE + `/api/recordings/${rec.id}/file?download=1&token=${S1}`);
    assert.match(dl.headers.get('content-disposition') || '', /attachment/);
    assert.equal((await put(uploadId, T, 0, A1)).status, 404); // phiên đã đóng
    assert.equal((await api(T, 'DELETE', `/api/recordings/${rec.id}`)).status, 200);
  });

  console.log('Hỏi đáp sau buổi học');
  await test('danh sách bài đã gắn lớp + chat theo bài, có đáp án vì đã dạy; lưu & xoá lịch sử', async () => {
    const l = (await api(S1, 'GET', `/api/classes/${ielts.id}/lessons`)).body;
    assert.equal(l.lessons.length, 2); // bài chính + bài trò chơi đã chiếu trong lớp
    assert.ok(l.lessons[0].taught);
    const r = await api(S1, 'POST', '/api/ai/chat', { classId: ielts.id, lessonId: lessonId, message: 'Tóm tắt bài giúp em' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.reply, /\[ctx:correct=[1-9]\]/);
    assert.match(r.body.reply, /\[slide:false\]/);
    const h = (await api(S1, 'GET', `/api/ai/chat?classId=${ielts.id}&lessonId=${lessonId}`)).body;
    assert.equal(h.messages.length, 6); // gồm 2 câu hỏi lúc live: cùng một hội thoại theo bài giảng
    assert.equal((await api(S1, 'DELETE', `/api/ai/chat?classId=${ielts.id}&lessonId=${lessonId}`)).status, 200);
    assert.equal((await api(S1, 'GET', `/api/ai/chat?classId=${ielts.id}&lessonId=${lessonId}`)).body.messages.length, 0);
    assert.equal((await api(S3, 'GET', `/api/classes/${ielts.id}/lessons`)).status, 403);
  });
  await test('nhiều hội thoại AI: tạo mới theo kiểu luyện, đổi tên, ghim, xóa và chỉ chủ sở hữu được sửa', async () => {
    const ctx = { classId: ielts.id };
    const a = await api(S1, 'POST', '/api/ai/chat', { ...ctx, newChat: true, kind: 'roleplay', message: "Let's role-play at a restaurant" });
    assert.equal(a.status, 200); assert.ok(a.body.chatId); assert.match(a.body.reply, /[kind:ROLE-PLAY]/); assert.match(a.body.reply, /[scope:true]/);
    const b = await api(S1, 'POST', '/api/ai/chat', { ...ctx, newChat: true, kind: 'bogus', message: 'Second chat about grammar' });
    assert.equal(b.status, 200); assert.notEqual(b.body.chatId, a.body.chatId); assert.match(b.body.reply, /[kind:none]/);
    const cont = await api(S1, 'POST', '/api/ai/chat', { ...ctx, chatId: a.body.chatId, message: 'Next turn' });
    assert.equal(cont.body.chatId, a.body.chatId);
    assert.equal((await api(S1, 'GET', '/api/ai/chat?classId=' + ielts.id + '&chatId=' + a.body.chatId)).body.messages.length, 4);
    assert.equal((await api(S1, 'GET', '/api/ai/chat?classId=' + ielts.id + '&chatId=ch_missing')).status, 404);
    assert.equal((await api(S1, 'POST', '/api/ai/chat', { ...ctx, chatId: 'ch_missing', message: 'x' })).status, 404);
    let list = (await api(S1, 'GET', '/api/ai/chats?classId=' + ielts.id + '&lessonId=')).body.chats;
    assert.ok(list.length >= 2); assert.match(list.find((c) => c.id === a.body.chatId).title, /role-play/i);
    assert.equal(list.find((c) => c.id === a.body.chatId).kind, 'roleplay');
    assert.equal((await api(S2, 'PATCH', '/api/ai/chats/' + a.body.chatId, { pinned: true })).status, 404);
    assert.equal((await api(S2, 'DELETE', '/api/ai/chats/' + a.body.chatId)).status, 404);
    assert.equal((await api(S1, 'PATCH', '/api/ai/chats/' + b.body.chatId, { title: '   ' })).status, 400);
    assert.equal((await api(S1, 'PATCH', '/api/ai/chats/' + b.body.chatId, { title: 'Ngữ pháp quan trọng', pinned: true })).status, 200);
    list = (await api(S1, 'GET', '/api/ai/chats?classId=' + ielts.id)).body.chats;
    assert.equal(list[0].id, b.body.chatId); assert.equal(list[0].pinned, true); assert.equal(list[0].title, 'Ngữ pháp quan trọng');
    assert.equal((await api(S2, 'GET', '/api/ai/chats?classId=' + ielts.id)).body.chats.length, 0);
    assert.equal((await api(S3, 'GET', '/api/ai/chats?classId=' + ielts.id)).status, 403);
    assert.equal((await api(S1, 'DELETE', '/api/ai/chats/' + a.body.chatId)).status, 200);
    assert.equal((await api(S1, 'GET', '/api/ai/chats?classId=' + ielts.id)).body.chats.some((c) => c.id === a.body.chatId), false);
  });
  await test('hỏi AI kèm ảnh và tệp: kiểm tra đầu vào, ảnh gửi dạng image_url, tệp chữ vào ngữ cảnh, trích PDF/TXT', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const ctx = { classId: ielts.id };
    const a = await api(S2, 'POST', '/api/ai/chat', { ...ctx, newChat: true, message: 'What does this sign say?', attachments: [{ kind: 'image', name: 'sign.png', dataUrl: png }] });
    assert.equal(a.status, 200, JSON.stringify(a.body)); assert.match(a.body.reply, /\[images:1\]/); assert.match(a.body.reply, /\[scope:true\]/);
    const only = await api(S2, 'POST', '/api/ai/chat', { ...ctx, chatId: a.body.chatId, attachments: [{ kind: 'image', name: 'again.png', dataUrl: png }] });
    assert.equal(only.status, 200); assert.match(only.body.reply, /\[images:1\]/); // không gõ chữ vẫn được nếu có ảnh
    const txt = await api(S2, 'POST', '/api/ai/chat', { ...ctx, newChat: true, message: 'Correct this please', attachments: [{ kind: 'text', name: 'note.txt', text: 'The cat sat on the mat. She go to school.' }] });
    assert.equal(txt.status, 200); assert.match(txt.body.reply, /\[file:true\]/); assert.match(txt.body.reply, /\[images:0\]/);
    const follow = await api(S2, 'POST', '/api/ai/chat', { ...ctx, chatId: txt.body.chatId, message: 'And the second sentence?' });
    assert.match(follow.body.reply, /\[hist:[1-9]\]/); // nội dung tệp vẫn nằm trong ngữ cảnh lượt sau
    const saved = (await api(S2, 'GET', '/api/ai/chat?classId=' + ielts.id + '&chatId=' + a.body.chatId)).body.messages;
    assert.equal(saved[0].attachments[0].name, 'sign.png'); assert.ok(!JSON.stringify(saved).includes('base64'), 'không lưu ảnh vào dữ liệu');
    for (const bad of [[{ kind: 'image', name: 'x', dataUrl: 'data:text/html;base64,PGI+' }], [{ kind: 'image', name: 'x', dataUrl: 'javascript:alert(1)' }], Array(4).fill({ kind: 'image', name: 'x', dataUrl: png }), Array(5).fill({ kind: 'text', name: 'x', text: 'a' }), [{ kind: 'text', name: 'x', text: '   ' }], [{ kind: 'video' }], 'nope']) {
      assert.equal((await api(S2, 'POST', '/api/ai/chat', { ...ctx, newChat: true, message: 'x', attachments: bad })).status, 400);
    }
    assert.equal((await api(S2, 'POST', '/api/ai/chat', { ...ctx, newChat: true })).status, 400);
    const post = (name, body) => fetch(BASE + '/api/ai/extract', { method: 'POST', headers: { Authorization: 'Bearer ' + S2, 'X-Filename': encodeURIComponent(name) }, body });
    const t = await post('a.txt', 'Hello teacher'); assert.equal(t.status, 200); assert.equal((await t.json()).text, 'Hello teacher');
    const p = await post('b.pdf', tinyPdf('Present perfect rules')); assert.equal(p.status, 200); assert.match((await p.json()).text, /Present perfect/);
    assert.equal((await post('c.docx', Buffer.from('PK'))).status, 400);
    assert.equal((await fetch(BASE + '/api/ai/extract', { method: 'POST', body: 'x' })).status, 401);
  });
  await test('tra từ nhanh trên slide: chỉ từ tiếng Anh, thành viên lớp, có bộ nhớ đệm', async () => {
    const look = (token, body) => api(token, 'POST', '/api/ai/lookup', body);
    const a = await look(S2, { classId: ielts.id, word: 'Luggage', context: 'Pack your luggage.' });
    assert.equal(a.status, 200, JSON.stringify(a.body)); assert.equal(a.body.word, 'luggage'); assert.equal(a.body.ipa, '/mock/'); assert.match(a.body.meaning, /luggage/i); assert.ok(a.body.example);
    const b = await look(S1, { classId: ielts.id, word: 'luggage' });
    assert.equal(b.status, 200); assert.equal(b.body.cached, true);
    for (const bad of ['', 'hello123', 'a b c d e f', '<script>', 'xin chào']) assert.equal((await look(S2, { classId: ielts.id, word: bad })).status, 400, bad);
    assert.equal((await look(S2, { classId: ielts.id, word: 'zzz' })).status, 422);
    assert.equal((await look(S3, { classId: ielts.id, word: 'ticket' })).status, 403);
    assert.equal((await look(S2, { word: 'ticket' })).status, 403);
    assert.equal((await look(T, { word: 'ticket' })).status, 200);
    assert.equal((await api(null, 'POST', '/api/ai/lookup', { word: 'ticket' })).status, 401);
  });
  await test('header bảo mật (CSP, chống nhúng, nosniff) và giới hạn tốc độ chat/sự kiện socket', async () => {
    const home = await fetch(BASE + '/');
    const policy = home.headers.get('content-security-policy') || '';
    assert.match(policy, /frame-ancestors 'self'/); assert.match(policy, /object-src 'none'/); assert.ok(!/script-src[^;]*unsafe-inline/.test(policy), 'không cho script inline');
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff'); assert.equal(home.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(home.headers.get('x-powered-by'), null);
    assert.ok(!/<script>/.test(await home.text()), 'trang chủ không còn script inline');
    assert.equal((await fetch(BASE + '/api/me', { headers: { Authorization: 'Bearer ' + S1 } })).headers.get('cache-control'), 'no-store');
    const zoomPolicy = (await fetch(BASE + '/zoom-embed.html')).headers.get('content-security-policy');
    assert.match(zoomPolicy, /frame-ancestors 'self'/); assert.ok(!/script-src/.test(zoomPolicy), 'trang nhúng Zoom cần tải SDK của Zoom');
    // chat: tối đa 6 tin / 8 giây, cách nhau ≥ 350 ms
    const cls = (await api(T, 'POST', '/api/classes', { name: 'Rate limit class' })).body.class;
    assert.equal((await api(T, 'POST', '/api/classes/' + cls.id + '/students', { email: 'student1@demo.com' })).status, 200);
    await api(T, 'POST', '/api/classes/' + cls.id + '/live', { title: 'Rate' });
    const tsock = await connect(T), ssock = await connect(S1);
    assert.ok((await emit(tsock, 'room:join', { classId: cls.id })).ok); assert.ok((await emit(ssock, 'room:join', { classId: cls.id })).ok);
    let got = 0; tsock.on('chat', (m) => { if (!m.system) got++; });
    const limited = nextEvent(ssock, 'chat:limited');
    for (let i = 0; i < 40; i++) ssock.emit('chat', { text: 'spam ' + i });
    assert.match((await limited).error, /nhanh/);
    await sleep(500); assert.ok(got >= 1 && got <= 6, 'giáo viên chỉ nhận tối đa 6 tin, nhận ' + got);
    // mọi sự kiện: quá nhanh thì bị bỏ và người gửi được báo
    const flood = nextEvent(ssock, 'rate:limited', () => true, 6000);
    for (let i = 0; i < 700; i++) ssock.emit('hand', { raised: i % 2 === 0 });
    const late = emit(ssock, 'room:join', { classId: cls.id }); // gửi ngay sau đợt spam, khi xô đã cạn
    assert.ok((await flood).event);
    assert.match((await late).error, /quá nhanh/); // ack vẫn được trả lời khi bị giới hạn
    tsock.close(); ssock.close();
    await api(T, 'DELETE', '/api/classes/' + cls.id + '/live');
  });
  await test('hỏi đáp chung (không có bài) và lỗi AI không lộ chi tiết cho học sinh', async () => {
    const r = await api(S1, 'POST', '/api/ai/chat', { classId: ielts.id, message: 'What is present perfect?' });
    assert.equal(r.status, 200);
    await api(A, 'PUT', '/api/ai/settings', { providers: [{ id: '9router', name: '9Router', baseUrl: 'http://127.0.0.1:9', models: ['m'] }], active: { providerId: '9router', model: 'm' } });
    const bad = await api(S1, 'POST', '/api/ai/chat', { classId: ielts.id, message: 'hello' });
    assert.equal(bad.status, 502);
    assert.ok(!bad.body.error.includes('127.0.0.1'));
  });
  const restart = async () => {
    const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited;
    server = spawn(process.execPath, ['server.js'], serverOptions);
    for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/healthz')).ok) return; } catch {} await sleep(100); }
    throw new Error('Không khởi động lại được server kiểm thử.');
  };
  await require('./operations-smoke')({ api, test, connect, emit, nextEvent, sleep, restart, A, T, S1, S2, S3, classes, ielts, lessonId, scenes, quizIdx, quiz, mockUrl, dataDir, login, mediaCalls });
  await require('./zoom-smoke')({ api, test, connect, emit, nextEvent, A, T, S1, S3, lessonId, restart, BASE });
}

main().then(() => { console.log(`\nOK — ${passed} kiểm tra đạt`); cleanup(0); }, (e) => { console.error(e); cleanup(1); });
function cleanup(code) {
  if (server) server.kill();
  if (mock) mock.close();
  if (mediaMock) mediaMock.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(code);
}
