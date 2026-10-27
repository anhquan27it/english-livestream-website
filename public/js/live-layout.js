// Bố cục phòng live: ẩn/hiện khung chat và kéo thanh để đổi độ rộng (nhớ lại lựa chọn). Chỉ đụng tới giao diện, không động vào logic buổi học.
(() => {
  const body = document.body, app = document.querySelector('.live-app');
  const btn = document.getElementById('sideToggle'), handle = document.getElementById('sideResizer'), chatList = document.getElementById('chatList');
  if (!app || !btn || !handle) return;
  const KEY_W = 'englive_side_w', KEY_C = 'englive_side_collapsed', DEFAULT_W = 360;
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* chế độ riêng tư: bỏ qua */ } };
  const clamp = (w) => Math.max(280, Math.min(w, Math.min(760, window.innerWidth * 0.6)));
  const relayout = () => window.dispatchEvent(new Event('resize')); // slide/PDF vẽ lại theo khung mới
  const setWidth = (w) => app.style.setProperty('--side-w', clamp(w) + 'px');
  const collapsed = () => body.classList.contains('side-collapsed');

  function paintButton() {
    btn.dataset.tip = collapsed() ? 'Hiện khung chat' : 'Ẩn khung chat để xem màn hình lớn hơn';
    btn.setAttribute('aria-label', btn.dataset.tip);
    btn.innerHTML = '<i data-lucide="' + (collapsed() ? 'panel-right-open' : 'panel-right-close') + '"></i>';
    if (typeof icons === 'function') icons();
  }
  function toggle(force) {
    const next = force === undefined ? !collapsed() : force;
    body.classList.toggle('side-collapsed', next);
    set(KEY_C, next ? '1' : '0');
    if (!next) btn.classList.remove('has-new');
    paintButton();
    setTimeout(relayout, 230); // sau hoạt ảnh đổi cột
  }

  setWidth(Number(get(KEY_W)) || DEFAULT_W);
  if (get(KEY_C) === '1') body.classList.add('side-collapsed');
  paintButton();
  btn.onclick = () => toggle();

  // Kéo thanh để đổi độ rộng khung chat
  handle.addEventListener('pointerdown', (e) => {
    if (collapsed()) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    app.classList.add('dragging');
    const move = (ev) => setWidth(window.innerWidth - ev.clientX);
    const up = (ev) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      app.classList.remove('dragging');
      set(KEY_W, String(clamp(window.innerWidth - ev.clientX)));
      relayout();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('dblclick', () => { setWidth(DEFAULT_W); set(KEY_W, String(DEFAULT_W)); relayout(); });
  addEventListener('resize', () => setWidth(Number(get(KEY_W)) || DEFAULT_W));

  // Khung chat đang ẩn mà có tin mới: chấm báo trên nút
  if (chatList) new MutationObserver(() => { if (collapsed()) btn.classList.add('has-new'); }).observe(chatList, { childList: true });
})();
