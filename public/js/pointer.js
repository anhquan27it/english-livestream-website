// Con trỏ giáo viên trên slide/PDF: giáo viên rê chuột trong khung slide → học sinh thấy chấm sáng di chuyển theo,
// bấm chuột thì hiện vòng gợn. Slide tự co giãn khác nhau trên từng máy nên vị trí gắn theo phần tử dưới chuột
// (đường dẫn chỉ số con tính từ khung slide + tỉ lệ trong phần tử); không khớp thì dùng tỉ lệ của cả khung.
const TeacherPointer = (() => {
  const o = {};
  const SEND_MS = 60;           // ~16 lần/giây, dưới giới hạn tốc độ socket
  const KEY = 'englive-pointer-off';
  let on = true, last = 0, pending = null, timer = null, hideT = null, dot = null;
  try { on = localStorage.getItem(KEY) !== '1'; } catch { /* trình duyệt chặn lưu trữ: mặc định bật */ }

  const showing = () => o.stage.classList.contains('with-slide') && o.layer.getBoundingClientRect().width > 0;
  // Bỏ qua phần tử SVG (icon) để đường dẫn chỉ gồm phần tử HTML giống nhau giữa các máy
  const climb = (el) => { while (el && el !== o.layer && !(el instanceof HTMLElement)) el = el.parentElement; return el; };
  function pathOf(el) {
    const path = [];
    for (let n = el; n !== o.layer; n = n.parentElement) {
      if (!n || !n.parentElement) return null;
      path.unshift([...n.parentElement.children].indexOf(n));
    }
    return path.length <= 24 ? path : null;
  }
  function resolve(path) {
    let n = o.layer;
    for (const i of path) { n = n.children[i]; if (!n) return null; }
    return n;
  }

  // ----- Giáo viên: đo và gửi -----
  function flush() {
    clearTimeout(timer); timer = null;
    if (!pending) return;
    o.socket.emit('pointer:move', pending);
    last = Date.now(); pending = null;
  }
  function send(p) {
    pending = p;
    const wait = SEND_MS - (Date.now() - last);
    if (p.hide || p.click || wait <= 0) flush();
    else if (!timer) timer = setTimeout(flush, wait);
  }
  function measure(e, click) {
    const lr = o.layer.getBoundingClientRect();
    const p = { x: (e.clientX - lr.left) / lr.width, y: (e.clientY - lr.top) / lr.height, click };
    const el = climb(e.target);
    if (el && el !== o.layer && o.layer.contains(el)) {
      const r = el.getBoundingClientRect(), path = pathOf(el);
      if (path && r.width && r.height) Object.assign(p, { path, fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, tag: el.tagName });
    }
    return p;
  }
  function paintBtn() {
    const b = o.btn; if (!b) return;
    b.classList.toggle('on', on);
    b.title = on ? 'Học sinh đang thấy con trỏ của bạn trên slide — bấm để tắt' : 'Bấm để học sinh thấy con trỏ của bạn trên slide';
    b.innerHTML = `<i data-lucide="${on ? 'mouse-pointer-2' : 'mouse-pointer-ban'}"></i><span>${on ? 'Con trỏ: bật' : 'Con trỏ: tắt'}</span>`;
    icons();
  }

  // ----- Học sinh: vẽ chấm sáng -----
  function hide() { if (dot) dot.classList.remove('show'); }
  function show(p) {
    if (p.hide || !showing()) return hide();
    const lr = o.layer.getBoundingClientRect();
    let x = null, y = null;
    const el = p.path && resolve(p.path);
    if (el && el.tagName === p.tag) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) { x = r.left + p.fx * r.width; y = r.top + p.fy * r.height; }
    }
    if (x === null) { x = lr.left + p.x * lr.width; y = lr.top + p.y * lr.height; }
    x = Math.min(lr.right - 4, Math.max(lr.left + 4, x));
    y = Math.min(lr.bottom - 4, Math.max(lr.top + 4, y));
    if (!dot) { dot = document.createElement('div'); dot.className = 'tp-dot'; dot.setAttribute('aria-hidden', 'true'); document.body.appendChild(dot); }
    const fresh = !dot.classList.contains('show');
    if (fresh) dot.style.transition = 'none'; // lần đầu hiện: nhảy thẳng tới chỗ, không trượt từ vị trí cũ
    dot.style.transform = `translate(${x}px, ${y}px)`;
    if (fresh) { void dot.offsetWidth; dot.style.transition = ''; }
    dot.classList.add('show');
    if (p.click) {
      const rip = document.createElement('div');
      rip.className = 'tp-ripple'; rip.style.left = x + 'px'; rip.style.top = y + 'px';
      document.body.appendChild(rip);
      setTimeout(() => rip.remove(), 700);
    }
    clearTimeout(hideT);
    hideT = setTimeout(hide, 4000); // giáo viên đứng yên lâu thì ẩn cho đỡ vướng
  }

  function init(opts) {
    Object.assign(o, opts);
    if (!o.isTeacher) {
      o.socket.on('pointer', show);
      o.socket.on('lesson:state', (st) => { if (!st) hide(); });
      window.addEventListener('resize', hide);
      return;
    }
    if (o.btn) {
      o.btn.hidden = false;
      paintBtn();
      o.btn.onclick = () => {
        on = !on;
        try { on ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, '1'); } catch { /* bỏ qua */ }
        if (!on) send({ hide: true });
        paintBtn();
      };
    }
    o.layer.addEventListener('pointermove', (e) => { if (on && e.pointerType !== 'touch' && showing()) send(measure(e, false)); });
    o.layer.addEventListener('pointerdown', (e) => { if (on && showing()) send(measure(e, true)); });
    o.layer.addEventListener('pointerleave', () => { if (on) send({ hide: true }); });
  }

  return { init };
})();
