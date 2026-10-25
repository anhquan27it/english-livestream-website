// Phòng học trực tiếp: giáo viên phát (WebRTC 1 -> nhiều), học sinh xem
const me = Auth.require();
const classId = new URLSearchParams(location.search).get('class');
const isTeacher = me && me.role === 'teacher';
const RTC = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

const $ = (id) => document.getElementById(id);
const video = $('video');
let socket;
let aiChat = null;
let live = null;
let timerInt = null;
let ended = false;

// Giáo viên
let camStream = null;     // camera + micro (hoặc nguồn dự phòng)
let screenTrack = null;   // track chia sẻ màn hình
let usingFallback = false;
const peers = new Map();  // socketId học sinh -> RTCPeerConnection
const viewers = new Map(); // socketId -> { name, hand }
const outStream = new MediaStream();

// Học sinh
let pc = null;
let handRaised = false;
const words = [];

const QUICK_STUDENT = ['Could you repeat that, please? 🙏', 'I understand! 👍', 'Can you speak more slowly?', 'How do you spell it?'];
const QUICK_TEACHER = ['Great job! 🎉', 'Any questions?', 'Repeat after me 🗣️', "Let's take a short break ☕"];
const WORD_PRESETS = [
  { word: 'confident', ipa: '/ˈkɒn.fɪ.dənt/', type: 'adj', meaning: 'tự tin', example: 'Be confident when you speak English.' },
  { word: 'hobby', ipa: '/ˈhɒb.i/', type: 'noun', meaning: 'sở thích', example: 'My favourite hobby is reading.' },
  { word: 'look forward to', ipa: '/lʊk ˈfɔː.wəd tuː/', type: 'phrase', meaning: 'mong chờ', example: 'I look forward to hearing from you.' },
];

if (me) init();

async function init() {
  if (!classId) return showState('🤔', 'Không tìm thấy lớp học', 'Đường dẫn không hợp lệ.', true);
  try {
    const { class: c } = await api('/api/classes/' + classId);
    $('liveTitle').textContent = c.live ? c.live.title : c.name;
    $('liveSub').textContent = `${c.name} · ${c.teacher}`;
    if (!c.live) return showState('😴', 'Lớp học chưa bắt đầu', 'Giáo viên chưa mở livestream. Bạn sẽ thấy nút “Vào học” khi lớp lên sóng.', true);
  } catch (e) {
    return showState('🔒', 'Bạn không có quyền vào lớp này', e.message, true);
  }

  setupUi();
  LessonLive.init({
    isTeacher, socket: null, classId, stage: $('stage'), layer: $('slideLayer'), panel: $('lessonPanel'),
    onChange: () => aiChat && aiChat.reload(),
  });
  if (isTeacher) {
    showState(null, 'Đang bật camera & micro...', 'Hãy cho phép trình duyệt truy cập camera và micro.');
    await startMedia();
  }

  socket = connectSocket();
  LessonLive.init({ socket });
  socket.on('connect', joinRoom);
  socket.on('connect_error', () => toast('Mất kết nối máy chủ, đang thử lại...', 'error'));
  socket.on('chat', addChat);
  socket.on('viewers:count', (n) => { $('viewerCount').textContent = n; if (!isTeacher) $('peopleCount').textContent = words.length; });
  socket.on('word', showWord);
  socket.on('live:ended', ({ reason }) => finish('👋', 'Buổi học đã kết thúc', reason));
  socket.on('kicked', ({ reason }) => finish('🚪', 'Bạn đã rời buổi học', reason));
  socket.on('signal', onSignal);
  socket.on('lesson:state', (st) => LessonLive.apply(st));

  if (isTeacher) {
    socket.on('viewer:joined', (v) => { viewers.set(v.socketId, v); renderPeople(); callViewer(v.socketId); });
    socket.on('viewer:left', ({ socketId }) => { viewers.delete(socketId); closePeer(socketId); renderPeople(); });
    socket.on('hand', ({ socketId, name, raised }) => {
      const v = viewers.get(socketId);
      if (v) v.hand = raised;
      if (raised) toast(`✋ ${name} đang giơ tay`);
      renderPeople();
    });
  } else {
    socket.on('teacher:left', () => {
      closeStudentPeer();
      showState('📡', 'Giáo viên tạm mất kết nối', 'Đang chờ giáo viên quay lại...');
    });
    socket.on('teacher:joined', () => showState(null, 'Giáo viên đã quay lại', 'Đang kết nối lại livestream...'));
    socket.on('hand:lowered', () => { handRaised = false; renderControls(); toast('Giáo viên đã hạ tay của bạn'); });
  }
}

