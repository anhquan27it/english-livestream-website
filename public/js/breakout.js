// Phòng thảo luận nhỏ (breakout) phía trình duyệt.
// Học sinh: khi được chia nhóm, bật camera/micro và nối WebRTC trực tiếp với các bạn trong nhóm (mesh); người có socketId nhỏ hơn
// gọi trước để tránh hai bên cùng gọi. Giáo viên "đi tuần": vào một nhóm bằng cách gọi tới từng thành viên (giáo viên luôn là bên gọi).
// Máy chủ chỉ chia nhóm, kiểm soát quyền và chuyển tiếp tín hiệu (xem breakout.js ở thư mục gốc).
const BreakoutLive = (() => {
  const o = {};                  // { isTeacher, socket, stage, panel, getMedia(), muteMain(bool), teacherTracks() }
  const peers = new Map();       // socketId -> { pc, name }
  const pendingIce = new Map();  // socketId -> [candidate...] đến trước khi có remoteDescription
  let group = null;              // học sinh: { groupId, name, members, endsAt }
  let local = null;              // học sinh: luồng camera/micro của mình
  let ready = null;              // lời hứa: đã bật xong camera/micro (có thể null nếu bị từ chối)
  let layer = null;              // lớp phủ trên sân khấu của học sinh
  let tiles = null;              // vùng chứa video: lớp phủ (học sinh) hoặc bảng điều khiển (giáo viên)
  let tState = null;             // giáo viên: trạng thái nhóm từ máy chủ
  let visiting = null;           // giáo viên: groupId đang ghé thăm
  let timerInt = null;

  function init(opts) {
    Object.assign(o, opts);
    const s = o.socket;
    s.on('bo:signal', onSignal);
    s.on('breakout:member-left', ({ socketId }) => dropPeer(socketId));
    s.on('breakout:ended', ({ reason }) => { teardown(); if (reason) toast(reason); });
    if (o.isTeacher) {
      s.on('breakout:state', (st) => { tState = st; paintTeacher(); });
      paintTeacher();
    } else {
      s.on('breakout:assigned', onAssigned);
      s.on('breakout:visitor', ({ socketId, name }) => { setName(socketId, name); toast('👩‍🏫 Giáo viên ghé thăm nhóm của bạn'); });
      s.on('breakout:visitor-left', ({ socketId }) => dropPeer(socketId));
    }
  }

  const mkPc = (id) => {
    dropPeer(id, true);
    const pc = new RTCPeerConnection(RTC);
    const entry = { pc, name: (peers.get(id) || {}).name };
    peers.set(id, entry);
    pc.onicecandidate = (e) => e.candidate && o.socket.emit('bo:signal', { to: id, data: { candidate: e.candidate } });
    pc.ontrack = (e) => addTile(id, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => { const t = tiles && tiles.querySelector(`[data-id="${id}"]`); if (t) t.dataset.state = pc.connectionState; };
    return pc;
  };

  const setName = (id, name) => { const p = peers.get(id); if (p) p.name = name; else peers.set(id, { pc: null, name }); const l = tiles && tiles.querySelector(`[data-id="${id}"] span`); if (l) l.textContent = name; };

  function addTile(id, stream) {
    if (!tiles) return;
    let t = tiles.querySelector(`[data-id="${id}"]`);
    if (!t) {
      t = document.createElement('div');
      t.className = 'bo-tile';
      t.dataset.id = id;
      t.innerHTML = `<video autoplay playsinline></video><span>${esc((peers.get(id) || {}).name || '')}</span>`;
      tiles.appendChild(t);
    }
    const v = t.querySelector('video');
    v.srcObject = stream;
    v.play().catch(() => {});
  }

  function dropPeer(id, keepName) {
    const p = peers.get(id);
    if (p && p.pc) p.pc.close();
    if (keepName && p) p.pc = null; else { peers.delete(id); pendingIce.delete(id); }
    if (tiles && !keepName) { const t = tiles.querySelector(`[data-id="${id}"]`); if (t) t.remove(); }
  }

  async function call(id, tracks, stream) {
    const pc = mkPc(id);
    tracks.forEach((t) => pc.addTrack(t, stream));
    if (!tracks.some((t) => t.kind === 'video')) pc.addTransceiver('video', { direction: 'recvonly' });
    if (!tracks.some((t) => t.kind === 'audio')) pc.addTransceiver('audio', { direction: 'recvonly' });
    await pc.setLocalDescription(await pc.createOffer());
    o.socket.emit('bo:signal', { to: id, data: { sdp: pc.localDescription } });
  }

  async function onSignal({ from, data }) {
    try {
      if (data.sdp && data.sdp.type === 'offer') {
        if (ready) await ready; // đợi bật xong camera/micro để trả lời kèm hình ảnh của mình
        const pc = mkPc(from);
        if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));
        await pc.setRemoteDescription(data.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        o.socket.emit('bo:signal', { to: from, data: { sdp: pc.localDescription } });
        (pendingIce.get(from) || []).forEach((c) => pc.addIceCandidate(c).catch(() => {}));
        pendingIce.delete(from);
      } else if (data.sdp) {
        const p = peers.get(from);
        if (p && p.pc) {
          await p.pc.setRemoteDescription(data.sdp);
          (pendingIce.get(from) || []).forEach((c) => p.pc.addIceCandidate(c).catch(() => {}));
          pendingIce.delete(from);
        }
      } else if (data.candidate) {
        const p = peers.get(from);
        if (p && p.pc && p.pc.remoteDescription) p.pc.addIceCandidate(data.candidate).catch(() => {});
        else pendingIce.set(from, [...(pendingIce.get(from) || []), data.candidate]);
      }
    } catch (e) { console.warn('breakout signal', e); }
  }

  // ----- Học sinh -----
  async function onAssigned(g) {
    teardown(true);
    group = { ...g, endsAt: g.endsInMs != null ? Date.now() + g.endsInMs : null };
    layer = document.createElement('div');
    layer.id = 'boLayer';
    layer.innerHTML = `<div class="bo-head"><b>👥 ${esc(g.name)}</b><span class="bo-timer" hidden></span>
        <div class="bo-actions"><button class="ctrl" data-mic><i data-lucide="mic"></i></button><button class="ctrl" data-cam><i data-lucide="video"></i></button><button class="ctrl" data-help title="Gọi giáo viên"><i data-lucide="hand"></i><span class="lbl">Gọi giáo viên</span></button></div></div>
      <div class="bo-grid"></div><p class="bo-hint">Hãy cùng luyện nói tiếng Anh trong nhóm. Giáo viên có thể ghé thăm bất cứ lúc nào.</p>`;
    o.stage.appendChild(layer);
    tiles = layer.querySelector('.bo-grid');
    g.members.forEach((m) => { if (m.socketId !== o.socket.id) peers.set(m.socketId, { pc: null, name: m.name }); });
    o.muteMain(true);
    icons();
    ready = (async () => { try { local = await o.getMedia(); } catch { local = null; } })();
    await ready;
    if (!group) return; // nhóm đã kết thúc trong lúc chờ cấp quyền camera
    if (local) addLocalTile(); else toast('Không bật được camera/micro — bạn vẫn nghe và xem được nhóm.', 'error');
    layer.querySelector('[data-mic]').onclick = (e) => toggle('audio', e.currentTarget);
    layer.querySelector('[data-cam]').onclick = (e) => toggle('video', e.currentTarget);
    layer.querySelector('[data-help]').onclick = () => { o.socket.emit('hand', { raised: true }); toast('Đã gọi giáo viên'); };
    if (group.endsAt) startTimer();
    // Người có socketId nhỏ hơn gọi trước
    for (const m of g.members) {
      if (m.socketId !== o.socket.id && o.socket.id < m.socketId) call(m.socketId, local ? local.getTracks() : [], local || new MediaStream());
    }
  }

  function addLocalTile() {
    const t = document.createElement('div');
    t.className = 'bo-tile me';
    t.dataset.id = 'me';
    t.innerHTML = '<video autoplay playsinline muted></video><span>Bạn</span>';
    t.querySelector('video').srcObject = new MediaStream(local.getVideoTracks());
    tiles.prepend(t);
  }

  function toggle(kind, btn) {
    const tr = local && (kind === 'audio' ? local.getAudioTracks() : local.getVideoTracks())[0];
    if (!tr) return toast(kind === 'audio' ? 'Không có micro.' : 'Không có camera.', 'error');
    tr.enabled = !tr.enabled;
    btn.classList.toggle('off', !tr.enabled);
    btn.innerHTML = `<i data-lucide="${kind === 'audio' ? (tr.enabled ? 'mic' : 'mic-off') : (tr.enabled ? 'video' : 'video-off')}"></i>`;
    icons();
  }

  function startTimer() {
    const el = layer.querySelector('.bo-timer');
    el.hidden = false;
    const tick = () => { el.textContent = '⏱ ' + fmtDuration(Math.max(0, group.endsAt - Date.now())); };
    tick();
    timerInt = setInterval(tick, 1000);
  }

  function teardown(keepMain) {
    clearInterval(timerInt);
    peers.forEach((p, id) => { if (p.pc) p.pc.close(); });
    peers.clear();
    pendingIce.clear();
    if (local) local.getTracks().forEach((t) => t.stop());
    local = null; ready = null;
    if (layer) { layer.remove(); layer = null; }
    if (!o.isTeacher) { tiles = null; if (group && !keepMain) o.muteMain(false); group = null; } else { visiting = null; tiles = null; paintTeacher(); }
  }

  // ----- Giáo viên -----
  function paintTeacher() {
    const p = o.panel;
    if (!tState) {
      p.innerHTML = `<div class="panel-heading">Phòng thảo luận nhỏ</div>
        <p style="color:#a9a6c9;font-size:14px;margin:0 8px 12px">Chia học sinh thành các nhóm nhỏ để luyện nói theo cặp hoặc nhóm. Mỗi nhóm có camera/micro riêng; bạn có thể ghé thăm từng nhóm.</p>
        <div class="grid-2" style="gap:8px"><div class="field"><label style="color:#cfcbf3">Số người / nhóm</label><select class="input" id="boSize" style="background:rgba(255,255,255,.07);color:#fff;border-color:rgba(255,255,255,.15)">${[2, 3, 4, 5].map((n) => `<option value="${n}" style="color:#000">${n} người</option>`).join('')}</select></div>
        <div class="field"><label style="color:#cfcbf3">Thời gian</label><select class="input" id="boMin" style="background:rgba(255,255,255,.07);color:#fff;border-color:rgba(255,255,255,.15)">${[[0, 'Không giới hạn'], [3, '3 phút'], [5, '5 phút'], [10, '10 phút'], [15, '15 phút'], [20, '20 phút']].map(([v, l]) => `<option value="${v}" style="color:#000">${l}</option>`).join('')}</select></div></div>
        <button class="btn btn-accent btn-block" id="boStart"><i data-lucide="users-round"></i> Chia nhóm ngẫu nhiên</button>`;
      icons();
      p.querySelector('#boStart').onclick = () => o.socket.emit('breakout:start', { size: +p.querySelector('#boSize').value, minutes: +p.querySelector('#boMin').value }, (r) => r && r.error && toast(r.error, 'error'));
      return;
    }
    p.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b style="font-size:14px">👥 ${tState.groups.length} nhóm đang thảo luận</b><span id="boLeft" style="color:#ffd68a;font-weight:700;font-size:13px"></span></div>
      <div id="boGroups">${tState.groups.map((g) => `<div class="bo-group ${g.visiting ? 'on' : ''}"><div class="bo-gh"><b>${esc(g.name)}</b>
          <button class="btn btn-sm ${g.visiting ? 'btn-accent' : 'btn-outline'}" data-visit="${g.id}" style="${g.visiting ? '' : 'background:transparent;color:#fff;border-color:rgba(255,255,255,.2)'}">${g.visiting ? 'Rời nhóm' : 'Vào nghe'}</button></div>
          <small>${g.members.map((m) => esc(m.name)).join(', ') || '(trống)'}</small></div>`).join('')}</div>
      <div id="boTiles" class="bo-tiles"></div>
      <button class="btn btn-live btn-block" id="boEnd" style="margin-top:10px"><i data-lucide="log-in"></i> Gọi cả lớp về phòng chính</button>`;
    icons();
    tiles = p.querySelector('#boTiles');
    p.querySelector('#boEnd').onclick = () => o.socket.emit('breakout:end');
    p.querySelectorAll('[data-visit]').forEach((b) => (b.onclick = () => (b.textContent === 'Rời nhóm' ? leaveVisit() : visit(b.dataset.visit))));
    clearInterval(timerInt);
    if (tState.endsInMs != null) {
      const endsAt = Date.now() + tState.endsInMs;
      const tick = () => { const e = p.querySelector('#boLeft'); if (e) e.textContent = '⏱ ' + fmtDuration(Math.max(0, endsAt - Date.now())); };
      tick();
      timerInt = setInterval(tick, 1000);
    }
    // Vẽ lại các ô video của nhóm đang ghé thăm sau khi bảng được dựng lại
    if (visiting) peers.forEach((pr, id) => { if (pr.stream) addTile(id, pr.stream); });
  }

  function visit(groupId) {
    leaveVisit(true);
    o.socket.emit('breakout:visit', { groupId }, async (r) => {
      if (!r || r.error) return toast((r && r.error) || 'Không vào được nhóm.', 'error');
      visiting = groupId;
      const tracks = o.teacherTracks();
      const stream = new MediaStream(tracks);
      r.members.forEach((m) => peers.set(m.socketId, { pc: null, name: m.name }));
      paintTeacher();
      for (const m of r.members) {
        await call(m.socketId, tracks, stream);
        const pr = peers.get(m.socketId);
        if (pr && pr.pc) pr.pc.ontrack = (e) => { pr.stream = e.streams[0] || new MediaStream([e.track]); addTile(m.socketId, pr.stream); };
      }
    });
  }

  function leaveVisit(silent) {
    if (!visiting) return;
    peers.forEach((p) => { if (p.pc) p.pc.close(); });
    peers.clear();
    if (tiles) tiles.innerHTML = '';
    visiting = null;
    o.socket.emit('breakout:leave-visit');
    if (!silent) paintTeacher();
  }

  return { init, setState(st) { tState = st; paintTeacher(); }, get active() { return !!group || !!tState; } };
})();
