// Phòng học trực tiếp: giáo viên phát (WebRTC 1 -> nhiều), học sinh xem
const me = Auth.require();
const classId = new URLSearchParams(location.search).get('class');
const isTeacher = me && ['teacher', 'admin'].includes(me.role);
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
const remoteAudio = new Map(); // socketId học sinh -> track âm thanh nhận được (trộn khi cho phép phát biểu)
let speakerSocket = null;      // socket của học sinh đang được phát biểu
addEventListener('beforeunload', (e) => { if (rec) { e.preventDefault(); e.returnValue = ''; } }); // đóng tab khi đang ghi sẽ mất bản ghi
let rec = null;                // bản ghi đang chạy { mr, chunks, canvas, timer, startedAt }
let listenEl = null;           // phần tử phát file nghe
let screenStream = null;       // luồng chia sẻ màn hình (có thể kèm âm thanh hệ thống)
const FAKE_MIC = new URLSearchParams(location.search).has('fakemic');
let capRec = null, capOn = false, ccHidden = false, capClear = null; // phụ đề trực tiếp
let LK = false;                // true khi máy chủ bật LiveKit: hình/tiếng đi qua LiveKit thay cho WebRTC P2P
let soundMuted = false;        // học sinh tắt tiếng (với LiveKit, tiếng phát bằng các phần tử <audio> riêng)
const lkPresent = new Set();   // userId đang có trong phòng LiveKit (giáo viên dùng để hiện trạng thái học sinh)
let mainMutedBefore = null;     // trạng thái âm thanh phòng chính trước khi vào phòng nhỏ // dùng âm thanh giả để thử khi không có micro

