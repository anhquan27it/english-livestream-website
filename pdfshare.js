// Chiếu tệp PDF trực tiếp: giáo viên tải PDF lên lớp, chọn chiếu; học sinh tải cùng tệp và vẽ đúng trang giáo viên đang mở.
// Máy chủ chỉ giữ tệp và số trang hiện tại; việc vẽ trang làm ở trình duyệt (pdf.js).
const fs = require('fs');
const path = require('path');
const express = require('express');
const store = require('./db');

const DIR = path.join(store.dir, 'pdfs');

function init({ io, lives, auth, findClass, canAccess, present }) {
  const router = express.Router();
  const publicPdf = (p) => ({ id: p.id, name: p.name, size: p.size, createdAt: p.createdAt });
  const mediaAuth = (req, res, next) => {
    if (!req.headers.authorization && req.query.token) req.headers.authorization = 'Bearer ' + req.query.token;
    return auth()(req, res, next);
  };
  const ownClass = (req, res) => {
    const c = findClass(req.params.id);
    if (!c || c.teacherId !== req.user.id) { res.status(404).json({ error: 'Không tìm thấy lớp học.' }); return null; }
    return c;
  };

  router.get('/api/classes/:id/pdfs', auth('teacher'), (req, res) => {
    const c = ownClass(req, res);
    if (c) res.json({ pdfs: store.data.pdfs.filter((p) => p.classId === c.id).sort((a, b) => b.createdAt - a.createdAt).map(publicPdf) });
  });

  router.post('/api/classes/:id/pdfs', auth('teacher'), express.raw({ type: () => true, limit: '25mb' }), (req, res) => {
    const c = ownClass(req, res);
    if (!c) return;
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.slice(0, 5).toString() !== '%PDF-') return res.status(400).json({ error: 'Đây không phải tệp PDF hợp lệ.' });
    fs.mkdirSync(DIR, { recursive: true });
    const id = store.id('pdf');
    fs.writeFileSync(path.join(DIR, id + '.pdf'), buf);
    const rec = { id, classId: c.id, name: decodeURIComponent(String(req.headers['x-filename'] || 'tai-lieu.pdf')).slice(0, 120), size: buf.length, createdAt: Date.now() };
    store.data.pdfs.push(rec);
    store.save();
    res.json({ pdf: publicPdf(rec) });
  });

  router.get('/api/pdfs/:pid/file', mediaAuth, (req, res) => {
    const p = store.data.pdfs.find((x) => x.id === req.params.pid);
    if (!p || !canAccess(req.user, findClass(p.classId))) return res.status(404).json({ error: 'Không tìm thấy tệp.' });
    res.type('application/pdf');
    res.sendFile(path.join(DIR, p.id + '.pdf'), (e) => { if (e && !res.headersSent) res.status(404).json({ error: 'Tệp không còn.' }); });
  });

  router.delete('/api/pdfs/:pid', auth('teacher'), (req, res) => {
    const p = store.data.pdfs.find((x) => x.id === req.params.pid);
    const c = p && findClass(p.classId);
    if (!p || !c || c.teacherId !== req.user.id) return res.status(404).json({ error: 'Không tìm thấy tệp.' });
    fs.rm(path.join(DIR, p.id + '.pdf'), { force: true }, () => {});
    store.data.pdfs = store.data.pdfs.filter((x) => x !== p);
    store.save();
    res.json({ ok: true });
  });

  function attach(socket) {
    const user = socket.data.user;
    const teacherLive = () => {
      const live = lives.get(socket.data.classId);
      return live && live.teacherSocket === socket.id && user.role === 'teacher' ? live : null;
    };
    const reply = (ack) => (typeof ack === 'function' ? ack : () => {});
    const room = () => 'live:' + socket.data.classId;

    socket.on('pdf:present', ({ fileId } = {}, ack) => {
      const live = teacherLive();
      const p = live && store.data.pdfs.find((x) => x.id === fileId && x.classId === socket.data.classId);
      if (!p) return reply(ack)({ error: 'Không tìm thấy tệp PDF của lớp này.' });
      present.stopLesson(live); // PDF và bài giảng AI không chiếu cùng lúc
      live.pdf = { id: p.id, name: p.name, page: 1 };
      io.to(room()).emit('pdf:state', live.pdf);
      reply(ack)({ ok: true });
    });

    socket.on('pdf:goto', ({ page } = {}) => {
      const live = teacherLive();
      if (!live || !live.pdf || !Number.isInteger(page)) return;
      live.pdf.page = Math.min(2000, Math.max(1, page));
      io.to(room()).emit('pdf:state', live.pdf);
    });

    socket.on('pdf:stop', () => {
      const live = teacherLive();
      if (!live || !live.pdf) return;
      live.pdf = null;
      io.to(room()).emit('pdf:state', null);
    });
  }

  return { router, attach };
}

module.exports = { init };
