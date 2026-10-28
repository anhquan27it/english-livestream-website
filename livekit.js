// Tích hợp LiveKit (SFU mã nguồn mở) cho phần video/âm thanh. Socket.IO vẫn giữ vai trò kênh điều khiển
// (chấm điểm, ẩn đáp án, kiểm tra quyền); LiveKit chỉ lo truyền hình. Khoá chỉ nằm ở máy chủ.
//
// Cấu hình bằng biến môi trường (để trống = tắt LiveKit, dùng WebRTC P2P cũ):
//   LIVEKIT_URL          địa chỉ máy chủ LiveKit mà MÁY CHỦ EngLive gọi được, vd ws://localhost:7880 hoặc wss://xxx.livekit.cloud
//   LIVEKIT_PUBLIC_URL   (tuỳ chọn) địa chỉ mà TRÌNH DUYỆT dùng, nếu khác LIVEKIT_URL
//   LIVEKIT_API_KEY, LIVEKIT_API_SECRET
//   LIVEKIT_DEV=1        dùng khoá mặc định của `livekit-server --dev` (devkey/secret, ws://localhost:7880)
const express = require('express');
const { AccessToken, RoomServiceClient, TrackSource } = require('livekit-server-sdk');

function readConfig() {
  const dev = process.env.LIVEKIT_DEV === '1';
  const url = process.env.LIVEKIT_URL || (dev ? 'ws://localhost:7880' : '');
  const key = process.env.LIVEKIT_API_KEY || (dev ? 'devkey' : '');
  const secret = process.env.LIVEKIT_API_SECRET || (dev ? 'secret' : '');
  return { url, publicUrl: process.env.LIVEKIT_PUBLIC_URL || url, key, secret, enabled: !!(url && key && secret) };
}

const toHttp = (u) => u.replace(/^ws/i, 'http');
const roomName = (classId, groupId) => `cls_${classId}` + (groupId ? `__${groupId}` : '');

