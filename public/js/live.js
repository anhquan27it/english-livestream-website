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
let ZOOM = false, selectedProvider = '', zoomState = ''; // zoomState: học sinh báo giáo viên đã vào Zoom hay chưa
let soundVolume = (() => { try { const v = parseFloat(localStorage.getItem('englive_volume')); return v >= 0 && v <= 1 ? v : 1; } catch { return 1; } })();
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
let spkPerms = { camera: false, screen: false }, myCamStream = null, myScreenStream = null; // học sinh được giáo viên cấp thêm camera/chia sẻ màn hình (cần LiveKit)
let autoSwapped = false;
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
    if (typeof WordPop !== 'undefined') WordPop.setClass(classId);
    selectedProvider = c.live?.provider || '';
    ZOOM = selectedProvider === 'zoom';
    $('liveTitle').textContent = c.live ? c.live.title : c.name;
    $('liveSub').textContent = `${c.name} · ${c.teacher}`;
    if (c.code) showClassCode(c.code); // chỉ giáo viên phụ trách/admin nhận được mã lớp
    if (!c.live) return showState('😴', 'Lớp học chưa bắt đầu', 'Giáo viên chưa mở livestream. Bạn sẽ thấy nút “Vào học” khi lớp lên sóng.', true);
  } catch (e) {
    return showState('🔒', 'Bạn không có quyền vào lớp này', e.message, true);
  }

  setupUi();
  // Máy chủ bật LiveKit thì hình/tiếng đi qua LiveKit; thêm ?p2p=1 vào URL để ép dùng WebRTC P2P cũ (chỉ để thử/đối chiếu)
  try { LK = !ZOOM && selectedProvider !== 'p2p' && (await LiveKitLive.isEnabled()); }
  catch (e) { return showState('🔌', 'Chưa đọc được cấu hình video', e.message, true); }
  if (selectedProvider === 'livekit' && !LK) return showState('🔌', 'Chưa kết nối được LiveKit', 'Admin cần kiểm tra cấu hình LiveKit của máy chủ.', true);
  $('liveSub').textContent += ZOOM ? ' · Zoom Meeting' : LK ? ' · ' + LiveKitLive.label : ' · P2P';
  if (!LK) video.volume = soundVolume;
  if (ZOOM) { $('stage').classList.add('zoom-mode'); $('zoomHost').hidden = false; initZoomGrip(); initZoomSplitter(); setZoomLayout(savedZoomLayout()); }
  LessonLive.init({
    isTeacher, socket: null, classId, stage: $('stage'), layer: $('slideLayer'), panel: $('lessonPanel'),
    onChange: () => aiChat && aiChat.reload(),
  });
  if (isTeacher && !ZOOM) {
    showState(null, 'Đang bật camera & micro...', 'Hãy cho phép trình duyệt truy cập camera và micro.');
    await startMedia();
  }

  socket = connectSocket();
  LessonLive.init({ socket });
  PdfLive.init({ isTeacher, socket, classId, stage: $('stage'), layer: $('slideLayer'), panel: $('lessonPanel') });
  TeacherPointer.init({ isTeacher, socket, stage: $('stage'), layer: $('slideLayer'), btn: $('ptrBtn') });
  PadLive.init({ isTeacher, socket, stage: $('stage'), panel: $('padPanel') });
  BreakoutLive.init({ lk: LK, isTeacher, socket, stage: $('stage'), panel: $('boPanel'), getMedia: getBreakoutMedia, muteMain: setMainMuted, muteTeacherMain, teacherTracks: () => (camStream ? camStream.getTracks() : []) });
  socket.on('connect', joinRoom);
  socket.on('video:changed', () => {
    if (rec) return toast('Admin đã đổi dịch vụ video. Hãy dừng, lưu bản ghi rồi tải lại trang để tiếp tục.', 'error');
    location.reload();
  });
  socket.on('connect_error', () => toast('Mất kết nối máy chủ, đang thử lại...', 'error'));
  socket.on('chat', addChat);
  socket.on('chat:limited', ({ error } = {}) => toast(error || 'Bạn gửi tin hơi nhanh.', 'error'));
  socket.on('rate:limited', () => toast('Bạn thao tác quá nhanh, hãy chậm lại một chút.', 'error'));
  socket.on('viewers:count', (n) => { $('viewerCount').textContent = n; if (!isTeacher) $('peopleCount').textContent = words.length; });
  socket.on('word', showWord);
  socket.on('live:ended', ({ reason }) => finish('👋', 'Buổi học đã kết thúc', reason));
  socket.on('kicked', ({ reason }) => finish('🚪', 'Bạn đã rời buổi học', reason));
  socket.on('signal', onSignal);
  socket.on('lesson:state', (st) => LessonLive.apply(st));
  socket.on('speaker', onSpeaker);
  socket.on('caption', showCaption);
  if (!isTeacher) socket.on('listen:state', applyListen); // file nghe đồng bộ (chế độ Zoom)
  socket.on('reaction', showReaction);

  if (isTeacher) {
    socket.on('viewer:joined', (v) => { viewers.set(v.socketId, v); if (LK) v.state = lkPresent.has(v.userId) ? 'connected' : 'connecting'; renderPeople(); if (!LK && !ZOOM) callViewer(v.socketId); });
    socket.on('viewer:zoom', ({ socketId, state }) => { const v = viewers.get(socketId); if (v) { v.zoom = state; renderPeople(); } });
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
      if (LK || ZOOM) return;
      closeStudentPeer();
      showState('📡', 'Giáo viên tạm mất kết nối', 'Đang chờ giáo viên quay lại...');
    });
    socket.on('teacher:joined', () => { if (LK || ZOOM) return; showState(null, 'Giáo viên đã quay lại', 'Đang kết nối lại livestream...'); });
    socket.on('hand:lowered', () => { handRaised = false; renderControls(); toast('Giáo viên đã hạ tay của bạn'); });
    socket.on('speak:granted', (d) => {
      spkPerms = (d && d.perms) || { camera: false, screen: false };
      if (ZOOM) { speaking = true; toast('🎤 Giáo viên mời bạn phát biểu — hãy bật micro trong khung Zoom rồi nói nhé!', 'success'); renderControls(); return; }
      startMic();
    });
    socket.on('speak:perms', ({ perms } = {}) => {
      const before = spkPerms;
      spkPerms = perms || { camera: false, screen: false };
      if (!spkPerms.camera) stopMyCam();
      if (!spkPerms.screen) stopMyScreen();
      if (spkPerms.camera && !before.camera) toast('📹 Giáo viên cho phép bạn bật camera', 'success');
      if (spkPerms.screen && !before.screen) toast('🖥 Giáo viên cho phép bạn chia sẻ màn hình', 'success');
      renderControls();
    });
    socket.on('speak:revoked', ({ reason }) => stopMic(reason));
    socket.on('star:received', ({ count }) => { toast(`⭐ Bạn được tặng ${count} sao!`, 'success'); showReaction({ emoji: '⭐', name: me.name }); });
  }
}

