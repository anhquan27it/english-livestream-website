const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const store = require('./db');
const lessons = require('./lessons');
const presentMod = require('./present');
const aiRoutes = require('./aiRoutes');
const interactMod = require('./interact');
const recordings = require('./recordings');
const writingMod = require('./writing');
const pdfshareMod = require('./pdfshare');
const breakoutMod = require('./breakout');
const livekitMod = require('./livekit');
const operations = require('./operations');
const sessions = require('./sessions');
const videoProvider = require('./video');
const zoom = require('./zoom');

store.lock();
store.applyAdminSetup();
const app = express();
const server = http.createServer(app);
const security = require('./security');
const io = new Server(server, { maxHttpBufferSize: 512 * 1024 }); // gói socket lớn nhất 512 KB

app.disable('x-powered-by');
app.use(security.headers({ getLivekitUrl: () => (lk.enabled ? lk.config.publicUrl : '') }));

app.use(express.json({ limit: '2mb' }));
// A successful HTTP response must not precede its PostgreSQL commit.
app.use((req,res,next)=>{
  if(store.driver==='postgres') {
    const send=res.json;
    res.json=function(body) {
      if(res.statusCode<400) try { store.flush(); }
      catch { res.status(503); return send.call(this,{error:'Không lưu được dữ liệu. Kiểm tra PostgreSQL và khởi động lại server.'}); }
      return send.call(this,body);
    };
  }
  next();
});
app.use('/zoom-embed.html', (req, res, next) => { res.set({ 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }); next(); });
app.use(express.static(path.join(__dirname, 'public')));

// Kiểm tra dịch vụ sau khi triển khai, không cần đăng nhập.
app.get('/healthz', (req, res) => res.json({ ok: true, storage: store.driver }));

// ---------- Trạng thái livestream (trong bộ nhớ) ----------
// classId -> { title, startedAt, teacherSocket, viewers: Map<socketId, {userId, name, hand}>, attendees:Set, peak, word }
// Thêm: lesson (bản chụp bài giảng đang chiếu), slideIndex, activity (hoạt động đang mở), scores (điểm theo học sinh) - xem present.js
const lives = sessions.restore();
const present = presentMod.init({ io, lives });
const lk = livekitMod.create(); // LiveKit (video/âm thanh); tắt nếu chưa cấu hình, khi đó dùng WebRTC P2P
const interact = interactMod.init({ io, lives, present, lk });
const writing = writingMod.init({ io, lives });
const breakout = breakoutMod.init({ io, lives, lk, onGroupStart: (live, classId) => interact.setSpeaker(live, classId, null) });
for (const live of lives.values()) if (live.activity && live.activity.phase === 'open') present.endActivity(live);
const checkpoint = () => sessions.checkpoint(lives);
let checkpointTimer = null;
const requestCheckpoint = () => { if (!checkpointTimer) checkpointTimer = setTimeout(() => { checkpointTimer = null; checkpoint(); }, 200); };
setInterval(checkpoint, 5000).unref();
setInterval(() => { try { store.backup(); } catch (e) { console.error('[backup]', e.message); } }, 86400000).unref();
try {
  const fs = require('fs'), folder = path.join(store.dir, 'backups'), today = 'db-' + new Date().toISOString().slice(0, 10);
  if (!fs.existsSync(folder) || !fs.readdirSync(folder).some(n => n.startsWith(today))) store.backup();
} catch (e) { console.error('[backup]', e.message); }

// ---------- Helpers ----------
const db = () => store.data;
const findUser = (id) => db().users.find((u) => u.id === id);
const findClass = (id) => db().classes.find((c) => c.id === id);
const capacity = require('./class-capacity');
const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status || 'active' };

function liveInfo(classId) {
  const live = lives.get(classId);
  if (!live) return null;
  return { title: live.title, startedAt: live.startedAt, viewers: live.viewers.size, teacherOnline: !!live.teacherSocket, provider: live.video?.provider || (lk.enabled ? 'livekit' : 'p2p') };
}