// Học sinh
let pc = null;
let handRaised = false;
const words = [];
let remoteStream = null;       // gom mọi track nhận từ giáo viên vào một luồng
let audioSender = null;        // sender âm thanh về phía giáo viên (chỉ phát khi được cho phép)
let micStream = null, speaking = false, mutedSelf = false;
let speaker = null;            // người đang phát biểu (cả lớp thấy)

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
  // Máy chủ bật LiveKit thì hình/tiếng đi qua LiveKit; thêm ?p2p=1 vào URL để ép dùng WebRTC P2P cũ (chỉ để thử/đối chiếu)
  try { LK = !new URLSearchParams(location.search).has('p2p') && (await LiveKitLive.isEnabled()); }
  catch (e) { return showState('🔌', 'Chưa đọc được cấu hình video', e.message, true); }
  $('liveSub').textContent += LK ? ' · ' + LiveKitLive.label : ' · P2P';
  LessonLive.init({
    isTeacher, socket: null, classId, stage: $('stage'), layer: $('slideLayer'), panel: $('lessonPanel'),
    onChange: () => aiChat && aiChat.reload(),
  });
  if (isTeacher) {
    showState(null, 'Đang bật camera & micro...', 'Hãy cho phép trình duyệt truy cập camera và micro.');
    await startMedia();
    if (LK) {
      try { await connectLiveKitTeacher(); } catch (e) { return showState('🔌', 'Không kết nối được máy chủ video (LiveKit)', e.message, true); }
    }
  }

  socket = connectSocket();
  LessonLive.init({ socket });
  PdfLive.init({ isTeacher, socket, classId, stage: $('stage'), layer: $('slideLayer'), panel: $('lessonPanel') });
  PadLive.init({ isTeacher, socket, stage: $('stage'), panel: $('padPanel') });
  BreakoutLive.init({ lk: LK, isTeacher, socket, stage: $('stage'), panel: $('boPanel'), getMedia: getBreakoutMedia, muteMain: setMainMuted, muteTeacherMain, teacherTracks: () => (camStream ? camStream.getTracks() : []) });
  socket.on('connect', joinRoom);
  socket.on('connect_error', () => toast('Mất kết nối máy chủ, đang thử lại...', 'error'));
  socket.on('chat', addChat);
  socket.on('viewers:count', (n) => { $('viewerCount').textContent = n; if (!isTeacher) $('peopleCount').textContent = words.length; });
  socket.on('word', showWord);
  socket.on('live:ended', ({ reason }) => finish('👋', 'Buổi học đã kết thúc', reason));
  socket.on('kicked', ({ reason }) => finish('🚪', 'Bạn đã rời buổi học', reason));
  socket.on('signal', onSignal);
  socket.on('lesson:state', (st) => LessonLive.apply(st));
  socket.on('speaker', onSpeaker);
  socket.on('caption', showCaption);
  socket.on('reaction', showReaction);

  if (isTeacher) {
    socket.on('viewer:joined', (v) => { viewers.set(v.socketId, v); if (LK) v.state = lkPresent.has(v.userId) ? 'connected' : 'connecting'; renderPeople(); if (!LK) callViewer(v.socketId); });
    socket.on('viewer:left', ({ socketId }) => { viewers.delete(socketId); closePeer(socketId); renderPeople(); });
    socket.on('hand', ({ socketId, name, raised }) => {
      const v = viewers.get(socketId);
      if (v) v.hand = raised;
      if (raised) toast(`✋ ${name} đang giơ tay`);
      renderPeople();
    });
  } else {
    // Với LiveKit, trạng thái giáo viên do chính phòng LiveKit báo (ParticipantConnected/Disconnected); socket chỉ là kênh điều khiển
    // và có thể rớt thoáng qua mà hình vẫn chạy, nên bỏ qua hai sự kiện này để lớp phủ không kẹt.
    socket.on('teacher:left', () => {
      if (LK) return;
      closeStudentPeer();
      showState('📡', 'Giáo viên tạm mất kết nối', 'Đang chờ giáo viên quay lại...');
    });
    socket.on('teacher:joined', () => { if (LK) return; showState(null, 'Giáo viên đã quay lại', 'Đang kết nối lại livestream...'); });
    socket.on('hand:lowered', () => { handRaised = false; renderControls(); toast('Giáo viên đã hạ tay của bạn'); });
    socket.on('speak:granted', startMic);
    socket.on('speak:revoked', ({ reason }) => stopMic(reason));
    socket.on('star:received', ({ count }) => { toast(`⭐ Bạn được tặng ${count} sao!`, 'success'); showReaction({ emoji: '⭐', name: me.name }); });
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
    onSpeaker(res.speaker || null);
    PdfLive.apply(res.pdf || null);
    PadLive.apply(res.pad || null);
    if (!isTeacher && LK) connectLiveKitStudent();
    if (isTeacher && res.breakout) BreakoutLive.setState(res.breakout);
    if (!isTeacher && res.breakout) BreakoutLive.rejoin(res.breakout);
    const wanted = new URLSearchParams(location.search).get('lesson');
    if (isTeacher && wanted && !res.lesson) LessonLive.present(wanted);
    if (isTeacher) {
      // Kết nối (lại) tới tất cả học sinh đang có mặt
      viewers.clear();
      res.viewers.forEach((v) => { viewers.set(v.socketId, v); if (LK) v.state = lkPresent.has(v.userId) ? 'connected' : 'connecting'; else callViewer(v.socketId); });
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
function fakeAudio(freq) {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const dest = ac.createMediaStreamDestination();
  osc.frequency.value = freq;
  gain.gain.value = 0.2;
  osc.connect(gain); gain.connect(dest); osc.start();
  return dest.stream.getAudioTracks()[0];
}

// Chất lượng camera giáo viên (gói LiveKit miễn phí có hạn mức băng thông: mức thấp hơn tiết kiệm hơn)
const CAM_QUALITY = {
  low: { label: 'Tiết kiệm', w: 640, h: 360, fps: 15, bitrate: 400000, note: '360p · khoảng 0,2 GB/giờ cho mỗi học sinh' },
  medium: { label: 'Cân bằng', w: 854, h: 480, fps: 24, bitrate: 800000, note: '480p · khoảng 0,35 GB/giờ cho mỗi học sinh' },
  high: { label: 'Cao', w: 1280, h: 720, fps: 25, bitrate: 1500000, note: '720p · khoảng 0,7 GB/giờ cho mỗi học sinh' },
};
function camQualityKey() {
  try { const k = localStorage.getItem('englive_cam_quality'); return CAM_QUALITY[k] ? k : 'high'; } catch { return 'high'; }
}
async function setCamQuality(key) {
  const q = CAM_QUALITY[key]; if (!q) return;
  try { localStorage.setItem('englive_cam_quality', key); } catch {}
  const vt = camStream && camStream.getVideoTracks()[0];
  // Camera thật: đổi độ phân giải/khung hình tại nguồn (ảnh hưởng cả P2P lẫn LiveKit)
  if (vt && !usingFallback) { try { await vt.applyConstraints({ width: { ideal: q.w }, height: { ideal: q.h }, frameRate: { ideal: q.fps } }); } catch { /* camera không hỗ trợ: giữ nguyên */ } }
  if (LK && typeof LiveKitLive !== 'undefined') { try { await LiveKitLive.setCameraQuality({ maxBitrate: q.bitrate, maxFramerate: q.fps }); } catch (e) { toast('Không đổi được chất lượng: ' + e.message, 'error'); return; } }
  toast('Chất lượng camera: ' + q.label + ' (' + q.note + ')');
  renderControls();
}
function qualityModal() {
  const cur = camQualityKey();
  const m = openModal(`<h3>Chất lượng camera</h3><p class="sub">Chọn thấp hơn để tiết kiệm băng thông (hạn mức LiveKit) và giúp học sinh mạng yếu xem mượt hơn. Đổi được ngay trong lúc đang dạy.</p>
    <div class="stack">${Object.entries(CAM_QUALITY).map(([k, q]) => `<label class="field" style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="radio" name="camq" value="${k}" ${k === cur ? 'checked' : ''} style="margin-top:4px"><span><b>${q.label}</b><br><small>${q.note}</small></span></label>`).join('')}</div>
    <p class="sub" style="margin-top:10px"><small>Chia sẻ màn hình dùng mức riêng. Slide đi qua kết nối điều khiển nên không tốn băng thông video.</small></p>`);
  m.querySelectorAll('input[name="camq"]').forEach((r) => (r.onchange = () => { setCamQuality(r.value); m.close && m.close(); }));
}

async function startMedia() {
  if (FAKE_MIC) {
    usingFallback = true;
    camStream = new MediaStream([fakeAudio(220), canvasTrack()]);
    camStream.getTracks().forEach((t) => outStream.addTrack(t));
    showLocalPreview();
    renderControls();
    return;
  }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: CAM_QUALITY[camQualityKey()].w }, height: { ideal: CAM_QUALITY[camQualityKey()].h }, frameRate: { ideal: CAM_QUALITY[camQualityKey()].fps }, ...devicePreferences('camera') }, audio: { echoCancellation: true, noiseSuppression: true, ...devicePreferences('microphone') } });
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
  // canvas.captureStream() ngừng phát khung hình khi tab bị ẩn (giáo viên chuyển tab/cửa sổ). Dùng MediaStreamTrackGenerator
  // (Chrome/Edge) để màn hình chờ luôn có hình dù tab ở nền; trình duyệt khác dùng captureStream như cũ.
  if (window.MediaStreamTrackGenerator && window.VideoFrame) {
    const gen = new MediaStreamTrackGenerator({ kind: 'video' });
    const writer = gen.writable.getWriter();
    setInterval(async () => {
      draw();
      const frame = new VideoFrame(canvas, { timestamp: performance.now() * 1000 });
      try { await writer.write(frame); } catch { /* track đã dừng */ }
      frame.close();
    }, 100);
    return gen;
  }
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
    // audio: true => nếu người dùng tick "Chia sẻ âm thanh" (tab/hệ thống), âm thanh đó được trộn vào luồng phát (dùng cho bài nghe)
    const st = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: true });
    screenStream = st;
    screenTrack = st.getVideoTracks()[0];
    screenTrack.onended = stopScreen;
    const sysAudio = st.getAudioTracks()[0];
    if (sysAudio) {
      ensureMixer();
      Mixer.attachSystem(sysAudio);
      toast('Đang chia sẻ cả âm thanh hệ thống', 'success');
    } else {
      toast('Đang chia sẻ màn hình (chưa có âm thanh — khi chọn, hãy tick "Chia sẻ âm thanh" nếu cần phát bài nghe)');
    }
    if (LK) LiveKitLive.publishScreen(screenTrack, sysAudio || null).catch((e) => toast('Không phát được màn hình: ' + e.message, 'error'));
    replaceVideo(screenTrack);
  } catch { /* người dùng huỷ */ }
}