function joinRoom() {
  socket.emit('room:join', { classId }, (res) => {
    if (res.error) return finish('🔒', 'Không thể tham gia', res.error);
    live = res.live;
    $('liveTitle').textContent = live.title;
    $('liveBadge').hidden = false;
    $('viewerCount').textContent = live.viewers;
    startTimer(live.startedAt);
    showWord(res.word);
    LessonLive.apply(res.lesson);
    const wanted = new URLSearchParams(location.search).get('lesson');
    if (isTeacher && wanted && !res.lesson) LessonLive.present(wanted);
    if (isTeacher) {
      // Kết nối (lại) tới tất cả học sinh đang có mặt
      viewers.clear();
      res.viewers.forEach((v) => { viewers.set(v.socketId, v); callViewer(v.socketId); });
      renderPeople();
      hideState();
    } else if (res.teacherOnline) {
      showState(null, 'Đang kết nối tới giáo viên...', 'Buổi học sẽ hiển thị trong giây lát.');
    } else {
      showState('⏳', 'Chờ giáo viên vào lớp', 'Giáo viên đã mở lớp nhưng chưa lên sóng. Hãy đợi một chút nhé!');
    }
  });
}

// ---------------- Giáo viên: media ----------------
async function startMedia() {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    // Không có camera: dùng micro (nếu có) + màn hình chờ vẽ bằng canvas
    usingFallback = true;
    let audio = [];
    try { audio = (await navigator.mediaDevices.getUserMedia({ audio: true })).getAudioTracks(); } catch {}
    camStream = new MediaStream([...audio, canvasTrack()]);
    toast(audio.length ? 'Không tìm thấy camera — đang phát màn hình chờ kèm micro.' : 'Không tìm thấy camera/micro — hãy dùng “Chia sẻ màn hình”.', 'error');
  }
  camStream.getTracks().forEach((t) => outStream.addTrack(t));
  showLocalPreview();
  renderControls();
}

function canvasTrack() {
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const draw = () => {
    const t = Date.now() / 1000;
    const g = ctx.createLinearGradient(0, 0, 1280, 720);
    g.addColorStop(0, '#2a2160'); g.addColorStop(0.6, '#5b4cf5'); g.addColorStop(1, '#8f7bff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.arc(1100 + Math.sin(t) * 30, 120, 220, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(160, 640 + Math.cos(t) * 20, 180, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.font = '120px sans-serif'; ctx.fillText('👩‍🏫', 640, 300);
    ctx.font = 'bold 54px "Plus Jakarta Sans", sans-serif'; ctx.fillText(me.name, 640, 410);
    ctx.font = '600 30px "Plus Jakarta Sans", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText((live && live.title) || 'EngLive Classroom', 640, 465);
    ctx.fillText(new Date().toLocaleTimeString('vi-VN'), 640, 520);
  };
  draw();
  setInterval(draw, 100);
  return canvas.captureStream(10).getVideoTracks()[0];
}

function currentVideoTrack() {
  return screenTrack || camStream.getVideoTracks()[0];
}

function showLocalPreview() {
  video.muted = true;
  video.srcObject = new MediaStream([currentVideoTrack()]);
  video.style.transform = !screenTrack && !usingFallback ? 'scaleX(-1)' : 'none';
  video.play().catch(() => {});
}

async function toggleScreen() {
  if (screenTrack) return stopScreen();
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    screenTrack = s.getVideoTracks()[0];
    screenTrack.onended = stopScreen;
    replaceVideo(screenTrack);
    toast('Đang chia sẻ màn hình');
  } catch { /* người dùng huỷ */ }
}

