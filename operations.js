// Quản trị, lịch học, bài tập và từ vựng. Mọi quyền đều kiểm tra ở máy chủ.
const express = require('express');
const fs = require('fs');
const path = require('path');
const store = require('./db');
const text = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const manager = (u, c) => u.role === 'admin' || c.teacherId === u.id || (c.assistantIds || []).includes(u.id);
const active = u => u && !['pending', 'blocked'].includes(u.status);
function storageBytes() {
  return require('./storage').diskBytes();
}
function createRouter(ctx) {
  const { auth, lives, lk, findClass, canAccess, endLive, revokeUser, publicUser, notifyClass, checkpoint } = ctx;
  const r = express.Router(), db = store.data;
  r.use('/api/admin', auth('admin'));
  const safeUser = u => ({ ...publicUser(u), createdAt: u.createdAt });
  r.get('/api/admin/overview', async (req, res) => res.json({
    users: db.users.map(safeUser), classes: db.classes,
    lives: [...lives].map(([classId, l]) => ({ classId, title: l.title, startedAt: l.startedAt, viewers: l.viewers.size, recovered: !!l.recovered })),
    limits: db.settings.limits, storageBytes: storageBytes(), livekit: { enabled: lk.enabled, url: lk.enabled ? lk.config.publicUrl : null, stats: await lk.stats() },
    usage: db.aiUsage, audit: db.audit.slice(0, 100), recordings: db.recordings.map(({ file, ...x }) => x), pdfs: db.pdfs,
    backups: fs.existsSync(path.join(store.dir, 'backups')) ? fs.readdirSync(path.join(store.dir, 'backups')).filter(n => /^db-[\dTZ-]+\.json$/.test(n)).sort().reverse() : [],
  }));
  r.patch('/api/admin/users/:id', (req, res) => {
    const u = db.users.find(u => u.id === req.params.id), b = req.body || {};
    if (!u) return res.status(404).json({ error: 'Không có tài khoản.' });
    const role = b.role === undefined ? u.role : b.role, status = b.status === undefined ? (u.status || 'active') : b.status;
    if (!['admin', 'teacher', 'assistant', 'student'].includes(role) || !['active', 'pending', 'blocked'].includes(status)) return res.status(400).json({ error: 'Vai trò hoặc trạng thái không hợp lệ.' });
    if (u.role === 'admin' && (role !== 'admin' || status !== 'active') && db.users.filter(x => x.role === 'admin' && active(x)).length <= 1) return res.status(409).json({ error: 'Phải giữ ít nhất một admin đang hoạt động.' });
    if (role !== u.role && db.classes.some(c => c.teacherId === u.id) && !['teacher', 'admin'].includes(role)) return res.status(409).json({ error: 'Hãy chuyển lớp sang giáo viên khác trước khi đổi vai trò.' });
    const changed = role !== u.role || status !== (u.status || 'active');
    u.role = role; u.status = status;
    if (changed) revokeUser(u.id);
    if (b.revokeSessions) revokeUser(u.id);
    store.audit(req.user, 'user.update', u.id, role + '/' + status); res.json({ user: safeUser(u) });
  });
  r.post('/api/admin/users/:id/password', (req, res) => {
    const u = db.users.find(u => u.id === req.params.id), password = (req.body || {}).password;
    if (!u) return res.status(404).json({ error: 'Không có tài khoản.' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Mật khẩu cần 8–128 ký tự.' });
    u.password = store.hashPassword(password); revokeUser(u.id); store.audit(req.user, 'user.password.reset', u.id); res.json({ ok: true });
  });
  r.patch('/api/admin/classes/:id', (req, res) => {
    const original = findClass(req.params.id), b = req.body || {};
    if (!original) return res.status(404).json({ error: 'Không có lớp.' });
    const c = { ...original };
    if (lives.has(c.id)) return res.status(409).json({ error: 'Kết thúc buổi live trước khi đổi phân công.' });
    if (b.teacherId !== undefined) {
      const t = db.users.find(u => u.id === b.teacherId);
      if (!active(t) || !['teacher', 'admin'].includes(t.role)) return res.status(400).json({ error: 'Giáo viên không hợp lệ.' });
      const future = db.schedules.filter(s => s.classId === c.id && s.endsAt > Date.now());
      if (future.some(a => db.schedules.some(b => b.classId !== c.id && findClass(b.classId)?.teacherId === t.id && a.startsAt < b.endsAt && b.startsAt < a.endsAt))) return res.status(409).json({ error: 'Giáo viên được chọn bị trùng lịch với lớp này.' });
      c.teacherId = t.id;
    }
    if (b.assistantIds !== undefined) {
      if (!Array.isArray(b.assistantIds) || b.assistantIds.some(id => !db.users.some(u => u.id === id && active(u) && u.role === 'assistant'))) return res.status(400).json({ error: 'Trợ giảng không hợp lệ.' });
      c.assistantIds = [...new Set(b.assistantIds)];
    }
    if (b.name !== undefined && text(b.name)) c.name = text(b.name, 120);
    if (b.studentIds !== undefined) {
      if (!Array.isArray(b.studentIds) || b.studentIds.some(id => !db.users.some(u => u.id === id && active(u) && u.role === 'student'))) return res.status(400).json({ error: 'Danh sách học sinh không hợp lệ.' });
      c.studentIds = [...new Set(b.studentIds)]; c.pendingIds = c.pendingIds.filter(id => !c.studentIds.includes(id));
    }
    Object.assign(original, c); store.audit(req.user, 'class.update', c.id); notifyClass(c); res.json({ class: c });
  });
  r.delete('/api/admin/classes/:id/live', (req, res) => {
    const c = findClass(req.params.id); if (!c) return res.status(404).json({ error: 'Không có lớp.' });
    endLive(c, 'Quản trị viên kết thúc buổi học.'); store.audit(req.user, 'live.end', c.id); res.json({ ok: true });
  });
  r.put('/api/admin/limits', (req, res) => {
    const b = req.body || {}, next = { ...db.settings.limits };
    for (const [k, max] of Object.entries({ chatPerDay: 10000, generationsPerDay: 1000, maxParticipants: 10000, storageMB: 1000000 })) {
      if (b[k] !== undefined) { if (!Number.isInteger(b[k]) || b[k] < 1 || b[k] > max) return res.status(400).json({ error: 'Giới hạn không hợp lệ: ' + k }); next[k] = b[k]; }
    }
    db.settings.limits = next; store.audit(req.user, 'limits.update', 'global'); res.json({ limits: next });
  });
  r.post('/api/admin/backups', (req, res) => { checkpoint(); store.audit(req.user, 'backup.create', 'manual'); const name = store.backup(); res.json({ name }); });
  r.get('/api/admin/backups/:name', (req, res) => {
    if (!/^db-[\dTZ-]+\.json$/.test(req.params.name)) return res.status(400).json({ error: 'Tên bản sao không hợp lệ.' });
    res.download(path.join(store.dir, 'backups', req.params.name), err => { if (err && !res.headersSent) res.status(404).json({ error: 'Không có bản sao.' }); });
  });
  r.delete('/api/admin/media/:kind/:id', (req, res) => {
    const kind = req.params.kind;
    if (!['pdfs', 'recordings'].includes(kind)) return res.status(400).json({ error: 'Loại tệp không hợp lệ.' });
    const item = db[kind].find(x => x.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Không có tệp.' });
    if ([...lives.values()].some(l => l.pdf && l.pdf.id === item.id)) return res.status(409).json({ error: 'PDF đang được chiếu.' });
    const file = item.id + (kind === 'pdfs' ? '.pdf' : '.webm');
    fs.rmSync(path.join(store.dir, kind, file), { force: true }); db[kind] = db[kind].filter(x => x !== item);
    store.audit(req.user, 'media.delete', item.id, kind); res.json({ ok: true });
  });

  r.use('/api/learning', auth());
  r.get('/api/learning/reminders', (req, res) => res.json({ schedules: db.schedules.filter(s => s.startsAt > Date.now() && s.startsAt <= Date.now() + 15 * 60000 && canAccess(req.user, findClass(s.classId))) }));
  r.get('/api/learning', (req, res) => {
    const classes = db.classes.filter(c => canAccess(req.user, c));
    const ids = new Set(classes.map(c => c.id)), manageable = new Set(classes.filter(c => manager(req.user, c)).map(c => c.id));
    const assignments = db.assignments.filter(a => ids.has(a.classId));
    const assignmentIds = new Set(assignments.map(a => a.id));
    res.json({ classes: classes.map(c => ({ id: c.id, name: c.name, canManage: manageable.has(c.id), teacherId: c.teacherId })),
      schedules: db.schedules.filter(s => ids.has(s.classId)).sort((a, b) => a.startsAt - b.startsAt), assignments,
      submissions: db.submissions.filter(s => assignmentIds.has(s.assignmentId) && (s.userId === req.user.id || manageable.has((assignments.find(a => a.id === s.assignmentId) || {}).classId))),
      vocabulary: db.vocabulary.filter(v => v.userId === req.user.id),
      reports: classes.map(c => ({ classId: c.id, history: c.history.map(h => ({ title: h.title, startedAt: h.startedAt, endedAt: h.endedAt, attendance: manageable.has(c.id) ? h.attendance : { [req.user.id]: (h.attendance || {})[req.user.id] }, scores: (h.scores || []).filter(s => manageable.has(c.id) || s.userId === req.user.id) })) })),
      results: db.activityResults.filter(a => ids.has(a.classId)).map(a => ({ ...a, answers: a.answers.filter(s => manageable.has(a.classId) || s.userId === req.user.id) })),
    });
  });
  const classManager = (req, res) => { const c = findClass((req.body || {}).classId); if (!c || !canAccess(req.user, c) || !manager(req.user, c)) { res.status(403).json({ error: 'Không có quyền quản lý lớp này.' }); return null; } return c; };
  r.post('/api/learning/schedules', (req, res) => {
    const c = classManager(req, res); if (!c) return;
    const b = req.body || {}, startsAt = Number(b.startsAt), endsAt = Number(b.endsAt), title = text(b.title, 120);
    if (!title || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt < Date.now() - 60000 || endsAt <= startsAt || endsAt - startsAt > 86400000) return res.status(400).json({ error: 'Tên và thời gian học không hợp lệ (tối đa 24 giờ).' });
    if (db.schedules.some(s => s.startsAt < endsAt && startsAt < s.endsAt && (s.classId === c.id || findClass(s.classId)?.teacherId === c.teacherId))) return res.status(409).json({ error: 'Trùng lịch lớp hoặc giáo viên.' });
    const schedule = { id: store.id('sch'), classId: c.id, title, startsAt, endsAt }; db.schedules.push(schedule); store.audit(req.user, 'schedule.create', schedule.id); res.json({ schedule });
  });
  r.delete('/api/learning/schedules/:id', (req, res) => {
    const s = db.schedules.find(s => s.id === req.params.id), c = s && findClass(s.classId);
    if (!c || !canAccess(req.user, c) || !manager(req.user, c)) return res.status(403).json({ error: 'Không có quyền.' });
    db.schedules = db.schedules.filter(x => x !== s); store.audit(req.user, 'schedule.delete', s.id); res.json({ ok: true });
  });
  r.post('/api/learning/assignments', (req, res) => {
    const c = classManager(req, res); if (!c) return;
    const b = req.body || {}, title = text(b.title, 120), prompt = text(b.prompt, 5000), dueAt = Number(b.dueAt);
    if (!title || !prompt || !Number.isFinite(dueAt) || dueAt <= Date.now()) return res.status(400).json({ error: 'Nhập tên, đề bài và hạn nộp trong tương lai.' });
    const assignment = { id: store.id('hw'), classId: c.id, title, prompt, dueAt, createdAt: Date.now(), createdBy: req.user.id };
    db.assignments.push(assignment); store.audit(req.user, 'assignment.create', assignment.id); res.json({ assignment });
  });
  r.post('/api/learning/assignments/:id/submit', (req, res) => {
    const a = db.assignments.find(a => a.id === req.params.id), c = a && findClass(a.classId);
    if (!c || req.user.role !== 'student' || !c.studentIds.includes(req.user.id)) return res.status(403).json({ error: 'Không có quyền nộp bài.' });
    if (Date.now() > a.dueAt) return res.status(409).json({ error: 'Đã hết hạn nộp.' });
    const content = text((req.body || {}).content, 10000); if (!content) return res.status(400).json({ error: 'Bài làm còn trống.' });
    let s = db.submissions.find(s => s.assignmentId === a.id && s.userId === req.user.id);
    if (s && s.gradedAt) return res.status(409).json({ error: 'Bài đã chấm, không thể ghi đè.' });
    if (!s) { s = { id: store.id('sub'), assignmentId: a.id, userId: req.user.id, name: req.user.name }; db.submissions.push(s); }
    Object.assign(s, { content, submittedAt: Date.now() }); store.save(); res.json({ submission: s });
  });
  r.post('/api/learning/submissions/:id/grade', (req, res) => {
    const s = db.submissions.find(s => s.id === req.params.id), a = s && db.assignments.find(a => a.id === s.assignmentId), c = a && findClass(a.classId);
    if (!c || !canAccess(req.user, c) || !manager(req.user, c)) return res.status(403).json({ error: 'Không có quyền chấm.' });
    const score = (req.body || {}).score;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 10) return res.status(400).json({ error: 'Điểm từ 0 đến 10.' });
    Object.assign(s, { score, feedback: text(req.body.feedback, 2000), gradedAt: Date.now(), gradedBy: req.user.id }); store.audit(req.user, 'submission.grade', s.id); res.json({ submission: s });
  });
  r.post('/api/learning/vocabulary', (req, res) => {
    const b = req.body || {}, word = text(b.word, 100), meaning = text(b.meaning, 300);
    if (!word || !meaning) return res.status(400).json({ error: 'Nhập từ và nghĩa.' });
    if (db.vocabulary.filter(v => v.userId === req.user.id).length >= 2000) return res.status(409).json({ error: 'Kho từ tối đa 2.000 từ.' });
    if (db.vocabulary.some(v => v.userId === req.user.id && v.word.toLowerCase() === word.toLowerCase())) return res.status(409).json({ error: 'Từ này đã lưu.' });
    const v = { id: store.id('v'), userId: req.user.id, word, meaning, example: text(b.example, 500), learned: false, createdAt: Date.now() }; db.vocabulary.push(v); store.save(); res.json({ word: v });
  });
  r.patch('/api/learning/vocabulary/:id', (req, res) => {
    const v = db.vocabulary.find(v => v.id === req.params.id && v.userId === req.user.id);
    if (!v) return res.status(404).json({ error: 'Không có từ.' });
    v.learned = (req.body || {}).learned === true; store.save(); res.json({ word: v });
  });
  r.delete('/api/learning/vocabulary/:id', (req, res) => { db.vocabulary = db.vocabulary.filter(v => v.id !== req.params.id || v.userId !== req.user.id); store.save(); res.json({ ok: true }); });
  return r;
}
module.exports = { createRouter, storageBytes };
