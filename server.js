const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const store = require('./db');
const lessons = require('./lessons');
const presentMod = require('./present');
const aiRoutes = require('./aiRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Kiểm tra dịch vụ sau khi triển khai, không cần đăng nhập.
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------- Trạng thái livestream (trong bộ nhớ) ----------
// classId -> { title, startedAt, teacherSocket, viewers: Map<socketId, {userId, name, hand}>, attendees:Set, peak, word }
// Thêm: lesson (bản chụp bài giảng đang chiếu), slideIndex, activity (hoạt động đang mở), scores (điểm theo học sinh) - xem present.js
const lives = new Map();
const present = presentMod.init({ io, lives });

// ---------- Helpers ----------
const db = () => store.data;
const findUser = (id) => db().users.find((u) => u.id === id);
const findClass = (id) => db().classes.find((c) => c.id === id);
const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, role: u.role };

function liveInfo(classId) {
  const live = lives.get(classId);
  if (!live) return null;
  return { title: live.title, startedAt: live.startedAt, viewers: live.viewers.size, teacherOnline: !!live.teacherSocket };
}

function classForTeacher(c) {
  return {
    ...c,
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
    studentCount: c.studentIds.length,
    status: isMember ? 'member' : 'pending',
    live: isMember ? liveInfo(c.id) : null,
    attended: c.history.filter((h) => (h.attendees || []).includes(userId)).length,
    sessions: c.history.length,
  };
}

function canAccessLive(user, c) {
  if (!user || !c) return false;
  if (user.role === 'teacher') return c.teacherId === user.id;
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
  db().tokens[token] = { userId, createdAt: Date.now() };
  store.save();
  return token;
}

function userFromToken(token) {
  const t = token && db().tokens[token];
  return t ? findUser(t.userId) : null;
}

function auth(role) {
  return (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const user = userFromToken(token);
    if (!user) return res.status(401).json({ error: 'Vui lòng đăng nhập lại.' });
    if (role && user.role !== role) return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
    req.user = user;
    req.token = token;
    next();
  };
}

