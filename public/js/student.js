const me = Auth.require('student');
let classes = [];
let liveIds = new Set();

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
  setupShell(me);
  document.getElementById('hello').textContent = `${greeting()}, ${me.name}! ☀️`;
  renderWord();
  load();
  const socket = connectSocket();
  socket.on('classes:changed', () => load(true));
  document.getElementById('joinBtn').onclick = joinClass;
  document.getElementById('joinNav').onclick = (e) => { e.preventDefault(); joinClass(); };
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

  document.getElementById('liveNow').innerHTML = live.map((c) => `
    <div class="live-banner">
      <div class="pulse-ic"><i data-lucide="radio"></i></div>
      <div class="info">
        <span class="badge-live" style="background:rgba(255,255,255,.22)">ĐANG LIVE</span>
        <h3 style="margin-top:6px">${esc(c.live.title)}</h3>
        <p>${esc(c.name)} · ${esc(c.teacher)} · ${c.live.viewers} bạn đang học</p>
      </div>
      <a class="btn btn-lg" href="/live.html?class=${c.id}"><i data-lucide="play"></i> Vào học ngay</a>
    </div>`).join('');

  const attended = members.reduce((n, c) => n + c.attended, 0);
  const total = members.reduce((n, c) => n + c.sessions, 0);
  document.getElementById('stats').innerHTML = [
    ['book-open', 'tone-violet', members.length, 'Lớp đang học'],
    ['circle-check-big', 'tone-mint', attended, 'Buổi đã tham gia'],
    ['target', 'tone-orange', total ? Math.round((attended / total) * 100) + '%' : '—', 'Chuyên cần'],
  ].map(([ic, tone, v, l]) => `<div class="stat"><div class="ic ${tone}"><i data-lucide="${ic}"></i></div><div><b>${v}</b><small>${l}</small></div></div>`).join('');

  document.getElementById('classGrid').innerHTML = classes.length ? classes.map((c) => `
    <article class="class-card" style="cursor:default">
      <div class="class-cover cover-${c.color}">
        <span class="level">${esc(c.level)}</span>
        ${c.live ? '<span class="badge-live" style="position:relative;z-index:1">LIVE</span>' : ''}
        <span class="emoji">${CLASS_EMOJI[c.color] || '📘'}</span>
      </div>
      <div class="class-body">
        <h3>${esc(c.name)}</h3>
        <p>${esc(c.description || '')}</p>
        <div class="class-meta">
          <span><i data-lucide="user-round"></i>${esc(c.teacher)}</span>
          <span><i data-lucide="users"></i>${c.studentCount} học sinh</span>
        </div>
        <div class="class-foot">
          ${c.status === 'pending'
            ? '<span class="chip chip-warn"><i data-lucide="clock"></i> Chờ giáo viên duyệt</span>'
            : `<span class="chip chip-ok"><i data-lucide="check"></i> Đã học ${c.attended}/${c.sessions} buổi</span>`}
          ${c.live
            ? `<a class="btn btn-live btn-sm" href="/live.html?class=${c.id}"><i data-lucide="play"></i> Vào học</a>`
            : c.status === 'member' ? '<span class="chip chip-muted">Chưa live</span>' : ''}
        </div>
      </div>
    </article>`).join('') : `
    <div class="card empty" style="grid-column:1/-1"><div class="emoji">🎒</div><b>Bạn chưa tham gia lớp nào</b>Hỏi giáo viên mã lớp và nhập để xin vào lớp nhé.<br /><br />
    <button class="btn btn-primary" onclick="joinClass()"><i data-lucide="key-round"></i> Nhập mã lớp</button></div>`;
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
