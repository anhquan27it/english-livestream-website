const me = Auth.require('teacher');
const zoomCallbackUrl = ZoomUrls.callback(location.origin);
let classes = [];
let selectedId = null;
let collectionScroll = 0;
const directory = new ClassDirectory('teacher', renderClassList);

document.getElementById('backToClasses').onclick = () => {
  selectedId = null;
  renderDetail();
  window.scrollTo({ top: collectionScroll });
  document.querySelector(`[data-manage="${lastOpenedId}"]`)?.focus({ preventScroll: true });
};
let lastOpenedId = null;

function manageClass(id) {
  collectionScroll = window.scrollY;
  selectedId = lastOpenedId = id;
  renderDetail();
  window.scrollTo({ top: 0 });
  document.getElementById('backToClasses').focus({ preventScroll: true });
  icons();
}

if (me) {
  buildSidebar('teacher', 'overview');
  setupShell(me);
  document.getElementById('zoomConnectBtn').onclick = async () => {
    try {
      const state = await api('/api/zoom/connection');
      if (state.connected && !(await confirmModal('Kết nối Zoom', 'Đang kết nối ' + state.email + '. Bạn muốn đăng nhập Zoom lại?', 'Kết nối lại', false))) return;
      await linkZoom();
    } catch (e) { toast(e.message, 'error'); }
  };
  const zoomResult = new URLSearchParams(location.search).get('zoom');
  if (zoomResult === 'connected') toast('Đã liên kết Zoom. Bạn có thể mở cuộc họp ngay trong web.', 'success');
  else if (zoomResult) showZoomLinkError();
  document.getElementById('hello').textContent = `${greeting()}, ${me.name}! 👋`;
  load();
  const socket = connectSocket();
  socket.on('classes:changed', () => load());
}

async function load() {
  try {
    const data = await api('/api/classes');
    classes = data.classes;
    if (!classes.find((c) => c.id === selectedId)) selectedId = null;
    render();
    const requested = sessionStorage.getItem('englive_zoom_start');
    if (new URLSearchParams(location.search).get('zoom') === 'connected' && requested && classes.some(c => c.id === requested)) {
      sessionStorage.removeItem('englive_zoom_start');
      history.replaceState(null, '', location.pathname);
      startLive(requested);
    }
  } catch (e) { toast(e.message, 'error'); }
}

function render() {
  const students = new Set(classes.flatMap((c) => c.students.map((s) => s.id)));
  const pending = classes.reduce((n, c) => n + c.pending.length, 0);
  const live = classes.filter((c) => c.live).length;
  const sessions = classes.reduce((n, c) => n + c.history.length, 0);
  document.getElementById('stats').innerHTML = [
    ['school', 'tone-violet', classes.length, 'Lớp học'],
    ['users', 'tone-mint', students.size, 'Học sinh'],
    ['user-plus', 'tone-orange', pending, 'Yêu cầu chờ duyệt'],
    ['radio', 'tone-pink', live ? `${live} live` : sessions, live ? 'Đang phát trực tiếp' : 'Buổi đã dạy'],
  ].map(([ic, tone, v, l]) => `<div class="stat"><div class="ic ${tone}"><i data-lucide="${ic}"></i></div><div><b>${v}</b><small>${l}</small></div></div>`).join('');

  directory.setItems(classes);
  renderDetail();
  icons();
}

function renderClassList(items) {
  const grid = document.getElementById('classGrid');
  grid.innerHTML = classes.length ? items.map(classCard).join('') : `
    <div class="card empty" style="grid-column:1/-1"><div class="emoji">🏫</div><b>Bạn chưa có lớp học nào</b>Tạo lớp đầu tiên để mời học sinh và bắt đầu livestream.<br /><br />
    <button class="btn btn-primary" data-new-empty><i data-lucide="plus"></i> Tạo lớp mới</button></div>`;
  grid.querySelectorAll('[data-manage]').forEach((b) => (b.onclick = () => manageClass(b.dataset.manage)));
  grid.querySelectorAll('[data-new-empty]').forEach((b) => (b.onclick = () => newClass()));
  grid.querySelectorAll('[data-golive]').forEach((b) => (b.onclick = () => startLive(b.dataset.golive)));

}

