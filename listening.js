// File nghe đồng bộ cho cả lớp (dùng khi video do Zoom đảm nhiệm, nơi không trộn được âm thanh vào luồng).
// Giáo viên tải file âm thanh lên buổi đang live; máy chủ giữ tệp + trạng thái phát (đang phát/vị trí),
// mỗi học sinh tự phát tệp trên máy mình và bám theo vị trí của giáo viên. Tệp bị xóa khi thay file hoặc hết buổi.
const fs = require('fs');
const path = require('path');
const express = require('express');
const store = require('./db');

const DIR = path.join(store.dir, 'listening');
const EXTS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'webm', 'mp4', 'flac'];

function init({ io, lives, auth, findClass, canAccess }) {
  const router = express.Router();
  const mediaAuth = (req, res, next) => {
    if (!req.headers.authorization && req.query.token) req.headers.authorization = 'Bearer ' + req.query.token;
    return auth()(req, res, next);
  };
  const position = (l) => l.position + (l.playing ? (Date.now() - l.at) / 1000 : 0);
  const stateFor = (live) => (live && live.listen ? { id: live.listen.id, name: live.listen.name, url: '/api/listening/' + live.listen.id + '/file', playing: live.listen.playing, position: position(live.listen) } : null);
  const fileOf = (l) => path.join(DIR, l.id + '.' + l.ext);
  function drop(live) {
    if (!live || !live.listen) return;
    fs.rm(fileOf(live.listen), { force: true }, () => {});
    live.listen = null;
  }
  const broadcast = (live, except) => (except ? except.to('live:' + live.classId) : io.to('live:' + live.classId)).emit('listen:state', stateFor(live));

  router.post('/api/classes/:id/listening', auth('teacher'), express.raw({ type: () => true, limit: '30mb' }), (req, res) => {
    const c = findClass(req.params.id);
    if (!c || c.teacherId !== req.user.id) return res.status(404).json({ error: 'Không tìm thấy lớp học.' });
    const live = lives.get(c.id);
    if (!live) return res.status(409).json({ error: 'Hãy mở buổi học trước khi phát file nghe.' });
    let name;
    try { name = decodeURIComponent(String(req.headers['x-filename'] || 'file-nghe.mp3')).replace(/[\r\n]/g, ' ').slice(0, 120); }
    catch { return res.status(400).json({ error: 'Tên tệp không hợp lệ.' }); }
    const ext = (name.split('.').pop() || '').toLowerCase();
    const buf = req.body;
    if (!EXTS.includes(ext)) return res.status(400).json({ error: 'Chỉ hỗ trợ ' + EXTS.join(', ') + '.' });
    if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'Tệp rỗng.' });
    if (!require('./storage').available(buf.length)) return res.status(413).json({ error: 'Đã hết dung lượng lưu trữ. Liên hệ admin.' });
    fs.mkdirSync(DIR, { recursive: true });
    drop(live);
    const id = store.id('lst');
    fs.writeFileSync(path.join(DIR, id + '.' + ext), buf);
    live.listen = { id, name, ext, playing: false, position: 0, at: Date.now() };
    broadcast(live);
    res.json({ listen: stateFor(live) });
  });

  router.get('/api/listening/:lid/file', mediaAuth, (req, res) => {
    const live = [...lives.values()].find((l) => l.listen && l.listen.id === req.params.lid);
    if (!live || !canAccess(req.user, findClass(live.classId))) return res.status(404).json({ error: 'Không tìm thấy tệp.' });
    res.sendFile(fileOf(live.listen), (e) => { if (e && !res.headersSent) res.status(404).json({ error: 'Tệp không còn.' }); });
  });

  function attach(socket) {
    const user = socket.data.user;
    const teacherLive = () => {
      const live = lives.get(socket.data.classId);
      return live && live.teacherSocket === socket.id && ['teacher', 'admin'].includes(user.role) ? live : null;
    };
    const reply = (ack) => (typeof ack === 'function' ? ack : () => {});
    // Giáo viên điều khiển: đang phát/tạm dừng + vị trí (gửi lại định kỳ để học sinh chỉnh lệch)
    socket.on('listen:control', ({ playing, position: pos } = {}, ack) => {
      const live = teacherLive();
      if (!live || !live.listen) return reply(ack)({ error: 'Chưa có file nghe.' });
      const p = Number(pos);
      live.listen.playing = !!playing;
      live.listen.position = Number.isFinite(p) && p >= 0 ? Math.min(p, 86400) : 0;
      live.listen.at = Date.now();
      broadcast(live, socket);
      reply(ack)({ ok: true });
    });
    socket.on('listen:stop', (_, ack) => {
      const live = teacherLive();
      if (!live || !live.listen) return reply(ack)({ ok: true });
      drop(live);
      io.to('live:' + live.classId).emit('listen:state', null);
      reply(ack)({ ok: true });
    });
  }

  return { router, attach, stateFor, drop };
}

module.exports = { init };
