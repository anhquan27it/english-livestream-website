// Tiện ích dùng chung cho mọi trang
const Auth = {
  get token() { return localStorage.getItem('englive_token'); },
  get user() { try { return JSON.parse(localStorage.getItem('englive_user')); } catch { return null; } },
  set(token, user) {
    localStorage.setItem('englive_token', token);
    localStorage.setItem('englive_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('englive_token');
    localStorage.removeItem('englive_user');
  },
  home(user) { return user && user.role === 'admin' ? '/admin.html' : user && user.role === 'teacher' ? '/teacher.html' : user && user.role === 'assistant' ? '/learning.html' : '/student.html'; },
  // Chặn trang nếu chưa đăng nhập hoặc sai vai trò
  require(role) {
    const user = this.user;
    if (!this.token || !user) { location.href = '/?login=1'; return null; }
    if (role && user.role !== role && !(role === 'teacher' && user.role === 'admin')) { location.href = this.home(user); return null; }
    return user;
  },
  async logout() {
    try { await api('/api/logout', { method: 'POST' }); } catch {}
    this.clear();
    location.href = '/';
  },
};

async function api(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(Auth.token ? { Authorization: 'Bearer ' + Auth.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && !url.includes('/login')) {
    Auth.clear();
    location.href = '/?login=1';
  }
  if (res.status === 404 && !data) throw new Error('Máy chủ đang chạy bản cũ, chưa có chức năng này. Trong terminal đang chạy server, bấm Ctrl+C rồi chạy lại npm start, sau đó tải lại trang.');
  if (!res.ok) throw new Error((data && data.error) || 'Máy chủ trả lỗi HTTP ' + res.status + '. Hãy thử lại.');
  if (!data) throw new Error('Máy chủ không trả dữ liệu hợp lệ. Hãy tải lại trang hoặc kiểm tra server.');
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function icons() { if (window.lucide) lucide.createIcons(); }

function toast(text, type = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2800);
  setTimeout(() => el.remove(), 3200);
}

const AVATAR_COLORS = ['#5b4cf5', '#f43f6e', '#ff8a3d', '#12b981', '#2f8cff', '#a855f7', '#0ea5a4'];
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts.length > 1 ? parts[parts.length - 2][0] : '') + parts[parts.length - 1][0]).toUpperCase();
}
function avatar(name, cls = '') {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<div class="avatar ${cls}" style="background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}">${esc(initials(name))}</div>`;
}

const CLASS_EMOJI = { violet: '🎙️', orange: '💬', teal: '📚', pink: '🎧', blue: '✈️' };

function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// Modal đơn giản: trả về phần tử modal, đóng bằng nút .close / click nền / Esc
function openModal(html, { wide = false } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <button class="icon-btn close" data-close aria-label="Đóng"><i data-lucide="x"></i></button>${html}</div>`;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  icons();
  const first = back.querySelector('input, textarea, select');
  if (first) setTimeout(() => first.focus(), 50);
  back.close = close;
  return back;
}

function confirmModal(title, text, okLabel = 'Đồng ý', danger = true) {
  return new Promise((resolve) => {
    const m = openModal(`<h3>${esc(title)}</h3><p class="sub">${esc(text)}</p>
      <div class="modal-actions"><button class="btn btn-outline" data-close>Huỷ</button>
      <button class="btn ${danger ? 'btn-live' : 'btn-primary'}" data-ok>${esc(okLabel)}</button></div>`);
    m.querySelector('[data-ok]').onclick = () => { m.close(); resolve(true); };
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === m) resolve(false); });
  });
}

