// Trang chủ: thanh điều hướng, hộp đăng nhập/đăng ký (tách khỏi index.html để CSP không cần cho phép script inline)
const nav = document.getElementById('nav');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8));

function authModal(mode = 'login', role = 'student') {
  const m = openModal(`
    <div class="auth-hero"><span class="auth-badge" aria-hidden="true"><i data-lucide="radio"></i></span><h3 id="authTitle"></h3><p class="sub" id="authSub"></p></div>
    <div class="tabs auth-tabs" id="authTabs"><span class="auth-tab-ind" aria-hidden="true"></span><button data-tab="login"><i data-lucide="log-in"></i> Đăng nhập</button><button data-tab="register"><i data-lucide="user-plus"></i> Đăng ký</button></div>
    <form id="authForm" novalidate>
      <div data-reg>
        <div class="role-pick">
          <label><input type="radio" name="role" value="student" /><span>🧑‍🎓</span>Học sinh<small>Tham gia lớp học</small></label>
          <label><input type="radio" name="role" value="teacher" /><span>👩‍🏫</span>Giáo viên<small>Mở lớp & livestream</small></label>
        </div>
        <div class="field"><label>Họ và tên</label><input class="input" name="name" placeholder="Nguyễn Văn A" /></div>
      </div>
      <div class="field"><label>Email</label><input class="input" name="email" type="email" placeholder="you@example.com" autocomplete="email" /></div>
      <div class="field"><label>Mật khẩu</label><input class="input" name="password" type="password" placeholder="Tối thiểu 6 ký tự" /></div>
      <div class="form-error" id="authErr"></div>
      <button class="btn btn-primary btn-block btn-lg" id="authBtn"></button>
    </form>
    <div class="demo-box" data-login>
      <b>Tài khoản dùng thử</b> (mật khẩu <b>123456</b>):<br />
      <button data-demo="teacher@demo.com">👩‍🏫 teacher@demo.com</button>
      <button data-demo="student1@demo.com">🧑‍🎓 student1@demo.com</button>
      <button data-demo="student3@demo.com">🧑‍🎓 student3 (chưa được duyệt)</button>
      <div class="admin-shortcut">
        <b>Quản trị viên dùng thử</b> (mật khẩu <b>123456</b>):<br />
        <button type="button" data-admin-login="admin@englive.local">🛡️ Admin · admin@englive.local</button>
      </div>
    </div>`);
  m.querySelector('.modal').classList.add('auth-modal');
  const form = m.querySelector('#authForm');
  form.role.value = role;

  function setMode(next) {
    mode = next;
    m.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === mode));
    m.querySelector('#authTabs').dataset.mode = mode;
    m.querySelectorAll('[data-reg]').forEach((el) => (el.hidden = mode !== 'register'));
    m.querySelectorAll('[data-login]').forEach((el) => (el.hidden = mode !== 'login'));
    m.querySelector('#authTitle').textContent = mode === 'login' ? 'Welcome back! 👋' : 'Tạo tài khoản mới ✨';
    m.querySelector('#authSub').textContent = mode === 'login' ? 'Đăng nhập để tiếp tục buổi học của bạn.' : 'Chọn vai trò và bắt đầu hành trình tiếng Anh.';
    m.querySelector('#authBtn').textContent = mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
    m.querySelector('#authErr').textContent = '';
  }
  m.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => setMode(b.dataset.tab)));
  m.querySelectorAll('[data-demo]').forEach((b) => (b.onclick = () => {
    form.email.value = b.dataset.demo;
    form.password.value = '123456';
    form.requestSubmit();
  }));
  m.querySelector('[data-admin-login]').onclick = (e) => {
    setMode('login');
    form.email.value = e.currentTarget.dataset.adminLogin;
    form.password.value = '123456';
    form.requestSubmit();
  };
  setMode(mode);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = m.querySelector('#authBtn');
    btn.disabled = true;
    try {
      const body = { email: form.email.value, password: form.password.value };
      if (mode === 'register') Object.assign(body, { name: form.name.value, role: form.role.value });
      const data = await api(mode === 'login' ? '/api/login' : '/api/register', { method: 'POST', body });
      if (data.pending) { m.querySelector('#authErr').textContent = data.message; btn.disabled = false; return; }
      Auth.set(data.token, data.user);
      location.replace(Auth.home(data.user));
    } catch (err) {
      m.querySelector('#authErr').textContent = err.message;
      btn.disabled = false;
    }
  };
}

document.querySelectorAll('[data-auth]').forEach((b) => (b.onclick = () => authModal(b.dataset.auth, b.dataset.role)));
if (new URLSearchParams(location.search).has('login')) authModal('login');
icons();

// ----- Hiệu ứng trang chủ -----
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Hiện dần khi cuộn tới; số đếm chạy lên khi hiện
const countUp = (el) => {
  const to = +el.dataset.to || 0, start = performance.now(), dur = 1400;
  const tick = (t) => { const p = Math.min(1, (t - start) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); };
  if (reduceMotion) el.textContent = to; else requestAnimationFrame(tick);
};
const seen = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in');
  e.target.querySelectorAll('.count').forEach(countUp);
  if (e.target.classList.contains('count')) countUp(e.target);
  seen.unobserve(e.target);
}), { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el, i) => { el.style.setProperty('--d', (i % 4) * 0.08 + 's'); seen.observe(el); });

// Chữ đổi luân phiên trong tiêu đề
const rot = document.getElementById('rotWord');
if (rot && !reduceMotion) {
  const words = ['Live.', 'Every day.', 'With friends.', 'Confidently.'];
  let k = 0;
  setInterval(() => { k = (k + 1) % words.length; rot.classList.remove('swap'); void rot.offsetWidth; rot.textContent = words[k]; rot.classList.add('swap'); }, 2600);
}

// Màn hình lớp học nghiêng theo chuột
const stage = document.getElementById('stageTilt');
const screen = stage && stage.querySelector('.h-screen');
if (screen && !reduceMotion && matchMedia('(hover: hover)').matches) {
  stage.addEventListener('mousemove', (e) => {
    const r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    screen.style.transform = `rotateY(${-12 + x * 16}deg) rotateX(${6 - y * 12}deg)`;
  });
  stage.addEventListener('mouseleave', () => { screen.style.transform = ''; });
}

// Ô tính năng: vệt sáng đi theo chuột
document.querySelectorAll('.h-tile').forEach((t) => t.addEventListener('mousemove', (e) => {
  const r = t.getBoundingClientRect();
  t.style.setProperty('--mx', e.clientX - r.left + 'px'); t.style.setProperty('--my', e.clientY - r.top + 'px');
}));