function stopScreen() {
  if (!screenTrack) return;
  screenTrack.onended = null;
  screenTrack.stop();
  screenTrack = null;
  replaceVideo(camStream.getVideoTracks()[0]);
}

function replaceVideo(track) {
  peers.forEach((p) => {
    const sender = p.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(track);
  });
  showLocalPreview();
  renderControls();
}

function toggleTrack(kind) {
  const t = kind === 'audio' ? camStream.getAudioTracks()[0] : camStream.getVideoTracks()[0];
  if (!t) return toast(kind === 'audio' ? 'Không có micro.' : 'Không có camera.', 'error');
  t.enabled = !t.enabled;
  renderControls();
}

// ---------------- Giáo viên: WebRTC tới từng học sinh ----------------
async function callViewer(id) {
  if (!camStream) return;
  closePeer(id);
  const p = new RTCPeerConnection(RTC);
  peers.set(id, p);
  const audio = camStream.getAudioTracks()[0];
  if (audio) p.addTrack(audio, outStream);
  p.addTrack(currentVideoTrack(), outStream);
  p.onicecandidate = (e) => e.candidate && socket.emit('signal', { to: id, data: { candidate: e.candidate } });
  p.onconnectionstatechange = () => {
    const v = viewers.get(id);
    if (v) { v.state = p.connectionState; renderPeople(); }
  };
  const offer = await p.createOffer();
  await p.setLocalDescription(offer);
  socket.emit('signal', { to: id, data: { sdp: p.localDescription } });
}

function closePeer(id) {
  const p = peers.get(id);
  if (p) { p.close(); peers.delete(id); }
}

async function onSignal({ from, data }) {
  try {
    if (isTeacher) {
      const p = peers.get(from);
      if (!p) return;
      if (data.sdp) await p.setRemoteDescription(data.sdp);
      else if (data.candidate) await p.addIceCandidate(data.candidate);
      return;
    }
    // Học sinh
    if (data.sdp && data.sdp.type === 'offer') {
      closeStudentPeer();
      pc = new RTCPeerConnection(RTC);
      pc.ontrack = (e) => attachRemote(e.streams[0]);
      pc.onicecandidate = (e) => e.candidate && socket.emit('signal', { to: from, data: { candidate: e.candidate } });
      pc.onconnectionstatechange = () => {
        if (pc && ['failed', 'disconnected'].includes(pc.connectionState)) showState('📶', 'Kết nối không ổn định', 'Đang thử kết nối lại...');
        if (pc && pc.connectionState === 'connected') hideState();
      };
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: from, data: { sdp: pc.localDescription } });
    } else if (data.candidate && pc) {
      await pc.addIceCandidate(data.candidate);
    }
  } catch (e) { console.warn('signal error', e); }
}

// ---------------- Học sinh ----------------
function attachRemote(stream) {
  if (video.srcObject === stream) return;
  video.srcObject = stream;
  video.muted = false;
  hideState();
  video.play().catch(() => {
    // Trình duyệt chặn tự phát có tiếng -> phát không tiếng và hiện nút bật tiếng
    video.muted = true;
    video.play().catch(() => {});
    showUnmute();
  });
  renderControls();
}

function showUnmute() {
  if ($('unmuteBtn')) return;
  const b = document.createElement('button');
  b.id = 'unmuteBtn';
  b.className = 'btn btn-accent';
  b.style.cssText = 'position:absolute;top:14px;right:14px;z-index:5';
  b.innerHTML = '<i data-lucide="volume-x"></i> Bấm để bật tiếng';
  b.onclick = () => { video.muted = false; video.play(); b.remove(); renderControls(); };
  $('stage').appendChild(b);
  icons();
}

function closeStudentPeer() {
  if (pc) { pc.close(); pc = null; }
}

