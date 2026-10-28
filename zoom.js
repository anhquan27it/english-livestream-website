// Meeting SDK: chữ ký chỉ cấp cho thành viên đã vào phòng qua Socket.IO.
const express = require('express');
const crypto = require('crypto');
const store = require('./db');
const video = require('./video');
const zoomUrls = require('./public/js/zoom-urls');
const zoomErrors = require('./public/js/zoom-errors');
const sign = (payload, secret) => {
  const value = [ { alg: 'HS256', typ: 'JWT' }, payload ].map(x => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  return value + '.' + crypto.createHmac('sha256', secret).update(value).digest('base64url');
};
const signature = (z, meetingNumber, role) => { const iat = Math.floor(Date.now() / 1000) - 30; return sign({ appKey: z.clientId, sdkKey: z.clientId, mn: meetingNumber, role, iat, exp: iat + 1800, tokenExp: iat + 1800, video_webrtc_mode: 1 }, z.clientSecret); };
// Legacy desktop assignments must not make a linked meeting owner join as a guest.
const webHost = (user, room) => room.hostMode === 'sdk' || (!!room.hostEmail && store.data.zoomAccounts?.[user.id]?.email === room.hostEmail);
function hostSetup(user, room) {
  if (room.provider !== 'zoom' || !webHost(user, room)) return { canStart: true };
  const z = video.zoomConfig(), account = store.data.zoomAccounts?.[user.id];
  if (!z.redirectUri) return { canStart: false, canConnect: false, code: 'oauth_config', message: 'Admin cần cấu hình OAuth Redirect URL để giáo viên chủ trì trong web.' };
  if (z.redirectUri.startsWith('http:') && !z.publicClientId) return { canStart: false, canConnect: false, code: 'oauth_pkce', message: 'Zoom yêu cầu Public Client OAuth (PKCE) khi dùng callback local HTTP. Bật Use Public Client OAuth trong General App → Basic information → App credentials, rồi nhập Public Client ID vào admin EngLive.' };
  if (!account) return { canStart: false, canConnect: true, code: 'connect', message: 'Liên kết Zoom một lần để mở cuộc họp ngay trong EngLive. Sau khi liên kết, không cần mở Zoom trước.' };
  if (account.email !== room.hostEmail) return { canStart: false, canConnect: true, code: 'account', message: 'Lớp được gán cho ' + room.hostEmail + ', nhưng bạn đang liên kết ' + account.email + '. Hãy liên kết đúng tài khoản hoặc nhờ admin đổi chủ trì.' };
  return { canStart: true, connectedEmail: account.email };
}
function createRouter({ auth, userFromToken, io, lk, lives, findClass, canAccess }) {
  const r = express.Router(), oauthStates = new Map(), refreshes = new Map(), connectionErrors = new Map();
  const accounts = () => store.data.zoomAccounts || (store.data.zoomAccounts = {});
  const request = async (url, opts = {}) => {
    let response;
    try { response = await fetch(url, { ...opts, signal: AbortSignal.timeout(12000) }); }
    catch (cause) { const e = new Error('Không kết nối được máy chủ Zoom.'); e.providerCode = cause.name === 'TimeoutError' ? 'TIMEOUT' : String(cause.cause?.code || 'NETWORK_ERROR').replace(/[^A-Z0-9_]/gi, '').slice(0, 40); throw e; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const e = new Error(typeof data.reason === 'string' ? data.reason : typeof data.message === 'string' ? data.message : typeof data.error_description === 'string' ? data.error_description : typeof data.error === 'string' ? data.error : 'Zoom từ chối yêu cầu.');
      e.httpStatus = response.status;
      e.providerCode = typeof data.code === 'number' || typeof data.code === 'string' ? String(data.code).slice(0, 40) : typeof data.error === 'string' ? data.error.slice(0, 40) : '';
      throw e;
    }
    return data;
  };
  const lastErrorFor = uid => { const error = connectionErrors.get(uid); if (error && error.at > Date.now() - 3600000) return error; connectionErrors.delete(uid); return null; };
  function recordFailure(uid, stage, error, secrets = []) {
    const titles = { token: 'Đổi mã cấp quyền lấy token Zoom', profile: 'Đọc thông tin tài khoản Zoom', zak: 'Lấy quyền chủ trì ZAK', save: 'Lưu liên kết tài khoản', consent: 'Cấp quyền trên Zoom' };
    const hints = { token: 'Kiểm tra Public Client ID của cùng ứng dụng, Public Client OAuth đã bật và callback khớp. Bắt đầu liên kết mới từ EngLive.', profile: 'Kiểm tra Scopes có user:read:user. Sau khi thêm quyền, liên kết và cấp quyền lại.', zak: 'Kiểm tra Scopes có user:read:zak. Sau khi thêm quyền, liên kết và cấp quyền lại.', save: 'Phiên đăng nhập hoặc cấu hình đã thay đổi. Đăng nhập và bắt đầu liên kết lại.', consent: 'Zoom chưa cấp quyền cho ứng dụng. Bắt đầu liên kết lại từ EngLive.' };
    const redact = value => {
      let result = String(value || '');
      for (const secret of secrets) if (typeof secret === 'string' && secret) result = result.split(secret).join('[đã ẩn]');
      return zoomErrors.safeReason(result);
    };
    const item = { at: Date.now(), stage, title: titles[stage] || 'Liên kết Zoom', message: redact(error.message), code: redact(error.providerCode), httpStatus: error.httpStatus || null, hint: hints[stage] || '' };
    connectionErrors.set(uid, item);
    console.error('[zoom oauth]', item.stage, item.httpStatus || '', item.code || '', item.message);
    return item;
  }
  const tokenRequest = (body, publicClientId = '') => {
    const z = video.zoomConfig();
    return request('https://zoom.us/oauth/token', { method: 'POST', headers: { ...(!publicClientId ? { Authorization: 'Basic ' + Buffer.from(z.clientId + ':' + z.clientSecret).toString('base64') } : {}), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(publicClientId ? { ...body, client_id: publicClientId } : body).toString() });
  };
  async function accessToken(uid) {
    const account = accounts()[uid];
    if (!account) throw new Error('Giáo viên cần kết nối Zoom tại trang Tổng quan để chủ trì ngay trong web.');
    if (account.expiresAt > Date.now() + 60000) return account.accessToken;
    if (!refreshes.has(uid)) refreshes.set(uid, (async () => {
      const next = await tokenRequest({ grant_type: 'refresh_token', refresh_token: account.refreshToken }, account.publicClientId || '');
      if (accounts()[uid] !== account) throw new Error('Kết nối Zoom đã thay đổi. Hãy thử lại.');
      Object.assign(account, { accessToken: next.access_token, refreshToken: next.refresh_token, expiresAt: Date.now() + next.expires_in * 1000 }); store.save(); return account.accessToken;
    })().finally(() => refreshes.delete(uid)));
    return refreshes.get(uid);
  }
  r.get('/api/admin/video', auth('admin'), (req, res) => res.json(video.summary(lk)));
  r.put('/api/admin/video', auth('admin'), (req, res) => {
    const b = req.body || {}, current = video.settings(), next = { ...current };
    if (b.defaultProvider !== undefined) {
      if (!video.PROVIDERS.includes(b.defaultProvider)) return res.status(400).json({ error: 'Chỉ chọn Zoom hoặc LiveKit.' });
      next.defaultProvider = b.defaultProvider;
    }
    if (b.date !== undefined) {
      if (!video.validDay(b.date) || (b.provider !== null && !video.PROVIDERS.includes(b.provider))) return res.status(400).json({ error: 'Ngày hoặc dịch vụ không hợp lệ.' });
      next.dailyProviders = { ...current.dailyProviders };
      if (b.provider === null) delete next.dailyProviders[b.date]; else next.dailyProviders[b.date] = b.provider;
    }
    if (b.zoomHostMode !== undefined) {
      if (b.zoomHostMode !== 'sdk') return res.status(400).json({ error: 'Chọn chủ trì trong web.' });
      next.meetings = (current.meetings || []).map(room => ({ ...room, hostMode: 'sdk' }));
    }
    if (b.zoom !== undefined) {
      if (!b.zoom || typeof b.zoom !== 'object') return res.status(400).json({ error: 'Cấu hình Zoom không hợp lệ.' });
      const z = { ...video.zoomConfig() };
      for (const key of ['clientId', 'clientSecret', 'publicClientId', 'redirectUri']) if (b.zoom[key] !== undefined && b.zoom[key] !== '') {
        if (typeof b.zoom[key] !== 'string' || b.zoom[key].length > 2048) return res.status(400).json({ error: 'Thông tin Zoom không hợp lệ.' });
        z[key] = b.zoom[key].trim();
      }
      if (b.zoom.clearSecret) z.clientSecret = '';
      if (z.redirectUri) {
        try { const u = new URL(z.redirectUri); if (u.hostname === 'localhost' || u.pathname !== '/api/zoom/oauth/callback' || u.search || u.hash || u.username || u.password || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(u.hostname)))) throw new Error(); }
        catch { return res.status(400).json({ error: 'Zoom không cho dùng localhost trong OAuth Redirect URL. Dùng http://127.0.0.1:<cổng>/api/zoom/oauth/callback khi thử local, hoặc URL HTTPS của website.' }); }
      }
      const old = video.zoomConfig();
      if (z.publicClientId !== old.publicClientId && [...lives.values()].some(l => l.video?.provider === 'zoom' && l.video.hostMode === 'sdk')) return res.status(409).json({ error: 'Kết thúc buổi Zoom đang chủ trì trong web trước khi đổi Public Client ID.' });
      if ((z.clientId !== old.clientId || z.clientSecret !== old.clientSecret) && [...lives.values()].some(l => l.video?.provider === 'zoom')) return res.status(409).json({ error: 'Kết thúc hoặc chuyển các buổi Zoom sang LiveKit trước khi đổi khóa ứng dụng.' });
      if (z.clientId !== old.clientId || z.clientSecret !== old.clientSecret || z.publicClientId !== old.publicClientId) { store.data.zoomAccounts = {}; oauthStates.clear(); }
      next.zoom = z;
    }
    store.data.settings.video = next; store.audit(req.user, 'video.settings.update', b.date || 'default');
    res.json(video.summary(lk));
  });
  r.put('/api/admin/video/meetings/:classId', auth('admin'), (req, res) => {
    const c = findClass(req.params.classId), b = req.body || {}, date = b.date || '';
    if (!c) return res.status(404).json({ error: 'Không có lớp.' });
    if (date && !video.validDay(date)) return res.status(400).json({ error: 'Ngày không hợp lệ.' });
    const number = typeof b.meetingNumber === 'string' ? b.meetingNumber.replace(/[ -]/g, '') : '';
    const hostEmail = typeof b.hostEmail === 'string' ? b.hostEmail.trim().toLowerCase() : '';
    const hostMode = b.hostMode === undefined ? 'sdk' : b.hostMode;
    if (!/^\d{9,11}$/.test(number) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hostEmail) || !['desktop', 'sdk'].includes(hostMode)) return res.status(400).json({ error: 'Cần Meeting ID (9–11 số), email chủ trì và cách mở Zoom.' });
    const s = video.settings(), old = (s.meetings || []).find(x => x.classId === c.id && x.date === date);
    if (b.password !== undefined && (typeof b.password !== 'string' || b.password.length > 128)) return res.status(400).json({ error: 'Passcode không hợp lệ.' });
    const password = b.clearPassword ? '' : b.password || old?.password || '';
    const row = { classId: c.id, date, meetingNumber: number, password, hostEmail, hostMode };
    s.meetings = [...(s.meetings || []).filter(x => x !== old), row];
    store.audit(req.user, 'zoom.meeting.assign', c.id, date || 'default'); res.json(video.summary(lk));
  });
  r.delete('/api/admin/video/meetings/:classId', auth('admin'), (req, res) => {
    const date = req.query.date || '', s = video.settings();
    s.meetings = (s.meetings || []).filter(x => x.classId !== req.params.classId || x.date !== date);
    store.audit(req.user, 'zoom.meeting.remove', req.params.classId); res.json(video.summary(lk));
  });
  r.get('/api/zoom/connection', auth('teacher'), (req, res) => {
    const a = accounts()[req.user.id], z = video.zoomConfig();
    const pkceRequired = z.redirectUri.startsWith('http:');
    res.json({ configured: !!(z.clientId && z.clientSecret), oauthReady: !!z.redirectUri && (!pkceRequired || !!z.publicClientId), pkceRequired, publicClientReady: !!z.publicClientId, connected: !!a, email: a?.email || '', lastError: lastErrorFor(req.user.id) });
  });
  r.get('/api/zoom/classes/:id/setup', auth('teacher'), (req, res) => {
    const c = findClass(req.params.id);
    if (!c || c.teacherId !== req.user.id) return res.status(403).json({ error: 'Chỉ giáo viên phụ trách kiểm tra cấu hình mở lớp.' });
    try {
      const room = lives.get(c.id)?.video || video.select(lk, c, lives);
      res.json({ provider: room.provider, hostMode: room.hostMode, ...hostSetup(req.user, room) });
    } catch (e) { res.json({ canStart: false, canConnect: false, code: 'config', message: e.message }); }
  });
  r.post('/api/zoom/connect', auth('teacher'), (req, res) => {
    const z = video.zoomConfig();
    if (!z.clientId || !z.clientSecret || !z.redirectUri) return res.status(409).json({ error: 'Admin cần cấu hình ứng dụng Zoom và OAuth Redirect URL trước.' });
    if (new URL(z.redirectUri).hostname === 'localhost') return res.status(409).json({ error: 'Admin cần đổi OAuth Redirect URL từ localhost sang 127.0.0.1 ở cả Zoom Marketplace và EngLive, rồi lưu lại.' });
    if (z.redirectUri.startsWith('http:') && !z.publicClientId) return res.status(409).json({ error: 'Callback local cần PKCE: bật Use Public Client OAuth trong Zoom, rồi nhập Public Client ID ở admin EngLive.' });
    for (const [id, state] of oauthStates) if (state.expiresAt < Date.now() || state.uid === req.user.id) oauthStates.delete(id);
    const state = crypto.randomBytes(32).toString('hex');
    const verifier = z.publicClientId ? crypto.randomBytes(48).toString('base64url') : '';
    const pkce = verifier ? { code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' } : {};
    oauthStates.set(state, { token: req.token, uid: req.user.id, expiresAt: Date.now() + 600000, clientId: z.clientId, publicClientId: z.publicClientId, verifier, redirectUri: z.redirectUri, returnOrigin: zoomUrls.returnOrigin(req.get('origin'), z.redirectUri) });
    res.json({ url: 'https://zoom.us/oauth/authorize?' + new URLSearchParams({ response_type: 'code', client_id: z.publicClientId || z.clientId, redirect_uri: z.redirectUri, state, ...pkce }) });
  });
  r.get('/api/zoom/oauth/callback', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const state = oauthStates.get(req.query.state); oauthStates.delete(req.query.state);
    const u = state && userFromToken(state.token), z = video.zoomConfig();
    if (!state || state.expiresAt < Date.now() || !u || u.id !== state.uid || !['teacher', 'admin'].includes(u.role) || state.clientId !== z.clientId || state.publicClientId !== z.publicClientId || state.redirectUri !== z.redirectUri) return res.status(400).send('Yêu cầu kết nối Zoom đã hết hạn. Quay lại trang giáo viên và kết nối lại.');
    const back = result => res.redirect((state.returnOrigin || '') + '/teacher.html?zoom=' + result);
    if (req.query.error || typeof req.query.code !== 'string') {
      recordFailure(u.id, 'consent', { message: 'Zoom chưa cấp mã xác thực cho ứng dụng.', providerCode: typeof req.query.error === 'string' ? req.query.error : '' }, [z.clientSecret]);
      return back('cancelled');
    }
    let stage = 'token', tokens;
    try {
      tokens = await tokenRequest({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: z.redirectUri, ...(state.verifier ? { code_verifier: state.verifier } : {}) }, state.publicClientId);
      if (typeof tokens.access_token !== 'string' || !tokens.access_token || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token || !(Number(tokens.expires_in) > 0)) throw new Error('Zoom không trả đủ access token, refresh token hoặc thời hạn.');
      stage = 'profile';
      const user = await request('https://api.zoom.us/v2/users/me', { headers: { Authorization: 'Bearer ' + tokens.access_token } });
      if (typeof user.id !== 'string' || !user.id || typeof user.email !== 'string' || !user.email) throw new Error('Zoom không trả đủ thông tin tài khoản.');
      stage = 'zak';
      const permission = await request('https://api.zoom.us/v2/users/me/zak', { headers: { Authorization: 'Bearer ' + tokens.access_token } });
      if (!permission.token) throw new Error('Zoom không trả ZAK token.');
      stage = 'save';
      const latest = video.zoomConfig();
      if (!userFromToken(state.token) || latest.clientId !== z.clientId || latest.clientSecret !== z.clientSecret || latest.publicClientId !== z.publicClientId || latest.redirectUri !== z.redirectUri) throw new Error('Phiên đăng nhập hoặc cấu hình Zoom đã thay đổi.');
      accounts()[u.id] = { zoomId: user.id, email: user.email.toLowerCase(), publicClientId: state.publicClientId, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
      connectionErrors.delete(u.id);
      store.audit(u, 'zoom.connected', u.id); back('connected');
    } catch (e) {
      recordFailure(u.id, stage, e, [z.clientSecret, req.query.code, state.verifier, tokens?.access_token, tokens?.refresh_token]);
      back('error');
    }
  });
  r.delete('/api/zoom/connection', auth('teacher'), (req, res) => { delete accounts()[req.user.id]; store.audit(req.user, 'zoom.disconnected', req.user.id); res.json({ ok: true }); });
  r.post('/api/zoom/join', auth(), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const classId = req.body?.classId, c = findClass(classId), live = lives.get(classId);
    if (!canAccess(req.user, c)) return res.status(403).json({ error: 'Bạn không thuộc lớp học này.' });
    if (!live || live.video?.provider !== 'zoom') return res.status(409).json({ error: 'Buổi học này không sử dụng Zoom.' });
    const teacher = req.user.id === c.teacherId && ['teacher', 'admin'].includes(req.user.role);
    const expectedVideo = live.video;
    const joined = () => {
      if (lives.get(classId) !== live || live.video !== expectedVideo || live.banned?.has(req.user.id) || !canAccess(req.user, findClass(classId))) return false;
      const match = sid => { const s = io.sockets.sockets.get(sid); return s?.connected && s.data.token === req.token && s.data.classId === classId; };
      return teacher ? match(live.teacherSocket) : req.user.role === 'student' && [...live.viewers].some(([sid, v]) => v.userId === req.user.id && match(sid));
    };
    if (!joined()) return res.status(403).json({ error: 'Bạn cần tham gia phòng học trước khi kết nối Zoom.' });
    try {
      const room = live.video, z = video.zoomConfig();
      if (!z.clientId || !z.clientSecret) return res.status(409).json({ error: 'Chưa cấu hình Zoom Meeting SDK.' });
      let zak, role = 0;
      if (teacher && webHost(req.user, room)) {
        if (accounts()[req.user.id]?.email !== room.hostEmail) return res.status(409).json({ error: 'Kết nối đúng tài khoản Zoom chủ trì (' + room.hostEmail + ') ở trang giáo viên trước.' });
        const token = await accessToken(req.user.id);
        const data = await request('https://api.zoom.us/v2/users/me/zak', { headers: { Authorization: 'Bearer ' + token } });
        if (!data.token) throw new Error('Không lấy được quyền chủ trì Zoom.');
        zak = data.token; role = 1;
      }
      if (!joined()) return res.status(403).json({ error: 'Bạn đã rời phòng học.' });
      res.json({ sdkKey: z.clientId, signature: signature(z, room.meetingNumber, role), meetingNumber: room.meetingNumber, passWord: room.password, userName: req.user.name, userEmail: teacher ? room.hostEmail : '', zak, hostInDesktop: teacher && room.hostMode === 'desktop' && role !== 1, sdkVersion: '6.2.0' });
    } catch { res.status(502).json({ error: 'Chưa lấy được quyền chủ trì Zoom. Kiểm tra quyền OAuth và kết nối lại tài khoản.' }); }
  });
  return r;
}
module.exports = { createRouter, signature, hostSetup };