function joinRoom() {
  socket.emit('room:join', { classId }, (res) => {
    if (res.error) return finish('🔒', 'Không thể tham gia', res.error);
    live = res.live;
    if (selectedProvider && live.provider !== selectedProvider) return location.reload();
    $('liveTitle').textContent = live.title;
    $('liveBadge').hidden = false;
    $('viewerCount').textContent = live.viewers;
    startTimer(live.startedAt);
    showWord(res.word);
    LessonLive.apply(res.lesson);
    onSpeaker(res.speaker || null);
    PdfLive.apply(res.pdf || null);
    if (!isTeacher) applyListen(res.listen || null);
    PadLive.apply(res.pad || null);
    if (!isTeacher && LK) connectLiveKitStudent();
    if (ZOOM) {
      hideState();
      if (!isTeacher && zoomState) socket.emit('zoom:state', { state: zoomState }); // nối lại socket: báo lại trạng thái
      ZoomLive.connect({ classId, container: $('zoomHost'), onState: (s) => { zoomState = s; if (!isTeacher) socket.emit('zoom:state', { state: s }); }, onStatus: (message, error = false) => { $('zoomNotice').hidden = false; $('zoomNotice').textContent = message; $('zoomNotice').classList.toggle('error', error); } });
    }
    if (isTeacher && res.breakout) BreakoutLive.setState(res.breakout);
    if (!isTeacher && res.breakout) BreakoutLive.rejoin(res.breakout);
    const wanted = new URLSearchParams(location.search).get('lesson');
    if (isTeacher && wanted && !res.lesson) LessonLive.present(wanted);
    if (isTeacher) {
      // Kết nối (lại) tới tất cả học sinh đang có mặt
      viewers.clear();
      res.viewers.forEach((v) => { viewers.set(v.socketId, v); if (LK) v.state = lkPresent.has(v.userId) ? 'connected' : 'connecting'; else if (!ZOOM) callViewer(v.socketId); });
      renderPeople();
      if (LK) connectLiveKitTeacherAfterJoin(); else hideState();
    } else if (ZOOM) {
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

// Lý do cụ thể khi getUserMedia lỗi (trước đây mọi lỗi đều bị báo là "không tìm thấy thiết bị")
function mediaErrorText(e, what) {
  const n = (e && e.name) || '';
  if (!navigator.mediaDevices) return 'Trình duyệt chỉ cho dùng ' + what + ' ở trang HTTPS hoặc localhost. Hãy mở bằng địa chỉ https:// (ví dụ link Cloudflare).';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Trình duyệt đang chặn ' + what + '. Bấm biểu tượng ổ khóa cạnh địa chỉ → cho phép camera/micro (Brave: tắt Shields cho trang này), rồi tải lại trang.';
  if (n === 'NotReadableError' || n === 'AbortError') return what + ' đang được ứng dụng khác dùng (Zoom, Teams, tab khác…). Hãy tắt chúng rồi tải lại trang.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Không tìm thấy ' + what + (n === 'OverconstrainedError' ? ' đã chọn ở trang Kiểm tra thiết bị. Hãy chọn lại thiết bị.' : '. Kiểm tra thiết bị đã cắm và được bật trong hệ điều hành.');
  return 'Không mở được ' + what + (e && e.message ? ': ' + e.message : '.');
}

// Bố cục slide + Zoom: slide lớn (Zoom thu nhỏ ở góc) → Zoom lớn (slide thu nhỏ) → chia đôi; nhớ lựa chọn
const ZOOM_LAYOUTS = ['split', 'pip', 'zoom'], ZOOM_LAYOUT_LABEL = { split: 'Slide + Zoom', pip: 'Slide lớn', zoom: 'Zoom lớn' };
function savedZoomLayout() { try { const k = localStorage.getItem('englive_zoom_layout2'); return ZOOM_LAYOUTS.includes(k) ? k : 'split'; } catch { return 'split'; } }
// Khung Zoom nhỏ ("Slide lớn"): kéo để di chuyển khỏi chỗ đang che slide, − / + đổi cỡ; nhớ vị trí và cỡ
const ZOOM_PIP_KEY = 'englive_zoom_pip', ZOOM_SIZES = ['s', 'm', 'l'];
let zoomPip = (() => {
  try { const v = JSON.parse(localStorage.getItem(ZOOM_PIP_KEY)) || {}; return { size: ZOOM_SIZES.includes(v.size) ? v.size : 'm', x: typeof v.x === 'number' ? v.x : null, y: typeof v.y === 'number' ? v.y : null }; }
  catch { return { size: 'm', x: null, y: null }; }
})();
const saveZoomPip = () => { try { localStorage.setItem(ZOOM_PIP_KEY, JSON.stringify(zoomPip)); } catch { /* chế độ riêng tư */ } };
function applyZoomPip() {
  const st = $('stage'), host = $('zoomHost');
  if (st.dataset.zs !== zoomPip.size) st.dataset.zs = zoomPip.size;
  const pip = st.classList.contains('with-slide') && st.dataset.zl !== 'zoom' && st.dataset.zl !== 'split';
  if (!pip || zoomPip.x === null) { Object.assign(host.style, { left: '', top: '', right: '', bottom: '' }); return; }
  const sr = st.getBoundingClientRect(), hr = host.getBoundingClientRect();
  const left = Math.min(Math.max(0, zoomPip.x * sr.width), Math.max(0, sr.width - hr.width));
  const top = Math.min(Math.max(0, zoomPip.y * sr.height), Math.max(0, sr.height - hr.height));
  Object.assign(host.style, { left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto' });
}
// Thanh chia giữa slide và Zoom (bố cục "Slide + Zoom"): kéo để đổi tỉ lệ, nhớ lại lựa chọn
const ZOOM_W_KEY = 'englive_zoom_w';
function initZoomSplitter() {
  const st = $('stage');
  const set = (pct) => st.style.setProperty('--zw', Math.min(70, Math.max(25, pct)).toFixed(1) + '%');
  const saved = (() => { try { return parseFloat(localStorage.getItem(ZOOM_W_KEY)); } catch { return NaN; } })();
  if (saved) set(saved);
  const bar = document.createElement('div');
  bar.className = 'zoom-splitter'; bar.title = 'Kéo để đổi độ rộng Zoom (bấm đúp: 45% ↔ 65%)';
  st.appendChild(bar);
  const save = () => { try { localStorage.setItem(ZOOM_W_KEY, parseFloat(st.style.getPropertyValue('--zw'))); } catch { /* chế độ riêng tư */ } };
  bar.addEventListener('pointerdown', (e) => {
    e.preventDefault(); bar.setPointerCapture(e.pointerId); st.classList.add('zsplit-drag');
    const sr = st.getBoundingClientRect();
    const move = (ev) => set((sr.right - ev.clientX) / sr.width * 100);
    const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); st.classList.remove('zsplit-drag'); save(); window.dispatchEvent(new Event('resize')); };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  });
  bar.addEventListener('dblclick', () => { set(parseFloat(st.style.getPropertyValue('--zw')) > 55 ? 45 : 65); save(); window.dispatchEvent(new Event('resize')); });
}

function initZoomGrip() {
  const st = $('stage'), host = $('zoomHost');
  const g = document.createElement('div');
  g.className = 'zoom-grip';
  g.innerHTML = '<span class="zg-drag" title="Kéo để di chuyển khung Zoom (bấm đúp để về góc dưới)"><i data-lucide="grip-horizontal"></i></span><button type="button" data-zs="smaller" title="Thu nhỏ khung Zoom"><i data-lucide="minus"></i></button><button type="button" data-zs="bigger" title="Phóng to khung Zoom"><i data-lucide="plus"></i></button>';
  host.prepend(g); icons();
  g.querySelector('[data-zs="smaller"]').onclick = () => { zoomPip.size = ZOOM_SIZES[Math.max(0, ZOOM_SIZES.indexOf(zoomPip.size) - 1)]; saveZoomPip(); applyZoomPip(); };
  g.querySelector('[data-zs="bigger"]').onclick = () => {
    if (zoomPip.size === 'l') return setZoomLayout('zoom'); // đã lớn nhất: chuyển sang "Zoom lớn"
    zoomPip.size = ZOOM_SIZES[ZOOM_SIZES.indexOf(zoomPip.size) + 1]; saveZoomPip(); applyZoomPip();
  };
  const drag = g.querySelector('.zg-drag');
  drag.addEventListener('pointerdown', (e) => {
    e.preventDefault(); drag.setPointerCapture(e.pointerId);
    const hr = host.getBoundingClientRect(), sr = st.getBoundingClientRect(), dx = e.clientX - hr.left, dy = e.clientY - hr.top;
    const move = (ev) => {
      zoomPip.x = Math.min(Math.max(0, ev.clientX - dx - sr.left), sr.width - hr.width) / sr.width;
      zoomPip.y = Math.min(Math.max(0, ev.clientY - dy - sr.top), sr.height - hr.height) / sr.height;
      applyZoomPip();
    };
    const up = () => { drag.removeEventListener('pointermove', move); drag.removeEventListener('pointerup', up); drag.removeEventListener('pointercancel', up); saveZoomPip(); };
    drag.addEventListener('pointermove', move); drag.addEventListener('pointerup', up); drag.addEventListener('pointercancel', up);
  });
  drag.addEventListener('dblclick', () => { zoomPip.x = zoomPip.y = null; saveZoomPip(); applyZoomPip(); });
  new MutationObserver(applyZoomPip).observe(st, { attributes: true, attributeFilter: ['class', 'data-zl'] });
  addEventListener('resize', applyZoomPip);
}

function setZoomLayout(k) {
  $('stage').dataset.zl = k;
  try { localStorage.setItem('englive_zoom_layout2', k); } catch { /* chế độ riêng tư */ }
  $('swapBtn').title = 'Đang: ' + ZOOM_LAYOUT_LABEL[k] + ' — bấm để đổi cách hiển thị slide và Zoom';
  $('swapBtn').innerHTML = '<i data-lucide="layout-dashboard"></i> ' + ZOOM_LAYOUT_LABEL[k];
  icons();
  if (ZOOM && $('controls').childElementCount) renderControls(); // cập nhật nút bố cục đang chọn
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50); // slide vẽ lại theo khung mới
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
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: CAM_QUALITY[camQualityKey()].w }, height: { ideal: CAM_QUALITY[camQualityKey()].h }, frameRate: { ideal: CAM_QUALITY[camQualityKey()].fps }, ...devicePreferences('camera') }, audio: { ...micConstraints() } });
  } catch (e) {
    // Một thiết bị lỗi không được kéo theo thiết bị kia: thử riêng micro và camera, báo đúng lý do từng cái
    const gum = navigator.mediaDevices ? (c) => navigator.mediaDevices.getUserMedia(c) : () => Promise.reject(e);
    let audio = [], video = [], aErr = e, vErr = e;
    try { audio = (await gum({ audio: { ...micConstraints() } })).getAudioTracks(); } catch (x) { aErr = x; }
    if (!audio.length) { try { audio = (await gum({ audio: true })).getAudioTracks(); } catch (x) { aErr = x; } }
    try { video = (await gum({ video: true })).getVideoTracks(); } catch (x) { vErr = x; }
    usingFallback = !video.length;
    camStream = new MediaStream([...audio, video[0] || canvasTrack()]);
    if (!video.length) toast(mediaErrorText(vErr, 'camera') + (audio.length ? ' Đang phát màn hình chờ kèm micro.' : ''), 'error');
    if (!audio.length) toast(mediaErrorText(aErr, 'micro'), 'error');
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
  if (ZOOM) return;
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
  // Tab này là danh sách học sinh (giáo viên) hoặc từ vựng (học sinh): đổi tooltip và icon cho đúng
  const pb = $('tabPeople'); pb.dataset.tip = $('peopleLabel').textContent; pb.setAttribute('aria-label', pb.dataset.tip);
  if (!isTeacher) { const ic = pb.querySelector('[data-lucide]'); if (ic) ic.outerHTML = '<i data-lucide="book-open-text"></i>'; icons(); }
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
  $('tabBo').hidden = !isTeacher || ZOOM;
  $('tabPad').hidden = !isTeacher;
  $('tabAi').hidden = isTeacher;
  if (!isTeacher) aiChat = AiChat.mount($('aiPanel'), { classId, dark: true });
  document.querySelectorAll('[data-panel]').forEach((b) => (b.onclick = () => {
    document.querySelectorAll('[data-panel]').forEach((x) => x.classList.toggle('active', x === b));
    Object.entries(panels).forEach(([k, id]) => ($(id).hidden = b.dataset.panel !== k));
    $('chatBox').hidden = b.dataset.panel !== 'chat';
  }));
  $('swapBtn').onclick = () => { if (ZOOM) setZoomLayout(ZOOM_LAYOUTS[(ZOOM_LAYOUTS.indexOf($('stage').dataset.zl) + 1) % ZOOM_LAYOUTS.length]); else $('stage').classList.toggle('swap'); };
  addChat({ system: true, text: isTeacher ? 'Bạn đang ở phòng livestream. Chỉ học sinh trong lớp mới xem được.' : 'Welcome to class! Hãy dùng tiếng Anh khi chat nhé 😊' });
  renderControls();
  renderPeople();
}