function stopScreen() {
  if (!screenTrack) return;
  screenTrack.onended = null;
  if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
  screenStream = null;
  screenTrack = null;
  Mixer.detachSystem();
  if (LK) LiveKitLive.unpublishScreen();
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
  const groupTrack = BreakoutLive.teacherMedia.find(t => t.kind === kind);
  if (groupTrack) { groupTrack.enabled = !groupTrack.enabled; renderControls(); return; }
  const t = kind === 'audio' ? camStream.getAudioTracks()[0] : camStream.getVideoTracks()[0];
  if (!t) return toast(kind === 'audio' ? 'Không có micro.' : 'Không có camera.', 'error');
  if (LK) { LiveKitLive.toggleLocal(kind).then(renderControls); return; }
  t.enabled = !t.enabled;
  renderControls();
}

// ---------------- Giáo viên: WebRTC tới từng học sinh ----------------
async function callViewer(id) {
  if (!camStream) return;
  closePeer(id);
  const p = new RTCPeerConnection(RTC);
  peers.set(id, p);
  // Kênh âm thanh luôn là sendrecv: giáo viên phát (micro hoặc bản trộn) và nhận giọng học sinh khi được phép phát biểu
  const tr = p.addTransceiver('audio', { direction: 'sendrecv', streams: [outStream] });
  tr.sender.replaceTrack(audioSenderTrack(id));
  p.addTrack(currentVideoTrack(), outStream);
  p.ontrack = (e) => {
    if (e.track.kind !== 'audio') return;
    remoteAudio.set(id, e.track);
    if (speakerSocket === id && Mixer.active) Mixer.attachSpeaker(e.track);
  };
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
  remoteAudio.delete(id);
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
      pc.ontrack = (e) => {
        remoteStream = remoteStream || new MediaStream();
        remoteStream.addTrack(e.track);
        attachRemote(remoteStream);
      };
      pc.onicecandidate = (e) => e.candidate && socket.emit('signal', { to: from, data: { candidate: e.candidate } });
      pc.onconnectionstatechange = () => {
        if (pc && ['failed', 'disconnected'].includes(pc.connectionState)) showState('📶', 'Kết nối không ổn định', 'Đang thử kết nối lại...');
        if (pc && pc.connectionState === 'connected') hideState();
      };
      await pc.setRemoteDescription(data.sdp);
      // Mở sẵn đường âm thanh gửi về giáo viên (chưa có track); khi được cho phép phát biểu chỉ cần replaceTrack
      const at = pc.getTransceivers().find((t) => t.receiver.track && t.receiver.track.kind === 'audio');
      if (at) { at.direction = 'sendrecv'; audioSender = at.sender; }
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
  stopMic();
  remoteStream = null;
  audioSender = null;
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
  const panels = { chat: 'chatPanel', people: 'peoplePanel', lesson: 'lessonPanel', ai: 'aiPanel', breakout: 'boPanel', pad: 'padPanel' };
  $('tabLesson').hidden = !isTeacher;
  $('tabBo').hidden = !isTeacher;
  $('tabPad').hidden = !isTeacher;
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
  return `<button class="ctrl ${cls}" id="${id}" data-tip="${esc(label)}" aria-label="${esc(label)}"><i data-lucide="${icon}"></i><span class="lbl">${esc(label)}</span></button>`;
}
const SEP = '<span class="ctrl-sep" aria-hidden="true"></span>';