// Tóm tắt cho thẻ lớp: buổi học sắp tới, bài tập, lần dạy gần nhất (thẻ lớp hiện nhiều thông tin hơn)
function nextSchedule(classId) {
  const now = Date.now();
  const s = db().schedules.filter((x) => x.classId === classId && x.endsAt > now).sort((a, b) => a.startsAt - b.startsAt)[0];
  return s ? { title: s.title, startsAt: s.startsAt, endsAt: s.endsAt } : null;
}
function teacherSummary(c) {
  const now = Date.now();
  const hw = db().assignments.filter((a) => a.classId === c.id);
  const ids = new Set(hw.map((a) => a.id));
  const toGrade = db().submissions.filter((s) => ids.has(s.assignmentId) && !s.gradedAt).length;
  const last = c.history[0];
  return { next: nextSchedule(c.id), openAssignments: hw.filter((a) => a.dueAt > now).length, toGrade, lastSessionAt: last ? last.endedAt || last.startedAt : null, lastAttendance: last ? (last.attendees || []).length : null };
}
function studentSummary(c, userId) {
  const now = Date.now();
  const mine = new Set(db().submissions.filter((s) => s.userId === userId).map((s) => s.assignmentId));
  const todo = db().assignments.filter((a) => a.classId === c.id && a.dueAt > now && !mine.has(a.id)).sort((a, b) => a.dueAt - b.dueAt);
  const last = c.history[0];
  return { next: nextSchedule(c.id), homeworkTodo: todo.length, homeworkDue: todo.length ? todo[0].dueAt : null, lastSessionAt: last ? last.endedAt || last.startedAt : null };
}

function classForTeacher(c) {
  return {
    ...c, maxStudents: capacity.limit(c), summary: teacherSummary(c),
    students: c.studentIds.map(findUser).filter(Boolean).map(publicUser),
    pending: c.pendingIds.map(findUser).filter(Boolean).map(publicUser),
    live: liveInfo(c.id),
  };
}

function classForStudent(c, userId) {
  const teacher = findUser(c.teacherId);
  const isMember = c.studentIds.includes(userId);
  return {
    id: c.id,
    name: c.name,
    level: c.level,
    description: c.description,
    color: c.color,
    teacher: teacher ? teacher.name : '',
    studentCount: c.studentIds.length, maxStudents: capacity.limit(c),
    status: isMember ? 'member' : 'pending',
    live: isMember ? liveInfo(c.id) : null,
    attended: c.history.filter((h) => (h.attendees || []).includes(userId)).length,
    sessions: c.history.length,
    summary: isMember ? studentSummary(c, userId) : null,
  };
}

function canAccessLive(user, c) {
  if (!user || !c || user.status === 'blocked' || user.status === 'pending') return false;
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') return c.teacherId === user.id;
  if (user.role === 'assistant') return (c.assistantIds || []).includes(user.id);
  return c.studentIds.includes(user.id);
}

// Báo cho giáo viên + học sinh của lớp biết trạng thái lớp đã thay đổi
function notifyClass(c) {
  const ids = [c.teacherId, ...c.studentIds, ...c.pendingIds];
  ids.forEach((uid) => io.to('user:' + uid).emit('classes:changed', { classId: c.id, live: liveInfo(c.id) }));
}

// ---------- Auth ----------
function issueToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db().tokens[token] = { userId, createdAt: Date.now(), expiresAt: Date.now() + 7 * 86400000 };
  store.save();
  return token;
}

function userFromToken(token) {
  const t = token && db().tokens[token];
  if (!t || Date.now() >= (t.expiresAt || t.createdAt + 7 * 86400000)) return null;
  const u = findUser(t.userId);
  return u && !['blocked', 'pending'].includes(u.status) ? u : null;
}

function auth(role) {
  return (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const user = userFromToken(token);
    if (!user) return res.status(401).json({ error: 'Vui lòng đăng nhập lại.' });
    if (role && user.role !== role && !(role === 'teacher' && user.role === 'admin')) return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
    req.user = user;
    req.token = token;
    next();
  };
}

const loginHits = new Map();
function authLimit(req, res, next) {
  const now = Date.now(), key = req.ip;
  const entry = loginHits.get(key);
  const hit = entry && entry.until > now ? entry : { count: 0, until: now + 60000 };
  hit.count++; loginHits.set(key, hit);
  if (loginHits.size > 10000) for (const [k, v] of loginHits) if (v.until <= now) loginHits.delete(k);
  if (hit.count > 30) return res.status(429).json({ error: 'Thử quá nhiều lần. Đợi một phút rồi thử lại.' });
  next();
}
app.post('/api/register', authLimit, (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin.' });
  if (!['teacher', 'student'].includes(role)) return res.status(400).json({ error: 'Vai trò không hợp lệ.' });
  if (typeof password !== 'string' || password.length < 6 || password.length > 128 || typeof name !== 'string' || name.trim().length > 100 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) return res.status(400).json({ error: 'Tên/email không hợp lệ hoặc mật khẩu phải có 6–128 ký tự.' });
  const mail = String(email).trim().toLowerCase();
  if (db().users.some((u) => u.email === mail)) return res.status(400).json({ error: 'Email đã được sử dụng.' });
  const user = { id: store.id('u'), name: String(name).trim(), email: mail, role, status: role === 'teacher' ? 'pending' : 'active', password: store.hashPassword(password), createdAt: Date.now() };
  db().users.push(user);
  store.save();
  if (user.status === 'pending') return res.status(202).json({ pending: true, message: 'Đăng ký thành công. Chờ quản trị viên duyệt tài khoản giáo viên.' });
  res.json({ token: issueToken(user.id), user: publicUser(user) });
});