// Mã lớp ở thanh trên: bấm để sao chép gửi cho học sinh xin vào lớp
function showClassCode(code) {
  const chip = $('codeChip');
  $('codeText').textContent = code;
  chip.hidden = false;
  chip.onclick = async () => {
    try { await navigator.clipboard.writeText(code); toast('Đã sao chép mã lớp ' + code, 'success'); }
    catch { toast('Mã lớp: ' + code); }
  };
  icons();
}

function ctrl(id, icon, label, cls = '') {
  return `<button class="ctrl ${cls}" id="${id}" data-tip="${esc(label)}" aria-label="${esc(label)}"><i data-lucide="${icon}"></i><span class="lbl">${esc(label)}</span></button>`;
}
const SEP = '<span class="ctrl-sep" aria-hidden="true"></span>';

const zoomPresence = (v) => ({ joined: '● Đang trong Zoom', waiting: '⏳ Đang chờ chủ trì cho vào Zoom', error: '⚠ Zoom lỗi — nhờ học sinh bấm Kết nối Zoom', left: 'Đã rời Zoom' }[v.zoom] || 'Đã vào EngLive · chưa vào Zoom');

function renderZoomControls() {
  const box = $('controls');
  const zl = $('stage').dataset.zl || 'split';
  box.innerHTML = ctrl('zReconnect', 'video', 'Kết nối Zoom') + SEP +
    ctrl('zLayoutSplit', 'columns-2', 'Bố cục: Slide + Zoom cân bằng (kéo thanh giữa để đổi tỉ lệ)', zl === 'split' ? 'on' : '') + ctrl('zLayoutPip', 'picture-in-picture-2', 'Bố cục: Slide lớn, Zoom thu nhỏ', zl === 'pip' ? 'on' : '') + ctrl('zLayoutZoom', 'monitor-play', 'Bố cục: Zoom / chia sẻ màn hình lớn', zl === 'zoom' ? 'on' : '') + SEP +
    (isTeacher ? ctrl('zLesson', 'presentation', 'Thêm / đổi bài giảng') + ctrl('zWord', 'book-open-text', 'Thẻ từ vựng') + ctrl('zListen', 'headphones', 'Phát file nghe (đồng bộ cho cả lớp)', zListen ? 'on' : '') + ctrl('zCap', 'captions', capOn ? 'Tắt phụ đề' : 'Phụ đề', capOn ? 'on' : '') + ctrl('zRecord', rec ? 'circle-stop' : 'circle-dot', rec ? 'Dừng ghi ' + fmtDuration(Date.now() - rec.startedAt) : 'Ghi tab kèm Zoom', rec ? 'danger rec' : '') : ctrl('zHand', 'hand', handRaised ? 'Hạ tay' : 'Giơ tay trong EngLive', handRaised ? 'on' : '') + (speaking ? ctrl('zSpeak', 'mic', 'Bạn được mời phát biểu — bật micro trong Zoom', 'on') : '') + ctrl('zReact', 'smile', 'Cảm xúc') + (lAudio ? '<input type="range" id="zVol" class="vol-range" min="0" max="100" value="' + Math.round(soundVolume * 100) + '" aria-label="Âm lượng file nghe" title="Âm lượng file nghe">' : '') + ctrl('zCC', 'captions', ccHidden ? 'Hiện phụ đề' : 'Phụ đề', ccHidden ? 'off' : '')) + SEP +
    ctrl('zFull', 'maximize', 'Toàn màn hình') + ctrl('zLeave', isTeacher ? 'square' : 'log-out', isTeacher ? 'Kết thúc buổi học' : 'Rời lớp', 'danger');
  $('zReconnect').onclick = ZoomLive.retry;
  $('zLayoutSplit').onclick = () => setZoomLayout('split'); $('zLayoutPip').onclick = () => setZoomLayout('pip'); $('zLayoutZoom').onclick = () => setZoomLayout('zoom');
  $('zFull').onclick = () => document.fullscreenElement ? document.exitFullscreen() : $('stage').requestFullscreen().catch(() => {});
  $('zLeave').onclick = isTeacher ? endLive : leave;
  if (isTeacher) { $('zLesson').onclick = () => LessonLive.openPicker(); $('zWord').onclick = wordModal; $('zListen').onclick = zoomListenModal; $('zCap').onclick = toggleCaptions; $('zRecord').onclick = toggleZoomRecord; }
  else { if ($('zVol')) $('zVol').oninput = (e) => setVolume(e.target.value / 100); $('zHand').onclick = () => { handRaised = !handRaised; socket.emit('hand', { raised: handRaised }); renderControls(); }; $('zReact').onclick = reactPicker; $('zCC').onclick = () => { ccHidden = !ccHidden; if (ccHidden) $('captions').hidden = true; renderControls(); }; }
  icons();
}