function create() {
  const cfg = readConfig();
  const svc = cfg.enabled ? new RoomServiceClient(toHttp(cfg.url), cfg.key, cfg.secret) : null;

  async function makeToken({ user, classId, groupId, canPublish, sources }) {
    const at = new AccessToken(cfg.key, cfg.secret, { identity: user.id, name: user.name, ttl: '6h', metadata: JSON.stringify({ role: user.role }) });
    at.addGrant({
      room: roomName(classId, groupId), roomJoin: true, canSubscribe: true, canPublishData: false,
      canPublish, ...(canPublish && sources ? { canPublishSources: sources } : {}),
    });
    return at.toJwt();
  }

  const speakerSources = (perms = {}) => [TrackSource.MICROPHONE, ...(perms.camera ? [TrackSource.CAMERA] : []), ...(perms.screen ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : [])];

  // Cho/thu quyền phát (micro, và camera/màn hình nếu giáo viên cấp thêm) của một học sinh đang ở phòng chính. Lỗi (học sinh chưa vào LiveKit...) không làm hỏng buổi học.
  async function allowSpeaker(classId, userId, allowed, perms = {}) {
    if (!svc || !userId) return false;
    try {
      await svc.updateParticipant(roomName(classId), userId, undefined, {
        canSubscribe: true, canPublish: allowed, canPublishData: false, canPublishSources: allowed ? speakerSources(perms) : [],
      });
      return true;
    } catch (e) {
      console.warn('[livekit] updateParticipant', e.message);
      return false;
    }
  }

  // Đóng phòng chính và các phòng nhóm khi kết thúc buổi học (mọi người bị ngắt)
  async function endRooms(classId, groupIds = [], includeMain = true) {
    if (!svc) return;
    for (const g of [...(includeMain ? [null] : []), ...groupIds]) {
      try { await svc.deleteRoom(roomName(classId, g)); } catch { /* phòng chưa tồn tại */ }
    }
  }

  async function removeUser(classId, userId, groupIds = []) {
    if (!svc || !userId) return;
    for (const groupId of [null, ...groupIds]) {
      try { await svc.removeParticipant(roomName(classId, groupId), userId); }
      catch (e) { if (!/not found/i.test(e.message)) console.warn('[livekit] removeParticipant failed'); }
    }
  }

  // Số phòng và số người đang online thật trên LiveKit (cho trang admin). Lỗi/chậm thì trả null, không làm hỏng trang.
  async function stats() {
    if (!svc) return null;
    try {
      const rooms = await Promise.race([svc.listRooms(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]);
      return { rooms: rooms.length, participants: rooms.reduce((n, r) => n + (r.numParticipants || 0), 0) };
    } catch (e) {
      return { error: e.message };
    }
  }

  return { enabled: cfg.enabled, config: cfg, roomName, makeToken, allowSpeaker, speakerSources, endRooms, removeUser, stats, TrackSource };
}

// Route: /api/config cho trình duyệt biết có dùng LiveKit không; /api/livekit/token cấp token theo quyền của người dùng
function createRouter({ lk, auth, lives, io, findClass, canAccess, viewerUserId, groupForUser }) {
  const router = express.Router();

  router.get('/api/config', auth(), (req, res) => {
    res.json({ livekit: { enabled: lk.enabled, url: lk.enabled ? lk.config.publicUrl : null } });
  });

  router.post('/api/livekit/token', auth(), async (req, res) => {
    if (!lk.enabled) return res.status(400).json({ error: 'LiveKit chưa được cấu hình trên máy chủ.' });
    const { classId, groupId } = req.body || {};
    const c = findClass(classId);
    if (!canAccess(req.user, c)) return res.status(403).json({ error: 'Bạn không thuộc lớp học này.' });
    const live = lives.get(classId);
    if (!live) return res.status(409).json({ error: 'Buổi học chưa bắt đầu hoặc đã kết thúc.' });
    if (live.video && live.video.provider !== 'livekit') return res.status(409).json({ error: 'Buổi học này không sử dụng LiveKit.' });
    const isTeacher = req.user.id === c.teacherId && ['teacher', 'admin'].includes(req.user.role);
    const joined = () => {
      if (lives.get(classId) !== live || (live.banned && live.banned.has(req.user.id))) return false;
      const matches = sid => { const s = io.sockets.sockets.get(sid); return s && s.connected && s.data.token === req.token && s.data.classId === classId; };
      if (isTeacher) return matches(live.teacherSocket);
      if (req.user.role !== 'student' || !c.studentIds.includes(req.user.id)) return false;
      return [...live.viewers].some(([sid, viewer]) => viewer.userId === req.user.id && matches(sid));
    };
    if (!joined()) return res.status(403).json({ error: 'Bạn cần tham gia phòng học trước khi kết nối video.' });
    try {
      let params;
      if (!groupId) {
        // Phòng chính: chỉ giáo viên phát; học sinh chỉ nghe/xem, trừ khi đang được cho phát biểu (khi đó chỉ được phát micro)
        const speaking = live.speaker && viewerUserId(live, live.speaker) === req.user.id;
        params = { canPublish: isTeacher || !!speaking, sources: isTeacher ? undefined : lk.speakerSources(live.speakerPerms) };
      } else {
        // Phòng nhóm: thành viên của nhóm (hoặc giáo viên) mới được vào; trong nhóm ai cũng phát camera + micro
        const g = live.breakout && live.breakout.groups.find((x) => x.id === groupId);
        if (!g) return res.status(404).json({ error: 'Không tìm thấy nhóm.' });
        if (!isTeacher && !(groupForUser(live, req.user.id) === g)) return res.status(403).json({ error: 'Bạn không thuộc nhóm này.' });
        params = { canPublish: true, sources: [lk.TrackSource.CAMERA, lk.TrackSource.MICROPHONE] };
      }
      const token = await lk.makeToken({ user: req.user, classId, groupId, ...params });
      if (!joined()) return res.status(403).json({ error: 'Bạn không còn trong phòng học.' });
      res.json({ url: lk.config.publicUrl, token, room: lk.roomName(classId, groupId), identity: req.user.id, canPublish: params.canPublish });
    } catch (e) {
      console.error('[livekit] token', e.message);
      res.status(500).json({ error: 'Không tạo được token LiveKit.' });
    }
  });

  return router;
}

module.exports = { create, createRouter };
