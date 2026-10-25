// Trình chiếu bài giảng trong phòng live: học sinh xem slide + chơi hoạt động, giáo viên điều khiển.
const LessonLive = (() => {
  const o = {};            // { isTeacher, socket, classId, stage, layer, panel }
  let state = null;        // trạng thái bài giảng mới nhất từ server
  let local = {};          // trạng thái tạm của học sinh (ghép cặp, xếp câu...)
  let localKey = '';
  let onChange = () => {};

  let statsBound = false;
  // init gọi hai lần: lần đầu dựng giao diện, lần sau (khi đã có socket) đăng ký sự kiện
  function init(opts) {
    Object.assign(o, opts);
    onChange = opts.onChange || onChange;
    if (!o.isTeacher) return;
    if (!opts.socket) {
      document.addEventListener('keydown', (e) => {
        if (!state || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.querySelector('.modal-backdrop')) return;
        if (e.key === 'ArrowRight') go(state.index + 1);
        if (e.key === 'ArrowLeft') go(state.index - 1);
      });
      paintTeacher();
    } else if (!statsBound) {
      statsBound = true;
      o.socket.on('activity:stats', (st) => {
        if (state && state.activity) { state.activity.stats = st; paintTeacher(); }
      });
    }
  }

  function apply(st) {
    const before = state && state.id;
    state = st;
    const key = st ? st.scene.id + ':' + (st.activity ? st.activity.startedAt : '') : '';
    if (key !== localKey) { local = {}; localKey = key; }
    if (o.isTeacher) paintTeacher(); else paintStudent();
    if ((st && st.id) !== before) onChange(st);
  }

  // ----- Học sinh -----
  function paintStudent() {
    o.stage.classList.toggle('with-slide', !!state);
    if (!state) { o.layer.innerHTML = ''; o.stage.classList.remove('swap'); return; }
    Slides.render(o.layer, {
      scene: state.scene, activity: state.activity, role: 'student', local,
      handlers: {
        answer(value, onFail) {
          o.socket.emit('activity:answer', { answer: value }, (res) => {
            if (res && res.error) { toast(res.error, 'error'); onFail(); return; }
            if (state.activity) state.activity.answered = true;
            paintStudent();
          });
        },
      },
    });
  }

  // ----- Giáo viên -----
  const go = (i) => {
    if (!state || i < 0 || i >= state.total) return;
    o.socket.emit('slide:goto', { index: i });
  };

  async function paintTeacher() {
    const p = o.panel;
    // Sân khấu của giáo viên cũng hiển thị slide (video của mình thu nhỏ ở góc, bấm "Đổi khung" để đảo)
    o.stage.classList.toggle('with-slide', !!state);
    if (!state) { o.layer.innerHTML = ''; o.stage.classList.remove('swap'); return paintPicker(p); }
    const act = state.activity;
    const sc = state.fullScene;
    const interactive = state.scene.interactive;
    const open = act && act.phase === 'open';
    const ended = act && act.phase === 'ended';
    p.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px">
        <b style="font-size:15px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📘 ${esc(state.title)}</b>
        <button class="icon-btn" data-stop title="Dừng chiếu bài giảng" style="color:#a9a6c9"><i data-lucide="square"></i></button>
      </div>
      <div class="lp-preview" id="lpPrev"></div>
      <div class="lp-nav">
        <button data-nav="-1" ${state.index === 0 ? 'disabled' : ''} title="Slide trước (←)"><i data-lucide="chevron-left"></i></button>
        <span class="count">${state.index + 1} / ${state.total}</span>
        <button data-nav="1" ${state.index === state.total - 1 ? 'disabled' : ''} title="Slide sau (→)"><i data-lucide="chevron-right"></i></button>
      </div>
      <div class="lp-act">
        ${interactive && !act ? `<button class="btn btn-accent" data-start><i data-lucide="play"></i> Bắt đầu hoạt động</button>` : ''}
        ${open ? `<div class="lp-stat">📝 ${act.stats.answered} học sinh đã trả lời</div><button class="btn btn-live" data-end><i data-lucide="flag"></i> Chốt &amp; xem kết quả</button>` : ''}
        ${ended ? `<div class="lp-stat">✅ Đã chốt · ${act.result.answered}/${act.result.viewers} học sinh tham gia</div>` : ''}
        ${!interactive ? '<div class="lp-stat" style="font-weight:600;color:#a9a6c9">Slide nội dung — bấm → để tiếp tục</div>' : ''}
      </div>
      ${sc && sc.note ? `<div class="lp-notes"><b>Ghi chú của bạn</b>${esc(sc.note)}</div>` : ''}
      ${ended && act.result.details && act.result.details.length ? `<div class="panel-heading">Kết quả từng học sinh</div><div class="lp-list" style="margin-bottom:10px">${act.result.details.map((d) => `<div class="viewer" style="padding:4px 8px"><div class="info">${esc(d.name)}</div><span class="chip ${d.correct === false ? 'chip-warn' : 'chip-ok'}">${d.correct === null ? 'đã chọn' : d.correct ? 'đúng' : 'chưa đúng'} · +${d.points}</span></div>`).join('')}</div>` : ''}
      ${state.leaderboard.length ? `<div class="panel-heading">🏆 Bảng xếp hạng</div><ol class="sl-board" style="color:#ecebff;margin:0 8px 12px">${state.leaderboard.map((r) => `<li style="background:rgba(255,255,255,.07)"><span>${esc(r.name)}</span><b>${r.points}</b></li>`).join('')}</ol>` : ''}
      <div class="panel-heading">Danh sách slide</div>
      <div class="lp-list">${state.outline.map((s, i) => `<button data-go="${i}" class="${i === state.index ? 'active' : ''}"><i>${i + 1}</i><span>${esc(s.title)}</span><em>${Slides.TAGS[s.type] || 'Slide'}</em></button>`).join('')}</div>`;
    icons();
    Slides.render(document.getElementById('lpPrev'), { scene: state.scene, full: sc, activity: act, role: 'teacher', local: {}, handlers: {} });
    Slides.render(o.layer, { scene: state.scene, full: sc, activity: act, role: 'teacher', local: {}, handlers: {} });
    p.querySelector('[data-stop]').onclick = () => o.socket.emit('lesson:stop');
    p.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(state.index + +b.dataset.nav)));
    p.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(+b.dataset.go)));
    const st = p.querySelector('[data-start]'); if (st) st.onclick = () => o.socket.emit('activity:start');
    const en = p.querySelector('[data-end]'); if (en) en.onclick = () => o.socket.emit('activity:end');
  }

  let pickerLoading = false;
  async function paintPicker(p) {
    if (pickerLoading) return;
    pickerLoading = true;
    p.innerHTML = '<div class="empty" style="color:#8885ab">Đang tải bài giảng…</div>';
    try {
      const d = await api('/api/lessons');
      if (state) { pickerLoading = false; return; } // trong lúc tải, giáo viên đã bắt đầu chiếu bài khác
      const ready = d.lessons.filter((l) => l.sceneCount).sort((a, b) => (b.classIds.includes(o.classId) ? 1 : 0) - (a.classIds.includes(o.classId) ? 1 : 0));
      p.innerHTML = `<div class="panel-heading">Chọn bài giảng để chiếu</div>
        <div class="lp-pick">${ready.map((l) => `<button class="lp-lesson" data-pick="${l.id}"><span style="font-size:24px">📘</span><span style="flex:1;min-width:0"><b>${esc(l.title)}</b><small>${l.sceneCount} slide · ${esc(l.level)}${l.classIds.includes(o.classId) ? ' · đã gắn lớp này' : ''}</small></span><i data-lucide="play"></i></button>`).join('')
          || '<div class="empty" style="color:#8885ab"><div class="emoji">📝</div><b style="color:#fff">Chưa có bài giảng nào</b>Hãy soạn bài giảng bằng AI trước buổi học.</div>'}</div>
        <a class="btn btn-outline btn-block" style="margin-top:12px;background:transparent;color:#fff;border-color:rgba(255,255,255,.2)" href="/lessons.html" target="_blank" rel="noopener"><i data-lucide="sparkles"></i> Soạn bài giảng mới</a>`;
      icons();
      p.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => present(b.dataset.pick)));
    } catch (e) {
      p.innerHTML = `<div class="empty" style="color:#ff9bb3">${esc(e.message)}</div>`;
    }
    pickerLoading = false;
  }

  function present(lessonId) {
    o.socket.emit('lesson:present', { lessonId }, (res) => {
      if (res && res.error) toast(res.error, 'error');
      else toast('Đang chiếu bài giảng cho cả lớp', 'success');
    });
  }

  return { init, apply, present, get state() { return state; } };
})();