function renderControls() {
  if (ZOOM) return renderZoomControls();
  const box = $('controls');
  if (isTeacher) {
    const a = BreakoutLive.teacherMedia.find(t => t.kind === 'audio') || (camStream && camStream.getAudioTracks()[0]);
    const v = BreakoutLive.teacherMedia.find(t => t.kind === 'video') || (camStream && camStream.getVideoTracks()[0]);
    const micOn = a && a.enabled, camOn = v && v.enabled;
    box.innerHTML =
      ctrl('cMic', micOn ? 'mic' : 'mic-off', micOn ? 'Micro' : 'Đã tắt mic', micOn ? '' : 'off') +
      ctrl('cCam', camOn ? 'video' : 'video-off', camOn ? 'Camera' : 'Đã tắt cam', camOn ? '' : 'off') +
      ctrl('cQuality', 'gauge', 'Chất lượng camera: ' + CAM_QUALITY[camQualityKey()].label) + SEP +
      ctrl('cLesson', 'presentation', 'Thêm / đổi bài giảng', LessonLive.state ? 'on' : '') +
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
    $('cLesson').onclick = () => LessonLive.openPicker();
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
      (speaking && LK && spkPerms.camera ? ctrl('cMyCam', myCamStream ? 'video' : 'video-off', myCamStream ? 'Tắt camera của bạn' : 'Bật camera của bạn', myCamStream ? 'on' : 'off') : '') +
      (speaking && LK && spkPerms.screen ? ctrl('cMyScreen', myScreenStream ? 'monitor-off' : 'monitor-up', myScreenStream ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình của bạn', myScreenStream ? 'on' : '') : '') +
      ctrl('cReact', 'smile', 'Cảm xúc') + SEP +
      ctrl('cCC', 'captions', ccHidden ? 'Hiện phụ đề' : 'Phụ đề', ccHidden ? 'off' : '') +
      ctrl('cSound', isSoundMuted() ? 'volume-x' : 'volume-2', isSoundMuted() ? 'Bật tiếng' : 'Âm thanh', isSoundMuted() ? 'off' : '') +
      '<input type="range" id="cVol" class="vol-range" min="0" max="100" value="' + Math.round(soundVolume * 100) + '" aria-label="Âm lượng" title="Âm lượng">' +
      ctrl('cFull', 'maximize', 'Toàn màn hình') + SEP +
      ctrl('cLeave', 'log-out', 'Rời lớp', 'danger');
    $('cHand').onclick = () => { handRaised = !handRaised; socket.emit('hand', { raised: handRaised }); renderControls(); };
    if ($('cMyMic')) $('cMyMic').onclick = () => { mutedSelf = !mutedSelf; if (micStream) micStream.getAudioTracks().forEach((t) => (t.enabled = !mutedSelf)); renderControls(); };
    if ($('cMyCam')) $('cMyCam').onclick = toggleMyCam;
    if ($('cMyScreen')) $('cMyScreen').onclick = toggleMyScreen;
    $('cReact').onclick = reactPicker;
    $('cCC').onclick = () => { ccHidden = !ccHidden; if (ccHidden) $('captions').hidden = true; renderControls(); };
    $('cVol').oninput = (e) => setVolume(e.target.value / 100);
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
      <div class="info">${esc(v.name)}<small>${ZOOM ? zoomPresence(v) : v.state === 'connected' ? '● Đang xem' : v.state === 'failed' ? 'Kết nối lỗi' : 'Đang kết nối...'}</small></div>
      ${v.hand ? `<span class="hand">✋</span><button class="icon-btn" data-lower="${id}" title="Hạ tay"><i data-lucide="hand"></i></button>` : ''}
      <button class="icon-btn" data-star="${id}" title="Tặng sao (+10 điểm)"><i data-lucide="star"></i></button>
      ${`<button class="icon-btn ${speakerSocket === id ? 'speaking' : ''}" data-speak="${id}" title="${speakerSocket === id ? (ZOOM ? 'Thu lại lượt phát biểu' : 'Thu lại mic') : (ZOOM ? 'Mời phát biểu (học sinh tự bật mic trong Zoom)' : 'Cho phép phát biểu')}"><i data-lucide="${speakerSocket === id ? 'mic-off' : 'mic'}"></i></button>`}
      ${LK && speakerSocket === id ? `<button class="icon-btn ${speaker && speaker.perms && speaker.perms.camera ? 'speaking' : ''}" data-perm="camera" title="${speaker && speaker.perms && speaker.perms.camera ? 'Thu quyền camera' : 'Cho phép bật camera'}"><i data-lucide="video"></i></button><button class="icon-btn ${speaker && speaker.perms && speaker.perms.screen ? 'speaking' : ''}" data-perm="screen" title="${speaker && speaker.perms && speaker.perms.screen ? 'Thu quyền chia sẻ màn hình' : 'Cho phép chia sẻ màn hình'}"><i data-lucide="monitor-up"></i></button>` : ''}
      <button class="icon-btn" data-kick="${id}" title="Mời rời buổi học"><i data-lucide="user-x"></i></button>
    </div>`).join('')
    : '<div class="empty" style="color:#8885ab"><div class="emoji">👀</div>Chưa có học sinh nào vào xem.<br />Học sinh trong lớp sẽ nhận được thông báo.</div>';
  panel.querySelectorAll('[data-star]').forEach((b) => (b.onclick = () => socket.emit('star:give', { socketId: b.dataset.star, count: 1 })));
  panel.querySelectorAll('[data-speak]').forEach((b) => (b.onclick = () => {
    const id = b.dataset.speak;
    if (speakerSocket === id) return socket.emit('speak:revoke');
    if (!ZOOM) ensureMixer(); // cần thao tác người dùng để bật bộ trộn âm thanh
    socket.emit('speak:grant', { socketId: id }, (r) => r && r.error && toast(r.error, 'error'));
  }));
  panel.querySelectorAll('[data-perm]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.perm;
    socket.emit('speak:perms', { [k]: !(speaker && speaker.perms && speaker.perms[k]) }, (r) => r && r.error && toast(r.error, 'error'));
  }));
  panel.querySelectorAll('[data-lower]').forEach((b) => (b.onclick = () => socket.emit('hand:lower', { socketId: b.dataset.lower })));
  panel.querySelectorAll('[data-kick]').forEach((b) => (b.onclick = async () => {
    const v = viewers.get(b.dataset.kick);
    if (await confirmModal('Mời học sinh rời buổi học?', ZOOM ? 'Thao tác này xóa quyền truy cập EngLive. Chủ trì cần dùng Remove trong Zoom để xóa người đó khỏi cuộc họp và tắt cho phép vào lại.' : `${v ? v.name : 'Học sinh'} sẽ bị ngắt khỏi livestream này (vẫn ở trong lớp).`, 'Mời rời')) {
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
  if (ZOOM) ZoomLive.disconnect();
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
    else micStream = await navigator.mediaDevices.getUserMedia({ audio: { ...micConstraints() } });
    const track = micStream.getAudioTracks()[0];
    track.enabled = !mutedSelf;
    if (LK) await LiveKitLive.startSpeaking(track);
    else if (audioSender) await audioSender.replaceTrack(track);
    speaking = true;
    toast('🎤 Giáo viên cho phép bạn phát biểu — hãy nói nhé!', 'success');
  } catch (e) {
    toast(mediaErrorText(e, 'micro') + ' Sau đó nhờ giáo viên mời phát biểu lại.', 'error');
  }
  renderControls();
}

// ----- Học sinh: camera và chia sẻ màn hình khi được cấp quyền (LiveKit) -----
async function toggleMyCam() {
  if (myCamStream) return stopMyCam();
  try {
    let track;
    if (FAKE_MIC) track = canvasTrack();
    else track = (await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 20 }, ...devicePreferences('camera') } })).getVideoTracks()[0];
    myCamStream = new MediaStream([track]);
    await LiveKitLive.startStudentCamera(track);
    toast('📹 Camera của bạn đang hiển thị cho cả lớp', 'success');
  } catch (e) {
    stopMyCam();
    toast(e && /quyền phát/.test(e.message || '') ? e.message : mediaErrorText(e, 'camera'), 'error');
  }
  renderControls();
}
function stopMyCam() {
  if (!myCamStream) return;
  const s = myCamStream; myCamStream = null;
  if (LK) LiveKitLive.stopStudent('camera');
  s.getTracks().forEach((t) => t.stop());
  renderControls();
}
async function toggleMyScreen() {
  if (myScreenStream) return stopMyScreen();
  try {
    myScreenStream = FAKE_MIC ? new MediaStream([canvasTrack()]) : await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: true });
    const v = myScreenStream.getVideoTracks()[0];
    v.onended = () => stopMyScreen();
    await LiveKitLive.startStudentScreen(v, myScreenStream.getAudioTracks()[0] || null);
    toast('🖥 Bạn đang chia sẻ màn hình cho cả lớp', 'success');
  } catch (e) {
    stopMyScreen();
    if (!e || e.name !== 'NotAllowedError') toast('Không chia sẻ được màn hình: ' + (e && e.message ? e.message : ''), 'error');
  }
  renderControls();
}
function stopMyScreen() {
  if (!myScreenStream) return;
  const s = myScreenStream; myScreenStream = null;
  if (LK) LiveKitLive.stopStudent('screen');
  s.getTracks().forEach((t) => { t.onended = null; t.stop(); });
  renderControls();
}

function stopMic(reason) {
  if (!speaking && !micStream) return;
  stopMyCam(); stopMyScreen();
  spkPerms = { camera: false, screen: false };
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
// ---------------- File nghe đồng bộ (Zoom không trộn được âm thanh vào luồng) ----------------
// Giáo viên tải file lên máy chủ và điều khiển; mỗi học sinh tự phát file trên máy mình và bám theo vị trí giáo viên.
let zListen = null; // { el, bar } phía giáo viên
function zoomListenModal() {
  const m = openModal(`<h3>Phát file nghe 🎧</h3>
    <p class="sub">Chọn file âm thanh (mp3, wav, m4a, ogg, flac, mp4…, tối đa 30 MB). File được gửi tới máy từng học sinh và phát đồng bộ với bạn: bạn phát/tạm dừng/tua thì cả lớp theo. <b>Hãy tắt mic Zoom của bạn khi phát</b> để tránh vọng, vì học sinh nghe file trực tiếp trên máy họ.</p>
    <div class="field"><input type="file" id="listenFile" accept="audio/*,video/mp4" class="input" /></div>
    <div class="modal-actions"><button class="btn btn-outline" data-close>Đóng</button></div>`);
  m.querySelector('#listenFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 30 * 1048576) return toast('File quá lớn (tối đa 30 MB).', 'error');
    e.target.disabled = true;
    toast('Đang gửi file nghe tới lớp…');
    try {
      const res = await fetch(`/api/classes/${classId}/listening`, { method: 'POST', headers: { Authorization: 'Bearer ' + Auth.token, 'X-Filename': encodeURIComponent(f.name) }, body: f });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Không gửi được file.');
    } catch (err) { m.close(); return toast(err.message, 'error'); }
    m.close();
    openZoomListenBar(f);
  };
}

function openZoomListenBar(f) {
  if (zListen) { zListen.el.pause(); zListen.bar.remove(); }
  const el = document.createElement('audio');
  el.controls = true; el.className = 'listen-player'; el.src = URL.createObjectURL(f);
  const bar = document.createElement('div');
  bar.id = 'listenBar'; bar.innerHTML = '<b>🎧 ' + esc(f.name) + '</b>';
  bar.appendChild(el);
  const close = document.createElement('button');
  close.className = 'icon-btn'; close.title = 'Dừng và đóng file nghe'; close.innerHTML = '<i data-lucide="x"></i>';
  close.onclick = () => { socket.emit('listen:stop'); el.pause(); el.removeAttribute('src'); el.load(); bar.remove(); zListen = null; renderControls(); };
  bar.appendChild(close);
  $('controls').before(bar);
  const send = () => socket.emit('listen:control', { playing: !el.paused && !el.ended, position: el.currentTime });
  let last = 0;
  el.addEventListener('play', send); el.addEventListener('pause', send); el.addEventListener('seeked', send); el.addEventListener('ended', send);
  el.addEventListener('timeupdate', () => { if (!el.paused && Date.now() - last > 8000) { last = Date.now(); send(); } }); // gửi định kỳ để học sinh chỉnh lệch
  zListen = { el, bar };
  renderControls(); icons();
}

// Học sinh: bám theo trạng thái file nghe của giáo viên
let lState = null, lAudio = null, lBar = null;
function stopListen() {
  if (lAudio) { lAudio.pause(); lAudio.removeAttribute('src'); lAudio.load(); }
  if (lBar) lBar.remove();
  lAudio = lBar = lState = null;
  if (ZOOM) renderControls();
}
function applyListen(st) {
  if (!st) return stopListen();
  lState = st;
  if (!lAudio || lAudio.dataset.id !== st.id) {
    stopListen(); lState = st;
    lAudio = document.createElement('audio');
    lAudio.dataset.id = st.id; lAudio.preload = 'auto'; lAudio.volume = soundVolume;
    lAudio.src = st.url + '?token=' + encodeURIComponent(Auth.token);
    lBar = document.createElement('div');
    lBar.id = 'listenBar';
    lBar.innerHTML = '<b>🎧 ' + esc(st.name) + '</b><span class="sub" data-note style="font-size:12px;color:#a9a6c9">Giáo viên đang điều khiển file nghe</span><button class="btn btn-sm btn-accent" data-tap hidden><i data-lucide="play"></i> Bấm để nghe</button>';
    lBar.querySelector('[data-tap]').onclick = () => { lBar.querySelector('[data-tap]').hidden = true; lAudio.play().catch(() => {}); };
    $('controls').before(lBar); icons();
    if (ZOOM) renderControls(); // hiện thanh âm lượng file nghe
  }
  const el = lAudio, want = Math.max(0, st.position || 0);
  const sync = () => { if (Math.abs(el.currentTime - want) > 1) { try { el.currentTime = want; } catch { /* chưa tải xong: thử lại khi có metadata */ } } };
  if (el.readyState >= 1) sync(); else el.addEventListener('loadedmetadata', sync, { once: true });
  if (st.playing) {
    el.play().then(() => { const t = lBar && lBar.querySelector('[data-tap]'); if (t) t.hidden = true; }).catch(() => { const t = lBar && lBar.querySelector('[data-tap]'); if (t) t.hidden = false; }); // trình duyệt chặn tự phát: cần bấm
  } else el.pause();
}

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
async function toggleZoomRecord() {
  if (rec) return stopRecord();
  if (!window.MediaRecorder || !navigator.mediaDevices?.getDisplayMedia) return toast('Ghi tab cần Chrome/Edge trên máy tính.', 'error');
  let capture, mic, context;
  try {
    toast('Chọn tab EngLive hiện tại và bật Chia sẻ âm thanh tab.');
    capture = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include' });
    if (!capture.getAudioTracks().length) throw new Error('Chưa chọn âm thanh tab. Hãy thử lại và bật Chia sẻ âm thanh tab để thu được tiếng Zoom.');
    mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    for (const stream of [capture, mic]) context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(destination);
    const stream = new MediaStream([...capture.getVideoTracks(), ...destination.stream.getAudioTracks()]);
    const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const mr = new MediaRecorder(stream, { mimeType }), chunks = [], startedAt = Date.now();
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      for (const s of [capture, mic]) s.getTracks().forEach(t => t.stop()); context.close();
      const seconds = Math.round((Date.now() - startedAt) / 1000), blob = new Blob(chunks, { type: 'video/webm' });
      if (window.ysFixWebmDuration) window.ysFixWebmDuration(blob, seconds * 1000, fixed => saveRecordingModal(fixed, seconds)); else saveRecordingModal(blob, seconds);
    };
    capture.getVideoTracks()[0].onended = stopRecord;
    mr.start(2000); rec = { mr, startedAt, tick: setInterval(renderControls, 1000), withSlides: true }; renderControls();
  } catch (err) {
    for (const s of [capture, mic]) s?.getTracks().forEach(t => t.stop()); context?.close();
    if (err.name !== 'NotAllowedError') toast(err.message || 'Không ghi được tab.', 'error');
  }
}

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
    return await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360, ...devicePreferences('camera') }, audio: { ...micConstraints() } });
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
function setVolume(v) {
  soundVolume = Math.min(1, Math.max(0, v));
  try { localStorage.setItem('englive_volume', String(soundVolume)); } catch { /* chế độ riêng tư */ }
  if (lAudio) lAudio.volume = soundVolume; // file nghe đồng bộ (Zoom)
  if (LK) LiveKitLive.setVolume(soundVolume); else video.volume = soundVolume;
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
    // Hết màn hình học sinh chia sẻ: giáo viên quay lại xem hình của chính mình
    onLocalPreview: () => { if (isTeacher && camStream) showLocalPreview(); },
    // Học sinh chia sẻ màn hình: ghi chú tên + tự đổi khung nếu đang chiếu slide để màn hình đó hiện lớn
    onSpeakerScreen: (on, name) => {
      const note = $('spkNote'), st = $('stage');
      note.hidden = !on;
      if (on) note.textContent = '🖥 ' + name + ' đang chia sẻ màn hình';
      if (on && st.classList.contains('with-slide') && !st.classList.contains('swap')) { st.classList.add('swap'); autoSwapped = true; }
      else if (!on && autoSwapped) { st.classList.remove('swap'); autoSwapped = false; }
    },
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

let lkTeacherConnecting = false;
async function connectLiveKitTeacherAfterJoin() {
  if (LiveKitLive.room || lkTeacherConnecting) return;
  lkTeacherConnecting = true;
  try { await connectLiveKitTeacher(); if (!ended) hideState(); }
  catch (e) { if (!ended) showState('🔌', 'Không kết nối được máy chủ video (LiveKit)', e.message, true); }
  finally { lkTeacherConnecting = false; }
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
    LiveKitLive.setVolume(soundVolume);
  } catch (e) {
    showState('🔌', 'Không kết nối được máy chủ video (LiveKit)', e.message, true);
  }
  lkConnecting = false;
}
