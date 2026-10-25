// Smoke test end-to-end: mock LLM + server thật + socket.io-client.   Chạy: npm test
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { createServer } = require('./mock-llm');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'englive-'));
let server, mock, passed = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(token, method, url, body, raw) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(raw ? { 'X-Filename': raw.name } : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: raw ? raw.buffer : body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const login = async (email) => (await api(null, 'POST', '/api/login', { email, password: '123456' })).body.token;
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
  process.env.MOCK_KEY = 'secret-test-key';
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;
  server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT, DATA_DIR: dataDir, AI_BASE_URL: mockUrl, AI_API_KEY: 'secret-test-key', AI_MODEL: 'ag/gemini-3.8-flash-high' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch {} await sleep(100); }

  const T = await login('teacher@demo.com');
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
    const { settings } = (await api(T, 'GET', '/api/ai/settings')).body;
    assert.equal(settings.active.model, 'ag/gemini-3.8-flash-high');
    assert.equal(settings.providers[0].hasKey, true);
    assert.ok(!JSON.stringify(settings).includes('secret-test-key'));
  });
  await test('test kết nối + lấy danh sách model', async () => {
    const r = await api(T, 'POST', '/api/ai/test', { providerId: '9router', model: 'ag/gemini-3.8-flash-high' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.reply, 'OK');
    const m = await api(T, 'GET', '/api/ai/models/9router');
    assert.deepEqual(m.body.models, ['ag/gemini-3.8-flash-high', 'ag/gemini-3.8-flash-low']);
  });
  await test('sai khoá API báo lỗi rõ ràng; thêm nhà cung cấp thứ hai giữ nguyên khoá cũ', async () => {
    const { settings } = (await api(T, 'GET', '/api/ai/settings')).body;
    const bad = settings.providers.map((p) => ({ ...p, apiKey: 'wrong' }));
    const put = await api(T, 'PUT', '/api/ai/settings', { providers: bad, active: settings.active });
    assert.equal(put.status, 200);
    const r = await api(T, 'POST', '/api/ai/test', { providerId: '9router', model: 'x' });
    assert.equal(r.status, 502);
    assert.match(r.body.error, /khoá API/);
    // gửi lại không kèm apiKey -> giữ "wrong"; khôi phục khoá đúng và thêm provider
    const good = (await api(T, 'PUT', '/api/ai/settings', { providers: [{ id: '9router', name: '9Router', baseUrl: mockUrl, apiKey: 'secret-test-key', models: ['ag/gemini-3.8-flash-high'] }, { name: 'Khác', baseUrl: 'localhost:11434', models: ['llama'] }], active: settings.active })).body.settings;
    assert.equal(good.providers.length, 2);
    assert.equal(good.providers[1].baseUrl, 'http://localhost:11434/v1');
    assert.equal((await api(T, 'POST', '/api/ai/test', { providerId: '9router', model: 'x' })).status, 200);
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
  await test('sinh lại một slide với yêu cầu riêng', async () => {
    const r = await api(T, 'POST', `/api/lessons/${lessonId}/scenes/${scenes[0].id}/regenerate`, { instruction: 'Làm dễ hơn' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.scene.id, scenes[0].id);
  });
  await test('giáo viên khác/học sinh không truy cập được bài giảng', async () => {
    assert.equal((await api(S1, 'GET', `/api/lessons/${lessonId}`)).status, 403);
    const other = (await api(null, 'POST', '/api/register', { name: 'Other T', email: 'other@t.com', password: '123456', role: 'teacher' })).body.token;
    assert.equal((await api(other, 'GET', `/api/lessons/${lessonId}`)).status, 404);
  });

  console.log('Trình chiếu & hoạt động trực tiếp');
  const quizIdx = scenes.findIndex((s) => s.type === 'quiz');
  const quiz = scenes[quizIdx];
  await test('học sinh ngoài lớp không vào được phòng/chat AI', async () => {
    await api(T, 'POST', `/api/classes/${ielts.id}/live`, { title: 'Live test' });
    const s3 = await connect(S3);
    const r = await emit(s3, 'room:join', { classId: ielts.id });
    assert.ok(r.error);
    s3.close();
    assert.equal((await api(S3, 'POST', '/api/ai/chat', { classId: ielts.id, message: 'hi' })).status, 403);
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
  });

  console.log('Hỏi đáp sau buổi học');
  await test('danh sách bài đã gắn lớp + chat theo bài, có đáp án vì đã dạy; lưu & xoá lịch sử', async () => {
    const l = (await api(S1, 'GET', `/api/classes/${ielts.id}/lessons`)).body;
    assert.equal(l.lessons.length, 1);
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
  await test('hỏi đáp chung (không có bài) và lỗi AI không lộ chi tiết cho học sinh', async () => {
    const r = await api(S1, 'POST', '/api/ai/chat', { classId: ielts.id, message: 'What is present perfect?' });
    assert.equal(r.status, 200);
    await api(T, 'PUT', '/api/ai/settings', { providers: [{ id: '9router', name: '9Router', baseUrl: 'http://127.0.0.1:9', models: ['m'] }], active: { providerId: '9router', model: 'm' } });
    const bad = await api(S1, 'POST', '/api/ai/chat', { classId: ielts.id, message: 'hello' });
    assert.equal(bad.status, 502);
    assert.ok(!bad.body.error.includes('127.0.0.1'));
  });
}

main().then(() => { console.log(`\nOK — ${passed} kiểm tra đạt`); cleanup(0); }, () => cleanup(1));
function cleanup(code) {
  if (server) server.kill();
  if (mock) mock.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(code);
}
