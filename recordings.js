// Bản ghi buổi học: giáo viên tải lên (video+âm thanh, định dạng webm), thành viên lớp xem lại.
const fs = require('fs');
const path = require('path');
const express = require('express');
const store = require('./db');

const MAX_BYTES = 500 * 1024 * 1024; // ~1 giờ ở 720p/800kbps
const DIR = path.join(store.dir, 'recordings');

function createRouter({ auth, findClass, canAccess }) {
  const router = express.Router();
  const publicRec = (r) => ({ id: r.id, classId: r.classId, title: r.title, createdAt: r.createdAt, durationSec: r.durationSec, size: r.size });

  // File phát qua thẻ <video> không gửi được header nên chấp nhận token ở query (?token=)
  const mediaAuth = (req, res, next) => {
    if (!req.headers.authorization && req.query.token) req.headers.authorization = 'Bearer ' + req.query.token;
    return auth()(req, res, next);
  };

  router.get('/api/classes/:id/recordings', auth(), (req, res) => {
    const c = findClass(req.params.id);
    if (!canAccess(req.user, c)) return res.status(403).json({ error: 'Bạn không thuộc lớp học này.' });
    res.json({ recordings: store.data.recordings.filter((r) => r.classId === c.id).sort((a, b) => b.createdAt - a.createdAt).map(publicRec) });
  });

  // Thân yêu cầu là dữ liệu video thô, ghi thẳng ra đĩa và chặn khi vượt giới hạn
  router.post('/api/classes/:id/recordings', auth('teacher'), (req, res) => {
    const c = findClass(req.params.id);
    if (!c || c.teacherId !== req.user.id) return res.status(404).json({ error: 'Không tìm thấy lớp học.' });
    fs.mkdirSync(DIR, { recursive: true });
    const id = store.id('rec');
    const file = path.join(DIR, id + '.webm');
    const out = fs.createWriteStream(file);
    let size = 0;
    let failed = false;
    const fail = (status, msg) => {
      if (failed) return;
      failed = true;
      out.destroy();
      fs.rm(file, { force: true }, () => {});
      if (!res.headersSent) res.status(status).json({ error: msg });
    };
    req.on('data', (chunk) => { size += chunk.length; if (size > MAX_BYTES) { fail(413, 'Bản ghi vượt quá 500 MB.'); req.destroy(); } });
    req.on('error', () => fail(400, 'Tải lên bị gián đoạn.'));
    out.on('error', () => fail(500, 'Không ghi được tệp.'));
    out.on('finish', () => {
      if (failed) return;
      if (size < 1000) return fail(400, 'Bản ghi rỗng.');
      const rec = {
        id, classId: c.id, title: decodeURIComponent(String(req.headers['x-title'] || 'Buổi học')).slice(0, 120),
        durationSec: Math.max(0, parseInt(req.headers['x-duration']) || 0), size, createdAt: Date.now(), file: id + '.webm',
      };
      store.data.recordings.push(rec);
      store.save();
      res.json({ recording: publicRec(rec) });
    });
    req.pipe(out);
  });

  router.get('/api/recordings/:rid/file', mediaAuth, (req, res) => {
    const r = store.data.recordings.find((x) => x.id === req.params.rid);
    if (!r || !canAccess(req.user, findClass(r.classId))) return res.status(404).json({ error: 'Không tìm thấy bản ghi.' });
    res.type('video/webm');
    res.sendFile(path.join(DIR, r.file), (e) => { if (e && !res.headersSent) res.status(404).json({ error: 'Tệp bản ghi không còn.' }); });
  });

  router.delete('/api/recordings/:rid', auth('teacher'), (req, res) => {
    const r = store.data.recordings.find((x) => x.id === req.params.rid);
    const c = r && findClass(r.classId);
    if (!r || !c || c.teacherId !== req.user.id) return res.status(404).json({ error: 'Không tìm thấy bản ghi.' });
    fs.rm(path.join(DIR, r.file), { force: true }, () => {});
    store.data.recordings = store.data.recordings.filter((x) => x !== r);
    store.save();
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createRouter };