app.post('/api/register', (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin.' });
  if (!['teacher', 'student'].includes(role)) return res.status(400).json({ error: 'Vai trò không hợp lệ.' });
  if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự.' });
  const mail = String(email).trim().toLowerCase();
  if (db().users.some((u) => u.email === mail)) return res.status(400).json({ error: 'Email đã được sử dụng.' });
  const user = { id: store.id('u'), name: String(name).trim(), email: mail, role, password: store.hashPassword(password), createdAt: Date.now() };
  db().users.push(user);
  store.save();
  res.json({ token: issueToken(user.id), user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db().users.find((u) => u.email === String(email || '').trim().toLowerCase());
  if (!user || !store.verifyPassword(String(password || ''), user.password)) {
    return res.status(400).json({ error: 'Email hoặc mật khẩu không đúng.' });
  }
  res.json({ token: issueToken(user.id), user: publicUser(user) });
});

app.post('/api/logout', auth(), (req, res) => {
  delete db().tokens[req.token];
  store.save();
  res.json({ ok: true });
});

app.get('/api/me', auth(), (req, res) => res.json({ user: publicUser(req.user) }));

// ---------- Bài giảng + AI ----------
lessons.recoverJobs();
app.use(lessons.createRouter({ auth, findClass }));
app.use(aiRoutes.createRouter({ auth, lives, findClass, canAccess: canAccessLive }));

// ---------- Lớp học ----------
app.get('/api/classes', auth(), (req, res) => {
  const u = req.user;
  if (u.role === 'teacher') {
    return res.json({ classes: db().classes.filter((c) => c.teacherId === u.id).map(classForTeacher) });
  }
  const list = db().classes.filter((c) => c.studentIds.includes(u.id) || c.pendingIds.includes(u.id));
  res.json({ classes: list.map((c) => classForStudent(c, u.id)) });
});

app.get('/api/classes/:id', auth(), (req, res) => {
  const c = findClass(req.params.id);
  if (!canAccessLive(req.user, c)) return res.status(403).json({ error: 'Bạn không thuộc lớp học này.' });
  const teacher = findUser(c.teacherId);
  res.json({ class: { id: c.id, name: c.name, level: c.level, color: c.color, teacher: teacher && teacher.name, studentCount: c.studentIds.length, live: liveInfo(c.id) } });
});

const COLORS = ['violet', 'orange', 'teal', 'pink', 'blue'];

app.post('/api/classes', auth('teacher'), (req, res) => {
  const { name, level, description, color } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên lớp.' });
  const c = {
    id: store.id('c'),
    name: String(name).trim(),
    level: level || 'A1',
    description: description || '',
    color: COLORS.includes(color) ? color : COLORS[db().classes.length % COLORS.length],
    code: store.classCode(),
    teacherId: req.user.id,
    studentIds: [],
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
  db().classes = db().classes.filter((x) => x.id !== c.id);
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
  if (!c.pendingIds.includes(sid)) return res.status(404).json({ error: 'Không có yêu cầu này.' });
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
    const title = String((req.body || {}).title || '').trim() || 'Buổi học trực tiếp';
    lives.set(c.id, { title, startedAt: Date.now(), teacherSocket: null, viewers: new Map(), attendees: new Set(), peak: 0, word: null, lesson: null, slideIndex: 0, activity: null, scores: new Map() });
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
  c.history.unshift({
    title: live.title,
    startedAt: live.startedAt,
    endedAt: Date.now(),
    peak: live.peak,
    attendees: [...live.attendees],
    lessonTitle: live.lesson ? live.lesson.title : '',
    scores: present.ranking(live).slice(0, 10),
  });
  c.history = c.history.slice(0, 50);
  store.save();
  io.to('live:' + c.id).emit('live:ended', { reason });
  io.in('live:' + c.id).socketsLeave('live:' + c.id);
  lives.delete(c.id);
  notifyClass(c);
}

function kickUserFromLive(classId, userId, reason) {
  const live = lives.get(classId);
  if (!live) return;
  for (const [sid, v] of live.viewers) {
    if (v.userId === userId) {
      io.to(sid).emit('kicked', { reason });
      removeViewer(classId, sid);
      const s = io.sockets.sockets.get(sid);
      if (s) s.leave('live:' + classId);
    }
  }
}

function removeViewer(classId, socketId) {
  const live = lives.get(classId);
  if (!live || !live.viewers.has(socketId)) return;
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
  next();
});

io.on('connection', (socket) => {
  const user = socket.data.user;
  socket.join('user:' + user.id);

  socket.on('room:join', ({ classId }, ack) => {
    const c = findClass(classId);
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!canAccessLive(user, c)) return reply({ error: 'Bạn không có quyền tham gia buổi học này.' });
    const live = lives.get(classId);
    if (!live) return reply({ error: 'Buổi học chưa bắt đầu hoặc đã kết thúc.' });

    socket.data.classId = classId;
    socket.join('live:' + classId);

    if (user.role === 'teacher') {
      if (live.teacherSocket && live.teacherSocket !== socket.id) {
        io.to(live.teacherSocket).emit('kicked', { reason: 'Bạn đã mở buổi học ở một tab khác.' });
      }
      live.teacherSocket = socket.id;
      socket.to('live:' + classId).emit('teacher:joined');
      notifyClass(c);
      return reply({
        ok: true,
        live: liveInfo(classId),
        word: live.word,
        lesson: present.stateFor(live, { teacher: true }),
        viewers: [...live.viewers].map(([sid, v]) => ({ socketId: sid, ...v })),
      });
    }

    // Học sinh: một tài khoản chỉ xem ở một tab
    for (const [sid, v] of live.viewers) {
      if (v.userId === user.id && sid !== socket.id) {
        io.to(sid).emit('kicked', { reason: 'Bạn đã tham gia ở một tab/thiết bị khác.' });
        removeViewer(classId, sid);
      }
    }
    const viewer = { userId: user.id, name: user.name, hand: false };
    live.viewers.set(socket.id, viewer);
    live.attendees.add(user.id);
    live.peak = Math.max(live.peak, live.viewers.size);
    if (live.teacherSocket) io.to(live.teacherSocket).emit('viewer:joined', { socketId: socket.id, ...viewer });
    io.to('live:' + classId).emit('viewers:count', live.viewers.size);
    socket.to('live:' + classId).emit('chat', { system: true, text: `${user.name} đã tham gia lớp học`, at: Date.now() });
    notifyClass(c);
    reply({ ok: true, live: liveInfo(classId), word: live.word, teacherOnline: !!live.teacherSocket, lesson: present.stateFor(live, { userId: user.id }) });
  });

  present.attach(socket);

  // Chuyển tiếp offer/answer/ICE giữa giáo viên và học sinh trong cùng phòng
  socket.on('signal', ({ to, data }) => {
    const live = lives.get(socket.data.classId);
    if (!live) return;
    const allowed = user.role === 'teacher' ? live.teacherSocket === socket.id && live.viewers.has(to) : to === live.teacherSocket && live.viewers.has(socket.id);
    if (allowed) io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('chat', ({ text }) => {
    const classId = socket.data.classId;
    if (!lives.has(classId)) return;
    const msg = String(text || '').trim().slice(0, 500);
    if (!msg) return;
    io.to('live:' + classId).emit('chat', { name: user.name, role: user.role, userId: user.id, text: msg, at: Date.now() });
  });

  socket.on('hand', ({ raised }) => {
    const live = lives.get(socket.data.classId);
    if (!live || !live.viewers.has(socket.id)) return;
    live.viewers.get(socket.id).hand = !!raised;
    if (live.teacherSocket) io.to(live.teacherSocket).emit('hand', { socketId: socket.id, name: user.name, raised: !!raised });
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

  socket.on('kick', ({ socketId }) => {
    const classId = socket.data.classId;
    const live = lives.get(classId);
    if (!live || live.teacherSocket !== socket.id) return;
    io.to(socketId).emit('kicked', { reason: 'Giáo viên đã mời bạn rời khỏi buổi học.' });
    removeViewer(classId, socketId);
    const s = io.sockets.sockets.get(socketId);
    if (s) s.leave('live:' + classId);
  });

  socket.on('room:leave', () => leaveRoom());
  socket.on('disconnect', () => leaveRoom());

  function leaveRoom() {
    const classId = socket.data.classId;
    const live = lives.get(classId);
    socket.data.classId = null;
    if (!live) return;
    socket.leave('live:' + classId);
    if (live.teacherSocket === socket.id) {
      live.teacherSocket = null;
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
server.listen(PORT, () => console.log(`EngLive đang chạy tại http://localhost:${PORT}`));