function classCard(c) {
  return `<article class="catalog-card">
    <div class="catalog-mark cover-${esc(c.color)}" aria-hidden="true">${CLASS_EMOJI[c.color] || '📘'}</div>
    <div class="catalog-summary">
      <div class="catalog-heading"><h3>${esc(c.name)}</h3><span class="chip chip-muted">${esc(c.level)}</span>${c.live ? '<span class="badge-live">LIVE</span>' : ''}</div>
      <p>${esc(c.description || 'Chưa có mô tả.')}</p>
      <div class="class-meta">
        <span><i data-lucide="users"></i>${c.students.length}/${c.maxStudents} học sinh</span>
        <span><i data-lucide="video"></i>${c.history.length} buổi</span>
        <span class="catalog-code" title="Mã lớp"><i data-lucide="key-round"></i>${esc(c.code)}</span>
        ${c.pending.length ? `<span class="chip chip-warn">${c.pending.length} chờ duyệt</span>` : ''}
      </div>
    </div>
      <div class="catalog-actions">
        <button class="btn btn-outline btn-sm" data-manage="${c.id}" aria-label="Quản lý lớp ${esc(c.name)}">Quản lý lớp</button>
        ${c.live
          ? `<button class="btn btn-live btn-sm" data-golive="${c.id}"><i data-lucide="radio"></i> Vào phòng live</button>`
          : `<button class="btn btn-primary btn-sm" data-golive="${c.id}"><i data-lucide="video"></i> Livestream</button>`}
      </div>
  </article>`;
}

