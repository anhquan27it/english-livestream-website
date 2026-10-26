// Tương tác trong phòng live: cho học sinh phát biểu (mic), tắt mic cả lớp, biểu tượng cảm xúc, tặng sao.
// Âm thanh của học sinh được giáo viên trộn rồi phát lại cho cả lớp (xem public/js/mixer.js); máy chủ chỉ giữ quyền.
const store = require('./db');

const REACTIONS = ['👍', '❤️', '😂', '👏', '😮', '🎉', '🙋'];

function init({ io, lives, present }) {
  const speakerInfo = (live) => {
    if (!live.speaker) return null;
    const v = live.viewers.get(live.speaker);
    return v ? { socketId: live.speaker, userId: v.userId, name: v.name } : null;
  };

  // Một học sinh được phát biểu tại một thời điểm
  function setSpeaker(live, classId, socketId) {
    const prev = live.speaker;
    if (prev && prev !== socketId) io.to(prev).emit('speak:revoked', { reason: 'Giáo viên đã thu lại micro.' });
    live.speaker = socketId || null;
    if (socketId) io.to(socketId).emit('speak:granted');
    io.to('live:' + classId).emit('speaker', speakerInfo(live));
  }

  function onViewerGone(live, classId, socketId) {
    if (live.speaker === socketId) setSpeaker(live, classId, null);
  }

  function attach(socket) {
    const user = socket.data.user;
    const teacherLive = () => {
      const live = lives.get(socket.data.classId);
      return live && live.teacherSocket === socket.id && user.role === 'teacher' ? live : null;
    };
    const reply = (ack) => (typeof ack === 'function' ? ack : () => {});

    socket.on('speak:grant', ({ socketId } = {}, ack) => {
      const live = teacherLive();
      if (!live || !live.viewers.has(socketId)) return reply(ack)({ error: 'Không tìm thấy học sinh.' });
      setSpeaker(live, socket.data.classId, socketId);
      reply(ack)({ ok: true });
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
