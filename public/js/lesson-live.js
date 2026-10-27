// Trình chiếu bài giảng trong phòng live: học sinh xem slide + chơi hoạt động, giáo viên điều khiển.
const LessonLive = (() => {
  const o = {};            // { isTeacher, socket, classId, stage, layer, panel }
  let state = null;        // trạng thái bài giảng mới nhất từ server
  let local = {};          // trạng thái tạm của học sinh (ghép cặp, xếp câu...)
  let localKey = '';
  let onChange = () => {};

  // Đếm ngược: cập nhật mọi thanh .sl-timer trên trang mỗi 250ms
  setInterval(() => {
    document.querySelectorAll('.sl-timer').forEach((el) => {
      const left = Math.max(0, +el.dataset.deadline - Date.now());
      el.querySelector('b').textContent = Math.ceil(left / 1000) + 's';
      el.querySelector('em').style.width = Math.min(100, (left / (+el.dataset.dur || 1)) * 100) + '%';
      el.classList.toggle('low', left < 6000);
    });
  }, 250);

  let actSecs = 0; // thời gian đếm ngược giáo viên đã chọn (giây, 0 = không giới hạn)
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
    if (st && st.activity && st.activity.endsInMs != null) st.activity.localEnds = Date.now() + st.activity.endsInMs;
    const key = st ? st.scene.id + ':' + (st.activity ? st.activity.startedAt : '') : '';
    if (key !== localKey) { local = {}; localKey = key; }
    if (o.isTeacher) paintTeacher(); else paintStudent();
    if ((st && st.id) !== before) onChange(st);
  }

  // ----- Học sinh -----
  function paintStudent() {
    if (typeof PdfLive !== 'undefined' && PdfLive.active) return; // đang chiếu PDF: PdfLive quản lý khung này
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
    if (typeof PdfLive !== 'undefined' && PdfLive.active) return PdfLive.paintPanel(p);
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
        <span style="display:flex;gap:4px"><button class="icon-btn" data-switch title="Thêm / đổi bài giảng" style="color:#a9a6c9"><i data-lucide="replace"></i></button><button class="icon-btn" data-stop title="Dừng chiếu bài giảng" style="color:#a9a6c9"><i data-lucide="square"></i></button></span>
      </div>
      <div class="lp-next-label"><span>Slide tiếp theo</span><small>đang chiếu: ${state.index + 1}. ${esc(state.scene.title)}</small></div>
      <div class="lp-preview" id="lpPrev" title="Bấm để chuyển sang slide này"></div>
      <div class="lp-nav">
        <button data-nav="-1" ${state.index === 0 ? 'disabled' : ''} title="Slide trước (←)"><i data-lucide="chevron-left"></i></button>
        <span class="count">${state.index + 1} / ${state.total}</span>
        <button data-nav="1" ${state.index === state.total - 1 ? 'disabled' : ''} title="Slide sau (→)"><i data-lucide="chevron-right"></i></button>
      </div>
      <div class="lp-act">
        ${interactive && !act ? `<select class="input" data-secs title="Đếm ngược" style="background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.15)">${[[0, 'Không giới hạn thời gian'], [15, 'Đếm ngược 15 giây'], [30, 'Đếm ngược 30 giây'], [45, 'Đếm ngược 45 giây'], [60, 'Đếm ngược 60 giây'], [90, 'Đếm ngược 90 giây'], [120, 'Đếm ngược 2 phút']].map(([v, l]) => `<option value="${v}" ${v === actSecs ? 'selected' : ''} style="color:#000">${l}</option>`).join('')}</select><button class="btn btn-accent" data-start><i data-lucide="play"></i> Bắt đầu hoạt động</button>` : ''}
        ${open && act.localEnds ? `<div class="sl-timer" data-deadline="${act.localEnds}" data-dur="${act.durationMs}"><span>⏱ <b></b></span><i><em></em></i></div>` : ''}
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
    const prev = document.getElementById('lpPrev');
    if (state.nextScene) {
      Slides.render(prev, { scene: state.nextScene, role: 'view', activity: null, local: {}, handlers: {} });
      prev.classList.add('clickable');
      prev.onclick = () => go(state.index + 1);
    } else {
      prev.innerHTML = '<div class="lp-last">🏁<b>Đây là slide cuối</b><small>Hết bài giảng</small></div>';
    }
    Slides.render(o.layer, { scene: state.scene, full: sc, activity: act, role: 'teacher', local: {}, handlers: {} });
    p.querySelector('[data-stop]').onclick = () => o.socket.emit('lesson:stop');
    p.querySelector('[data-switch]').onclick = openPicker;
    p.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(state.index + +b.dataset.nav)));
    p.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(+b.dataset.go)));
    const sel = p.querySelector('[data-secs]'); if (sel) sel.onchange = () => (actSecs = +sel.value);
    const st = p.querySelector('[data-start]'); if (st) st.onclick = () => o.socket.emit('activity:start', { seconds: actSecs });
    const en = p.querySelector('[data-end]'); if (en) en.onclick = () => o.socket.emit('activity:end');
  }

  let pickerLoading = false;
  async function paintPicker(p) {
    if (pickerLoading) return;
    pickerLoading = true;
    p.innerHTML = '<div class="empty" style="color:#8885ab">Đang tải bài giảng…</div>';
    try {
      const d = await api('/api/lessons');
      if (state || (typeof PdfLive !== 'undefined' && PdfLive.active)) { pickerLoading = false; return; } // trong lúc tải, giáo viên đã bắt đầu chiếu bài/PDF khác
      const ready = d.lessons.filter((l) => l.sceneCount).sort((a, b) => (b.classIds.includes(o.classId) ? 1 : 0) - (a.classIds.includes(o.classId) ? 1 : 0));
      p.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between"><div class="panel-heading">Chọn bài giảng để chiếu</div><button class="icon-btn" data-refresh title="Làm mới danh sách" style="color:#a9a6c9"><i data-lucide="refresh-cw"></i></button></div>
        <div class="lp-pick">${ready.map((l) => `<button class="lp-lesson" data-pick="${l.id}"><span style="font-size:24px">📘</span><span style="flex:1;min-width:0"><b>${esc(l.title)}</b><small>${l.sceneCount} slide · ${esc(l.level)}${l.classIds.includes(o.classId) ? ' · đã gắn lớp này' : ''}</small></span><i data-lucide="play"></i></button>`).join('')
          || '<div class="empty" style="color:#8885ab"><div class="emoji">📝</div><b style="color:#fff">Chưa có bài giảng nào</b>Hãy soạn bài giảng bằng AI trước buổi học.</div>'}</div>
        <a class="btn btn-outline btn-block" style="margin-top:12px;background:transparent;color:#fff;border-color:rgba(255,255,255,.2)" href="/lessons.html" target="_blank" rel="noopener"><i data-lucide="sparkles"></i> Soạn bài giảng mới</a>`;
      p.insertAdjacentHTML('beforeend', '<div id="pdfPick" style="margin-top:14px"></div>');
      if (typeof PdfLive !== 'undefined') PdfLive.mountPicker(p.querySelector('#pdfPick'));
      icons();
      p.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => present(b.dataset.pick)));
      const rf = p.querySelector('[data-refresh]'); if (rf) rf.onclick = () => paintPicker(p);
    } catch (e) {
      p.innerHTML = `<div class="empty" style="color:#ff9bb3">${esc(e.message)}</div>`;
    }
    pickerLoading = false;
  }

  // Bài giảng soạn xong trong lúc đang live (ở tab khác) tự hiện khi giáo viên quay lại tab này
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && o.isTeacher && o.panel && !state && !(typeof PdfLive !== 'undefined' && PdfLive.active) && !o.panel.hidden) paintPicker(o.panel);
  });

  // Hộp thoại chọn bài giảng: dùng được bất cứ lúc nào trong buổi học (kể cả khi đang chiếu bài khác)
  async function openPicker() {
    if (!o.isTeacher) return;
    const m = openModal(`<h3>Thêm / đổi bài giảng 📘</h3>
      <p class="sub">Chọn bài để chiếu cho cả lớp ngay trong buổi học${state ? '. Bài đang chiếu (' + esc(state.title) + ') sẽ dừng.' : '.'}</p>
      <input class="input" id="lpSearch" placeholder="Tìm bài giảng…" autocomplete="off" />
      <div id="lpModalList" style="margin:12px 0;max-height:46vh;overflow:auto"><div class="empty">Đang tải…</div></div>
      <div class="modal-actions">
        <a class="btn btn-outline" href="/lessons.html" target="_blank" rel="noopener"><i data-lucide="sparkles"></i> Soạn bài mới (mở tab mới)</a>
        <button class="btn btn-outline" type="button" id="lpReload"><i data-lucide="refresh-cw"></i> Làm mới</button>
      </div>`, { wide: true });
    const box = m.querySelector('#lpModalList'), search = m.querySelector('#lpSearch');
    let lessons = [];
    const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const paint = () => {
      const q = norm(search.value);
      const list = lessons.filter((l) => !q || norm(l.title + ' ' + l.level + ' ' + (l.topic || '')).includes(q));
      box.innerHTML = list.length ? list.map((l) => {
        const running = l.gen && l.gen.state === 'running';
        const ok = l.sceneCount > 0 && !running;
        const note = running ? 'Đang soạn ' + l.gen.done + '/' + l.gen.total + '…' : !l.sceneCount ? 'Chưa có slide' : l.sceneCount + ' slide';
        const here = l.classIds.includes(o.classId) ? ' · đã gắn lớp này' : '';
        const cur = state && state.id === l.id;
        return `<div class="list-item"><div class="avatar tone-violet">📘</div><div class="info"><b>${esc(l.title)}</b><small>${note} · ${esc(l.level)}${here}${cur ? ' · đang chiếu' : ''}</small></div><button class="btn btn-primary btn-sm" data-pick="${l.id}" ${ok && !cur ? '' : 'disabled'}><i data-lucide="play"></i> Chiếu</button></div>`;
      }).join('') : '<div class="empty"><div class="emoji">📝</div><b>' + (lessons.length ? 'Không tìm thấy bài phù hợp' : 'Chưa có bài giảng nào') + '</b>Bấm "Soạn bài mới" để tạo bằng AI, xong quay lại đây bấm Làm mới.</div>';
      icons();
      box.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = async () => {
        if (state && !(await confirmModal('Đổi sang bài khác?', 'Bài đang chiếu sẽ dừng và học sinh chuyển sang bài mới.', 'Chiếu bài mới'))) return;
        present(b.dataset.pick);
        m.close && m.close();
      }));
    };
    const load = async () => {
      try {
        lessons = (await api('/api/lessons')).lessons.sort((a, b) => (b.classIds.includes(o.classId) ? 1 : 0) - (a.classIds.includes(o.classId) ? 1 : 0));
        paint();
      } catch (e) { box.innerHTML = '<div class="empty" style="color:#d33">' + esc(e.message) + '</div>'; }
    };
    search.oninput = paint;
    m.querySelector('#lpReload').onclick = load;
    // quay lại từ tab soạn bài: tự làm mới danh sách
    const onVis = () => { if (!document.body.contains(box)) return document.removeEventListener('visibilitychange', onVis); if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    icons();
    load();
  }

  function present(lessonId) {
    o.socket.emit('lesson:present', { lessonId }, (res) => {
      if (res && res.error) toast(res.error, 'error');
      else toast('Đang chiếu bài giảng cho cả lớp', 'success');
    });
  }

  // Vẽ lại theo trạng thái hiện tại (PdfLive gọi sau khi dừng chiếu PDF)
  function refresh() { if (o.isTeacher) paintTeacher(); else paintStudent(); }

  return { init, apply, present, refresh, openPicker, get state() { return state; } };
})();
