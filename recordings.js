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
    let title;
    try { title = decodeURIComponent(String(req.headers['x-title'] || 'Buổi học')).slice(0, 120); }
    catch { return res.status(400).json({ error: 'Tên bản ghi không hợp lệ.' }); }
    const storage = require('./storage');
    if (!storage.available(1)) return res.status(413).json({ error: 'Đã hết dung lượng lưu trữ. Liên hệ admin.' });
    fs.mkdirSync(DIR, { recursive: true });
    const id = store.id('rec');
    const file = path.join(DIR, id + '.webm');
    const allocation = storage.reserve(file);
    const out = fs.createWriteStream(file);
    let size = 0;
    let failed = false;
    const fail = (status, msg) => {
      if (failed) return;
      failed = true;
      allocation.release();
      out.destroy();
      fs.rm(file, { force: true }, () => {});
      if (!res.headersSent) res.status(status).json({ error: msg });
    };
    req.on('data', (chunk) => { if (failed) return; size += chunk.length; if (size > MAX_BYTES || !allocation.grow(chunk.length)) { fail(413, 'Bản ghi vượt giới hạn 500 MB hoặc dung lượng còn lại.'); req.unpipe(out); req.resume(); } });
    req.on('aborted', () => fail(400, 'Tải lên bị gián đoạn.'));
    req.on('error', () => fail(400, 'Tải lên bị gián đoạn.'));
    out.on('error', () => fail(500, 'Không ghi được tệp.'));
    out.on('finish', () => {
      allocation.release();
      if (failed) return;
      if (size < 1000) return fail(400, 'Bản ghi rỗng.');
      const rec = {
        id, classId: c.id, title,
        durationSec: Math.max(0, parseInt(req.headers['x-duration']) || 0), size, createdAt: Date.now(), file: id + '.webm',
      };
      store.data.recordings.push(rec);
      store.save();
      res.json({ recording: publicRec(rec) });
    });
    req.pipe(out);
  });

  // ----- Tải lên theo phần (bản ghi dài/lớn): start -> nhiều PUT nối tiếp -> finish -----
  // Tệp tạm `.part` nằm cùng thư mục nên được tính vào dung lượng; mỗi phần phải nối đúng vị trí (X-Offset) để có thể tiếp tục khi lỗi.
  const uploads = new Map();
  const PART_MAX = 32 * 1024 * 1024;
  const dropUpload = (u) => { uploads.delete(u.id); fs.rm(u.part, { force: true }, () => {}); };
  const mine = (req, res) => {
    const u = uploads.get(req.params.uid);
    if (!u || u.userId !== req.user.id) { res.status(404).json({ error: 'Phiên tải lên không còn. Hãy bấm Tải về để giữ bản ghi.' }); return null; }
    return u;
  };

  router.post('/api/classes/:id/recordings/start', auth('teacher'), (req, res) => {
    const c = findClass(req.params.id);
    if (!c || c.teacherId !== req.user.id) return res.status(404).json({ error: 'Không tìm thấy lớp học.' });
    const total = Number((req.body || {}).total);
    if (!Number.isFinite(total) || total < 1000) return res.status(400).json({ error: 'Bản ghi rỗng.' });
    if (total > MAX_BYTES) return res.status(413).json({ error: 'Bản ghi vượt giới hạn 500 MB. Hãy bấm Tải về.' });
    if (!require('./storage').available(total)) return res.status(413).json({ error: 'Không đủ dung lượng lưu trữ. Liên hệ admin hoặc bấm Tải về.' });
    fs.mkdirSync(DIR, { recursive: true });
    for (const u of uploads.values()) if (Date.now() - u.at > 6 * 3600000) dropUpload(u); // dọn phiên bỏ dở
    const id = store.id('rec');
    const u = { id, classId: c.id, userId: req.user.id, total, size: 0, at: Date.now(), part: path.join(DIR, id + '.webm.part') };
    fs.writeFileSync(u.part, '');
    uploads.set(id, u);
    res.json({ uploadId: id, partSize: 16 * 1024 * 1024 });
  });

  router.put('/api/recordings/uploads/:uid', auth('teacher'), (req, res) => {
    const u = mine(req, res); if (!u) return;
    const offset = Number(req.headers['x-offset']);
    if (offset !== u.size) return res.status(409).json({ error: 'Sai vị trí phần tải lên.', size: u.size });
    let got = 0, failed = false;
    const out = fs.createWriteStream(u.part, { flags: 'a' });
    const fail = (status, msg) => { if (failed) return; failed = true; out.destroy(); if (!res.headersSent) res.status(status).json({ error: msg, size: u.size }); try { fs.truncateSync(u.part, u.size); } catch {} };
    req.on('data', (chunk) => { if (failed) return; got += chunk.length; if (got > PART_MAX || u.size + got > u.total + 1024 || !require('./storage').available(chunk.length)) { fail(413, 'Phần tải lên quá lớn hoặc hết dung lượng.'); req.resume(); } });
    req.on('aborted', () => fail(400, 'Tải lên bị gián đoạn.'));
    req.on('error', () => fail(400, 'Tải lên bị gián đoạn.'));
    out.on('error', () => fail(500, 'Không ghi được tệp.'));
    out.on('finish', () => { if (failed) return; u.size += got; u.at = Date.now(); res.json({ size: u.size }); });
    req.pipe(out);
  });

  router.post('/api/recordings/uploads/:uid/finish', auth('teacher'), (req, res) => {
    const u = mine(req, res); if (!u) return;
    const b = req.body || {};
    if (u.size < 1000 || u.size !== u.total) return res.status(409).json({ error: 'Chưa nhận đủ dữ liệu (' + u.size + '/' + u.total + ' byte). Hãy thử lại.', size: u.size });
    const file = u.id + '.webm';
    fs.renameSync(u.part, path.join(DIR, file));
    uploads.delete(u.id);
    const rec = { id: u.id, classId: u.classId, title: String(b.title || 'Buổi học').trim().slice(0, 120) || 'Buổi học', durationSec: Math.max(0, parseInt(b.durationSec) || 0), size: u.size, createdAt: Date.now(), file };
    store.data.recordings.push(rec);
    store.save();
    res.json({ recording: publicRec(rec) });
  });

  router.delete('/api/recordings/uploads/:uid', auth('teacher'), (req, res) => {
    const u = mine(req, res); if (!u) return;
    dropUpload(u);
    res.json({ ok: true });
  });

  router.get('/api/recordings/:rid/file', mediaAuth, (req, res) => {
    const r = store.data.recordings.find((x) => x.id === req.params.rid);
    if (!r || !canAccess(req.user, findClass(r.classId))) return res.status(404).json({ error: 'Không tìm thấy bản ghi.' });
    res.type('video/webm');
    if (req.query.download) res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent((r.title || 'buoi-hoc').replace(/[\\/:*?"<>|]/g, '-')) + '.webm');
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