function speak(text) {
  if (!('speechSynthesis' in window)) return toast('Trình duyệt không hỗ trợ đọc phát âm.');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

let scheduleReminderTimer = null;
// Sidebar dùng chung cho trang giáo viên/học sinh
function setupShell(user) {
  if (!scheduleReminderTimer) {
    const remind = async () => {
      if (!Auth.token) return;
      try {
        const d = await api('/api/learning/reminders');
        for (const s of d.schedules) {
          const left = s.startsAt - Date.now(), key = 'englive-reminder:' + s.id;
          if (left > 0 && left <= 15 * 60000 && !sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1'); toast('Sắp học: ' + s.title + ' · ' + new Date(s.startsAt).toLocaleString('vi-VN'));
          }
        }
      } catch { /* nhắc lại ở lần sau */ }
    };
    remind(); scheduleReminderTimer = setInterval(remind, 60000);
  }
  document.querySelectorAll('[data-me-name]').forEach((el) => (el.textContent = user.name));
  document.querySelectorAll('[data-me-avatar]').forEach((el) => (el.outerHTML = avatar(user.name, 'round')));
  document.querySelectorAll('[data-logout]').forEach((el) => (el.onclick = () => Auth.logout()));
  const sidebar = document.querySelector('.sidebar');
  document.querySelectorAll('[data-menu]').forEach((el) => (el.onclick = () => sidebar.classList.toggle('open')));
  document.addEventListener('click', (e) => {
    if (sidebar.classList.contains('open') && !e.target.closest('.sidebar') && !e.target.closest('[data-menu]')) sidebar.classList.remove('open');
  });
}

function connectSocket() {
  return io({ auth: { token: Auth.token } });
}

// Micro cho giọng nói: khử vọng + khử ồn + tự cân âm lượng, một kênh 48 kHz (khớp Opus của LiveKit)
function micConstraints() {
  return { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: { ideal: 48000 }, ...devicePreferences('microphone') };
}
function devicePreferences(kind) {
  try { const d = JSON.parse(localStorage.getItem('englive_devices') || '{}'); const id = d[kind]; return id ? { deviceId: { ideal: id } } : {}; } catch { return {}; }
}

function enterClass(classId, lessonId) {
  const url = '/live.html?class=' + encodeURIComponent(classId) + (lessonId ? '&lesson=' + encodeURIComponent(lessonId) : '');
  location.href = '/devices.html?next=' + encodeURIComponent(url);
}

// Danh sách và trình xem bản ghi buổi học của một lớp
async function openRecordings(classId, canDelete) {
  const m = openModal('<h3>Bản ghi buổi học 🎬</h3><p class="sub">Xem lại các buổi đã được giáo viên ghi hình.</p><div id="recBody"><div class="empty">Đang tải…</div></div>', { wide: true });
  const body = m.querySelector('#recBody');
  const paint = async () => {
    try {
      const { recordings } = await api('/api/classes/' + classId + '/recordings');
      body.innerHTML = recordings.length
        ? '<div id="recPlayer"></div><div class="list">' + recordings.map((r) => '<div class="list-item"><div class="avatar tone-violet"><i data-lucide="film"></i></div><div class="info"><b>' + esc(r.title) + '</b><small>' + fmtDate(r.createdAt) + ' · ' + fmtDuration(r.durationSec * 1000) + ' · ' + (r.size / 1048576).toFixed(0) + ' MB</small></div><button class="btn btn-primary btn-sm" data-play="' + r.id + '"><i data-lucide="play"></i> Xem</button><a class="icon-btn" title="Tải về máy" href="/api/recordings/' + r.id + '/file?download=1&token=' + encodeURIComponent(Auth.token) + '" download><i data-lucide="download"></i></a>' + (canDelete ? '<button class="icon-btn" data-del="' + r.id + '" title="Xoá bản ghi"><i data-lucide="trash-2"></i></button>' : '') + '</div>').join('') + '</div>'
        : '<div class="empty"><div class="emoji">🎬</div><b>Chưa có bản ghi nào</b>Giáo viên bấm "Ghi hình" trong phòng live để lưu lại buổi học.</div>';
      icons();
      body.querySelectorAll('[data-play]').forEach((b) => (b.onclick = () => {
        body.querySelector('#recPlayer').innerHTML = '<video controls autoplay playsinline style="width:100%;max-height:60vh;border-radius:16px;background:#000;margin-bottom:12px" src="/api/recordings/' + b.dataset.play + '/file?token=' + encodeURIComponent(Auth.token) + '"></video>';
      }));
      body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
        if (!(await confirmModal('Xoá bản ghi?', 'Bản ghi sẽ bị xoá vĩnh viễn khỏi máy chủ.', 'Xoá'))) return;
        await api('/api/recordings/' + b.dataset.del, { method: 'DELETE' }).catch((e) => toast(e.message, 'error'));
        paint();
      }));
    } catch (e) { body.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  };
  paint();
}

// Thanh bên dùng chung cho các trang giáo viên / học sinh
function buildSidebar(role, active) {
  const isAdmin = Auth.user && Auth.user.role === 'admin';
  const nav = isAdmin ? [
    ['overview', '/admin.html#overview', 'layout-dashboard', 'Tổng quan'], ['users', '/admin.html#users', 'users', 'Tài khoản'], ['classes', '/admin.html#classes', 'school', 'Lớp học'], ['schedule', '/admin.html#schedule', 'calendar-days', 'Thời khóa biểu'],
    ['media', '/admin.html#media', 'folder-open', 'Tài liệu & bản ghi'], ['video', '/video-settings.html', 'video', 'Phòng học trực tuyến'], ['settings', '/admin.html#settings', 'settings', 'Hệ thống'], ['audit', '/admin.html#audit', 'scroll-text', 'Nhật ký'],
    ['ai', '/ai-settings.html', 'sparkles', 'Cài đặt AI'],
  ] : role === 'teacher'
    ? [['overview', '/teacher.html', 'layout-dashboard', 'Tổng quan'], ['lessons', '/lessons.html', 'presentation', 'Bài giảng']]
    : [['home', '/student.html', 'house', 'Trang chủ'], ['tutor', '/tutor.html', 'bot', 'Hỏi đáp AI']];
  if (!isAdmin) nav.push(['learning', '/learning.html', 'calendar-days', 'Học tập & lịch học'], ['devices', '/devices.html', 'video', 'Kiểm tra thiết bị']);
  const promo = isAdmin ? '' : role === 'teacher'
    ? '<div class="promo"><span class="emoji">🎙️</span><b>Teaching tip</b><p>Soạn bài trước, chiếu slide và chơi game để lớp học sôi động hơn.</p></div>'
    : '<div class="promo" style="background:linear-gradient(150deg,#ff8a3d,#f43f6e)"><span class="emoji">🔥</span><b>Keep going!</b><p>Học đều đặn 15 phút mỗi ngày giúp bạn tiến bộ nhanh hơn.</p></div>';
  document.getElementById('sidebar').innerHTML = `
    <a href="/" class="brand"><span class="brand-mark"><i data-lucide="radio"></i></span><span>Eng<b>Live</b></span></a>
    <nav class="side-nav">${nav.map(([id, href, ic, label]) => `<a href="${href}" class="${id === active ? 'active' : ''}"><i data-lucide="${ic}"></i> ${label}</a>`).join('')}</nav>
    <div class="side-foot">${promo}
      <div class="me"><span data-me-avatar></span><div class="info"><b data-me-name></b><small>${({admin:'Quản trị viên',teacher:'Giáo viên',assistant:'Trợ giảng',student:'Học sinh'})[Auth.user?.role] || 'Người dùng'}</small></div>
      <button class="icon-btn" data-logout title="Đăng xuất"><i data-lucide="log-out"></i></button></div></div>`;
  icons();
}
