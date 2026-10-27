// Trình chiếu bài giảng trong buổi livestream: đồng bộ slide, hoạt động tương tác, chấm điểm, bảng xếp hạng.
// Trạng thái nằm trong `live` (Map lives của server.js): lesson, slideIndex, activity, scores.
const store = require('./db');
const L = require('./lessons');

function init({ io, lives }) {
  function distribution(act) {
    const sc = act.scene;
    if (sc.type !== 'quiz' && sc.type !== 'poll') return null;
    const counts = sc.options.map(() => 0);
    for (const a of act.answers.values()) counts[a.answer]++;
    return counts;
  }

  function ranking(live) {
    return [...live.scores.entries()]
      .map(([userId, v]) => ({ userId, name: v.name, points: v.points, correct: v.correct, stars: v.stars || 0 }))
      .sort((a, b) => b.points - a.points || b.correct - a.correct);
  }

  function resultFor(live, act, userId) {
    const rank = ranking(live);
    const out = { ...act.summary, leaderboard: rank.slice(0, 5) };
    if (userId) {
      const mine = act.answers.get(userId);
      const pos = rank.findIndex((r) => r.userId === userId);
      out.me = {
        answered: !!mine, correct: mine ? mine.correct : null, fraction: mine ? mine.fraction : 0,
        points: mine ? mine.points : 0, detail: mine ? mine.detail || null : null, total: pos >= 0 ? rank[pos].points : 0, rank: pos >= 0 ? pos + 1 : null,
      };
    } else {
      out.details = [...act.answers.values()].map((a) => ({ name: a.name, correct: a.correct, points: a.points })).sort((a, b) => b.points - a.points);
    }
    return out;
  }

  // Trạng thái bài giảng gửi cho một người; học sinh không bao giờ nhận đáp án trước khi chốt
  function stateFor(live, { teacher = false, userId = null } = {}) {
    const les = live.lesson;
    if (!les) return null;
    const sc = les.scenes[live.slideIndex];
    const act = live.activity;
    const st = { id: les.id, title: les.title, total: les.scenes.length, index: live.slideIndex, scene: L.publicScene(sc), activity: null, leaderboard: ranking(live).slice(0, 5) };
    if (act) {
      st.activity = { sceneId: act.sceneId, phase: act.phase, play: act.play, startedAt: act.startedAt, endsAt: act.endsAt || null, endsInMs: act.endsAt ? Math.max(0, act.endsAt - Date.now()) : null, durationMs: act.endsAt ? act.endsAt - act.startedAt : null };
      if (teacher) st.activity.stats = { answered: act.answers.size, distribution: distribution(act) };
      else st.activity.answered = act.answers.has(userId);
      if (act.phase === 'ended') st.activity.result = resultFor(live, act, teacher ? null : userId);
    }
    if (teacher) {
      st.fullScene = sc;
      st.nextScene = les.scenes[live.slideIndex + 1] || null;
      st.outline = les.scenes.map((x) => ({ id: x.id, type: x.type, title: x.title }));
    }
    return st;
  }

  function broadcast(live) {
    if (live.teacherSocket) io.to(live.teacherSocket).emit('lesson:state', stateFor(live, { teacher: true }));
    for (const [sid, v] of live.viewers) io.to(sid).emit('lesson:state', stateFor(live, { userId: v.userId }));
  }

  function endActivity(live) {
    const act = live.activity;
    if (!act || act.phase !== 'open') return;
    act.phase = 'ended';
    clearTimeout(act.timer);
    live.revealed = live.revealed || new Set();
    live.scored = live.scored || new Set();
    const key = live.lesson.id + ':' + act.sceneId;
    live.revealed.add(key);
    const first = !live.scored.has(key);
    if (act.scene.type !== 'poll' && first) {
      for (const [uid, a] of act.answers) {
        const prev = live.scores.get(uid) || { name: a.name, points: 0, correct: 0, stars: 0 };
        live.scores.set(uid, { name: a.name, points: prev.points + a.points, correct: prev.correct + (a.correct ? 1 : 0), stars: prev.stars || 0 });
      }
    }
    live.scored.add(key);
    if (!first) for (const a of act.answers.values()) a.points = 0;
    store.data.activityResults.push({ classId: live.classId, lessonId: live.lesson.id, sceneId: act.sceneId, at: Date.now(), practice: !first, answers: [...act.answers].map(([userId, a]) => ({ userId, ...a })) });
    store.data.activityResults = store.data.activityResults.slice(-10000);
    store.save();
    const answers = [...act.answers.values()];
    act.summary = {
      sceneId: act.sceneId, type: act.scene.type, reveal: L.reveal(act.scene), distribution: distribution(act),
      answered: answers.length, correctCount: answers.filter((a) => a.correct).length, viewers: live.viewers.size,
    };
  }

  function attach(socket) {
    const user = socket.data.user;
    // Chỉ socket giáo viên của phòng mới được điều khiển
    const teacherCtx = () => {
      const live = lives.get(socket.data.classId);
      return live && live.teacherSocket === socket.id && ['teacher', 'admin'].includes(user.role) ? live : null;
    };
    const reply = (ack) => (typeof ack === 'function' ? ack : () => {});

    socket.on('lesson:present', ({ lessonId } = {}, ack) => {
      const live = teacherCtx();
      if (!live) return reply(ack)({ error: 'Bạn không có quyền điều khiển buổi học này.' });
      const lesson = store.data.lessons.find((l) => l.id === lessonId && l.teacherId === user.id);
      if (!lesson || !lesson.scenes.length) return reply(ack)({ error: 'Bài giảng trống hoặc không tồn tại.' });
      endActivity(live);
      if (live.pdf) { live.pdf = null; io.to('live:' + socket.data.classId).emit('pdf:state', null); } // không chiếu PDF và bài giảng cùng lúc
      live.lesson = { id: lesson.id, title: lesson.title, scenes: JSON.parse(JSON.stringify(lesson.scenes)) };
      live.slideIndex = 0;
      live.activity = null;
      // Gắn bài vào lớp để học sinh hỏi AI sau buổi học
      if (!lesson.classIds.includes(socket.data.classId)) lesson.classIds.push(socket.data.classId);
      // Chỉ đánh dấu đã dạy khi giáo viên kết thúc buổi, không phải lúc vừa mở bài.
      store.save();
      broadcast(live);
      reply(ack)({ ok: true });
    });

    socket.on('lesson:stop', () => {
      const live = teacherCtx();
      if (!live || !live.lesson) return;
      endActivity(live);
      live.lastLesson = live.lesson;
      live.lesson = null;
      live.activity = null;
      broadcast(live);
    });

    socket.on('slide:goto', ({ index } = {}) => {
      const live = teacherCtx();
      if (!live || !live.lesson || !Number.isInteger(index)) return;
      const next = Math.min(live.lesson.scenes.length - 1, Math.max(0, index));
      endActivity(live); // đổi slide khi đang mở hoạt động -> tự chốt để không mất điểm
      live.slideIndex = next;
      live.activity = null;
      broadcast(live);
    });

    socket.on('activity:start', ({ seconds } = {}) => {
      const live = teacherCtx();
      if (!live || !live.lesson) return;
      const sc = live.lesson.scenes[live.slideIndex];
      if (!L.INTERACTIVE.includes(sc.type)) return;
      if (live.activity && live.activity.phase === 'open') return;
      // Đếm ngược tuỳ chọn (giây): hết giờ máy chủ tự chốt để học sinh không phải chờ giáo viên
      const secs = Math.min(600, Math.max(0, parseInt(seconds) || 0));
      const act = { sceneId: sc.id, scene: sc, phase: 'open', startedAt: Date.now(), endsAt: secs ? Date.now() + secs * 1000 : null, play: L.playable(sc), answers: new Map(), summary: null };
      if (secs) {
        act.timer = setTimeout(() => {
          if (live.activity === act && act.phase === 'open') { endActivity(live); broadcast(live); }
        }, secs * 1000 + 250);
      }
      live.activity = act;
      broadcast(live);
    });

    socket.on('activity:end', () => {
      const live = teacherCtx();
      if (!live || !live.activity || live.activity.phase !== 'open') return;
      endActivity(live);
      broadcast(live);
    });

    socket.on('activity:answer', ({ answer } = {}, ack) => {
      const live = lives.get(socket.data.classId);
      const viewer = live && live.viewers.get(socket.id);
      const act = live && live.activity;
      if (act && act.phase === 'open' && act.endsAt && Date.now() >= act.endsAt) { endActivity(live); broadcast(live); }
      if (!viewer || !act || act.phase !== 'open') return reply(ack)({ error: 'Hoạt động đã đóng.' });
      if (act.answers.has(viewer.userId)) return reply(ack)({ error: 'Bạn đã trả lời rồi.' });
      const g = L.grade(act.scene, answer);
      if (!g.valid) return reply(ack)({ error: 'Câu trả lời không hợp lệ.' });
      const elapsed = Date.now() - act.startedAt;
      const points = act.scene.type === 'poll' ? 0 : Math.round(g.fraction * 100 + (g.correct ? 50 * Math.max(0, 1 - elapsed / 45000) : 0));
      act.answers.set(viewer.userId, { answer, fraction: g.fraction, correct: g.correct, points, name: viewer.name, at: Date.now(), detail: g.detail });
      reply(ack)({ ok: true });
      if (live.teacherSocket) io.to(live.teacherSocket).emit('activity:stats', { answered: act.answers.size, distribution: distribution(act) });
    });
  }

  // Dừng chiếu bài giảng (dùng khi chuyển sang chiếu PDF)
  function stopLesson(live) {
    if (!live.lesson) return;
    endActivity(live);
    live.lastLesson = live.lesson;
    live.lesson = null;
    live.activity = null;
    broadcast(live);
  }

  return { stateFor, attach, ranking, endActivity, broadcast, stopLesson };
}

module.exports = { init };
