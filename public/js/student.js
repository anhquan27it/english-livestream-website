const me = Auth.require('student');
let classes = [];
let liveIds = new Set();
const directory = new ClassDirectory('student', renderClassList);

const WORDS = [
  { word: 'resilient', ipa: '/rɪˈzɪl.i.ənt/', type: 'adj', meaning: 'kiên cường, mau phục hồi', example: 'Children are often very resilient.' },
  { word: 'curious', ipa: '/ˈkjʊə.ri.əs/', type: 'adj', meaning: 'tò mò, ham hiểu biết', example: 'I was curious to know what happened next.' },
  { word: 'improve', ipa: '/ɪmˈpruːv/', type: 'verb', meaning: 'cải thiện', example: 'Practice every day to improve your speaking.' },
  { word: 'fluent', ipa: '/ˈfluː.ənt/', type: 'adj', meaning: 'trôi chảy, lưu loát', example: 'She is fluent in three languages.' },
  { word: 'opportunity', ipa: '/ˌɒp.əˈtʃuː.nə.ti/', type: 'noun', meaning: 'cơ hội', example: 'This is a great opportunity to practise English.' },
  { word: 'confident', ipa: '/ˈkɒn.fɪ.dənt/', type: 'adj', meaning: 'tự tin', example: 'Be confident when you speak.' },
  { word: 'achieve', ipa: '/əˈtʃiːv/', type: 'verb', meaning: 'đạt được', example: 'You can achieve your goals with hard work.' },
];

if (me) {
  buildSidebar('student', 'home');
  setupShell(me);
  renderWord();
  load();
  const socket = connectSocket();
  socket.on('classes:changed', () => load(true));
  document.getElementById('joinBtn').onclick = joinClass;
  // Nút "Nhập mã lớp" nổi bật ở thanh bên: trên trang này mở hộp nhập mã ngay; trang khác dẫn về đây với ?join=1
  document.querySelector('[data-side-cta]').onclick = (e) => { e.preventDefault(); document.getElementById('sidebar').classList.remove('open'); joinClass(); };
  if (new URLSearchParams(location.search).has('join')) { history.replaceState(null, '', location.pathname); joinClass(); }
}

async function load(notify = false) {
  try {
    const data = await api('/api/classes');
    classes = data.classes;
    const nowLive = new Set(classes.filter((c) => c.live).map((c) => c.id));
    if (notify) {
      classes.filter((c) => c.live && !liveIds.has(c.id)).forEach((c) => toast(`🔴 ${c.teacher} vừa bắt đầu livestream lớp ${c.name}!`));
    }
    liveIds = nowLive;
    render();
  } catch (e) { toast(e.message, 'error'); }
}

function render() {
  const members = classes.filter((c) => c.status === 'member');
  const live = members.filter((c) => c.live);

  document.getElementById('liveNow').innerHTML = live.slice(0, 2).map((c) => `
    <div class="live-banner">
      <div class="pulse-ic"><i data-lucide="radio"></i></div>
      <div class="info">
        <span class="badge-live" style="background:rgba(255,255,255,.22)">ĐANG LIVE</span>
        <h3 style="margin-top:6px">${esc(c.live.title)}</h3>
        <p>${esc(c.name)} · ${esc(c.teacher)} · ${c.live.viewers} bạn đang học</p>
      </div>
      <a class="btn btn-lg" href="/devices.html?next=${encodeURIComponent('/live.html?class='+c.id)}"><i data-lucide="play"></i> Vào học ngay</a>
    </div>`).join('') + (live.length > 2 ? `<button class="btn btn-outline live-more" id="showLiveClasses">Xem tất cả ${live.length} lớp đang live</button>` : '');
  const showLive = document.getElementById('showLiveClasses');
  if (showLive) showLive.onclick = () => { directory.status.value = 'live'; directory.refresh(); document.getElementById('classes').scrollIntoView({ block: 'start' }); };

  const attended = members.reduce((n, c) => n + c.attended, 0);
  const total = members.reduce((n, c) => n + c.sessions, 0);
  document.getElementById('stats').innerHTML = [
    ['book-open', 'tone-violet', members.length, 'Lớp đang học'],
    ['circle-check-big', 'tone-mint', attended, 'Buổi đã tham gia'],
    ['target', 'tone-orange', total ? Math.round((attended / total) * 100) + '%' : '—', 'Chuyên cần'],
  ].map(([ic, tone, v, l]) => `<div class="stat"><div class="ic ${tone}"><i data-lucide="${ic}"></i></div><div><b>${v}</b><small>${l}</small></div></div>`).join('');

  directory.setItems(classes);
  icons();
}