function renderControls() {
  const box = $('controls');
  if (isTeacher) {
    const a = BreakoutLive.teacherMedia.find(t => t.kind === 'audio') || (camStream && camStream.getAudioTracks()[0]);
    const v = BreakoutLive.teacherMedia.find(t => t.kind === 'video') || (camStream && camStream.getVideoTracks()[0]);
    const micOn = a && a.enabled, camOn = v && v.enabled;
    box.innerHTML =
      ctrl('cMic', micOn ? 'mic' : 'mic-off', micOn ? 'Micro' : 'Đã tắt mic', micOn ? '' : 'off') +
      ctrl('cCam', camOn ? 'video' : 'video-off', camOn ? 'Camera' : 'Đã tắt cam', camOn ? '' : 'off') +
      ctrl('cQuality', 'gauge', 'Chất lượng camera: ' + CAM_QUALITY[camQualityKey()].label) + SEP +
      ctrl('cScreen', screenTrack ? 'monitor-off' : 'monitor-up', screenTrack ? 'Dừng chia sẻ' : 'Chia sẻ màn hình', screenTrack ? 'on' : '') +
      ctrl('cListen', 'headphones', 'Phát file nghe', listenEl ? 'on' : '') +
      ctrl('cRec', rec ? 'circle-stop' : 'circle-dot', rec ? 'Dừng ghi ' + fmtDuration(Date.now() - rec.startedAt) : 'Ghi hình', rec ? 'danger rec' : '') + SEP +
      ctrl('cMuteAll', 'mic-off', 'Tắt mic lớp', speakerSocket ? 'on' : '') +
      ctrl('cCap', 'captions', capOn ? 'Tắt phụ đề' : 'Phụ đề', capOn ? 'on' : '') +
      ctrl('cWord', 'book-open-text', 'Thẻ từ vựng') + SEP +
      ctrl('cEnd', 'square', 'Kết thúc buổi học', 'danger');
    $('cMic').onclick = () => toggleTrack('audio');
    $('cCam').onclick = () => toggleTrack('video');
    $('cQuality').onclick = qualityModal;
    $('cScreen').onclick = toggleScreen;
    $('cWord').onclick = wordModal;
    $('cListen').onclick = listenModal;
    $('cRec').onclick = toggleRecord;
    $('cCap').onclick = toggleCaptions;
    $('cMuteAll').onclick = () => socket.emit('speak:revoke', null, () => toast('Đã tắt mic cả lớp'));
    $('cEnd').onclick = endLive;
  } else {
    box.innerHTML =
      ctrl('cHand', 'hand', handRaised ? 'Hạ tay' : 'Giơ tay', handRaised ? 'on' : '') +
      (speaking ? ctrl('cMyMic', mutedSelf ? 'mic-off' : 'mic', mutedSelf ? 'Mic đang tắt' : 'Bạn đang nói', mutedSelf ? 'off' : 'on') : '') +
      ctrl('cReact', 'smile', 'Cảm xúc') + SEP +
      ctrl('cCC', 'captions', ccHidden ? 'Hiện phụ đề' : 'Phụ đề', ccHidden ? 'off' : '') +
      ctrl('cSound', isSoundMuted() ? 'volume-x' : 'volume-2', isSoundMuted() ? 'Bật tiếng' : 'Âm thanh', isSoundMuted() ? 'off' : '') +
      ctrl('cFull', 'maximize', 'Toàn màn hình') + SEP +
      ctrl('cLeave', 'log-out', 'Rời lớp', 'danger');
    $('cHand').onclick = () => { handRaised = !handRaised; socket.emit('hand', { raised: handRaised }); renderControls(); };
    if ($('cMyMic')) $('cMyMic').onclick = () => { mutedSelf = !mutedSelf; if (micStream) micStream.getAudioTracks().forEach((t) => (t.enabled = !mutedSelf)); renderControls(); };
    $('cReact').onclick = reactPicker;
    $('cCC').onclick = () => { ccHidden = !ccHidden; if (ccHidden) $('captions').hidden = true; renderControls(); };
    $('cSound').onclick = () => { setSoundMuted(!isSoundMuted()); if (!isSoundMuted()) $('unmuteBtn')?.remove(); renderControls(); };
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
      <button class="icon-btn" data-star="${id}" title="Tặng sao (+10 điểm)"><i data-lucide="star"></i></button>
      <button class="icon-btn ${speakerSocket === id ? 'speaking' : ''}" data-speak="${id}" title="${speakerSocket === id ? 'Thu lại mic' : 'Cho phép phát biểu'}"><i data-lucide="${speakerSocket === id ? 'mic-off' : 'mic'}"></i></button>
      <button class="icon-btn" data-kick="${id}" title="Mời rời buổi học"><i data-lucide="user-x"></i></button>
    </div>`).join('')
    : '<div class="empty" style="color:#8885ab"><div class="emoji">👀</div>Chưa có học sinh nào vào xem.<br />Học sinh trong lớp sẽ nhận được thông báo.</div>';
  panel.querySelectorAll('[data-star]').forEach((b) => (b.onclick = () => socket.emit('star:give', { socketId: b.dataset.star, count: 1 })));
  panel.querySelectorAll('[data-speak]').forEach((b) => (b.onclick = () => {
    const id = b.dataset.speak;
    if (speakerSocket === id) return socket.emit('speak:revoke');
    ensureMixer(); // cần thao tác người dùng để bật bộ trộn âm thanh
    socket.emit('speak:grant', { socketId: id }, (r) => r && r.error && toast(r.error, 'error'));
  }));
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
  if (rec) return toast('Đang ghi hình: hãy dừng ghi và lưu bản ghi trước khi rời phòng.', 'error');
  if (socket) socket.emit('room:leave');
  location.href = Auth.home(me);
}

function finish(emoji, title, text) {
  ended = true;
  clearInterval(timerInt);
  $('liveBadge').hidden = true;
  if (rec) stopRecord();
  if (LK) LiveKitLive.disconnect();
  BreakoutLive.close();
  stopCaptions();
  if (listenEl) listenEl.pause();
  stopMic();
  if (camStream) camStream.getTracks().forEach((t) => t.stop());
  if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
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
  s.classList.toggle('fatal', !!withBack);
  s.innerHTML = `<div>${emoji ? `<div class="emoji">${emoji}</div>` : '<div class="spinner"></div>'}
    <h2>${esc(title)}</h2><p>${esc(text || '')}</p>
    ${withBack ? `<a class="btn btn-primary" href="${Auth.home(me)}"><i data-lucide="arrow-left"></i> Về trang lớp học</a>` : ''}</div>`;
  if (!ended && withBack) {
    const retry = document.createElement('button'); retry.className = 'btn btn-outline'; retry.textContent = 'Kết nối lại'; retry.onclick = () => location.reload(); s.querySelector('div').appendChild(retry);
  }
  icons();
}

function hideState() {
  if (!ended) $('stageState').hidden = true;
}

// ---------------- Âm thanh: trộn, phát biểu, file nghe ----------------
// Track âm thanh gửi cho một học sinh: chưa dùng bộ trộn thì gửi micro trực tiếp như trước
function audioSenderTrack(id) {
  if (!Mixer.active) return camStream ? camStream.getAudioTracks()[0] || null : null;
  return id === speakerSocket ? Mixer.exclTrack : Mixer.allTrack;
}

function refreshAudioSenders() {
  peers.forEach((p, id) => {
    const tr = p.getTransceivers().find((t) => t.receiver.track && t.receiver.track.kind === 'audio');
    if (tr) tr.sender.replaceTrack(audioSenderTrack(id)).catch(() => {});
  });
}

// Bật bộ trộn (gọi trong thao tác click) rồi chuyển mọi học sinh sang luồng trộn
function ensureMixer() {
  const wasActive = Mixer.active;
  Mixer.start(camStream && camStream.getAudioTracks()[0]);
  if (!wasActive) refreshAudioSenders();
}

function onSpeaker(info) {
  speaker = info;
  speakerSocket = info ? info.socketId : null;
  const badge = $('speakerBadge');
  badge.hidden = !info;
  if (info) badge.innerHTML = `<i data-lucide="mic"></i> ${esc(info.name)} đang phát biểu`;
  if (isTeacher) {
    const sv = info && viewers.get(info.socketId);
    const spTrack = LK ? (sv && LiveKitLive.audioTrackOf(sv.userId)) : remoteAudio.get(info && info.socketId);
    if (info && Mixer.active && spTrack) Mixer.attachSpeaker(spTrack, !LK);
    else Mixer.detachSpeaker();
    if (Mixer.active) refreshAudioSenders();
    renderPeople();
    renderControls();
  }
  icons();
}

async function startMic() {
  try {
    if (FAKE_MIC) micStream = new MediaStream([fakeAudio(660)]);
    else micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, ...devicePreferences('microphone') } });
    const track = micStream.getAudioTracks()[0];
    track.enabled = !mutedSelf;
    if (LK) await LiveKitLive.startSpeaking(track);
    else if (audioSender) await audioSender.replaceTrack(track);
    speaking = true;
    toast('🎤 Giáo viên cho phép bạn phát biểu — hãy nói nhé!', 'success');
  } catch {
    toast('Không bật được micro. Hãy cho phép trình duyệt dùng micro rồi nhờ giáo viên mời lại.', 'error');
  }
  renderControls();
}

function stopMic(reason) {
  if (!speaking && !micStream) return;
  speaking = false;
  mutedSelf = false;
  if (LK) LiveKitLive.stopSpeaking();
  else if (audioSender) audioSender.replaceTrack(null).catch(() => {});
  if (micStream) micStream.getTracks().forEach((t) => t.stop());
  micStream = null;
  if (reason) toast(reason);
  renderControls();
}

// File nghe: phát trong trình duyệt của giáo viên, trộn vào luồng nên cả lớp nghe cùng lúc với âm thanh gốc
function listenModal() {
  const m = openModal(`<h3>Phát file nghe 🎧</h3>
    <p class="sub">Chọn file âm thanh hoặc video (mp3, wav, m4a, mp4…). Cả lớp sẽ nghe đồng thời với âm thanh gốc; bạn có thể tạm dừng, tua, chỉnh âm lượng ngay trên thanh phát. Nên tắt micro của bạn khi phát.</p>
    <div class="field"><input type="file" id="listenFile" accept="audio/*,video/*" class="input" /></div>
    <div class="modal-actions"><button class="btn btn-outline" data-close>Đóng</button></div>`);
  m.querySelector('#listenFile').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    ensureMixer();
    if (!listenEl) {
      listenEl = document.createElement('audio');
      listenEl.controls = true;
      listenEl.className = 'listen-player';
      Mixer.attachFile(listenEl);
      if (LK) LiveKitLive.publishFile(Mixer.fileTrack).catch((e) => toast('Không phát được file nghe: ' + e.message, 'error'));
      const bar = document.createElement('div');
      bar.id = 'listenBar';
      bar.innerHTML = '<b></b>';
      bar.appendChild(listenEl);
      const close = document.createElement('button');
      close.className = 'icon-btn';
      close.title = 'Đóng trình phát';
      close.innerHTML = '<i data-lucide="x"></i>';
      close.onclick = () => { listenEl.pause(); listenEl.removeAttribute('src'); listenEl.load(); bar.remove(); listenEl = null; if (LK) LiveKitLive.unpublishFile(); renderControls(); };
      bar.appendChild(close);
      $('controls').before(bar);
    }
    listenEl.src = URL.createObjectURL(f);
    $('listenBar').querySelector('b').textContent = '🎧 ' + f.name;
    listenEl.play().catch(() => {});
    m.close();
    renderControls();
    icons();
  };
}

// ---------------- Ghi hình buổi học (video + âm thanh của giáo viên) ----------------
async function toggleRecord() {
  if (rec) return stopRecord();
  if (typeof MediaRecorder === 'undefined') return toast('Trình duyệt này không hỗ trợ ghi hình.', 'error');
  ensureMixer();
  // Cách 1 (ưu tiên): quay đúng khung sân khấu như học sinh thấy (slide, PDF, bảng viết, phụ đề, video giáo viên) bằng cách chia sẻ
  // chính tab này rồi cắt vùng theo phần tử sân khấu. Trình duyệt sẽ hiện hộp thoại xin quyền; hãy chọn tab EngLive hiện tại.
  let capStream = null, videoTrack = null, timer = null;
  try {
    toast('Hãy chọn tab EngLive này trong hộp thoại chia sẻ để ghi cả slide.');
    capStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 25 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' });
    videoTrack = capStream.getVideoTracks()[0];
    try {
      if (window.CropTarget && videoTrack.cropTo) await videoTrack.cropTo(await CropTarget.fromElement($('stage')));
    } catch { /* không cắt được (chọn màn hình/cửa sổ khác): ghi toàn bộ phần được chia sẻ */ }
  } catch {
    capStream = null;
    videoTrack = null;
  }
  let stream;
  if (videoTrack) {
    stream = new MediaStream([videoTrack, Mixer.allTrack]);
  } else {
    // Cách 2 (dự phòng): chỉ ghi video của giáo viên (camera hoặc màn hình chia sẻ), không có slide
    toast('Không quay được khung slide — chỉ ghi camera/màn hình của bạn.', 'error');
    const canvas = document.createElement('canvas');
    canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext('2d');
    // Vẽ lại phần tử video mỗi khung hình nên đổi giữa camera và chia sẻ màn hình vẫn được ghi liền mạch
    const draw = () => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1280, 720);
      const vw = video.videoWidth, vh = video.videoHeight;
      if (vw && vh) { const k = Math.min(1280 / vw, 720 / vh); ctx.drawImage(video, (1280 - vw * k) / 2, (720 - vh * k) / 2, vw * k, vh * k); }
    };
    draw();
    timer = setInterval(draw, 40);
    stream = canvas.captureStream(25);
    stream.addTrack(Mixer.allTrack);
  }
  const mime = ['video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1000000, audioBitsPerSecond: 64000 });
  const chunks = [];
  mr.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  const startedAt = Date.now();
  mr.onstop = () => {
    clearInterval(timer);
    if (capStream) capStream.getTracks().forEach((t) => t.stop());
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    const blob = new Blob(chunks, { type: 'video/webm' });
    // MediaRecorder không ghi thời lượng vào webm nên không tua được; thư viện này (MIT) bổ sung thông tin đó
    if (window.ysFixWebmDuration) window.ysFixWebmDuration(blob, seconds * 1000, (fixed) => saveRecordingModal(fixed, seconds));
    else saveRecordingModal(blob, seconds);
  };
  // Giáo viên bấm "Dừng chia sẻ" của trình duyệt -> kết thúc bản ghi
  if (videoTrack) videoTrack.onended = () => stopRecord();
  mr.start(2000);
  rec = { mr, startedAt, tick: setInterval(renderControls, 1000), withSlides: !!videoTrack };
  toast(videoTrack ? '● Đang ghi hình sân khấu (kèm slide)' : '● Đang ghi hình (chỉ camera/màn hình)', 'success');
  renderControls();
}

function stopRecord() {
  if (!rec) return;
  const r = rec;
  rec = null;
  clearInterval(r.tick);
  try { r.mr.stop(); } catch {}
  renderControls();
}

// Tải bản ghi lên theo từng phần nhỏ (mỗi yêu cầu vài chục MB) để không vướng giới hạn kích thước của tunnel/proxy; mỗi phần thử lại 3 lần
async function uploadRecording(blob, title, seconds, onProgress) {
  const auth = { Authorization: 'Bearer ' + Auth.token };
  const json = async (res) => { let d = null; try { d = await res.json(); } catch { /* không phải JSON */ } return d || {}; };
  const explain = (res, d) => d.error || (res.status === 404
    ? 'Máy chủ chưa có chức năng lưu bản ghi bản mới (đang chạy bản cũ). Hãy khởi động lại server (npm start) rồi bấm Tải về để không mất bản ghi.'
    : res.status === 413 ? 'Bản ghi bị từ chối vì quá lớn hoặc hết dung lượng. Hãy bấm Tải về.'
    : 'Tải lên thất bại (mã ' + res.status + '). Hãy bấm Tải về để giữ bản ghi.');
  const start = await fetch(`/api/classes/${classId}/recordings/start`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ total: blob.size }) });
  const sd = await json(start);
  if (!start.ok) throw new Error(explain(start, sd));
  const part = sd.partSize || 8 * 1024 * 1024;
  let offset = 0;
  while (offset < blob.size) {
    const end = Math.min(offset + part, blob.size);
    let ok = false, lastErr = 'Tải lên thất bại.';
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const res = await fetch(`/api/recordings/uploads/${sd.uploadId}`, { method: 'PUT', headers: { ...auth, 'X-Offset': String(offset), 'Content-Type': 'application/octet-stream' }, body: blob.slice(offset, end) });
        const d = await json(res);
        if (res.ok) { offset = d.size; ok = true; }
        else if (res.status === 409 && Number.isFinite(d.size)) { offset = d.size; ok = offset >= end; if (!ok) continue; } // máy chủ đã có tới vị trí này: tiếp tục từ đó
        else { lastErr = explain(res, d); if (res.status >= 400 && res.status < 500 && res.status !== 408) break; }
      } catch { lastErr = 'Mất kết nối khi tải lên.'; }
      if (!ok) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
    if (!ok) { fetch(`/api/recordings/uploads/${sd.uploadId}`, { method: 'DELETE', headers: auth }).catch(() => {}); throw new Error(lastErr + ' Hãy bấm Tải về để giữ bản ghi.'); }
    if (onProgress) onProgress(Math.min(99, Math.round(offset * 100 / blob.size)));
  }
  const fin = await fetch(`/api/recordings/uploads/${sd.uploadId}/finish`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ title, durationSec: seconds }) });
  const fd = await json(fin);
  if (!fin.ok) throw new Error(explain(fin, fd));
}

function saveRecordingModal(blob, seconds) {
  const mb = (blob.size / 1048576).toFixed(1);
  const url = URL.createObjectURL(blob);
  const m = openModal(`<h3>Đã ghi xong 🎬</h3>
    <p class="sub">Thời lượng ${fmtDuration(seconds * 1000)} · ${mb} MB. Lưu lên lớp để học sinh xem lại, hoặc tải về máy.</p>
    <div class="field"><label>Tên bản ghi</label><input class="input" id="recTitle" value="${esc($('liveTitle').textContent || 'Buổi học')}" /></div>
    <div class="form-error" id="recErr"></div>
    <div class="modal-actions">
      <button class="btn btn-outline" data-close>Bỏ</button>
      <a class="btn btn-outline" href="${url}" download="buoi-hoc.webm"><i data-lucide="download"></i> Tải về</a>
      <button class="btn btn-primary" id="recUp"><i data-lucide="upload"></i> Lưu lên lớp</button>
    </div>`);
  icons();
  m.querySelector('#recUp').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = 'Đang tải lên…';
    try {
      await uploadRecording(blob, m.querySelector('#recTitle').value, seconds, (pct) => { btn.textContent = 'Đang tải lên ' + pct + '%'; });
      toast('Đã lưu bản ghi cho lớp', 'success');
      m.close();
    } catch (err) {
      m.querySelector('#recErr').textContent = err.message;
      btn.disabled = false; btn.textContent = 'Thử lại';
    }
  };
}

// ---------------- Cảm xúc ----------------
const REACTIONS = ['👍', '❤️', '😂', '👏', '😮', '🎉', '🙋'];
function reactPicker() {
  let pop = $('reactPop');
  if (pop) return pop.remove();
  pop = document.createElement('div');
  pop.id = 'reactPop';
  pop.innerHTML = REACTIONS.map((e) => `<button type="button">${e}</button>`).join('');
  pop.querySelectorAll('button').forEach((b) => (b.onclick = () => { socket.emit('reaction', { emoji: b.textContent }); pop.remove(); }));
  $('controls').before(pop);
}

function showReaction({ emoji, name }) {
  const layer = $('reactLayer');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = 'react';
  el.style.left = 8 + Math.random() * 70 + '%';
  el.innerHTML = `<span>${emoji}</span><small>${esc(name || '')}</small>`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------------- Phụ đề trực tiếp ----------------
// Giáo viên: nhận dạng giọng nói bằng Web Speech API (Chrome/Edge, gửi âm thanh tới dịch vụ của trình duyệt), máy chủ chuyển chữ cho cả lớp
function toggleCaptions() {
  if (capOn) return stopCaptions();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast('Trình duyệt này không hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome hoặc Edge.', 'error');
  const m = openModal(`<h3>Phụ đề trực tiếp 💬</h3><p class="sub">Trình duyệt sẽ nghe micro của bạn và hiện chữ cho cả lớp. Chọn ngôn ngữ bạn đang nói.</p>
    <div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn btn-primary" data-lang="en-US">English (US)</button><button class="btn btn-outline" data-lang="en-GB">English (UK)</button><button class="btn btn-outline" data-lang="vi-VN">Tiếng Việt</button></div>`);
  m.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => { m.close(); startCaptions(b.dataset.lang, SR); }));
}

