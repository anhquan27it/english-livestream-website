// Lesson Studio: tạo bài giảng từ PDF/văn bản bằng AI, duyệt outline, chỉnh sửa slide & trò chơi, lưu.
const me = Auth.require('teacher');
const view = document.getElementById('view');
const TYPE_LABEL = { slide: 'Slide', quiz: 'Quiz', poll: 'Poll', match: 'Ghép cặp', order: 'Xếp câu', fill: 'Điền từ', speak: 'Đọc to' };
const TYPE_ICON = { slide: '📘', quiz: '❓', poll: '📊', match: '🔗', order: '🔤', fill: '✏️', speak: '🎤' };
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LAYOUT_LABEL = { bullets: 'Ý chính', rule: 'Quy tắc ngữ pháp', table: 'Bảng', dialogue: 'Hội thoại', passage: 'Bài đọc', vocab: 'Từ vựng' };

let classes = [];
let lesson = null;      // bài đang mở (bản đầy đủ)
let idx = 0;            // slide đang chọn
let saveTimer = null;
let pollTimer = null;
let dirty = false, revision = 0, saving = null, generating = false, lastRoute = location.hash;
let wizSource = { name: '', text: '' };

if (me) {
  buildSidebar('teacher', 'lessons');
  setupShell(me);
  addEventListener('hashchange', route);
  route();
}

const mobileMenu = `<button class="icon-btn mobile-only" data-menu aria-label="Menu"><i data-lucide="menu"></i></button>`;
const uid = () => 's_' + Math.random().toString(36).slice(2, 10);

async function route() {
  if (generating) { if (location.hash !== lastRoute) location.hash = lastRoute; toast('AI đang sinh slide. Hãy chờ xong trước khi đổi trang.'); return; }
  if (lesson && (dirty || saving)) {
    if (!(await flush())) { if (location.hash !== lastRoute) location.hash = lastRoute; toast('Chưa lưu được thay đổi. Hãy sửa lỗi hoặc lưu lại trước khi rời bài.', 'error'); return; }
  }
  lastRoute = location.hash;
  clearTimeout(pollTimer);
  const h = location.hash.replace(/^#\/?/, '');
  try {
    if (h === 'new') return viewNew();
    if (h.startsWith('l/')) {
      const d = await api('/api/lessons/' + h.slice(2).split('/')[0]);
      lesson = d.lesson;
      classes = d.classes;
      idx = Math.min(idx, Math.max(0, lesson.scenes.length - 1));
      if (lesson.gen && lesson.gen.state === 'running') return viewGenerating();
      if (lesson.scenes.length && !location.hash.endsWith('/outline')) return viewEditor();
      return viewOutline();
    }
    return viewList();
  } catch (e) {
    toast(e.message, 'error');
    if (h) location.hash = '#/';
  }
  shell();
}

function shell() { icons(); setupMenu(); }
function setupMenu() { /* nút menu được gắn trong setupShell; gắn lại cho nút mới render */
  const sidebar = document.querySelector('.sidebar');
  document.querySelectorAll('[data-menu]').forEach((el) => (el.onclick = () => sidebar.classList.toggle('open')));
}

// ---------- Danh sách ----------
async function viewList() {
  const d = await api('/api/lessons');
  classes = d.classes;
  const statusChip = (l) => l.gen && l.gen.state === 'running' ? '<span class="chip chip-warn">Đang sinh…</span>' : l.sceneCount ? '<span class="chip chip-ok">Sẵn sàng</span>' : '<span class="chip chip-muted">Bản nháp</span>';
  view.innerHTML = `
    <div class="topbar"><div style="display:flex;gap:12px;align-items:center">${mobileMenu}<div><h1>Bài giảng 📚</h1><p>Soạn slide và trò chơi trước giờ học, chiếu trong buổi livestream.</p></div></div>
      <div class="topbar-actions"><a class="btn btn-primary" href="#/new"><i data-lucide="sparkles"></i> Tạo bài giảng bằng AI</a></div></div>
    ${d.lessons.length ? `<div class="lesson-grid">${d.lessons.map((l) => `
      <article class="lesson-card" data-id="${l.id}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span class="chip chip-muted">Trình độ ${esc(l.level)}</span>${statusChip(l)}</div>
        <h3>${esc(l.title)}</h3>
        <div class="type-dots">${l.types.map((t) => `<i title="${TYPE_LABEL[t]}">${TYPE_ICON[t]}</i>`).join('') || '<span class="hint">Chưa có slide</span>'}</div>
        <div class="class-meta"><span><i data-lucide="layers"></i>${l.sceneCount} slide</span>${l.sourceName ? `<span><i data-lucide="file-text"></i>${esc(l.sourceName)}</span>` : ''}</div>
        <div class="class-foot"><span class="hint">${l.classNames.length ? '🏫 ' + esc(l.classNames.join(', ')) : 'Chưa gắn lớp'}</span>
          <button class="icon-btn" data-del="${l.id}" title="Xoá bài giảng"><i data-lucide="trash-2"></i></button></div>
      </article>`).join('')}</div>`
    : `<div class="card empty"><div class="emoji">📝</div><b>Chưa có bài giảng nào</b>Tải lên một file PDF hoặc nhập chủ đề, AI sẽ soạn slide và trò chơi cho bạn.<br /><br /><a class="btn btn-primary" href="#/new"><i data-lucide="sparkles"></i> Tạo bài giảng đầu tiên</a></div>`}`;
  view.querySelectorAll('.lesson-card').forEach((el) => (el.onclick = (e) => { if (!e.target.closest('[data-del]')) location.hash = '#/l/' + el.dataset.id; }));
  view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmModal('Xoá bài giảng?', 'Bài giảng và toàn bộ slide sẽ bị xoá vĩnh viễn.', 'Xoá'))) return;
    await api('/api/lessons/' + b.dataset.del, { method: 'DELETE' }).catch((e) => toast(e.message, 'error'));
    viewList();
  }));
  shell();
}

