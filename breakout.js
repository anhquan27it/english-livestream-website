// Phòng thảo luận nhỏ (breakout): chia lớp thành nhóm 2–5 học sinh; trong nhóm các học sinh nối WebRTC trực tiếp với nhau
// (mesh) và giáo viên có thể "đi tuần" vào từng nhóm. Máy chủ chỉ chia nhóm, giữ quyền và chuyển tiếp tín hiệu.
// Trạng thái: live.breakout = { groups: [{ id, name, members: [socketId], visitor: socketId|null }], startedAt, endsAt, timer }

function init({ io, lives, lk, onGroupStart }) {
  const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

  const memberInfo = (live, sid) => { const v = live.viewers.get(sid); return v ? { socketId: sid, name: v.name } : null; };
  const groupOf = (live, sid) => live.breakout && live.breakout.groups.find((g) => g.members.includes(sid));

  // Thông tin nhóm gửi cho giáo viên (kèm ai đang được giáo viên ghé thăm)
  function teacherState(live) {
    const b = live.breakout;
    if (!b) return null;
    return {
      endsInMs: b.endsAt ? Math.max(0, b.endsAt - Date.now()) : null,
      groups: b.groups.map((g) => ({ id: g.id, name: g.name, visiting: g.visitor === live.teacherSocket, members: g.members.map((m) => memberInfo(live, m)).filter(Boolean) })),
    };
  }
  const pushTeacher = (live) => live.teacherSocket && io.to(live.teacherSocket).emit('breakout:state', teacherState(live));

  function end(live, classId, reason) {
    const b = live.breakout;
    if (!b) return;
    clearTimeout(b.timer);
    for (const g of b.groups) for (const m of g.members) io.to(m).emit('breakout:ended', { reason });
    live.breakout = null;
    if (lk && lk.enabled) lk.endRooms(classId, b.groups.map((g) => g.id), false); // đóng các phòng nhóm LiveKit (kể cả giáo viên đang ghé thăm)
    pushTeacher(live);
    if (live.teacherSocket) io.to(live.teacherSocket).emit('breakout:ended', { reason });
  }

  function onViewerGone(live, classId, socketId) {
    const g = groupOf(live, socketId);
    if (!g) return;
    g.members = g.members.filter((m) => m !== socketId);
    for (const m of g.members) io.to(m).emit('breakout:member-left', { socketId });
    if (g.visitor) io.to(g.visitor).emit('breakout:member-left', { socketId });
    pushTeacher(live);
  }

  function attach(socket) {
    const user = socket.data.user;
    const teacherLive = () => {
      const live = lives.get(socket.data.classId);
      return live && live.teacherSocket === socket.id && ['teacher', 'admin'].includes(user.role) ? live : null;
    };
    const reply = (ack) => (typeof ack === 'function' ? ack : () => {});

    socket.on('breakout:start', ({ size, minutes } = {}, ack) => {
      const live = teacherLive();
      if (!live) return reply(ack)({ error: 'Không có quyền.' });
      if (live.video?.provider === 'zoom') return reply(ack)({ error: 'Hãy chia nhóm bằng chức năng Breakout Rooms trong Zoom.' });
      const ids = [...live.viewers.keys()];
      if (ids.length < 2) return reply(ack)({ error: 'Cần ít nhất 2 học sinh trong phòng để chia nhóm.' });
      if (onGroupStart) onGroupStart(live, socket.data.classId);
      if (live.breakout) end(live, socket.data.classId, 'Giáo viên chia nhóm lại.');
      const n = Math.min(5, Math.max(2, parseInt(size) || 2));
      const shuffled = shuffle(ids);
      const groups = [];
      for (let i = 0; i < shuffled.length; i += n) groups.push(shuffled.slice(i, i + n));
      // Người lẻ cuối cùng (một mình) được gộp vào nhóm trước đó
      if (groups.length > 1 && groups[groups.length - 1].length === 1) groups[groups.length - 2].push(groups.pop()[0]);
      const mins = Math.min(60, Math.max(0, parseInt(minutes) || 0));
      const b = live.breakout = { groups: groups.map((members, i) => ({ id: 'g' + (i + 1), name: 'Nhóm ' + (i + 1), members, userIds: members.map(sid => live.viewers.get(sid).userId), visitor: null })), startedAt: Date.now(), endsAt: mins ? Date.now() + mins * 60000 : null, timer: null };
      if (mins) b.timer = setTimeout(() => end(live, socket.data.classId, 'Hết giờ thảo luận nhóm.'), mins * 60000 + 300);
      for (const g of b.groups) {
        const members = g.members.map((m) => memberInfo(live, m)).filter(Boolean);
        for (const m of g.members) io.to(m).emit('breakout:assigned', { groupId: g.id, name: g.name, members, endsInMs: b.endsAt ? b.endsAt - Date.now() : null });
      }
      pushTeacher(live);
      reply(ack)({ ok: true, groups: b.groups.length });
    });

    socket.on('breakout:end', () => {
      const live = teacherLive();
      if (live) end(live, socket.data.classId, 'Giáo viên gọi cả lớp về phòng chính.');
    });

    // Đi tuần: giáo viên vào một nhóm (mỗi lúc một nhóm)
    socket.on('breakout:visit', ({ groupId } = {}, ack) => {
      const live = teacherLive();
      const g = live && live.breakout && live.breakout.groups.find((x) => x.id === groupId);
      if (!g) return reply(ack)({ error: 'Không tìm thấy nhóm.' });
      for (const o of live.breakout.groups) if (o.visitor === socket.id && o !== g) { o.visitor = null; for (const m of o.members) io.to(m).emit('breakout:visitor-left', { socketId: socket.id }); }
      g.visitor = socket.id;
      for (const m of g.members) io.to(m).emit('breakout:visitor', { socketId: socket.id, name: 'Giáo viên' });
      pushTeacher(live);
      reply(ack)({ ok: true, members: g.members.map((m) => memberInfo(live, m)).filter(Boolean) });
    });

    socket.on('breakout:leave-visit', () => {
      const live = teacherLive();
      if (!live || !live.breakout) return;
      for (const g of live.breakout.groups) if (g.visitor === socket.id) { g.visitor = null; for (const m of g.members) io.to(m).emit('breakout:visitor-left', { socketId: socket.id }); }
      pushTeacher(live);
    });

    // Chuyển tiếp tín hiệu WebRTC chỉ giữa các thành viên cùng nhóm (và giáo viên đang ghé thăm nhóm đó)
    socket.on('bo:signal', ({ to, data } = {}) => {
      const live = lives.get(socket.data.classId);
      if (!live || !live.breakout || typeof to !== 'string') return;
      const gFrom = groupOf(live, socket.id) || live.breakout.groups.find((g) => g.visitor === socket.id);
      const gTo = groupOf(live, to) || live.breakout.groups.find((g) => g.visitor === to);
      if (gFrom && gFrom === gTo && gFrom.members.concat(gFrom.visitor ? [gFrom.visitor] : []).includes(to)) io.to(to).emit('bo:signal', { from: socket.id, data });
    });
  }

  // Nhóm mà một người dùng (theo userId, không phải socketId) đang thuộc về; dùng khi cấp token LiveKit cho phòng nhóm
  function groupForUser(live, userId) {
    return (live.breakout && live.breakout.groups.find((g) => g.members.some((m) => (live.viewers.get(m) || {}).userId === userId))) || null;
  }

  function rejoin(live, socketId, userId) {
    const b = live.breakout, g = b && b.groups.find(g => (g.userIds || []).includes(userId));
    if (!g) return null;
    if (!g.members.includes(socketId)) g.members.push(socketId);
    pushTeacher(live);
    return { groupId: g.id, name: g.name, members: g.members.map(m => memberInfo(live, m)).filter(Boolean), endsInMs: b.endsAt ? Math.max(0, b.endsAt - Date.now()) : null };
  }

  return { attach, onViewerGone, end, teacherState, groupForUser, rejoin };
}

module.exports = { init };
