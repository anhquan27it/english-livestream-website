const assert = require('node:assert/strict');
const crypto = require('node:crypto');
module.exports = async ({ api, test, connect, emit, nextEvent, A, T, S1, S3, lessonId, restart }) => {
  console.log('Zoom Meeting SDK và lựa chọn dịch vụ theo ngày');
  await test('URL callback dùng IP loopback và chỉ quay lại đúng origin/cổng ban đầu', async () => {
    const urls = require('../public/js/zoom-urls');
    assert.equal(urls.callback('http://localhost:3000'), 'http://127.0.0.1:3000/api/zoom/oauth/callback');
    assert.equal(urls.callback('https://school.example'), 'https://school.example/api/zoom/oauth/callback');
    const redirect = 'http://127.0.0.1:3000/api/zoom/oauth/callback';
    assert.equal(urls.returnOrigin('http://localhost:3000', redirect), 'http://localhost:3000');
    for (const origin of ['https://evil.example', 'http://localhost:4000', 'https://localhost:3000', 'http://localhost:3000@evil.example', 'null']) assert.equal(urls.returnOrigin(origin, redirect), '');
  });
  await test('lỗi Zoom giữ lý do cụ thể, không đoán mã 3000, che token trong thông báo', async () => {
    const errors = require('../public/js/zoom-errors');
    const detail = errors.message({ errorCode: 3000, errorMessage: 'Already has other meetings in progress' });
    assert.match(detail, /cuộc họp khác/); assert.match(detail, /Zoom: Already/);
    assert.match(errors.message({ errorCode: 3000 }), /Chưa đủ thông tin/);
    assert.match(errors.message({ errorCode: 3000, reason: 'The current sdk version is no longer supported' }), /nâng phiên bản/);
    const safe = errors.message({ errorCode: -3000, reason: 'connection error https://zoom.us/wc/info?signature=private signature=private jwt eyJheader.payload.signature' });
    assert.ok(!safe.includes('private')); assert.ok(!safe.includes('eyJheader.payload.signature'));
    assert.match(safe, /mã -3000/);
  });
  await test('OAuth Zoom: PKCE, quyền host, lỗi từng bước token/profile/ZAK/mạng và che thông tin nhạy cảm', async () => {
    const result = require('node:child_process').spawnSync(process.execPath, [require('node:path').join(__dirname, 'zoom-oauth-check.js')], { encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, 0, result.stderr);
  });
  let date, c, second, ts, ss;
  const secret = 'zoom-test-secret-never-real';
  await test('chỉ admin được cấu hình Zoom và dịch vụ theo ngày', async () => {
    for (const token of [T, S1]) {
      assert.equal((await api(token, 'GET', '/api/admin/video')).status, 403);
      assert.equal((await api(token, 'PUT', '/api/admin/video', { defaultProvider: 'zoom' })).status, 403);
    }
    const settings = (await api(A, 'GET', '/api/admin/video')).body; date = settings.today;
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal((await api(A, 'PUT', '/api/admin/video', { date: '2026-02-30', provider: 'zoom' })).status, 400);
    assert.equal((await api(A, 'PUT', '/api/admin/video', { defaultProvider: 'other' })).status, 400);
    assert.equal((await api(A, 'PUT', '/api/admin/video', { defaultProvider: 'zoom', date, provider: null })).status, 200);
    c = (await api(T, 'POST', '/api/classes', { name: 'Zoom test' })).body.class;
    assert.equal((await api(T, 'POST', `/api/classes/${c.id}/live`)).status, 409);
  });
  await test('khóa và passcode Zoom không lộ qua cấu hình admin hay API lớp', async () => {
    assert.equal((await api(A, 'PUT', '/api/admin/video', { zoom: { redirectUri: 'http://localhost:3000/api/zoom/oauth/callback' } })).status, 400);
    const saved = await api(A, 'PUT', '/api/admin/video', { zoom: { clientId: 'test-sdk-id', clientSecret: secret, publicClientId: 'test-public-id', redirectUri: 'http://127.0.0.1:3000/api/zoom/oauth/callback' } });
    assert.equal(saved.status, 200); assert.equal(saved.body.zoom.hasSecret, true); assert.ok(!JSON.stringify(saved.body).includes(secret));
    assert.equal((await api(A, 'PUT', '/api/admin/video/meetings/' + c.id, { meetingNumber: '123 456 7890', password: 'testpass', hostEmail: 'host@test.com', hostMode: 'desktop' })).status, 200);
    assert.equal((await api(T, 'POST', `/api/classes/${c.id}/students`, { email: 'student1@demo.com' })).status, 200);
    assert.ok(!JSON.stringify((await api(S1, 'GET', '/api/classes')).body).includes('testpass'));
    assert.ok(!JSON.stringify((await api(A, 'GET', '/api/admin/video')).body).includes('testpass'));
  });
  await test('chủ trì web: chặn mở buổi khi chưa liên kết, hướng dẫn đúng tài khoản và chỉ admin đổi hàng loạt', async () => {
    assert.equal((await api(T, 'PUT', '/api/admin/video', { zoomHostMode: 'sdk' })).status, 403);
    const bulk = await api(A, 'PUT', '/api/admin/video', { zoomHostMode: 'sdk' });
    assert.equal(bulk.status, 200); assert.ok(bulk.body.meetings.every(room => room.hostMode === 'sdk'));
    const ready = await api(T, 'GET', '/api/zoom/classes/' + c.id + '/setup');
    assert.equal(ready.status, 200); assert.equal(ready.body.code, 'connect'); assert.equal(ready.body.canStart, false); assert.equal(ready.body.canConnect, true);
    assert.equal((await api(S1, 'GET', '/api/zoom/classes/' + c.id + '/setup')).status, 403);
    const opened = await api(T, 'POST', '/api/classes/' + c.id + '/live');
    assert.equal(opened.status, 409); assert.equal(opened.body.code, 'connect');
    assert.equal((await api(T, 'GET', '/api/classes/' + c.id)).body.class.live, null);
    await api(A, 'PUT', '/api/admin/video/meetings/' + c.id, { meetingNumber: '1234567890', hostEmail: 'host@test.com', hostMode: 'desktop' });
  });
  await test('Zoom khóa theo ngày Việt Nam, lớp không tự dùng LiveKit khi thiếu phòng', async () => {
    assert.equal((await api(A, 'PUT', '/api/admin/video', { date, provider: 'zoom' })).status, 200);
    const started = await api(T, 'POST', `/api/classes/${c.id}/live`, { title: 'Zoom lesson' });
    assert.equal(started.status, 200); assert.equal(started.body.live.provider, 'zoom');
    assert.equal((await api(S1, 'POST', '/api/zoom/join', { classId: c.id })).status, 403);
    assert.equal((await api(S3, 'POST', '/api/zoom/join', { classId: c.id })).status, 403);
    assert.equal((await api(A, 'POST', '/api/zoom/join', { classId: c.id })).status, 403);
    assert.equal((await api(T, 'POST', '/api/livekit/token', { classId: c.id })).status, 409);
    second = (await api(T, 'POST', '/api/classes', { name: 'Other Zoom class' })).body.class;
    assert.equal((await api(T, 'POST', `/api/classes/${second.id}/live`)).status, 409);
  });
  await test('chữ ký SDK có đúng phòng, role người tham gia, HMAC và thời hạn', async () => {
    ts = await connect(T); ss = await connect(S1);
    assert.ok((await emit(ts, 'room:join', { classId: c.id })).ok);
    assert.ok((await emit(ss, 'room:join', { classId: c.id })).ok);
    for (const token of [T, S1]) {
      const joined = await api(token, 'POST', '/api/zoom/join', { classId: c.id, role: 1, meetingNumber: '99999999999' });
      assert.equal(joined.status, 200);
      const [header, body, signature] = joined.body.signature.split('.');
      assert.equal(crypto.createHmac('sha256', secret).update(header + '.' + body).digest('base64url'), signature);
      const claims = JSON.parse(Buffer.from(body, 'base64url'));
      assert.equal(claims.mn, '1234567890'); assert.equal(claims.role, 0); assert.equal(claims.exp - claims.iat, 1800);
      assert.equal(joined.body.zak, undefined);
    }
    assert.equal((await emit(ts, 'breakout:start', { size: 2 })).error.includes('Zoom'), true);
  });
  await test('Zoom Basic không cho hai lớp chung phòng hoặc cùng chủ trì đồng thời', async () => {
    const assign = body => api(A, 'PUT', '/api/admin/video/meetings/' + second.id, { password: 'p', hostMode: 'desktop', ...body });
    await assign({ meetingNumber: '1234567890', hostEmail: 'other@test.com' });
    assert.equal((await api(T, 'POST', `/api/classes/${second.id}/live`)).status, 409);
    await assign({ meetingNumber: '9876543210', hostEmail: 'host@test.com' });
    assert.equal((await api(T, 'POST', `/api/classes/${second.id}/live`)).status, 409);
  });
  await test('đổi cấu hình ngày không đổi phòng đang học và không cho đổi khóa khi đang dùng', async () => {
    await api(A, 'PUT', '/api/admin/video', { date, provider: 'livekit' });
    assert.equal((await api(T, 'GET', '/api/classes/' + c.id)).body.class.live.provider, 'zoom');
    assert.equal((await api(A, 'PUT', '/api/admin/video', { zoom: { clientSecret: 'other-secret' } })).status, 409);
  });
  await test('admin chuyển Zoom sang LiveKit giữ slide và buổi học, cấp token đúng dịch vụ mới', async () => {
    assert.ok((await emit(ts, 'lesson:present', { lessonId })).ok);
    const changed = nextEvent(ss, 'video:changed');
    assert.equal((await api(A, 'PUT', '/api/admin/video/lives/' + c.id, { provider: 'livekit' })).status, 200);
    assert.equal((await changed).provider, 'livekit');
    assert.ok((await emit(ss, 'room:join', { classId: c.id })).lesson);
    assert.equal((await api(S1, 'POST', '/api/zoom/join', { classId: c.id })).status, 409);
    assert.equal((await api(S1, 'POST', '/api/livekit/token', { classId: c.id })).status, 200);
    assert.equal((await api(S1, 'PUT', '/api/admin/video/lives/' + c.id, { provider: 'zoom' })).status, 403);
  });
  await test('chủ trì trong web cần liên kết đúng tài khoản, không cấp ZAK cho học sinh', async () => {
    await api(A, 'PUT', '/api/admin/video/meetings/' + c.id, { meetingNumber: '1234567890', hostEmail: 'host@test.com', hostMode: 'sdk' });
    assert.equal((await api(A, 'PUT', '/api/admin/video/lives/' + c.id, { provider: 'zoom' })).status, 200);
    assert.equal((await api(T, 'POST', '/api/zoom/join', { classId: c.id })).status, 409);
    const student = await api(S1, 'POST', '/api/zoom/join', { classId: c.id });
    assert.equal(student.status, 200); assert.equal(student.body.zak, undefined);
    assert.equal((await api(null, 'GET', '/api/zoom/oauth/callback?state=invalid&code=x')).status, 400);
    const auth = (await api(T, 'POST', '/api/zoom/connect')).body;
    assert.equal(new URL(auth.url).hostname, 'zoom.us'); assert.ok(new URL(auth.url).searchParams.get('state'));
    assert.ok(!auth.url.includes(secret));
  });
  await test('khởi động lại giữ cấu hình ngày và dịch vụ của buổi Zoom', async () => {
    ts.close(); ss.close(); await restart();
    assert.equal((await api(T, 'GET', '/api/classes/' + c.id)).body.class.live.provider, 'zoom');
    assert.equal((await api(A, 'GET', '/api/admin/video')).body.todayProvider, 'livekit');
    assert.equal((await api(S1, 'POST', '/api/zoom/join', { classId: c.id })).status, 403);
    await api(T, 'DELETE', '/api/classes/' + c.id + '/live');
    await api(A, 'DELETE', '/api/admin/classes/' + c.id);
    await api(A, 'DELETE', '/api/admin/classes/' + second.id);
    await api(A, 'PUT', '/api/admin/video', { defaultProvider: 'livekit', date, provider: null });
  });
};