// ---------- Bước 1: tài liệu & yêu cầu ----------
async function viewNew() {
  if (!classes.length) classes = (await api('/api/lessons')).classes;
  wizSource = { name: '', text: '' };
  view.innerHTML = `
    <div class="topbar"><div style="display:flex;gap:12px;align-items:center">${mobileMenu}<div><h1>Tạo bài giảng mới ✨</h1><p>AI sẽ đọc tài liệu của bạn và đề xuất outline để bạn duyệt trước khi soạn slide.</p></div></div></div>
    <div class="wiz">
      <div class="steps-bar"><span class="on">1. Tài liệu &amp; yêu cầu</span><span>2. Duyệt outline</span><span>3. Sinh &amp; chỉnh sửa slide</span></div>
      <form class="card" id="newForm">
        <div class="grid-2">
          <div class="field"><label>Tên bài giảng *</label><input class="input" name="title" placeholder="VD: Unit 5 — Travel & Holidays" required /></div>
          <div class="field"><label>Trình độ học sinh (CEFR)</label><select class="input" name="level">${LEVELS.map((l) => `<option ${l === 'B1' ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Tài liệu nguồn (PDF, TXT, MD) — tuỳ chọn</label>
          <div class="dropzone" id="drop"><div style="font-size:34px">📄</div><b id="dropTitle">Kéo thả tệp PDF / TXT / MD vào đây</b><small id="dropSub">PDF dạng chữ (không phải ảnh scan), tối đa 25 MB</small><div style="margin-top:12px"><button type="button" class="btn btn-primary" id="pickFile"><i data-lucide="upload"></i> Chọn tệp từ máy</button></div></div>
          <input type="file" id="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain" hidden />
        </div>
        <div class="field"><label>Hoặc dán nội dung / viết yêu cầu cho AI</label>
          <textarea class="input" name="topic" rows="4" placeholder="VD: Tập trung từ vựng sân bay và mẫu câu đặt phòng khách sạn. Có nhiều trò chơi cho học sinh."></textarea></div>
        <div class="field"><label>Văn bản nguồn (tự điền khi tải tệp, có thể chỉnh sửa)</label>
          <textarea class="input" name="sourceText" rows="5" placeholder="Nội dung trích từ tài liệu sẽ hiện ở đây…"></textarea></div>
        <div class="grid-3">
          <div class="field"><label>Tổng số slide</label><input class="input" type="number" name="sceneCount" min="3" max="30" value="10" /></div>
          <div class="field"><label>Trong đó trò chơi / câu hỏi</label><input class="input" type="number" name="interactive" min="0" max="20" value="4" /></div>
          <div class="field"><label>Gắn vào lớp</label><div class="class-pick">${classes.map((c) => `<label><input type="checkbox" name="classIds" value="${c.id}" /> ${esc(c.name)}</label>`).join('') || '<span class="hint">Chưa có lớp</span>'}</div></div>
        </div>
        <div class="form-error" id="newErr"></div>
        <div class="modal-actions"><a class="btn btn-outline" href="#/">Huỷ</a><button class="btn btn-primary btn-lg" id="newBtn"><i data-lucide="wand-sparkles"></i> Tạo outline bằng AI</button></div>
      </form>
    </div>`;
  const form = document.getElementById('newForm');
  const drop = document.getElementById('drop'), file = document.getElementById('file');
  document.getElementById('pickFile').onclick = (e) => { e.stopPropagation(); file.click(); };
  drop.onclick = () => file.click();
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0], form); };
  file.onchange = () => file.files[0] && upload(file.files[0], form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('newBtn'), err = document.getElementById('newErr');
    err.textContent = '';
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader"></i> AI đang đọc tài liệu và lập outline… (có thể mất 10–40 giây)';
    icons();
    const fd = new FormData(form);
    try {
      const { lesson: l } = await api('/api/lessons', { method: 'POST', body: {
        title: fd.get('title'), level: fd.get('level'), topic: fd.get('topic'), sourceText: fd.get('sourceText'), sourceName: wizSource.name,
        sceneCount: fd.get('sceneCount'), interactive: fd.get('interactive'), classIds: fd.getAll('classIds'),
      } });
      try {
        await api(`/api/lessons/${l.id}/outline`, { method: 'POST', body: {} });
      } catch (e2) {
        // Nội dung không phải tiếng Anh: xoá bản nháp và ở lại form để sửa yêu cầu
        if (e2.message.startsWith('Nội dung này không phải')) {
          await api('/api/lessons/' + l.id, { method: 'DELETE' }).catch(() => {});
          throw e2;
        }
        toast('Bài giảng đã được tạo nhưng AI chưa lập được outline: ' + e2.message, 'error');
      }
      location.hash = `#/l/${l.id}`;
    } catch (e2) {
      err.textContent = e2.message;
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="wand-sparkles"></i> Tạo outline bằng AI';
      icons();
    }
  };
  shell();
}

