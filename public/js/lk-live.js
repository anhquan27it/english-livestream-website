// Video/âm thanh qua LiveKit (SFU) — thay cho WebRTC P2P cũ khi máy chủ bật LiveKit (xem livekit.js ở thư mục gốc).
// Socket.IO vẫn là kênh điều khiển (chấm điểm, quyền, chat...); module này chỉ lo luồng hình/tiếng:
//  - giáo viên: phát camera, micro, màn hình (+ âm thanh hệ thống) và file nghe
//  - học sinh: xem/nghe; khi được cho phát biểu thì phát micro (máy chủ cấp quyền phát trong token/permission)
//  - phòng nhóm (breakout): mỗi nhóm là một phòng LiveKit riêng, ai cũng phát camera + micro
const LiveKitLive = (() => {
  const lib = () => window.LivekitClient;
  const o = {};                    // { isTeacher, classId, video, onTeacherGone, onTeacherBack, onFirstVideo, onPresence, onAudio, onAudioGone }
  let room = null;
  let micPub = null, camPub = null, screenPub = null, screenAudioPub = null, filePub = null;
  const videos = {};               // 'screen' | 'camera' -> RemoteTrack đang nhận từ giáo viên
  const audioEls = new Map();      // trackSid -> <audio>
  const audioByUser = new Map();   // identity -> MediaStreamTrack (để giáo viên trộn khi ghi hình)
  let muted = false;
  let current = null;              // video track đang gắn vào o.video
  let closing = false;
  let serverUrl = '';

  const Source = () => lib().Track.Source;
  const holder = () => {
    let h = document.getElementById('lkAudio');
    if (!h) { h = document.createElement('div'); h.id = 'lkAudio'; h.hidden = true; document.body.appendChild(h); }
    return h;
  };

  async function token(groupId) {
    return api('/api/livekit/token', { method: 'POST', body: { classId: o.classId, groupId } });
  }

  async function isEnabled() {
    const c = (await api('/api/config')).livekit;
    serverUrl = c && c.url || '';
    if (c && c.enabled && !lib()) throw new Error('Không tải được thư viện LiveKit. Hãy tải lại trang.');
    return !!(c && c.enabled);
  }

  function makeRoom() {
    return new (lib().Room)({ adaptiveStream: true, dynacast: true, stopLocalTrackOnUnpublish: false });
  }

  // ----- Phòng chính -----
  async function connect(opts) {
    Object.assign(o, opts);
    closing = false;
    const t = await token();
    room = makeRoom();
    wireMain(room);
    try { await room.connect(t.url, t.token); }
    catch (e) { await disconnect(); throw e; }
    // Người đã có trong phòng trước khi mình vào
    room.remoteParticipants.forEach((p) => {
      if (o.onPresence) o.onPresence(p.identity, true);
      if (!o.isTeacher && isTeacherP(p) && o.onTeacherBack) o.onTeacherBack();
    });
    return room;
  }

  const isTeacherP = (p) => { try { return ['teacher', 'admin'].includes(JSON.parse(p.metadata || '{}').role); } catch { return false; } };

  function wireMain(r) {
    const E = lib().RoomEvent;
    r.on(E.TrackSubscribed, (track, pub, p) => {
      if (track.kind === 'video') {
        videos[pub.source === Source().ScreenShare ? 'screen' : 'camera'] = track;
        renderVideo();
        if (o.onFirstVideo) o.onFirstVideo();
      } else if (track.kind === 'audio') {
        const el = track.attach();
        el.muted = muted;
        holder().appendChild(el);
        audioEls.set(track.sid, el);
        audioByUser.set(p.identity, track.mediaStreamTrack);
        if (o.onAudio) o.onAudio(p.identity, track.mediaStreamTrack);
      }
    });
    r.on(E.TrackUnsubscribed, (track, pub, p) => {
      if (track.kind === 'video') {
        const key = pub.source === Source().ScreenShare ? 'screen' : 'camera';
        if (videos[key] === track) delete videos[key];
        track.detach();
        renderVideo();
      } else if (track.kind === 'audio') {
        track.detach().forEach((el) => el.remove());
        audioEls.delete(track.sid);
        if (audioByUser.get(p.identity) === track.mediaStreamTrack) audioByUser.delete(p.identity);
        if (o.onAudioGone) o.onAudioGone(p.identity);
      }
    });
    r.on(E.ParticipantConnected, (p) => {
      if (o.onPresence) o.onPresence(p.identity, true);
      if (!o.isTeacher && isTeacherP(p) && o.onTeacherBack) o.onTeacherBack();
    });
    r.on(E.ParticipantDisconnected, (p) => {
      if (o.onPresence) o.onPresence(p.identity, false);
      if (!o.isTeacher && isTeacherP(p) && o.onTeacherGone) o.onTeacherGone();
    });
    r.on(E.AudioPlaybackStatusChanged, () => { if (!r.canPlaybackAudio) needGesture(); });
    r.on(E.Reconnecting, () => { if (o.onNetwork) o.onNetwork('reconnecting'); });
    r.on(E.Reconnected, () => { if (o.onNetwork) o.onNetwork('ok'); });
    r.on(E.Disconnected, () => { if (!closing && o.onNetwork) o.onNetwork('lost'); });
  }

  // Ưu tiên màn hình giáo viên chia sẻ, nếu không có thì camera
  function renderVideo() {
    const want = videos.screen || videos.camera || null;
    if (want === current) return;
    if (current) current.detach(o.video);
    current = want;
    if (want) {
      want.attach(o.video);
      o.video.muted = true; // âm thanh do các phần tử <audio> riêng phát; phần tử video chỉ hiển thị hình
      o.video.play().catch(() => {});
    } else {
      o.video.srcObject = null;
    }
  }

  function needGesture() {
    if (document.getElementById('unmuteBtn')) return;
    const b = document.createElement('button');
    b.id = 'unmuteBtn';
    b.className = 'btn btn-accent';
    b.style.cssText = 'position:absolute;top:14px;right:14px;z-index:5';
    b.innerHTML = '<i data-lucide="volume-x"></i> Bấm để bật tiếng';
    b.onclick = async () => { await room.startAudio(); b.remove(); };
    document.getElementById('stage').appendChild(b);
    if (window.lucide) lucide.createIcons();
  }

  function setMuted(m) {
    muted = !!m;
    audioEls.forEach((el) => { el.muted = muted; });
  }

  // ----- Giáo viên phát -----
  let camEnc = { maxBitrate: 1500000, maxFramerate: 25 };
  const cam = () => ({ simulcast: true, videoEncoding: camEnc });

  // Đổi chất lượng camera: đặt mức bitrate/khung hình cho lần phát tới, và phát lại ngay nếu đang phát camera
  async function setCameraQuality({ maxBitrate, maxFramerate }) {
    camEnc = { maxBitrate, maxFramerate };
    const lp = room && room.localParticipant;
    if (!lp || !camPub || !camPub.track) return;
    const track = camPub.track, wasMuted = camPub.isMuted;
    await lp.unpublishTrack(track, false);
    camPub = await lp.publishTrack(track, { source: Source().Camera, name: 'camera', ...cam() });
    if (wasMuted) await camPub.mute();
  }

  async function publishTeacher({ audioTrack, videoTrack }) {
    const lp = room.localParticipant;
    if (audioTrack) micPub = await lp.publishTrack(audioTrack, { source: Source().Microphone, name: 'mic' });
    if (videoTrack) camPub = await lp.publishTrack(videoTrack, { source: Source().Camera, name: 'camera', ...cam() });
  }

  async function toggleLocal(kind) {
    const pub = kind === 'audio' ? micPub : camPub;
    if (!pub || !pub.track) return;
    if (pub.isMuted) await pub.unmute(); else await pub.mute();
  }

  async function publishScreen(videoTrack, audioTrack) {
    const lp = room.localParticipant;
    screenPub = await lp.publishTrack(videoTrack, { source: Source().ScreenShare, name: 'screen', simulcast: false, videoEncoding: { maxBitrate: 2500000, maxFramerate: 15 } });
    if (audioTrack) screenAudioPub = await lp.publishTrack(audioTrack, { source: Source().ScreenShareAudio, name: 'screen-audio' });
  }

  async function unpublishScreen() {
    const lp = room && room.localParticipant;
    if (!lp) return;
    if (screenPub && screenPub.track) await lp.unpublishTrack(screenPub.track, false);
    if (screenAudioPub && screenAudioPub.track) await lp.unpublishTrack(screenAudioPub.track, false);
    screenPub = screenAudioPub = null;
  }

  // File nghe: một track âm thanh riêng; cả lớp nghe cùng lúc với micro của giáo viên
  async function setTeacherMicMuted(muted) { if (micPub && micPub.track) { if (muted) await micPub.mute(); else await micPub.unmute(); } }
  async function publishFile(track) {
    if (filePub) return;
    filePub = await room.localParticipant.publishTrack(track, { source: Source().Unknown, name: 'listening' });
  }
  async function unpublishFile() {
    if (filePub && filePub.track) await room.localParticipant.unpublishTrack(filePub.track, false);
    filePub = null;
  }

  // ----- Học sinh phát biểu -----
  let speakerPub = null;
  async function waitCanPublish(ms = 4000) {
    const lp = room.localParticipant;
    const t0 = Date.now();
    while (!(lp.permissions && lp.permissions.canPublish) && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 100));
    return !!(lp.permissions && lp.permissions.canPublish);
  }
  async function startSpeaking(track) {
    if (!(await waitCanPublish())) throw new Error('Chưa được cấp quyền phát micro.');
    speakerPub = await room.localParticipant.publishTrack(track, { source: Source().Microphone, name: 'mic' });
  }
  async function stopSpeaking() {
    if (speakerPub && speakerPub.track) { try { await room.localParticipant.unpublishTrack(speakerPub.track, false); } catch {} }
    speakerPub = null;
  }
  const setSpeakerMuted = async (m) => { if (speakerPub && speakerPub.track) { if (m) await speakerPub.mute(); else await speakerPub.unmute(); } };

  // ----- Phòng nhóm -----
  // handlers: { onTrack(identity, name, track), onTrackGone(identity, track), onGone(identity) }
  async function joinGroup(groupId, tracks, handlers) {
    const t = await token(groupId);
    const r = makeRoom();
    const E = lib().RoomEvent;
    r.on(E.TrackSubscribed, (track, pub, p) => {
      if (track.kind === 'audio') { const el = track.attach(); el.dataset.lkGroup = '1'; holder().appendChild(el); }
      handlers.onTrack(p.identity, p.name || p.identity, track);
    });
    r.on(E.TrackUnsubscribed, (track, pub, p) => {
      const detached = track.detach();
      if (track.kind === 'audio') detached.forEach((el) => el.remove());
      handlers.onTrackGone(p.identity, track);
    });
    r.on(E.ParticipantDisconnected, (p) => handlers.onGone(p.identity));
    await r.connect(t.url, t.token);
    for (const tr of tracks) {
      await r.localParticipant.publishTrack(tr, tr.kind === 'video' ? { source: Source().Camera, simulcast: false, videoEncoding: { maxBitrate: 600000, maxFramerate: 24 } } : { source: Source().Microphone });
    }
    return {
      room: r,
      identity: t.identity,
      async disconnect() { try { await r.disconnect(); } catch {} holder().querySelectorAll('[data-lk-group]').forEach((el) => el.remove()); },
    };
  }

  async function disconnect() {
    closing = true;
    audioEls.forEach((el) => el.remove());
    audioEls.clear();
    audioByUser.clear();
    if (current) current.detach(o.video);
    current = null; delete videos.screen; delete videos.camera;
    if (room) { try { await room.disconnect(); } catch {} room = null; }
  }

  return {
    isEnabled, connect, disconnect, setMuted, publishTeacher, setCameraQuality, toggleLocal, setTeacherMicMuted, publishScreen, unpublishScreen, publishFile, unpublishFile,
    startSpeaking, stopSpeaking, setSpeakerMuted, joinGroup,
    audioTrackOf: (identity) => audioByUser.get(identity) || null,
    get room() { return room; },
    get label() { return /\.livekit\.cloud(?=[:/]|$)/i.test(serverUrl) ? 'LiveKit Cloud' : 'LiveKit riêng'; },
  };
})();
