// Bảng viết cộng tác: mỗi học sinh viết bài ngắn, giáo viên xem trực tiếp, chọn một bài chiếu cho cả lớp và tô màu sửa lỗi.
// Trạng thái nằm trong live.pad = { prompt, entries: Map(userId -> {name,text,at}), featured: {userId,name,text,marks[]} | null }
const COLORS = ['red', 'yellow', 'green', 'blue']; // đỏ = lỗi, vàng = gợi ý, xanh lá = hay, xanh dương = ghi chú
const MAX_TEXT = 1500;
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

function init({ io, lives }) {
  const entriesList = (pad) => [...pad.entries].map(([userId, e]) => ({ userId, name: e.name, text: e.text, at: e.at }));

  function stateFor(live, { teacher = false, userId = null } = {}) {
    const pad = live.pad;
    if (!pad) return null;
    const st = { prompt: pad.prompt, featured: pad.featured };
    if (teacher) st.entries = entriesList(pad);
    else st.mine = (pad.entries.get(userId) || {}).text || '';
    return st;
  }

  function broadcast(live) {
    if (live.teacherSocket) io.to(live.teacherSocket).emit('pad:state', stateFor(live, { teacher: true }));
    for (const [sid, v] of live.viewers) io.to(sid).emit('pad:state', stateFor(live, { userId: v.userId }));
  }

  function attach(socket) {
    const user = socket.data.user;
    const teacherLive = () => {
      const live = lives.get(socket.data.classId);
      return live && live.teacherSocket === socket.id && user.role === 'teacher' ? live : null;
    };
    const reply = (ack) => (typeof ack === 'function' ? ack : () => {});
    const room = () => 'live:' + socket.data.classId;

    socket.on('pad:open', ({ prompt } = {}, ack) => {
      const live = teacherLive();
      if (!live) return reply(ack)({ error: 'Không có quyền.' });
      live.pad = { prompt: clip(prompt, 300).trim() || 'Write 2–3 sentences about your day.', entries: new Map(), featured: null };
      broadcast(live);
      reply(ack)({ ok: true });
    });

    socket.on('pad:close', () => {
      const live = teacherLive();
      if (!live || !live.pad) return;
      live.pad = null;
      broadcast(live);
      io.to(room()).emit('pad:state', null);
    });

    socket.on('pad:write', ({ text } = {}, ack) => {
      const live = lives.get(socket.data.classId);
      const viewer = live && live.viewers.get(socket.id);
      if (!viewer || !live.pad || typeof text !== 'string') return reply(ack)({ error: 'Bảng viết chưa mở.' });
      const now = Date.now();
      if (now - (socket.data.lastPadWrite || 0) < 120) return reply(ack)({ error: 'Quá nhanh.' });
      socket.data.lastPadWrite = now;
      const entry = { name: viewer.name, text: text.slice(0, MAX_TEXT), at: now };
      live.pad.entries.set(viewer.userId, entry);
      if (live.teacherSocket) io.to(live.teacherSocket).emit('pad:entry', { userId: viewer.userId, name: entry.name, text: entry.text, at: now });
      reply(ack)({ ok: true });
    });

    // Chiếu bài của một học sinh cho cả lớp (chụp lại nội dung tại thời điểm chọn để vị trí tô màu không bị lệch)
    socket.on('pad:feature', ({ userId } = {}, ack) => {
      const live = teacherLive();
      if (!live || !live.pad) return reply(ack)({ error: 'Bảng viết chưa mở.' });
      const e = userId ? live.pad.entries.get(userId) : null;
      if (userId && !e) return reply(ack)({ error: 'Học sinh chưa viết gì.' });
      live.pad.featured = e ? { userId, name: e.name, text: e.text, marks: [] } : null;
      broadcast(live);
      reply(ack)({ ok: true });
    });

    socket.on('pad:mark', ({ start, end, color, fix, note } = {}, ack) => {
      const live = teacherLive();
      const f = live && live.pad && live.pad.featured;
      if (!f) return reply(ack)({ error: 'Chưa chọn bài để sửa.' });
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > f.text.length || start >= end) return reply(ack)({ error: 'Vùng chọn không hợp lệ.' });
      if (!COLORS.includes(color)) return reply(ack)({ error: 'Màu không hợp lệ.' });
      if (f.marks.length >= 60) return reply(ack)({ error: 'Quá nhiều ghi chú.' });
      f.marks.push({ start, end, color, fix: clip(fix, 200).trim(), note: clip(note, 200).trim() });
      io.to(room()).emit('pad:marks', { userId: f.userId, marks: f.marks });
      reply(ack)({ ok: true });
    });

    socket.on('pad:unmark', ({ index } = {}) => {
      const live = teacherLive();
      const f = live && live.pad && live.pad.featured;
      if (!f) return;
      if (index === 'all') f.marks = [];
      else if (Number.isInteger(index) && f.marks[index]) f.marks.splice(index, 1);
      io.to(room()).emit('pad:marks', { userId: f.userId, marks: f.marks });
    });
  }

  return { attach, stateFor };
}

module.exports = { init };