async function upload(f, form) {
  const title = document.getElementById('dropTitle'), sub = document.getElementById('dropSub');
  title.textContent = 'Đang đọc ' + f.name + '…';
  try {
    const res = await fetch('/api/lessons/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + Auth.token, 'X-Filename': encodeURIComponent(f.name) }, body: f });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error);
    wizSource = { name: d.name, text: d.text };
    form.sourceText.value = d.text;
    if (!form.title.value) form.title.value = d.name.replace(/\.[^.]+$/, '');
    title.textContent = '✅ ' + d.name;
    sub.textContent = `${d.pages} trang · ${d.chars.toLocaleString('vi-VN')} ký tự${d.truncated ? ' (chỉ dùng 60.000 ký tự đầu)' : ''}`;
  } catch (e) {
    title.textContent = 'Kéo thả tệp PDF / TXT / MD vào đây';
    sub.textContent = '';
    toast(e.message, 'error');
  }
}

// ---------- Bước 2: outline ----------
function viewOutline() {
  const o = lesson.outline;
  view.innerHTML = `
    <div class="topbar"><div style="display:flex;gap:12px;align-items:center">${mobileMenu}<div><h1>${esc(lesson.title)}</h1><p>Duyệt và chỉnh outline. Khi ổn, AI sẽ soạn nội dung chi tiết cho từng slide.</p></div></div>
      <div class="topbar-actions"><a class="btn btn-ghost" href="#/">Quay lại</a>${lesson.scenes.length ? `<a class="btn btn-outline" href="#/l/${lesson.id}">Về trình chỉnh sửa</a>` : ''}</div></div>
    <div class="wiz">
      <div class="steps-bar"><span class="done">1. Tài liệu &amp; yêu cầu</span><span class="on">2. Duyệt outline</span><span>3. Sinh &amp; chỉnh sửa slide</span></div>
      ${lesson.gen && lesson.gen.state === 'error' ? `<div class="card" style="background:var(--pink-50);border-color:transparent;margin-bottom:14px"><b>❌ Lần sinh trước bị lỗi:</b> ${esc(lesson.gen.error)}</div>` : ''}
      ${lesson.scenes.length ? '<div class="card" style="background:var(--accent-50);border-color:transparent;margin-bottom:14px">⚠️ Sinh lại từ outline sẽ <b>thay toàn bộ slide hiện có</b>.</div>' : ''}
      <div id="rows"></div>
      <div class="modal-actions" style="justify-content:space-between;flex-wrap:wrap">
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-outline" id="addRow"><i data-lucide="plus"></i> Thêm mục</button><button class="btn btn-outline" id="regen"><i data-lucide="refresh-cw"></i> Lập lại outline</button></div>
        <button class="btn btn-primary btn-lg" id="go" ${o.length ? '' : 'disabled'}><i data-lucide="wand-sparkles"></i> Sinh nội dung bằng AI</button>
      </div>
      ${o.length ? '' : '<div class="empty"><div class="emoji">🤔</div><b>Chưa có outline</b>Bấm “Lập lại outline” hoặc thêm mục thủ công.</div>'}
    </div>`;
  const rows = document.getElementById('rows');
  const paint = () => {
    rows.innerHTML = o.map((r, i) => `
      <div class="outline-row" data-i="${i}">
        <span class="n">${i + 1}</span>
        <select class="input" data-f="type">${Object.keys(TYPE_LABEL).map((t) => `<option value="${t}" ${t === r.type ? 'selected' : ''}>${TYPE_ICON[t]} ${TYPE_LABEL[t]}</option>`).join('')}</select>
        <input class="input" data-f="title" value="${esc(r.title)}" placeholder="Tiêu đề" />
        <div style="display:flex"><button class="icon-btn" data-mv="-1" title="Lên"><i data-lucide="arrow-up"></i></button><button class="icon-btn" data-mv="1" title="Xuống"><i data-lucide="arrow-down"></i></button><button class="icon-btn" data-rm title="Xoá"><i data-lucide="x"></i></button></div>
        <input class="input goal" data-f="goal" value="${esc(r.goal)}" placeholder="Mục tiêu của slide này" />
        <div class="meta">${r.type === 'slide' ? `<select class="input" data-f="layout" title="Bố cục slide">${Object.entries(LAYOUT_LABEL).map(([k, v]) => `<option value="${k}" ${(r.layout || 'bullets') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>` : ''}<input class="input" data-src value="${esc((r.source || []).join(', '))}" placeholder="📎 Phần tài liệu (VD: Page 2, Page 3)" title="Phần của tài liệu mà slide này dựa vào" /></div>
      </div>`).join('');
    icons();
    rows.querySelectorAll('.outline-row').forEach((el) => {
      const i = +el.dataset.i;
      el.querySelectorAll('[data-f]').forEach((inp) => (inp.oninput = inp.onchange = () => (o[i][inp.dataset.f] = inp.value)));
      el.querySelectorAll('[data-src]').forEach((inp) => (inp.oninput = () => (o[i].source = inp.value.split(',').map((x) => x.trim()).filter(Boolean))));
      el.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => { const j = i + +b.dataset.mv; if (j >= 0 && j < o.length) { [o[i], o[j]] = [o[j], o[i]]; paint(); } }));
      el.querySelector('[data-rm]').onclick = () => { o.splice(i, 1); paint(); document.getElementById('go').disabled = !o.length; };
    });
  };
  paint();
  document.getElementById('addRow').onclick = () => { o.push({ type: 'slide', title: '', goal: '' }); paint(); document.getElementById('go').disabled = false; };
  document.getElementById('regen').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'AI đang lập outline…';
    try { const d = await api(`/api/lessons/${lesson.id}/outline`, { method: 'POST', body: {} }); lesson = d.lesson; viewOutline(); } catch (err) { toast(err.message, 'error'); viewOutline(); }
  };
  document.getElementById('go').onclick = async () => {
    const clean = o.filter((r) => r.title.trim());
    if (!clean.length) return toast('Cần ít nhất một mục có tiêu đề.', 'error');
    if (lesson.scenes.length && !(await confirmModal('Thay toàn bộ slide?', 'Các slide hiện có (kể cả phần bạn đã chỉnh sửa) sẽ bị thay bằng nội dung AI mới.', 'Sinh lại'))) return;
    try {
      await api('/api/lessons/' + lesson.id, { method: 'PUT', body: { outline: clean } });
      await api(`/api/lessons/${lesson.id}/generate`, { method: 'POST' });
      location.hash = '#/l/' + lesson.id;
      route();
    } catch (err) { toast(err.message, 'error'); }
  };
  shell();
}

// ---------- Bước 3a: đang sinh (chạy nền, có thể đóng tab) ----------
function viewGenerating() {
  const g = lesson.gen;
  const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
  view.innerHTML = `
    <div class="topbar"><div style="display:flex;gap:12px;align-items:center">${mobileMenu}<div><h1>${esc(lesson.title)}</h1><p>AI đang soạn từng slide. Bạn có thể đóng trang, quá trình vẫn chạy trên máy chủ.</p></div></div></div>
    <div class="wiz"><div class="steps-bar"><span class="done">1. Tài liệu &amp; yêu cầu</span><span class="done">2. Duyệt outline</span><span class="on">3. Sinh &amp; chỉnh sửa slide</span></div>
      <div class="card gen-box"><div class="emoji">🪄</div><h2 style="margin:10px 0 4px">Đang soạn slide… ${g.done}/${g.total}</h2><p class="hint" style="margin-bottom:18px">${g.failed ? `${g.failed} slide gặp lỗi, bạn có thể sinh lại sau.` : 'Thường mất 30–90 giây.'}</p>
        <div class="progress"><i style="width:${Math.max(4, pct)}%"></i></div></div></div>`;
  shell();
  pollTimer = setTimeout(route, 1500);
}

// ---------- Bước 3b: trình chỉnh sửa ----------
function problem(sc) {
  if (!sc.title.trim()) return 'Thiếu tiêu đề';
  if (sc.type === 'quiz' || sc.type === 'poll') {
    if (!sc.question.trim()) return 'Thiếu câu hỏi';
    if (sc.options.filter((x) => x.trim()).length < 2) return 'Cần ít nhất 2 đáp án';
    if (sc.type === 'quiz' && !sc.options[sc.answer].trim()) return 'Đáp án đúng đang để trống';
  }
  if (sc.type === 'match' && sc.pairs.filter((p) => p.left.trim() && p.right.trim()).length < 3) return 'Cần ít nhất 3 cặp';
  if (sc.type === 'order' && sc.sentence.trim().split(/\s+/).length < 3) return 'Câu cần ít nhất 3 từ';
  if (sc.type === 'fill') {
    const blanks = (sc.sentence.match(/_{3,}/g) || []).length;
    if (!blanks) return 'Câu cần có chỗ trống ___';
    if (sc.answers.length !== blanks) return `Có ${blanks} chỗ trống nhưng ${sc.answers.length} đáp án`;
  }
  if (sc.type === 'speak' && sc.sentence.trim().split(/\s+/).length < 2) return 'Câu cần ít nhất 2 từ';
  return null;
}

const blank = {
  slide: () => ({ id: uid(), type: 'slide', title: 'New slide', emoji: '📘', layout: 'bullets', passage: '', rule: null, dialogue: [], table: null, bullets: [''], vocab: [], note: '' }),
  quiz: () => ({ id: uid(), type: 'quiz', title: 'Quiz', question: '', options: ['', '', '', ''], answer: 0, explanation: '', note: '' }),
  poll: () => ({ id: uid(), type: 'poll', title: 'Poll', question: '', options: ['', '', ''], note: '' }),
  match: () => ({ id: uid(), type: 'match', title: 'Matching game', instruction: 'Match each item on the left with its meaning.', pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }], note: '' }),
  order: () => ({ id: uid(), type: 'order', title: 'Word order', sentence: '', translation: '', note: '' }),
  fill: () => ({ id: uid(), type: 'fill', title: 'Fill in the blank', sentence: 'I ___ to school yesterday.', answers: [['went']], hint: '', translation: '', note: '' }),
  speak: () => ({ id: uid(), type: 'speak', title: 'Read aloud', sentence: '', translation: '', ipa: '', note: '' }),
};

function viewEditor() {
  const sc = lesson.scenes;
  const cur = sc[idx];
  const assigned = lesson.classIds.map((id) => (classes.find((c) => c.id === id) || {}).name).filter(Boolean);
  view.innerHTML = `
    <div class="topbar">
      <div style="display:flex;gap:12px;align-items:center;min-width:0">${mobileMenu}
        <div style="min-width:0"><input class="input" id="lTitle" value="${esc(lesson.title)}" style="font-size:22px;font-weight:800;border-color:transparent;background:transparent;padding:4px 8px" />
        <p style="padding-left:8px"><span class="chip chip-muted">Trình độ ${esc(lesson.level)}</span> <span class="saved" id="saveState"></span></p></div></div>
      <div class="topbar-actions" style="flex-wrap:wrap">
        <a class="btn btn-ghost btn-sm" href="#/">← Danh sách</a>
        <a class="btn btn-outline btn-sm" href="#/l/${lesson.id}/outline"><i data-lucide="list-ordered"></i> Outline</a>
        <button class="btn btn-outline btn-sm" id="classBtn"><i data-lucide="school"></i> ${assigned.length ? esc(assigned.join(', ')) : 'Gắn vào lớp'}</button>
        <button class="btn btn-live btn-sm" id="goLive"><i data-lucide="radio"></i> Livestream bài này</button>
      </div>
    </div>
    <div class="editor">
      <div class="rail" id="rail"></div>
      <div><div class="preview-frame" id="preview"></div>
        <div class="lp-notes" style="margin-top:12px;background:var(--accent-50);color:#7a5200"><b>Ghi chú cho giáo viên (học sinh không thấy)</b><textarea class="input sm" id="noteBox" rows="3" style="margin-top:6px" placeholder="Kịch bản nói, câu hỏi gợi mở…"></textarea></div>
      </div>
      <div class="form-panel" id="form"></div>
    </div>`;
  document.getElementById('lTitle').oninput = (e) => { lesson.title = e.target.value; touch(); };
  document.getElementById('classBtn').onclick = classModal;
  document.getElementById('goLive').onclick = liveModal;
  document.getElementById('noteBox').value = cur.note || '';
  document.getElementById('noteBox').oninput = (e) => { cur.note = e.target.value; touch(); };
  paintRail();
  paintPreview();
  paintForm();
  touch(true);
  shell();
}

function paintRail() {
  const rail = document.getElementById('rail');
  rail.innerHTML = lesson.scenes.map((s, i) => {
    const bad = problem(s);
    return `<button class="thumb ${i === idx ? 'active' : ''}" data-i="${i}" title="${bad ? esc(bad) : ''}"><span class="n">${i + 1}</span><span>${TYPE_ICON[s.type]} ${esc(s.title)}</span>${bad ? '⚠️' : ''}</button>`;
  }).join('') + `<div style="display:flex;gap:6px;margin-top:4px"><select class="input sm" id="addType">${Object.keys(TYPE_LABEL).map((t) => `<option value="${t}">${TYPE_ICON[t]} ${TYPE_LABEL[t]}</option>`).join('')}</select><button class="btn btn-outline btn-sm" id="addScene" title="Thêm slide sau slide hiện tại"><i data-lucide="plus"></i></button></div>`;
  icons();
  rail.querySelectorAll('.thumb').forEach((b) => (b.onclick = () => { idx = +b.dataset.i; viewEditor(); }));
  document.getElementById('addScene').onclick = () => {
    lesson.scenes.splice(idx + 1, 0, blank[document.getElementById('addType').value]());
    idx++;
    touch();
    viewEditor();
  };
}

function paintPreview() {
  Slides.render(document.getElementById('preview'), { scene: lesson.scenes[idx], role: 'view', activity: null, handlers: {} });
}

const val = (v) => esc(v == null ? '' : v);

function paintForm() {
  const s = lesson.scenes[idx];
  const f = document.getElementById('form');
  const aiBox = `<div class="ai-box"><b><i data-lucide="sparkles"></i> Nhờ AI sửa slide này</b>
    <textarea class="input sm" id="aiInst" rows="2" placeholder="VD: Làm dễ hơn cho A2, thêm 2 ví dụ, đổi chủ đề sang khách sạn…"></textarea>
    <div style="display:flex;gap:6px;margin-top:8px"><button class="btn btn-primary btn-sm" id="aiGo"><i data-lucide="wand-sparkles"></i> Sinh lại</button>
    <select class="input sm" id="aiType" style="width:auto" title="Đổi loại slide">${Object.keys(TYPE_LABEL).map((t) => `<option value="${t}" ${t === s.type ? 'selected' : ''}>${TYPE_LABEL[t]}</option>`).join('')}</select></div></div>`;
  let body = `${s.source ? `<div style="margin-bottom:10px"><span class="src-chip" title="Phần tài liệu AI dùng để viết slide này">📎 Nguồn: ${val(s.source)}</span></div>` : ''}<div class="field"><label>Tiêu đề</label><input class="input sm" data-k="title" value="${val(s.title)}" /></div>`;
  if (s.type === 'slide') {
    const tableText = s.table ? [s.table.headers.join(' | '), ...s.table.rows.map((r) => r.join(' | '))].join('\n') : '';
    body += `<div class="grid-2" style="gap:8px"><div class="field"><label>Emoji</label><input class="input sm" data-k="emoji" value="${val(s.emoji)}" style="width:80px" /></div>
      <div class="field"><label>Bố cục</label><select class="input sm" data-layout>${Object.entries(LAYOUT_LABEL).map(([k, v]) => `<option value="${k}" ${s.layout === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
      ${s.layout === 'passage' || s.passage ? `<div class="field"><label>Bài đọc (đặt **từ khoá** trong dấu ** để tô sáng)</label><textarea class="input sm" rows="6" data-k="passage">${val(s.passage)}</textarea></div>` : ''}
      ${s.layout === 'rule' || s.rule ? `<div class="field"><label>Quy tắc ngữ pháp</label><input class="input sm" data-rule="name" value="${val(s.rule && s.rule.name)}" placeholder="Tên, VD: Past Simple" style="margin-bottom:6px" /><input class="input sm" data-rule="formula" value="${val(s.rule && s.rule.formula)}" placeholder="Công thức, VD: S + V2/ed" style="margin-bottom:6px" /><textarea class="input sm" rows="2" data-rule="explanation" placeholder="Giải thích ngắn" style="margin-bottom:6px">${val(s.rule && s.rule.explanation)}</textarea><textarea class="input sm" rows="3" data-ruleex placeholder="Mỗi dòng một câu ví dụ">${val(s.rule ? s.rule.examples.join('\n') : '')}</textarea></div>` : ''}
      ${s.layout === 'table' || s.table ? `<div class="field"><label>Bảng (dòng đầu là tiêu đề cột, các ô cách nhau bằng dấu |)</label><textarea class="input sm" rows="5" data-table placeholder="Subject | Verb | Example&#10;I | go | I go to school">${val(tableText)}</textarea></div>` : ''}
      ${s.layout === 'dialogue' || (s.dialogue && s.dialogue.length) ? `<div class="field"><label>Hội thoại</label>${(s.dialogue || []).map((d, i) => `<div class="mini-row v" style="grid-template-columns:70px 1fr auto"><input class="input sm" data-dl="speaker" data-i="${i}" value="${val(d.speaker)}" placeholder="A" /><input class="input sm" data-dl="text" data-i="${i}" value="${val(d.text)}" placeholder="Lời thoại" /><button class="icon-btn" data-rm="dialogue" data-i="${i}"><i data-lucide="x"></i></button></div>`).join('')}<button class="btn btn-outline btn-sm" data-add="dialogue">+ Thêm câu thoại</button></div>` : ''}
      <div class="field"><label>Ý chính</label>${s.bullets.map((b, i) => `<div class="mini-row"><input class="input sm" data-arr="bullets" data-i="${i}" value="${val(b)}" /><button class="icon-btn" data-rm="bullets" data-i="${i}"><i data-lucide="x"></i></button></div>`).join('')}<button class="btn btn-outline btn-sm" data-add="bullets">+ Thêm ý</button></div>
      <div class="field"><label>Từ vựng</label>${s.vocab.map((v, i) => `<div style="border:1px solid var(--line);border-radius:12px;padding:8px;margin-bottom:6px"><div class="mini-row v"><input class="input sm" data-v="word" data-i="${i}" value="${val(v.word)}" placeholder="word" /><input class="input sm" data-v="ipa" data-i="${i}" value="${val(v.ipa)}" placeholder="/ipa/" /><button class="icon-btn" data-rm="vocab" data-i="${i}"><i data-lucide="x"></i></button></div>
        <input class="input sm" data-v="meaning" data-i="${i}" value="${val(v.meaning)}" placeholder="nghĩa tiếng Việt" style="margin-bottom:6px" /><input class="input sm" data-v="example" data-i="${i}" value="${val(v.example)}" placeholder="câu ví dụ" /></div>`).join('')}<button class="btn btn-outline btn-sm" data-add="vocab">+ Thêm từ</button></div>`;
  } else if (s.type === 'quiz' || s.type === 'poll') {
    body += `<div class="field"><label>Câu hỏi</label><textarea class="input sm" rows="3" data-k="question">${val(s.question)}</textarea></div>
      <div class="field"><label>Đáp án ${s.type === 'quiz' ? '(chọn ● cho đáp án đúng)' : ''}</label>${s.options.map((o, i) => `<div class="mini-row" style="grid-template-columns:${s.type === 'quiz' ? 'auto ' : ''}1fr auto">${s.type === 'quiz' ? `<input type="radio" name="ans" data-ans="${i}" ${s.answer === i ? 'checked' : ''} />` : ''}<input class="input sm" data-arr="options" data-i="${i}" value="${val(o)}" placeholder="Đáp án ${'ABCDEF'[i]}" /><button class="icon-btn" data-rm="options" data-i="${i}"><i data-lucide="x"></i></button></div>`).join('')}${s.options.length < (s.type === 'quiz' ? 4 : 6) ? '<button class="btn btn-outline btn-sm" data-add="options">+ Thêm đáp án</button>' : ''}</div>
      ${s.type === 'quiz' ? `<div class="field"><label>Giải thích (hiện sau khi chốt)</label><textarea class="input sm" rows="2" data-k="explanation">${val(s.explanation)}</textarea></div>` : ''}`;
  } else if (s.type === 'match') {
    body += `<div class="field"><label>Hướng dẫn</label><input class="input sm" data-k="instruction" value="${val(s.instruction)}" /></div>
      <div class="field"><label>Các cặp (trái ↔ phải)</label>${s.pairs.map((p, i) => `<div class="mini-row v"><input class="input sm" data-p="left" data-i="${i}" value="${val(p.left)}" placeholder="trái" /><input class="input sm" data-p="right" data-i="${i}" value="${val(p.right)}" placeholder="phải" /><button class="icon-btn" data-rm="pairs" data-i="${i}"><i data-lucide="x"></i></button></div>`).join('')}${s.pairs.length < 8 ? '<button class="btn btn-outline btn-sm" data-add="pairs">+ Thêm cặp</button>' : ''}</div>`;
  } else if (s.type === 'fill') {
    body += `<div class="field"><label>Câu có chỗ trống (dùng ___ cho mỗi chỗ trống, tối đa 4)</label><textarea class="input sm" rows="2" data-k="sentence">${val(s.sentence)}</textarea></div>
      <div class="field"><label>Đáp án — mỗi dòng một chỗ trống; nhiều đáp án chấp nhận cách nhau bằng dấu /</label><textarea class="input sm" rows="3" data-fillans placeholder="went&#10;did not go / didn't go">${val(s.answers.map((a) => a.join(' / ')).join('\n'))}</textarea></div>
      <div class="field"><label>Gợi ý (tuỳ chọn)</label><input class="input sm" data-k="hint" value="${val(s.hint)}" /></div>
      <div class="field"><label>Dịch nghĩa (tuỳ chọn)</label><input class="input sm" data-k="translation" value="${val(s.translation)}" /></div>`;
  } else if (s.type === 'speak') {
    body += `<div class="field"><label>Câu học sinh đọc to (chấm bằng nhận dạng giọng nói, cần Chrome/Edge)</label><textarea class="input sm" rows="2" data-k="sentence">${val(s.sentence)}</textarea></div>
      <div class="field"><label>Dịch nghĩa (tuỳ chọn)</label><input class="input sm" data-k="translation" value="${val(s.translation)}" /></div>`;
  } else {
    body += `<div class="field"><label>Câu hoàn chỉnh (học sinh sẽ xếp lại các từ)</label><textarea class="input sm" rows="2" data-k="sentence">${val(s.sentence)}</textarea></div>
      <div class="field"><label>Dịch nghĩa gợi ý</label><input class="input sm" data-k="translation" value="${val(s.translation)}" /></div>`;
  }
  body += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button class="btn btn-outline btn-sm" data-mv="-1"><i data-lucide="arrow-up"></i> Lên</button><button class="btn btn-outline btn-sm" data-mv="1"><i data-lucide="arrow-down"></i> Xuống</button><button class="btn btn-ghost btn-sm" id="dup"><i data-lucide="copy"></i> Nhân bản</button><button class="btn btn-ghost btn-sm" id="delScene" style="color:var(--pink)"><i data-lucide="trash-2"></i> Xoá slide</button></div>`;
  f.innerHTML = `<h3>${TYPE_ICON[s.type]} Chỉnh sửa · ${TYPE_LABEL[s.type]} ${idx + 1}</h3>${aiBox}${body}`;
  icons();

  const upd = () => { touch(); paintPreview(); paintRailTitles(); };
  f.querySelectorAll('[data-k]').forEach((el) => (el.oninput = () => { s[el.dataset.k] = el.value; upd(); }));
  f.querySelectorAll('[data-arr]').forEach((el) => (el.oninput = () => { s[el.dataset.arr][+el.dataset.i] = el.value; upd(); }));
  f.querySelectorAll('[data-v]').forEach((el) => (el.oninput = () => { s.vocab[+el.dataset.i][el.dataset.v] = el.value; upd(); }));
  f.querySelectorAll('[data-p]').forEach((el) => (el.oninput = () => { s.pairs[+el.dataset.i][el.dataset.p] = el.value; upd(); }));
  f.querySelectorAll('[data-fillans]').forEach((el) => (el.oninput = () => { s.answers = el.value.split('\n').map((l) => l.split('/').map((x) => x.trim()).filter(Boolean)).filter((a) => a.length); upd(); }));
  f.querySelectorAll('[data-dl]').forEach((el) => (el.oninput = () => { s.dialogue[+el.dataset.i][el.dataset.dl] = el.value; upd(); }));
  f.querySelectorAll('[data-rule]').forEach((el) => (el.oninput = () => { s.rule = s.rule || { name: '', formula: '', explanation: '', examples: [] }; s.rule[el.dataset.rule] = el.value; upd(); }));
  f.querySelectorAll('[data-ruleex]').forEach((el) => (el.oninput = () => { s.rule = s.rule || { name: '', formula: '', explanation: '', examples: [] }; s.rule.examples = el.value.split('\n').filter((x) => x.trim()); upd(); }));
  f.querySelectorAll('[data-table]').forEach((el) => (el.oninput = () => {
    const lines = el.value.split('\n').map((l) => l.split('|').map((c) => c.trim())).filter((r) => r.some(Boolean));
    s.table = lines.length > 1 ? { headers: lines[0], rows: lines.slice(1) } : null;
    upd();
  }));
  f.querySelectorAll('[data-layout]').forEach((el) => (el.onchange = () => {
    s.layout = el.value;
    if (s.layout === 'rule' && !s.rule) s.rule = { name: '', formula: '', explanation: '', examples: [] };
    if (s.layout === 'dialogue' && !(s.dialogue && s.dialogue.length)) s.dialogue = [{ speaker: 'A', text: '' }, { speaker: 'B', text: '' }];
    touch(); paintForm(); paintPreview();
  }));
  f.querySelectorAll('[data-ans]').forEach((el) => (el.onchange = () => { s.answer = +el.dataset.ans; upd(); }));
  f.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.add;
    if (k === 'vocab') s.vocab.push({ word: '', ipa: '', meaning: '', example: '' });
    else if (k === 'dialogue') s.dialogue.push({ speaker: s.dialogue.length % 2 ? 'B' : 'A', text: '' });
    else if (k === 'pairs') s.pairs.push({ left: '', right: '' });
    else s[k].push('');
    touch(); paintForm(); paintPreview();
  }));
  f.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.rm, i = +b.dataset.i;
    const min = k === 'options' ? 2 : k === 'pairs' ? 3 : 0;
    if (s[k].length <= min) return toast(`Cần giữ tối thiểu ${min} mục.`, 'error');
    s[k].splice(i, 1);
    if (k === 'options' && s.type === 'quiz' && s.answer >= s.options.length) s.answer = 0;
    touch(); paintForm(); paintPreview();
  }));
  f.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => {
    const j = idx + +b.dataset.mv;
    if (j < 0 || j >= lesson.scenes.length) return;
    [lesson.scenes[idx], lesson.scenes[j]] = [lesson.scenes[j], lesson.scenes[idx]];
    idx = j; touch(); viewEditor();
  }));
  document.getElementById('dup').onclick = () => { lesson.scenes.splice(idx + 1, 0, { ...JSON.parse(JSON.stringify(s)), id: uid() }); idx++; touch(); viewEditor(); };
  document.getElementById('delScene').onclick = async () => {
    if (lesson.scenes.length === 1) return toast('Bài giảng cần ít nhất một slide.', 'error');
    if (!(await confirmModal('Xoá slide này?', `Xoá "${s.title}" khỏi bài giảng.`, 'Xoá'))) return;
    lesson.scenes.splice(idx, 1);
    idx = Math.max(0, idx - 1);
    touch(); viewEditor();
  };
  document.getElementById('aiGo').onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = 'AI đang soạn…';
    const targetLesson = lesson, sceneId = s.id, instruction = document.getElementById('aiInst').value, type = document.getElementById('aiType').value;
    generating = true; document.querySelector('.editor').inert = true;
    try {
      if (!(await flush())) throw new Error('Chưa lưu được bài. Hãy sửa các trường còn lỗi trước khi sinh lại.');
      const d = await api(`/api/lessons/${targetLesson.id}/scenes/${sceneId}/regenerate`, { method: 'POST', body: { instruction, type } });
      const targetIndex = targetLesson.scenes.findIndex(x => x.id === sceneId);
      if (targetIndex >= 0) targetLesson.scenes[targetIndex] = d.scene;
      toast('AI đã soạn lại slide', 'success');
      viewEditor();
    } catch (err) { toast(err.message, 'error'); b.disabled = false; b.textContent = 'Sinh lại'; }
    finally { generating = false; const editor = document.querySelector('.editor'); if (editor) editor.inert = false; }
  };
}

function paintRailTitles() {
  document.querySelectorAll('#rail .thumb').forEach((b) => {
    const s = lesson.scenes[+b.dataset.i];
    b.querySelector('span:nth-child(2)').textContent = `${TYPE_ICON[s.type]} ${s.title}`;
    const bad = problem(s);
    b.title = bad || '';
    const warn = b.querySelector('.warn');
    if (bad && !warn) b.insertAdjacentHTML('beforeend', '<span class="warn">⚠️</span>');
    if (!bad && warn) warn.remove();
  });
}

// ---------- Lưu ----------
function touch(initial) {
  const st = document.getElementById('saveState');
  if (initial) { if (st) { st.className = dirty ? 'saved dirty' : 'saved'; st.textContent = dirty ? 'Đang chờ lưu…' : '✓ Đã lưu'; } return; }
  dirty = true; revision++;
  if (st) { st.className = 'saved dirty'; st.textContent = 'Đang chỉnh sửa…'; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 1200);
}

async function flush() {
  if (saving) { if (!(await saving)) return false; if (!dirty) return true; }
  if (!dirty) return true;
  clearTimeout(saveTimer);
  saveTimer = null;
  const st = document.getElementById('saveState');
  const bad = lesson.scenes.map((s, i) => [i, problem(s)]).find(([, p]) => p);
  if (bad) { if (st) { st.className = 'saved dirty'; st.textContent = `Chưa lưu: slide ${bad[0] + 1} — ${bad[1]}`; } return false; }
  const version = revision;
  saving = (async () => { try {
    await api('/api/lessons/' + lesson.id, { method: 'PUT', body: JSON.parse(JSON.stringify({ title: lesson.title, scenes: lesson.scenes, classIds: lesson.classIds })) });
    dirty = revision !== version;
    if (dirty) saveTimer = setTimeout(flush, 1200);
    if (st) { st.className = dirty ? 'saved dirty' : 'saved'; st.textContent = dirty ? 'Đang chờ lưu…' : '✓ Đã lưu'; }
    return true;
  } catch (e) {
    if (st) { st.className = 'saved dirty'; st.textContent = 'Lỗi lưu: ' + e.message; }
    return false;
  } })();
  const ok = await saving; saving = null; return ok;
}
addEventListener('beforeunload', (e) => { if (dirty || saving || generating) { e.preventDefault(); e.returnValue = ''; } });

// ---------- Gắn lớp / livestream ----------
function classModal() {
  const m = openModal(`<h3>Gắn bài giảng vào lớp 🏫</h3><p class="sub">Học sinh của lớp được gắn có thể hỏi AI về bài này sau buổi học. Bài giảng cũng tự gắn khi bạn chiếu nó trong lớp.</p>
    <div class="class-pick" style="margin-bottom:18px">${classes.map((c) => `<label><input type="checkbox" value="${c.id}" ${lesson.classIds.includes(c.id) ? 'checked' : ''} /> ${esc(c.name)}</label>`).join('') || '<span class="hint">Bạn chưa có lớp nào.</span>'}</div>
    <div class="modal-actions"><button class="btn btn-outline" data-close>Huỷ</button><button class="btn btn-primary" data-ok>Lưu</button></div>`);
  m.querySelector('[data-ok]').onclick = async () => {
    lesson.classIds = [...m.querySelectorAll('input:checked')].map((i) => i.value);
    touch();
    m.close();
    if (await flush()) toast('Đã cập nhật lớp', 'success');
    viewEditor();
  };
}

function liveModal() {
  const m = openModal(`<h3>Bắt đầu livestream với bài này 🎬</h3><p class="sub">Chọn lớp. Bài giảng sẽ được chiếu ngay khi bạn vào phòng live.</p>
    <form id="lf"><div class="field"><label>Lớp học</label><select class="input" name="cid">${classes.map((c) => `<option value="${c.id}" ${lesson.classIds[0] === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Chủ đề buổi học</label><input class="input" name="title" value="${esc(lesson.title)}" required /></div>
    <div class="modal-actions"><button type="button" class="btn btn-outline" data-close>Huỷ</button><button class="btn btn-live"><i data-lucide="radio"></i> Lên sóng</button></div></form>`);
  icons();
  m.querySelector('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      if (!(await flush())) throw new Error('Hãy sửa các slide còn lỗi trước khi chiếu.');
      await api(`/api/classes/${e.target.cid.value}/live`, { method: 'POST', body: { title: e.target.title.value } });
      enterClass(e.target.cid.value, lesson.id);
    } catch (err) { toast(err.message, 'error'); }
  };
}