function renderClassList(items) {
  document.getElementById('classGrid').innerHTML = classes.length ? items.map((c) => {
    const member = c.status === 'member', live = c.live && member, sm = c.summary || {};
    return `
    <article class="catalog-card ctile ${live ? 'is-live' : ''}" data-color="${esc(c.color)}">
      <header class="ctile-head">
        <div class="catalog-mark cover-${esc(c.color)}" aria-hidden="true">${CLASS_EMOJI[c.color] || '📘'}</div>
        <div class="ctile-title">
          <h3>${esc(c.name)}</h3>
          <small class="ctile-sub"><i data-lucide="user-round"></i>${esc(c.teacher || 'Chưa có giáo viên')}</small>
          <div class="ctile-tags"><span class="chip chip-muted">${esc(c.level)}</span>${live ? '<span class="badge-live">LIVE</span>' : ''}${member ? '' : '<span class="chip chip-warn"><i data-lucide="clock"></i> Chờ duyệt</span>'}</div>
        </div>
      </header>
      ${c.description ? `<p class="ctile-desc">${esc(c.description)}</p>` : ''}
      <div class="ctile-stats">
        ${ClassTile.stat('users', c.studentCount + '/' + c.maxStudents, 'Sĩ số')}
        ${member ? ClassTile.stat('clipboard-list', sm.homeworkTodo ? sm.homeworkTodo + ' bài' : 'Xong', sm.homeworkTodo ? 'cần làm' + (sm.homeworkDue ? ' · hạn ' + ClassTile.when(sm.homeworkDue) : '') : 'Bài tập', sm.homeworkTodo ? 'warn clickable' : 'ok', sm.homeworkTodo ? 'data-go-hw role="button" tabindex="0" title="Mở bài tập"' : '') : ''}
        ${member ? ClassTile.stat('history', sm.lastSessionAt ? ClassTile.day(sm.lastSessionAt) : '—', 'Buổi gần nhất') : ''}
      </div>
      ${member ? ClassTile.bar('Đã tham gia', c.attended, c.sessions) + ClassTile.next(sm.next, live ? c.live.title : '') : '<div class="ctile-next muted"><i data-lucide="hourglass"></i><span>Giáo viên sẽ duyệt yêu cầu vào lớp của bạn</span></div>'}
      <div class="ctile-actions">
        ${live ? `<a class="btn btn-live" href="/devices.html?next=${encodeURIComponent('/live.html?class='+c.id)}"><i data-lucide="play"></i> Vào học ngay</a>` : ''}
        ${member ? `<a class="btn ${live ? 'btn-outline' : 'btn-primary'}" href="/tutor.html?class=${c.id}"><i data-lucide="bot"></i> Hỏi AI</a><a class="btn btn-outline" href="/learning.html"><i data-lucide="clipboard-list"></i> Bài tập</a><button class="icon-btn" data-rec="${c.id}" title="Xem lại buổi học đã ghi hình" aria-label="Xem lại bản ghi"><i data-lucide="film"></i></button>` : ''}
      </div>
    </article>`; }).join('') : `
    <div class="card empty" style="grid-column:1/-1"><div class="emoji">🎒</div><b>Bạn chưa tham gia lớp nào</b>Hỏi giáo viên mã lớp và nhập để xin vào lớp nhé.<br /><br />
    <button class="btn btn-primary" data-join-empty><i data-lucide="key-round"></i> Nhập mã lớp</button></div>`;
  document.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => openRecordings(b.dataset.rec, false)));
  document.querySelectorAll('[data-join-empty]').forEach((b) => (b.onclick = () => joinClass()));
  document.querySelectorAll('[data-go-hw]').forEach((b) => { b.onclick = () => { location.href = '/learning.html'; }; b.onkeydown = (e) => { if (e.key === 'Enter') b.click(); }; });
  icons();
}

function renderWord() {
  const w = WORDS[Math.floor(Date.now() / 86400000) % WORDS.length];
  document.getElementById('wordCard').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span class="eyebrow" style="font-size:12px">Word of the day</span>
      <button class="icon-btn" id="speakWord" title="Nghe phát âm"><i data-lucide="volume-2"></i></button>
    </div>
    <div class="word">${esc(w.word)}</div>
    <div><span class="ipa">${esc(w.ipa)}</span> · <span class="chip chip-warn">${esc(w.type)}</span></div>
    <p style="margin-top:8px;font-weight:600">${esc(w.meaning)}</p>
    <div class="ex">“${esc(w.example)}”</div>`;
  document.getElementById('speakWord').onclick = () => speak(w.word + '. ' + w.example);
}

function joinClass() {
  const m = openModal(`
    <h3>Tham gia lớp học 🎒</h3><p class="sub">Nhập mã lớp 6 ký tự do giáo viên cung cấp. Giáo viên cần duyệt trước khi bạn xem được livestream.</p>
    <form id="joinForm">
      <div class="field"><input class="input" name="code" maxlength="6" placeholder="VD: K7P2QX" style="text-transform:uppercase;letter-spacing:.3em;font-size:22px;font-weight:800;text-align:center" required /></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" data-close>Huỷ</button><button class="btn btn-primary">Gửi yêu cầu</button></div>
    </form>`);
  m.querySelector('#joinForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await api('/api/join', { method: 'POST', body: { code: e.target.code.value } });
      m.close();
      toast(`Đã gửi yêu cầu vào lớp "${data.className}"`, 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };
}