// ---------------- UI ----------------
function setupUi() {
  $('backBtn').onclick = () => leave();
  $('peopleLabel').textContent = isTeacher ? 'Học sinh' : 'Từ vựng';
  $('quick').innerHTML = (isTeacher ? QUICK_TEACHER : QUICK_STUDENT).map((q) => `<button type="button">${esc(q)}</button>`).join('');
  $('quick').querySelectorAll('button').forEach((b) => (b.onclick = () => socket.emit('chat', { text: b.textContent })));
  $('chatForm').onsubmit = (e) => {
    e.preventDefault();
    const text = $('chatInput').value.trim();
    if (!text) return;
    socket.emit('chat', { text });
    $('chatInput').value = '';
  };
  const panels = { chat: 'chatPanel', people: 'peoplePanel', lesson: 'lessonPanel', ai: 'aiPanel' };
  $('tabLesson').hidden = !isTeacher;
  $('tabAi').hidden = isTeacher;
  if (!isTeacher) aiChat = AiChat.mount($('aiPanel'), { classId, dark: true });
  document.querySelectorAll('[data-panel]').forEach((b) => (b.onclick = () => {
    document.querySelectorAll('[data-panel]').forEach((x) => x.classList.toggle('active', x === b));
    Object.entries(panels).forEach(([k, id]) => ($(id).hidden = b.dataset.panel !== k));
    $('chatBox').hidden = b.dataset.panel !== 'chat';
  }));
  $('swapBtn').onclick = () => $('stage').classList.toggle('swap');
  addChat({ system: true, text: isTeacher ? 'Bạn đang ở phòng livestream. Chỉ học sinh trong lớp mới xem được.' : 'Welcome to class! Hãy dùng tiếng Anh khi chat nhé 😊' });
  renderControls();
  renderPeople();
}

function ctrl(id, icon, label, cls = '') {
  return `<button class="ctrl ${cls}" id="${id}" title="${esc(label)}"><i data-lucide="${icon}"></i><span class="lbl">${esc(label)}</span></button>`;
}