function renderDetail() {
  const el = document.getElementById('detail');
  const c = classes.find((x) => x.id === selectedId);
  document.getElementById('classCollection').hidden = !!c;
  document.getElementById('classDetail').hidden = !c;
  if (!c) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="card" style="margin-top:28px">
      <div class="detail-head">
        <div style="display:flex;gap:14px;align-items:center">
          <div class="avatar cover-${c.color}" style="width:52px;height:52px;border-radius:16px;font-size:26px">${CLASS_EMOJI[c.color] || '📘'}</div>
          <div><h2>${esc(c.name)}</h2><span class="chip chip-muted">Trình độ ${esc(c.level)}</span> ${c.live ? `<span class="badge-live">LIVE · ${c.live.viewers} đang xem</span>` : ''}<p class="catalog-description">${esc(c.description || 'Chưa có mô tả.')}</p></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${c.live
            ? `<button class="btn btn-live" data-act="enter"><i data-lucide="radio"></i> Vào phòng live</button>
               <button class="btn btn-outline" data-act="end"><i data-lucide="square"></i> Kết thúc</button>`
            : `<button class="btn btn-live" data-act="live"><i data-lucide="video"></i> Bắt đầu livestream</button>`}
          <button class="btn btn-outline" data-act="recs"><i data-lucide="film"></i> Bản ghi</button>
          <button class="icon-btn" data-act="delete" title="Xoá lớp"><i data-lucide="trash-2"></i></button>
        </div>
      </div>

      <div class="detail-grid" style="margin-top:0">
        <div>
          <div class="section-title"><h2>Học sinh trong lớp <span class="chip chip-muted">${c.students.length}/${c.maxStudents}</span></h2></div>
          <form class="inline-form" id="addForm">
            <input class="input" name="email" type="email" placeholder="Thêm học sinh bằng email..." required />
            <button class="btn btn-primary"><i data-lucide="user-plus"></i><span>Thêm</span></button>
          </form>
          <div class="list">
            ${c.students.length ? c.students.map((s) => `
              <div class="list-item">${avatar(s.name, 'round')}
                <div class="info"><b>${esc(s.name)}</b><small>${esc(s.email)} · đã học ${c.history.filter((h) => h.attendees.includes(s.id)).length}/${c.history.length} buổi</small></div>
                <button class="icon-btn" data-remove="${s.id}" title="Xoá khỏi lớp"><i data-lucide="user-minus"></i></button>
              </div>`).join('') : '<div class="empty"><div class="emoji">🧑‍🎓</div><b>Chưa có học sinh</b>Thêm bằng email hoặc chia sẻ mã lớp.</div>'}
          </div>

          ${c.pending.length ? `
            <div class="section-title" style="margin-top:20px"><h2>Yêu cầu tham gia <span class="chip chip-warn">${c.pending.length}</span></h2></div>
            <div class="list">${c.pending.map((s) => `
              <div class="list-item">${avatar(s.name, 'round')}
                <div class="info"><b>${esc(s.name)}</b><small>${esc(s.email)}</small></div>
                <button class="btn btn-primary btn-sm" data-approve="${s.id}"><i data-lucide="check"></i> Duyệt</button>
                <button class="icon-btn" data-reject="${s.id}" title="Từ chối"><i data-lucide="x"></i></button>
              </div>`).join('')}</div>` : ''}
        </div>

        <div style="display:grid;gap:18px;align-content:start">
          <div>
            <div class="section-title"><h2>Mã lớp học</h2></div>
            <div class="code-box">
              <div><small>Học sinh nhập mã này để xin vào lớp</small><b>${esc(c.code)}</b></div>
              <div style="display:flex;gap:4px">
                <button class="icon-btn" data-act="copy" title="Sao chép"><i data-lucide="copy"></i></button>
                <button class="icon-btn" data-act="regen" title="Tạo mã mới"><i data-lucide="refresh-cw"></i></button>
              </div>
            </div>
          </div>
          <div>
            <div class="section-title"><h2>Lịch sử buổi học</h2></div>
            <div class="card" style="padding:8px 16px">
              ${c.history.length ? c.history.slice(0, 6).map((h) => `
                <div class="history-item"><div class="ic tone-violet"><i data-lucide="video"></i></div>
                  <div style="flex:1;min-width:0"><b>${esc(h.title)}</b><small>${fmtDate(h.startedAt)} · ${fmtDuration(h.endedAt - h.startedAt)} · ${h.attendees.length} học sinh</small></div>
                </div>`).join('') : '<div class="empty" style="padding:24px 10px"><b>Chưa có buổi học nào</b>Bắt đầu livestream đầu tiên nhé!</div>'}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  el.querySelector('#addForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/api/classes/${c.id}/students`, { method: 'POST', body: { email: e.target.email.value } });
      toast('Đã thêm học sinh vào lớp', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };
  el.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmModal('Xoá học sinh khỏi lớp?', 'Học sinh sẽ không thể xem các buổi livestream của lớp này nữa.', 'Xoá'))) return;
    await api(`/api/classes/${c.id}/students/${b.dataset.remove}`, { method: 'DELETE' }).catch((e) => toast(e.message, 'error'));
    load();
  }));
  el.querySelectorAll('[data-approve]').forEach((b) => (b.onclick = async () => {
    try {
      await api(`/api/classes/${c.id}/requests/${b.dataset.approve}/approve`, { method: 'POST' });
      toast('Đã duyệt học sinh vào lớp', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  }));
  el.querySelectorAll('[data-reject]').forEach((b) => (b.onclick = async () => {
    await api(`/api/classes/${c.id}/requests/${b.dataset.reject}/reject`, { method: 'POST' }).catch((e) => toast(e.message, 'error'));
    load();
  }));
  el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
    const act = b.dataset.act;
    if (act === 'recs') openRecordings(c.id, true);
    if (act === 'live') startLive(c.id);
    if (act === 'enter') enterClass(c.id);
    if (act === 'end') {
      if (!(await confirmModal('Kết thúc buổi học?', 'Tất cả học sinh sẽ bị ngắt khỏi livestream.', 'Kết thúc'))) return;
      await api(`/api/classes/${c.id}/live`, { method: 'DELETE' });
      load();
    }
    if (act === 'copy') { navigator.clipboard.writeText(c.code).then(() => toast('Đã sao chép mã lớp')); }
    if (act === 'regen') { await api(`/api/classes/${c.id}/code`, { method: 'POST' }); toast('Đã tạo mã lớp mới'); load(); }
    if (act === 'delete') {
      if (!(await confirmModal('Xoá lớp học này?', `Lớp "${c.name}" và lịch sử buổi học sẽ bị xoá vĩnh viễn.`, 'Xoá lớp'))) return;
      await api(`/api/classes/${c.id}`, { method: 'DELETE' });
      toast('Đã xoá lớp học');
      load();
    }
  }));
}

