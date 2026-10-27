// Tương tác trong phòng live: cho học sinh phát biểu (mic), tắt mic cả lớp, biểu tượng cảm xúc, tặng sao.
// Âm thanh của học sinh được giáo viên trộn rồi phát lại cho cả lớp (xem public/js/mixer.js); máy chủ chỉ giữ quyền.
const store = require('./db');

const REACTIONS = ['👍', '❤️', '😂', '👏', '😮', '🎉', '🙋'];

function init({ io, lives, present, lk }) {
  const speakerInfo = (live) => {
    if (!live.speaker) return null;
    const v = live.viewers.get(live.speaker);
    return v ? { socketId: live.speaker, userId: v.userId, name: v.name } : null;
  };

  // Một học sinh được phát biểu tại một thời điểm
  async function setSpeaker(live, classId, socketId) {
    const revision = live.speakerRevision = (live.speakerRevision || 0) + 1;
    const prev = live.speaker;
    const userOf = (sid) => (live.viewers.get(sid) || {}).userId;
    if (prev && prev !== socketId) {
      io.to(prev).emit('speak:revoked', { reason: 'Giáo viên đã thu lại micro.' });
      if (lk && lk.enabled) lk.allowSpeaker(classId, userOf(prev), false);
    }
    live.speaker = socketId || null;
    if (socketId) {
      // Với LiveKit: cấp quyền phát xong mới báo cho học sinh bật micro (tránh phát khi quyền chưa có hiệu lực)
      const userId = userOf(socketId);
      const allowed = !lk || !lk.enabled || await lk.allowSpeaker(classId, userId, true);
      if (revision !== live.speakerRevision || live.speaker !== socketId || !live.viewers.has(socketId)) {
        if (lk && lk.enabled && userOf(live.speaker) !== userId) await lk.allowSpeaker(classId, userId, false);
        return false;
      }
      if (!allowed) { live.speaker = null; io.to(socketId).emit('speak:revoked', { reason: 'Máy chủ video chưa cấp được quyền micro. Hãy nhờ giáo viên thử lại.' }); }
      else io.to(socketId).emit('speak:granted');
    }
    io.to('live:' + classId).emit('speaker', speakerInfo(live));
    return !socketId || live.speaker === socketId;
  }

  function onViewerGone(live, classId, socketId) {
    if (live.speaker === socketId) setSpeaker(live, classId, null);
  }

  function attach(socket) {
    const user = socket.data.user;
    const teacherLive = () => {
      const live = lives.get(socket.data.classId);
      return live && live.teacherSocket === socket.id && ['teacher', 'admin'].includes(user.role) ? live : null;
    };
    const reply = (ack) => (typeof ack === 'function' ? ack : () => {});

    socket.on('speak:grant', async ({ socketId } = {}, ack) => {
      const live = teacherLive();
      if (!live || !live.viewers.has(socketId)) return reply(ack)({ error: 'Không tìm thấy học sinh.' });
      const ok = await setSpeaker(live, socket.data.classId, socketId);
      reply(ack)(ok ? { ok: true } : { error: 'Không cấp được quyền micro hoặc quyền đã thay đổi. Hãy thử lại.' });
    });

    // Thu mic của người đang nói; muteAll cũng dùng chung vì mỗi lúc chỉ một học sinh có mic
    socket.on('speak:revoke', (_, ack) => {
      const live = teacherLive();
      if (!live) return reply(ack)({ error: 'Không có quyền.' });
      setSpeaker(live, socket.data.classId, null);
      reply(ack)({ ok: true });
    });

    // Phụ đề trực tiếp: trình duyệt giáo viên nhận dạng giọng nói rồi gửi văn bản, máy chủ chuyển cho cả lớp
    socket.on('caption', ({ text, final } = {}) => {
      const live = teacherLive();
      if (!live || typeof text !== 'string') return;
      const now = Date.now();
      if (!final && now - (socket.data.lastCaption || 0) < 120) return;
      socket.data.lastCaption = now;
      io.to('live:' + socket.data.classId).emit('caption', { text: text.slice(0, 300), final: !!final });
    });

    socket.on('reaction', ({ emoji } = {}) => {
      const classId = socket.data.classId;
      const live = lives.get(classId);
      if (!live || !REACTIONS.includes(emoji)) return;
      const now = Date.now();
      if (now - (socket.data.lastReaction || 0) < 700) return; // chống spam
      socket.data.lastReaction = now;
      io.to('live:' + classId).emit('reaction', { emoji, name: user.name });
    });

    // Tặng sao: +10 điểm và hiện trên bảng xếp hạng
    socket.on('star:give', ({ socketId, count } = {}, ack) => {
      const live = teacherLive();
      const v = live && live.viewers.get(socketId);
      if (!v) return reply(ack)({ error: 'Không tìm thấy học sinh.' });
      const n = Math.min(5, Math.max(1, parseInt(count) || 1));
      const prev = live.scores.get(v.userId) || { name: v.name, points: 0, correct: 0, stars: 0 };
      live.scores.set(v.userId, { ...prev, name: v.name, points: prev.points + 10 * n, stars: (prev.stars || 0) + n });
      io.to(socketId).emit('star:received', { count: n });
      io.to('live:' + socket.data.classId).emit('chat', { system: true, text: `⭐ ${v.name} được tặng ${n} sao!`, at: Date.now() });
      if (live.lesson) present.broadcast(live);
      reply(ack)({ ok: true });
    });
  }

  return { attach, onViewerGone, speakerInfo, setSpeaker, REACTIONS };
}

module.exports = { init, REACTIONS };