app.post('/api/login', authLimit, (req, res) => {
  const { email, password } = req.body || {};
  const user = db().users.find((u) => u.email === String(email || '').trim().toLowerCase());
  if (!user || !store.verifyPassword(String(password || ''), user.password)) {
    return res.status(400).json({ error: 'Email hoặc mật khẩu không đúng.' });
  }
  if (['blocked', 'pending'].includes(user.status)) return res.status(403).json({ error: user.status === 'pending' ? 'Tài khoản đang chờ quản trị viên duyệt.' : 'Tài khoản đã bị khóa.' });
  res.json({ token: issueToken(user.id), user: publicUser(user) });
});

app.post('/api/logout', auth(), (req, res) => {
  delete db().tokens[req.token];
  for (const s of io.sockets.sockets.values()) if (s.data.token === req.token) s.disconnect(true);
  store.save();
  res.json({ ok: true });
});

app.get('/api/me', auth(), (req, res) => res.json({ user: publicUser(req.user) }));
app.post('/api/me/password', auth(), (req, res) => {
  const { currentPassword, password } = req.body || {};
  if (!store.verifyPassword(String(currentPassword || ''), req.user.password) || typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Mật khẩu hiện tại sai hoặc mật khẩu mới cần 8–128 ký tự.' });
  req.user.password = store.hashPassword(password); revokeUser(req.user.id); store.audit(req.user, 'password.changed', req.user.id); res.json({ ok: true });
});

// ---------- Bài giảng + AI ----------
lessons.recoverJobs();
app.use(lessons.createRouter({ auth, findClass }));
app.use(aiRoutes.createRouter({ auth, lives, findClass, canAccess: canAccessLive }));
app.use(recordings.createRouter({ auth, findClass, canAccess: canAccessLive }));
const listening = require('./listening').init({ io, lives, auth, findClass, canAccess: canAccessLive });
app.use(listening.router);
const pdfshare = pdfshareMod.init({ io, lives, auth, findClass, canAccess: canAccessLive, present });
app.use(pdfshare.router);
app.use(livekitMod.createRouter({
  lk, auth, lives, io, findClass, canAccess: canAccessLive,
  viewerUserId: (live, sid) => (live.viewers.get(sid) || {}).userId,
  groupForUser: breakout.groupForUser,
}));
app.use(operations.createRouter({ auth, lives, lk, findClass, canAccess: canAccessLive, endLive, revokeUser, publicUser, notifyClass, checkpoint }));
app.use(zoom.createRouter({ auth, userFromToken, io, lk, lives, findClass, canAccess: canAccessLive }));
app.put('/api/admin/video/lives/:id', auth('admin'), async (req, res) => {
  const c = findClass(req.params.id), live = lives.get(req.params.id), provider = req.body?.provider;
  if (!c || !live) return res.status(404).json({ error: 'Buổi học đã kết thúc.' });
  if (!videoProvider.PROVIDERS.includes(provider)) return res.status(400).json({ error: 'Chỉ chọn Zoom hoặc LiveKit.' });
  try {
    const next = videoProvider.select(lk, c, lives, provider), old = live.video;
    if (old?.provider === provider) return res.json({ ok: true });
    await interact.setSpeaker(live, c.id, null);
    if (lives.get(c.id) !== live || live.video !== old) return res.status(409).json({ error: 'Buổi học đã thay đổi. Hãy tải lại.' });
    breakout.end(live, c.id, 'Admin chuyển dịch vụ video.');
    if (old?.provider !== 'zoom') lk.endRooms(c.id, []);
    live.video = next;
    live.providerChanges = [...(live.providerChanges || []), { provider, at: Date.now() }];
    checkpoint(); store.audit(req.user, 'video.live.switch', c.id, provider);
    io.to('live:' + c.id).emit('video:changed', { provider }); notifyClass(c);
    res.json({ ok: true });
  } catch (e) { res.status(409).json({ error: e.message }); }
});

// ---------- Lớp học ----------
app.get('/api/classes', auth(), (req, res) => {
  const u = req.user;
  if (u.role === 'teacher' || u.role === 'admin') {
    return res.json({ classes: db().classes.filter((c) => c.teacherId === u.id).map(classForTeacher) });
  }
  const list = db().classes.filter((c) => c.studentIds.includes(u.id) || c.pendingIds.includes(u.id) || (c.assistantIds || []).includes(u.id));
  res.json({ classes: list.map((c) => classForStudent(c, u.id)) });
});

app.get('/api/classes/:id', auth(), (req, res) => {
  const c = findClass(req.params.id);
  if (!canAccessLive(req.user, c)) return res.status(403).json({ error: 'Bạn không thuộc lớp học này.' });
  const teacher = findUser(c.teacherId);
  const manager = c.teacherId === req.user.id || req.user.role === 'admin';
  res.json({ class: { id: c.id, name: c.name, level: c.level, color: c.color, teacher: teacher && teacher.name, studentCount: c.studentIds.length, maxStudents: capacity.limit(c), live: liveInfo(c.id), ...(manager ? { code: c.code } : {}) } });
});

const COLORS = ['violet', 'orange', 'teal', 'pink', 'blue'];

app.get('/api/classes/:id/sessions/:sessionId/review', auth(), (req, res) => {
  const c = findClass(req.params.id);
  if (!canAccessLive(req.user, c)) return res.status(403).json({ error: 'Bạn không thuộc lớp học này.' });
  const h = c.history.find(x => x.id === req.params.sessionId);
  if (!h || !h.reviewLessons || !h.reviewLessons.length) return res.status(404).json({ error: 'Buổi học không có slide để xem lại.' });
  res.json({ session: { title: h.title, startedAt: h.startedAt, lessons: h.reviewLessons } });
});

app.post('/api/classes', auth('teacher'), (req, res) => {
  const { name, level, description, color, maxStudents } = req.body || {};
  const limit = capacity.parse(maxStudents);
  if (!limit) return res.status(400).json({ error: 'Sĩ số tối đa phải là số nguyên từ 1 đến 1000.' });
  if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên lớp.' });
  const c = {
    id: store.id('c'),
    name: String(name).trim(),
    level: level || 'A1',
    description: description || '',
    color: COLORS.includes(color) ? color : COLORS[db().classes.length % COLORS.length],
    code: store.classCode(),
    teacherId: req.user.id,
    studentIds: [], maxStudents: limit,
    pendingIds: [],
    history: [],
    createdAt: Date.now(),
  };
  db().classes.push(c);
  store.save();
  res.json({ class: classForTeacher(c) });
});

function ownClass(req, res) {
  const c = findClass(req.params.id);
  if (!c || c.teacherId !== req.user.id) {
    res.status(404).json({ error: 'Không tìm thấy lớp học.' });
    return null;
  }
  return c;
}

app.delete('/api/classes/:id', auth('teacher'), (req, res) => {
  const c = ownClass(req, res);
  if (!c) return;
  endLive(c, 'Lớp học đã bị xoá.');
  store.removeClassData(c.id);
  store.save();
  notifyClass(c);
  res.json({ ok: true });
});

app.post('/api/classes/:id/students', auth('teacher'), (req, res) => {
  const c = ownClass(req, res);
  if (!c) return;
  const mail = String((req.body || {}).email || '').trim().toLowerCase();
  const s = db().users.find((u) => u.email === mail);
  if (!s) return res.status(404).json({ error: 'Không tìm thấy học sinh với email này.' });
  if (s.role !== 'student') return res.status(400).json({ error: 'Tài khoản này không phải học sinh.' });
  if (c.studentIds.includes(s.id)) return res.status(400).json({ error: 'Học sinh đã có trong lớp.' });
  if (c.studentIds.length >= capacity.limit(c)) return res.status(409).json({ error: 'Lớp đã đủ sĩ số tối đa.' });
  c.pendingIds = c.pendingIds.filter((x) => x !== s.id);
  c.studentIds.push(s.id);
  store.save();
  notifyClass(c);
  res.json({ class: classForTeacher(c) });
});

app.delete('/api/classes/:id/students/:sid', auth('teacher'), (req, res) => {
  const c = ownClass(req, res);
  if (!c) return;
  const sid = req.params.sid;
  const wasMember = c.studentIds.includes(sid);
  c.studentIds = c.studentIds.filter((x) => x !== sid);
  c.pendingIds = c.pendingIds.filter((x) => x !== sid);
  store.save();
  if (wasMember) kickUserFromLive(c.id, sid, 'Bạn đã bị xoá khỏi lớp học.');
  notifyClass(c);
  io.to('user:' + sid).emit('classes:changed', { classId: c.id });
  res.json({ class: classForTeacher(c) });
});

app.post('/api/classes/:id/requests/:sid/:action', auth('teacher'), (req, res) => {
  const c = ownClass(req, res);
  if (!c) return;
  const { sid, action } = req.params;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Thao tác không hợp lệ.' });
  if (!c.pendingIds.includes(sid)) return res.status(404).json({ error: 'Không có yêu cầu này.' });
  if (action === 'approve' && !c.studentIds.includes(sid) && c.studentIds.length >= capacity.limit(c)) return res.status(409).json({ error: 'Lớp đã đủ sĩ số tối đa.' });
  c.pendingIds = c.pendingIds.filter((x) => x !== sid);
  if (action === 'approve' && !c.studentIds.includes(sid)) c.studentIds.push(sid);
  store.save();
  notifyClass(c);
  io.to('user:' + sid).emit('classes:changed', { classId: c.id });
  res.json({ class: classForTeacher(c) });
});

app.post('/api/classes/:id/code', auth('teacher'), (req, res) => {
  const c = ownClass(req, res);
  if (!c) return;
  c.code = store.classCode();
  store.save();
  res.json({ class: classForTeacher(c) });
});

// Học sinh xin vào lớp bằng mã lớp -> chờ giáo viên duyệt
app.post('/api/join', auth('student'), (req, res) => {
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  const c = db().classes.find((x) => x.code === code);
  if (!c) return res.status(404).json({ error: 'Mã lớp không tồn tại.' });
  if (c.studentIds.includes(req.user.id)) return res.status(400).json({ error: 'Bạn đã ở trong lớp này.' });
  if (c.pendingIds.includes(req.user.id)) return res.status(400).json({ error: 'Bạn đã gửi yêu cầu, hãy chờ giáo viên duyệt.' });
  c.pendingIds.push(req.user.id);
  store.save();
  notifyClass(c);
  res.json({ ok: true, className: c.name });
});

// ---------- Livestream ----------
app.post('/api/classes/:id/live', auth('teacher'), (req, res) => {
  const c = ownClass(req, res);
  if (!c) return;
  if (!lives.has(c.id)) {
    let video;
    try { video = videoProvider.select(lk, c, lives); }
    catch (e) { return res.status(409).json({ error: e.message }); }
    const setup = zoom.hostSetup(req.user, video);
    if (!setup.canStart) return res.status(409).json({ error: setup.message, code: setup.code });
    const title = String((req.body || {}).title || '').trim() || 'Buổi học trực tiếp';
    lives.set(c.id, { classId: c.id, title, video, startedAt: Date.now(), teacherSocket: null, viewers: new Map(), attendees: new Set(), attendance: {}, banned: new Set(), revealed: new Set(), scored: new Set(), peak: 0, word: null, lesson: null, slideIndex: 0, activity: null, scores: new Map(), speaker: null, pad: null, pdf: null, breakout: null });
    checkpoint();
    notifyClass(c);
  }
  res.json({ live: liveInfo(c.id) });
});

app.delete('/api/classes/:id/live', auth('teacher'), (req, res) => {
  const c = ownClass(req, res);
  if (!c) return;
  endLive(c, 'Giáo viên đã kết thúc buổi học.');
  res.json({ ok: true, class: classForTeacher(c) });
});

function endLive(c, reason) {
  const live = lives.get(c.id);
  if (!live) return;
  present.endActivity(live);
  const taught = live.lesson || live.lastLesson;
  const lesson = taught && db().lessons.find(l => l.id === taught.id);
  if (lesson) lesson.taught[c.id] = Date.now();
  for (const sid of [...live.viewers.keys()]) closeAttendance(live, sid);
  const groupIds = live.breakout ? live.breakout.groups.map((g) => g.id) : [];
  breakout.end(live, c.id, 'Buổi học đã kết thúc.');
  if (live.video?.provider !== 'zoom') lk.endRooms(c.id, groupIds);
  c.history.unshift({
    id: store.id('session'), reviewLessons: (live.reviewLessons || []).filter(l => l.slides.length),
    provider: live.video?.provider || (lk.enabled ? 'livekit' : 'p2p'),
    title: live.title,
    startedAt: live.startedAt,
    endedAt: Date.now(),
    peak: live.peak,
    attendees: [...live.attendees],
    lessonTitle: taught ? taught.title : '',
    scores: present.ranking(live),
    attendance: live.attendance || {}, pad: live.pad ? { prompt: live.pad.prompt, entries: [...live.pad.entries], featured: live.pad.featured } : null,
  });
  store.save();
  listening.drop(live); // xóa file nghe của buổi
  io.to('live:' + c.id).emit('live:ended', { reason });
  io.in('live:' + c.id).socketsLeave('live:' + c.id);
  lives.delete(c.id);
  checkpoint();
  notifyClass(c);
}

function kickUserFromLive(classId, userId, reason, ban = true) {
  const live = lives.get(classId);
  if (!live) return;
  live.banned = live.banned || new Set(); if (ban) live.banned.add(userId);
  if (live.video?.provider !== 'zoom') lk.removeUser(classId, userId, live.breakout ? live.breakout.groups.map(g => g.id) : []);
  for (const [sid, v] of live.viewers) {
    if (v.userId === userId) {
      io.to(sid).emit('kicked', { reason });
      removeViewer(classId, sid);
      const s = io.sockets.sockets.get(sid);
      if (s) { s.leave('live:' + classId); s.data.classId = null; }
    }
  }
}

function revokeUser(userId) {
  for (const [token, t] of Object.entries(db().tokens)) if (t.userId === userId) delete db().tokens[token];
  for (const [classId, live] of lives) {
    if (findClass(classId)?.teacherId === userId) endLive(findClass(classId), 'Tài khoản giáo viên thay đổi quyền.');
    else kickUserFromLive(classId, userId, 'Phiên đăng nhập đã bị thu hồi.', false);
  }
  io.in('user:' + userId).disconnectSockets(true); store.save();
}

function closeAttendance(live, sid) {
  const viewer = live.viewers.get(sid); if (!viewer) return;
  live.attendance = live.attendance || {};
  const a = live.attendance[viewer.userId] || { seconds: 0, joins: 0 };
  if (viewer.joinedAt) a.seconds += Math.max(0, Math.floor((Date.now() - viewer.joinedAt) / 1000));
  viewer.joinedAt = null; live.attendance[viewer.userId] = a;
}

function removeViewer(classId, socketId) {
  const live = lives.get(classId);
  if (!live || !live.viewers.has(socketId)) return;
  closeAttendance(live, socketId);
  interact.onViewerGone(live, classId, socketId);
  breakout.onViewerGone(live, classId, socketId);
  live.viewers.delete(socketId);
  if (live.teacherSocket) io.to(live.teacherSocket).emit('viewer:left', { socketId });
  io.to('live:' + classId).emit('viewers:count', live.viewers.size);
  const c = findClass(classId);
  if (c) notifyClass(c);
}

// ---------- Socket.IO: signaling WebRTC + chat ----------
io.use((socket, next) => {
  const user = userFromToken(socket.handshake.auth && socket.handshake.auth.token);
  if (!user) return next(new Error('unauthorized'));
  socket.data.user = user;
  socket.data.token = socket.handshake.auth.token;
  next();
});

io.on('connection', (socket) => {
  security.limitSocket(socket); // giới hạn tốc độ mọi sự kiện của kết nối này
  const user = socket.data.user;
  socket.join('user:' + user.id);
  const register = socket.on.bind(socket);
  socket.on = (event, handler) => register(event, (...args) => {
    const failed = () => { const ack = args.find(a => typeof a === 'function'); if (ack) ack({ error: 'Dữ liệu không hợp lệ. Hãy tải lại phòng.' }); };
    try { const result = handler(...args); if (result && typeof result.catch === 'function') result.catch(failed); }
    catch { failed(); }
  });
  socket.use(([event], next) => {
    if (!userFromToken(socket.data.token)) { socket.disconnect(true); return; }
    if (!['room:join', 'room:leave'].includes(event)) {
      const live = lives.get(socket.data.classId);
      if (!live || (live.teacherSocket !== socket.id && !live.viewers.has(socket.id))) return;
    }
    requestCheckpoint(); next();
  });

  socket.on('room:join', ({ classId } = {}, ack) => {
    const c = findClass(classId);
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!canAccessLive(user, c)) return reply({ error: 'Bạn không có quyền tham gia buổi học này.' });
    const live = lives.get(classId);
    if (!live) return reply({ error: 'Buổi học chưa bắt đầu hoặc đã kết thúc.' });
    if (live.banned && live.banned.has(user.id)) return reply({ error: 'Bạn đã bị mời rời buổi học này.' });
    if (user.role === 'assistant' || user.role === 'admin' && c.teacherId !== user.id) return reply({ error: 'Chỉ giáo viên phụ trách điều khiển phòng. Trợ giảng quản lý bài tập tại trang Học tập.' });
    const maxParticipants = Math.min(db().settings.limits.maxParticipants, live.video?.provider === 'zoom' ? 100 : Infinity);
    if (user.role === 'student' && ![...live.viewers.values()].some(v => v.userId === user.id) && live.viewers.size >= maxParticipants - 1) return reply({ error: 'Lớp đã đủ số người cho phép.' });
    if (socket.data.classId) leaveRoom(socket.data.classId === classId);

    socket.data.classId = classId;
    socket.join('live:' + classId);

    if (user.role === 'teacher' || user.role === 'admin') {
      if (live.teacherSocket && live.teacherSocket !== socket.id) {
        io.to(live.teacherSocket).emit('kicked', { reason: 'Bạn đã mở buổi học ở một tab khác.' });
        const old = io.sockets.sockets.get(live.teacherSocket); if (old) { old.leave('live:' + classId); old.data.classId = null; }
      }
      live.teacherSocket = socket.id;
      socket.to('live:' + classId).emit('teacher:joined');
      notifyClass(c);
      return reply({
        ok: true,
        live: liveInfo(classId),
        word: live.word,
        lesson: present.stateFor(live, { teacher: true }),
        speaker: interact.speakerInfo(live),
        pad: writing.stateFor(live, { teacher: true }),
        pdf: live.pdf, listen: listening.stateFor(live),
        breakout: breakout.teacherState(live),
        viewers: [...live.viewers].map(([sid, v]) => ({ socketId: sid, ...v })),
      });
    }

    // Học sinh: một tài khoản chỉ xem ở một tab
    for (const [sid, v] of live.viewers) {
      if (v.userId === user.id && sid !== socket.id) {
        io.to(sid).emit('kicked', { reason: 'Bạn đã tham gia ở một tab/thiết bị khác.' });
        removeViewer(classId, sid);
        const old = io.sockets.sockets.get(sid); if (old) { old.leave('live:' + classId); old.data.classId = null; }
      }
    }
    const viewer = { userId: user.id, name: user.name, hand: false, joinedAt: Date.now() };
    live.attendance = live.attendance || {};
    const attendance = live.attendance[user.id] || { seconds: 0, joins: 0 }; attendance.name = user.name; attendance.joins++; live.attendance[user.id] = attendance;
    live.viewers.set(socket.id, viewer);
    live.attendees.add(user.id);
    live.peak = Math.max(live.peak, live.viewers.size);
    if (live.teacherSocket) io.to(live.teacherSocket).emit('viewer:joined', { socketId: socket.id, ...viewer });
    io.to('live:' + classId).emit('viewers:count', live.viewers.size);
    socket.to('live:' + classId).emit('chat', { system: true, text: `${user.name} đã tham gia lớp học`, at: Date.now() });
    notifyClass(c);
    const group = breakout.rejoin(live, socket.id, user.id);
    reply({ ok: true, live: liveInfo(classId), word: live.word, teacherOnline: !!live.teacherSocket, lesson: present.stateFor(live, { userId: user.id }), speaker: interact.speakerInfo(live), pad: writing.stateFor(live, { userId: user.id }), pdf: live.pdf, listen: listening.stateFor(live), breakout: group });
    if (group) for (const m of group.members) if (m.socketId !== socket.id) io.to(m.socketId).emit('breakout:member-joined', { socketId: socket.id, name: user.name });
  });

  present.attach(socket);
  interact.attach(socket);
  writing.attach(socket);
  pdfshare.attach(socket);
  listening.attach(socket);
  breakout.attach(socket);

  // Chuyển tiếp offer/answer/ICE giữa giáo viên và học sinh trong cùng phòng
  socket.on('signal', ({ to, data }) => {
    const live = lives.get(socket.data.classId);
    if (!live || live.video?.provider === 'zoom') return;
    const allowed = ['teacher', 'admin'].includes(user.role) ? live.teacherSocket === socket.id && live.viewers.has(to) : to === live.teacherSocket && live.viewers.has(socket.id);
    if (allowed) io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('chat', ({ text }) => {
    const classId = socket.data.classId;
    if (!lives.has(classId)) return;
    const msg = String(text || '').trim().slice(0, 500);
    if (!msg) return;
    if (!security.allowChat(socket)) return socket.emit('chat:limited', { error: 'Bạn gửi tin hơi nhanh, đợi vài giây rồi gửi tiếp nhé.' });
    io.to('live:' + classId).emit('chat', { name: user.name, role: user.role, userId: user.id, text: msg, at: Date.now() });
  });

  socket.on('hand', ({ raised }) => {
    const live = lives.get(socket.data.classId);
    if (!live || !live.viewers.has(socket.id)) return;
    live.viewers.get(socket.id).hand = !!raised;
    if (live.teacherSocket) io.to(live.teacherSocket).emit('hand', { socketId: socket.id, name: user.name, raised: !!raised });
  });

  // Chế độ Zoom: học sinh báo đã vào/đang chờ/rời/lỗi Zoom (giống trạng thái hiện diện của LiveKit)
  socket.on('zoom:state', ({ state } = {}) => {
    const live = lives.get(socket.data.classId);
    if (!live || live.video?.provider !== 'zoom' || !live.viewers.has(socket.id) || !['joined', 'waiting', 'left', 'error'].includes(state)) return;
    live.viewers.get(socket.id).zoom = state;
    if (live.teacherSocket) io.to(live.teacherSocket).emit('viewer:zoom', { socketId: socket.id, state });
  });

  socket.on('hand:lower', ({ socketId }) => {
    const live = lives.get(socket.data.classId);
    if (!live || live.teacherSocket !== socket.id || !live.viewers.has(socketId)) return;
    live.viewers.get(socketId).hand = false;
    io.to(socketId).emit('hand:lowered');
    socket.emit('hand', { socketId, raised: false });
  });

  // Thẻ từ vựng giáo viên ghim lên màn hình
  socket.on('word', (word) => {
    const classId = socket.data.classId;
    const live = lives.get(classId);
    if (!live || live.teacherSocket !== socket.id) return;
    live.word = word && word.word ? {
      word: String(word.word).slice(0, 60),
      ipa: String(word.ipa || '').slice(0, 60),
      type: String(word.type || '').slice(0, 20),
      meaning: String(word.meaning || '').slice(0, 160),
      example: String(word.example || '').slice(0, 200),
    } : null;
    io.to('live:' + classId).emit('word', live.word);
  });

  socket.on('kick', ({ socketId } = {}) => {
    const classId = socket.data.classId;
    const live = lives.get(classId);
    if (!live || live.teacherSocket !== socket.id) return;
    const viewer = live.viewers.get(socketId);
    if (viewer) kickUserFromLive(classId, viewer.userId, 'Giáo viên đã mời bạn rời khỏi buổi học.');
  });

  socket.on('room:leave', () => leaveRoom());
  socket.on('disconnect', () => leaveRoom(true)); // giữ phiên LiveKit: client tự nối lại socket, LiveKit tự phát hiện khi họ đóng trang

  function leaveRoom(keepMedia = false) {
    const classId = socket.data.classId;
    const live = lives.get(classId);
    socket.data.classId = null;
    if (!live) return;
    socket.leave('live:' + classId);
    if (!keepMedia && live.video?.provider !== 'zoom') lk.removeUser(classId, user.id, live.breakout ? live.breakout.groups.map(g => g.id) : []);
    if (live.teacherSocket === socket.id) {
      live.teacherSocket = null;
      interact.setSpeaker(live, classId, null);
      io.to('live:' + classId).emit('teacher:left');
      const c = findClass(classId);
      if (c) notifyClass(c);
    } else {
      const v = live.viewers.get(socket.id);
      removeViewer(classId, socket.id);
      if (v) io.to('live:' + classId).emit('chat', { system: true, text: `${v.name} đã rời lớp học`, at: Date.now() });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.use((err, req, res, next) => { console.error('[request]', err.message); if (!res.headersSent) res.status(err.status || 500).json({ error: err.status === 413 ? 'Dữ liệu vượt giới hạn.' : 'Yêu cầu không hợp lệ hoặc máy chủ gặp lỗi.' }); });
function shutdown() { checkpoint(); store.flush(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
server.listen(PORT, () => {
  console.log('Database: ' + store.driver);
  console.log(`EngLive đang chạy tại http://localhost:${PORT}`);
  const todayProvider = videoProvider.provider(lk);
  console.log(`Video cho buổi mở ngày ${videoProvider.day()}: ${todayProvider === 'zoom' ? 'Zoom Meeting SDK' : todayProvider === 'livekit' ? 'LiveKit' : 'WebRTC P2P'}`);
  if (todayProvider === 'zoom') console.log(lk.enabled ? 'Dự phòng LiveKit: đã cấu hình.' : 'Dự phòng LiveKit: chưa cấu hình trong tiến trình này.');
});