function renderControls() {
  const box = $('controls');
  if (isTeacher) {
    const a = camStream && camStream.getAudioTracks()[0];
    const v = camStream && camStream.getVideoTracks()[0];
    const micOn = a && a.enabled, camOn = v && v.enabled;
    box.innerHTML =
      ctrl('cMic', micOn ? 'mic' : 'mic-off', micOn ? 'Micro' : 'Đã tắt mic', micOn ? '' : 'off') +
      ctrl('cCam', camOn ? 'video' : 'video-off', camOn ? 'Camera' : 'Đã tắt cam', camOn ? '' : 'off') +
      ctrl('cScreen', screenTrack ? 'monitor-off' : 'monitor-up', screenTrack ? 'Dừng chia sẻ' : 'Chia sẻ màn hình', screenTrack ? 'on' : '') +
      ctrl('cWord', 'book-open-text', 'Thẻ từ vựng') +
      ctrl('cEnd', 'square', 'Kết thúc', 'danger');
    $('cMic').onclick = () => toggleTrack('audio');
    $('cCam').onclick = () => toggleTrack('video');
    $('cScreen').onclick = toggleScreen;
    $('cWord').onclick = wordModal;
    $('cEnd').onclick = endLive;
  } else {
    box.innerHTML =
      ctrl('cHand', 'hand', handRaised ? 'Hạ tay' : 'Giơ tay', handRaised ? 'on' : '') +
      ctrl('cSound', video.muted ? 'volume-x' : 'volume-2', video.muted ? 'Bật tiếng' : 'Âm thanh', video.muted ? 'off' : '') +
      ctrl('cFull', 'maximize', 'Toàn màn hình') +
      ctrl('cLeave', 'log-out', 'Rời lớp', 'danger');
    $('cHand').onclick = () => { handRaised = !handRaised; socket.emit('hand', { raised: handRaised }); renderControls(); };
    $('cSound').onclick = () => { video.muted = !video.muted; if (!video.muted) { video.play(); $('unmuteBtn')?.remove(); } renderControls(); };
    $('cFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : $('stage').requestFullscreen().catch(() => {}));
    $('cLeave').onclick = () => leave();
  }
  icons();
}

function renderPeople() {
  const panel = $('peoplePanel');
  if (!isTeacher) {
    $('peopleCount').textContent = words.length;
    panel.innerHTML = words.length ? '<div class="panel-heading">Từ vựng buổi học</div>' + words.map((w, i) => `
      <div class="viewer"><div class="avatar sm" style="background:var(--accent);color:#2b1d00">${i + 1}</div>
        <div class="info">${esc(w.word)} <small>${esc(w.ipa)} · ${esc(w.meaning)}</small></div>
        <button class="icon-btn" data-say="${i}" title="Nghe"><i data-lucide="volume-2"></i></button></div>`).join('')
      : '<div class="empty" style="color:#8885ab"><div class="emoji">📒</div>Từ vựng giáo viên ghim sẽ được lưu ở đây.</div>';
    panel.querySelectorAll('[data-say]').forEach((b) => (b.onclick = () => speak(words[b.dataset.say].word)));
    icons();
    return;
  }
  const list = [...viewers.entries()].sort((a, b) => (b[1].hand ? 1 : 0) - (a[1].hand ? 1 : 0));
  $('peopleCount').textContent = list.length;
  panel.innerHTML = list.length ? `<div class="panel-heading">Đang xem · ${list.length}</div>` + list.map(([id, v]) => `
    <div class="viewer">${avatar(v.name, 'sm round')}
      <div class="info">${esc(v.name)}<small>${v.state === 'connected' ? '● Đang xem' : v.state === 'failed' ? 'Kết nối lỗi' : 'Đang kết nối...'}</small></div>
      ${v.hand ? `<span class="hand">✋</span><button class="icon-btn" data-lower="${id}" title="Hạ tay"><i data-lucide="hand"></i></button>` : ''}
      <button class="icon-btn" data-kick="${id}" title="Mời rời buổi học"><i data-lucide="user-x"></i></button>
    </div>`).join('')
    : '<div class="empty" style="color:#8885ab"><div class="emoji">👀</div>Chưa có học sinh nào vào xem.<br />Học sinh trong lớp sẽ nhận được thông báo.</div>';
  panel.querySelectorAll('[data-lower]').forEach((b) => (b.onclick = () => socket.emit('hand:lower', { socketId: b.dataset.lower })));
  panel.querySelectorAll('[data-kick]').forEach((b) => (b.onclick = async () => {
    const v = viewers.get(b.dataset.kick);
    if (await confirmModal('Mời học sinh rời buổi học?', `${v ? v.name : 'Học sinh'} sẽ bị ngắt khỏi livestream này (vẫn ở trong lớp).`, 'Mời rời')) {
      socket.emit('kick', { socketId: b.dataset.kick });
    }
  }));
  icons();
}

function addChat(m) {
  const list = $('chatList');
  const el = document.createElement('div');
  if (m.system) {
    el.className = 'msg system';
    el.textContent = m.text;
  } else {
    el.className = 'msg' + (m.userId === me.id ? ' mine' : '');
    el.innerHTML = `${avatar(m.name, 'sm round')}<div class="bubble">
      <div class="name">${esc(m.name)}${m.role === 'teacher' ? '<span class="tag">TEACHER</span>' : ''}<time>${new Date(m.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time></div>
      <div class="text">${esc(m.text)}</div></div>`;
  }
  const atBottom = $('chatPanel').scrollHeight - $('chatPanel').scrollTop - $('chatPanel').clientHeight < 60;
  list.appendChild(el);
  if (atBottom || m.userId === me.id) $('chatPanel').scrollTop = $('chatPanel').scrollHeight;
}

function showWord(w) {
  const box = $('wordOverlay');
  if (!w) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `
    <button class="icon-btn speak" title="Nghe phát âm"><i data-lucide="volume-2"></i></button>
    <div class="w">${esc(w.word)} <span class="ipa">${esc(w.ipa)}</span> ${w.type ? `<span class="type">${esc(w.type)}</span>` : ''}</div>
    <div class="m">${esc(w.meaning)}</div>
    ${w.example ? `<div class="ex">“${esc(w.example)}”</div>` : ''}`;
  box.querySelector('.speak').onclick = () => speak(w.word + (w.example ? '. ' + w.example : ''));
  if (!isTeacher && !words.some((x) => x.word === w.word)) { words.push(w); renderPeople(); }
  icons();
}

function wordModal() {
  const m = openModal(`
    <h3>Ghim thẻ từ vựng 📌</h3><p class="sub">Thẻ hiển thị trên màn hình của tất cả học sinh, kèm nút nghe phát âm.</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${WORD_PRESETS.map((p, i) => `<button type="button" class="chip chip-muted" style="border:0;cursor:pointer" data-preset="${i}">${esc(p.word)}</button>`).join('')}</div>
    <form id="wordForm">
      <div style="display:grid;grid-template-columns:1.4fr 1fr .8fr;gap:10px">
        <div class="field"><label>Từ / cụm từ</label><input class="input" name="word" required /></div>
        <div class="field"><label>Phiên âm IPA</label><input class="input" name="ipa" placeholder="/.../" /></div>
        <div class="field"><label>Loại từ</label><input class="input" name="type" placeholder="noun" /></div>
      </div>
      <div class="field"><label>Nghĩa tiếng Việt</label><input class="input" name="meaning" /></div>
      <div class="field"><label>Câu ví dụ</label><input class="input" name="example" /></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="clearWord">Gỡ thẻ</button>
        <button class="btn btn-primary"><i data-lucide="pin"></i> Ghim lên màn hình</button>
      </div>
    </form>`, { wide: true });
  const f = m.querySelector('#wordForm');
  m.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => {
    const p = WORD_PRESETS[b.dataset.preset];
    Object.keys(p).forEach((k) => (f[k].value = p[k]));
  }));
  m.querySelector('#clearWord').onclick = () => { socket.emit('word', null); m.close(); };
  f.onsubmit = (e) => {
    e.preventDefault();
    socket.emit('word', Object.fromEntries(new FormData(f)));
    m.close();
  };
}