function startCaptions(lang, SR) {
  capRec = new SR();
  capRec.lang = lang;
  capRec.continuous = true;
  capRec.interimResults = true;
  capOn = true;
  capRec.onresult = (e) => {
    let interim = '', fin = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) fin += r[0].transcript; else interim += r[0].transcript;
    }
    if (fin.trim()) socket.emit('caption', { text: fin.trim(), final: true });
    else if (interim.trim()) socket.emit('caption', { text: interim.trim(), final: false });
  };
  // Chrome tự dừng sau một lúc im lặng: bật lại khi còn muốn phụ đề
  capRec.onend = () => { if (capOn) { try { capRec.start(); } catch {} } };
  capRec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { stopCaptions(); toast('Chưa được phép dùng micro để tạo phụ đề.', 'error'); } };
  try { capRec.start(); toast('Đang bật phụ đề trực tiếp', 'success'); } catch { capOn = false; }
  renderControls();
}

function stopCaptions() {
  if (!capOn && !capRec) return;
  capOn = false;
  if (capRec) { capRec.onend = null; try { capRec.stop(); } catch {} capRec = null; }
  $('captions').hidden = true;
  if (typeof renderControls === 'function' && !ended) renderControls();
}

function showCaption({ text, final }) {
  const box = $('captions');
  if (ccHidden && !isTeacher) return;
  box.textContent = text;
  box.hidden = false;
  box.classList.toggle('interim', !final);
  clearTimeout(capClear);
  capClear = setTimeout(() => (box.hidden = true), final ? 4500 : 7000);
}