function newClass() {
  const m = openModal(`
    <h3>Tạo lớp học mới 🏫</h3><p class="sub">Học sinh sẽ dùng mã lớp để xin tham gia.</p>
    <form id="classForm">
      <div class="field"><label>Tên lớp</label><input class="input" name="name" placeholder="VD: IELTS Speaking 6.5+" required /></div>
      <div class="field"><label>Trình độ</label>
        <select class="input" name="level">
          <option>A1</option><option>A2</option><option selected>B1</option><option>B2</option><option>C1</option><option>C2</option><option>IELTS</option><option>TOEIC</option><option>Kids</option>
        </select></div>
      <div class="field"><label>Sĩ số tối đa</label><input class="input" name="maxStudents" type="number" min="1" max="1000" value="30" required /></div>
      <div class="field"><label>Mô tả</label><textarea class="input" name="description" placeholder="Nội dung, mục tiêu của lớp..."></textarea></div>
      <div class="field"><label>Màu chủ đề</label>
        <div style="display:flex;gap:8px">${['violet', 'orange', 'teal', 'pink', 'blue'].map((col, i) => `
          <label style="cursor:pointer"><input type="radio" name="color" value="${col}" ${i === 0 ? 'checked' : ''} style="display:none" />
          <span class="avatar cover-${col}" style="font-size:20px;outline-offset:2px">${CLASS_EMOJI[col]}</span></label>`).join('')}</div></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" data-close>Huỷ</button><button class="btn btn-primary">Tạo lớp</button></div>
    </form>`);
  const form = m.querySelector('#classForm');
  const paint = () => form.querySelectorAll('input[name=color]').forEach((r) => (r.nextElementSibling.style.outline = r.checked ? '3px solid var(--primary)' : 'none'));
  form.addEventListener('change', paint);
  paint();
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await api('/api/classes', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      selectedId = data.class.id;
      m.close();
      toast('Đã tạo lớp học', 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };
}
document.getElementById('newClassBtn').onclick = newClass;

async function showZoomLinkError() {
  try {
    const { lastError } = await api('/api/zoom/connection');
    if (!lastError) return openModal('<h3>Chưa hoàn tất liên kết Zoom</h3><p class="sub">Lần thử trước không có thông tin chẩn đoán trong tiến trình này. Bấm Liên kết Zoom một lần để thử lại; hệ thống sẽ ghi rõ bước và lý do nếu thất bại.</p>');
    openModal(`<h3>Chưa hoàn tất liên kết Zoom</h3><p class="sub"><b>Bước: ${esc(lastError.title)}</b></p><p class="sub">${lastError.httpStatus ? 'HTTP ' + esc(lastError.httpStatus) : ''}${lastError.code ? ' · Mã Zoom: ' + esc(lastError.code) : ''}</p><div class="form-error" role="alert" style="white-space:pre-wrap;overflow-wrap:anywhere">Zoom: ${esc(lastError.message)}</div><p class="sub">${esc(lastError.hint)}</p><div class="modal-actions"><button class="btn btn-primary" data-close>Đã hiểu</button></div>`);
  } catch (e) { toast(e.message, 'error'); }
}

async function linkZoom(classId) {
  const state = await api('/api/zoom/connection');
  if (!state.configured || !state.oauthReady) {
    if (state.pkceRequired && !state.publicClientReady) {
      return openModal(`<h3>Còn thiếu Public Client ID</h3><p class="sub">Client ID/Secret SDK và callback local là hai phần khác nhau. Zoom yêu cầu PKCE cho callback HTTP trên máy bạn.</p><ol style="margin-left:20px;line-height:1.8"><li>Trong General App của Zoom, vào Basic information → App credentials, bật <b>Use Public Client OAuth</b>.</li><li>Sao chép Public Client ID mới vào ô <b>Public Client ID (OAuth local / PKCE)</b> trong admin EngLive và lưu.</li><li>Giữ nguyên Client ID/Secret SDK, rồi bấm Liên kết Zoom lại.</li></ol><div class="modal-actions"><button class="btn btn-primary" data-close>Đã hiểu</button></div>`);
    }
    return openModal(`<h3>Cấu hình chủ trì trong web</h3><p class="sub">Admin cần nhập OAuth Redirect URL trong EngLive và ứng dụng Zoom. Khi thử trên địa chỉ hiện tại:</p><p style="overflow-wrap:anywhere">${esc(zoomCallbackUrl)}</p><p class="sub">Trong General App → Scopes, thêm quyền xem thông tin người dùng và ZAK: user:read:user, user:read:zak. Sau đó quay lại bấm Liên kết Zoom.</p>`);
  }
  const { url } = await api('/api/zoom/connect', { method: 'POST' });
  if (classId) sessionStorage.setItem('englive_zoom_start', classId);
  location.href = url;
}

async function startLive(classId) {
  const c = classes.find((x) => x.id === classId);
  if (!c) return;
  let setup;
  try { setup = await api('/api/zoom/classes/' + encodeURIComponent(classId) + '/setup'); }
  catch (e) { return toast(e.message, 'error'); }
  if (!setup.canStart) {
    const modal = openModal(`<h3>${setup.canConnect ? 'Liên kết Zoom để mở lớp' : 'Cần cấu hình phòng học'}</h3><p class="sub">${esc(setup.message)}</p>${setup.code === 'oauth_config' ? `<p class="sub">Admin nhập URL này ở cả EngLive và General App → Basic information:</p><p style="overflow-wrap:anywhere">${esc(zoomCallbackUrl)}</p><p class="sub">Thêm Scopes user:read:user và user:read:zak trong Zoom. Sau đó giáo viên liên kết Zoom một lần.</p>` : ''}<div class="modal-actions"><button class="btn btn-outline" data-close>Đóng</button>${setup.canConnect ? '<button class="btn btn-primary" id="linkForClass">Liên kết Zoom</button>' : ''}</div>`);
    const button = modal.querySelector('#linkForClass');
    if (button) button.onclick = async () => { button.disabled = true; try { await linkZoom(classId); } catch (e) { toast(e.message, 'error'); button.disabled = false; } };
    return;
  }
  if (c && c.live) { enterClass(classId); return; }
  const m = openModal(`
    <h3>Bắt đầu livestream 🎬</h3><p class="sub">Chỉ ${c.students.length} học sinh trong lớp <b>${esc(c.name)}</b> mới có thể tham gia.</p>
    ${setup.provider === 'zoom' ? `<p class="sub">${setup.hostMode === 'sdk' ? 'Zoom sẽ được mở ngay trong EngLive. Không cần mở ứng dụng Zoom trước.' : 'Lớp đang được admin chọn cách thử bằng ứng dụng Zoom. Muốn dạy hoàn toàn trong web, admin cần đổi sang Chủ trì trong web.'}</p>` : ''}
    <form id="liveForm">
      <div class="field"><label>Chủ đề buổi học</label><input class="input" name="title" placeholder="VD: Unit 5 — Talking about hobbies" required /></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" data-close>Huỷ</button><button class="btn btn-live"><i data-lucide="radio"></i> Lên sóng</button></div>
    </form>`);
  icons();
  m.querySelector('#liveForm').onsubmit = async (e) => {
    e.preventDefault();
    const submit = e.target.querySelector('button[type="submit"], button.btn-live');
    submit.disabled = true;
    try {
      await api(`/api/classes/${classId}/live`, { method: 'POST', body: { title: e.target.title.value } });
      enterClass(classId);
    } catch (err) { toast(err.message, 'error'); submit.disabled = false; }
  };
}
