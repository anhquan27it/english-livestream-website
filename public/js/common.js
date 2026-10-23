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
  home(user) { return user && user.role === 'teacher' ? '/teacher.html' : '/student.html'; },
  // Chặn trang nếu chưa đăng nhập hoặc sai vai trò
  require(role) {
    const user = this.user;
    if (!this.token || !user) { location.href = '/?login=1'; return null; }
    if (role && user.role !== role) { location.href = this.home(user); return null; }
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
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.includes('/login')) {
    Auth.clear();
    location.href = '/?login=1';
  }
  if (!res.ok) throw new Error(data.error || 'Đã có lỗi xảy ra.');
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

// Sidebar dùng chung cho trang giáo viên/học sinh
function setupShell(user) {
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