// ---------------- Phòng nhỏ: hỗ trợ cho BreakoutLive ----------------
async function getBreakoutMedia() {
  if (FAKE_MIC) {
    let h = 0;
    for (const c of me.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return new MediaStream([fakeAudio(300 + (h % 400)), canvasTrack()]);
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360, ...devicePreferences('camera') }, audio: { echoCancellation: true, noiseSuppression: true, ...devicePreferences('microphone') } });
  } catch {
    return navigator.mediaDevices.getUserMedia({ audio: true }); // không có camera: chỉ tiếng
  }
}

// Tắt/mở tiếng phòng chính khi vào/ra phòng nhỏ (nhớ trạng thái cũ để trả lại)
function setMainMuted(on) {
  if (on && !isTeacher && speaking) stopMic();
  if (on) {
    if (mainMutedBefore === null) mainMutedBefore = isSoundMuted();
    setSoundMuted(true);
  } else if (mainMutedBefore !== null) {
    setSoundMuted(mainMutedBefore);
    mainMutedBefore = null;
  }
  renderControls();
}

// Tắt/mở tiếng người nghe: P2P dùng phần tử video; LiveKit dùng các phần tử <audio> riêng (video luôn tắt tiếng)
let teacherMicBeforeGroup = null;
async function muteTeacherMain(on) {
  const mic = camStream && camStream.getAudioTracks()[0];
  if (!mic) return;
  if (on) { if (teacherMicBeforeGroup === null) teacherMicBeforeGroup = mic.enabled; if (LK) await LiveKitLive.setTeacherMicMuted(true); else mic.enabled = false; }
  else if (teacherMicBeforeGroup !== null) { const enabled = teacherMicBeforeGroup; teacherMicBeforeGroup = null; if (LK) await LiveKitLive.setTeacherMicMuted(!enabled); else mic.enabled = enabled; }
  renderControls();
}
const isSoundMuted = () => (LK ? soundMuted : video.muted);
function setSoundMuted(m) {
  if (LK) { soundMuted = m; LiveKitLive.setMuted(m); return; }
  video.muted = m;
  if (!m) video.play().catch(() => {});
}