async function endLive() {
  if (!(await confirmModal('Kết thúc buổi học?', 'Livestream sẽ dừng và tất cả học sinh sẽ rời phòng.', 'Kết thúc'))) return;
  try { await api(`/api/classes/${classId}/live`, { method: 'DELETE' }); } catch (e) { toast(e.message, 'error'); }
}

function leave() {
  if (socket) socket.emit('room:leave');
  location.href = Auth.home(me);
}

function finish(emoji, title, text) {
  ended = true;
  clearInterval(timerInt);
  $('liveBadge').hidden = true;
  if (camStream) camStream.getTracks().forEach((t) => t.stop());
  if (screenTrack) screenTrack.stop();
  peers.forEach((p) => p.close());
  closeStudentPeer();
  video.srcObject = null;
  LessonLive.apply(null);
  $('wordOverlay').hidden = true;
  $('controls').innerHTML = '';
  if (socket) socket.disconnect();
  showState(emoji, title, text, true);
}

function startTimer(startedAt) {
  clearInterval(timerInt);
  const tick = () => ($('timer').innerHTML = `<i data-lucide="clock"></i> ${fmtDuration(Date.now() - startedAt)}`) && icons();
  tick();
  timerInt = setInterval(tick, 1000);
}

function showState(emoji, title, text, withBack = false) {
  const s = $('stageState');
  s.hidden = false;
  s.innerHTML = `<div>${emoji ? `<div class="emoji">${emoji}</div>` : '<div class="spinner"></div>'}
    <h2>${esc(title)}</h2><p>${esc(text || '')}</p>
    ${withBack ? `<a class="btn btn-primary" href="${Auth.home(me)}"><i data-lucide="arrow-left"></i> Về trang lớp học</a>` : ''}</div>`;
  icons();
}

function hideState() {
  if (!ended) $('stageState').hidden = true;
}