// ---------------- LiveKit ----------------
function lkHandlers() {
  return {
    isTeacher, classId, video,
    onPresence: (identity, on) => {
      if (on) lkPresent.add(identity); else lkPresent.delete(identity);
      if (isTeacher) { viewers.forEach((v) => { if (v.userId === identity) v.state = on ? 'connected' : 'disconnected'; }); renderPeople(); }
    },
    // Giọng học sinh phát biểu tới sau sự kiện "speaker": trộn vào bản ghi của giáo viên
    onAudio: (identity, track) => {
      const sv = isTeacher && speakerSocket && viewers.get(speakerSocket);
      if (sv && sv.userId === identity && Mixer.active) Mixer.attachSpeaker(track, false);
    },
    onFirstVideo: () => hideState(),
    // Giáo viên vào lại phòng LiveKit sau khi mất kết nối: phát lại camera/micro (và màn hình đang chia sẻ)
    onRejoined: async () => {
      if (!isTeacher || !camStream) return;
      // Ngắt kết nối có thể làm dừng track camera/micro: nếu vậy thì mở lại thiết bị trước khi phát
      if (camStream.getTracks().some((t) => t.readyState === 'ended')) { camStream.getTracks().forEach((t) => t.stop()); await startMedia(); }
      await LiveKitLive.publishTeacher({ audioTrack: camStream.getAudioTracks()[0], videoTrack: camStream.getVideoTracks()[0] });
      if (screenTrack) await LiveKitLive.publishScreen(screenTrack, null);
    },
    onTeacherGone: () => showState('📡', 'Giáo viên tạm mất kết nối', 'Đang chờ giáo viên quay lại...'),
    onTeacherBack: () => showState(null, 'Giáo viên đã quay lại', 'Đang kết nối lại livestream...'),
    onNetwork: (st) => {
      if (st === 'reconnecting') showState('📶', 'Kết nối không ổn định', 'Đang thử kết nối lại...');
      else if (st === 'ok') hideState();
      else if (st === 'lost' && !ended) showState('🔌', 'Mất kết nối video', 'Hãy tải lại trang để vào lại lớp.', true);
    },
  };
}

async function connectLiveKitTeacher() {
  await LiveKitLive.connect(lkHandlers());
  const q = CAM_QUALITY[camQualityKey()];
  await LiveKitLive.setCameraQuality({ maxBitrate: q.bitrate, maxFramerate: q.fps }); // chưa phát: chỉ đặt mức
  await LiveKitLive.publishTeacher({ audioTrack: camStream.getAudioTracks()[0], videoTrack: camStream.getVideoTracks()[0] });
}

let lkConnecting = false;
async function connectLiveKitStudent() {
  if (LiveKitLive.room || lkConnecting) return; // joinRoom chạy lại mỗi lần Socket.IO nối lại
  lkConnecting = true;
  try {
    await LiveKitLive.connect(lkHandlers());
    LiveKitLive.setMuted(soundMuted);
  } catch (e) {
    showState('🔌', 'Không kết nối được máy chủ video (LiveKit)', e.message, true);
  }
  lkConnecting = false;
}
