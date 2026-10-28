// Tách CSS của Zoom khỏi giao diện EngLive; không đưa bearer token vào iframe/URL.
(() => {
  const origin = location.origin, status = document.getElementById('status');
  const send = (type, detail = {}) => parent.postMessage({ type, ...detail }, origin);
  if (parent === window) { status.textContent = 'Hãy mở Zoom từ phòng học EngLive.'; return; }
  if (new URLSearchParams(location.search).has('left')) { status.textContent = 'Bạn đã rời Zoom. Bấm “Kết nối Zoom” ở thanh điều khiển để vào lại.'; send('zoom:left'); return; }
  const load = src => new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = () => reject(new Error('Không tải được SDK từ Zoom. Kiểm tra kết nối mạng rồi thử lại.')); document.head.appendChild(script); });
  let started = false;
  addEventListener('message', async e => {
    if (e.origin !== origin || e.source !== parent) return;
    if (e.data?.type === 'zoom:leave') { if (window.ZoomMtg) ZoomMtg.leaveMeeting({ success: () => send('zoom:closed'), error: () => send('zoom:closed') }); else send('zoom:closed'); return; }
    if (e.data?.type !== 'zoom:join' || started) return;
    started = true;
    try {
      const p = e.data.credentials, version = '6.2.0', base = 'https://source.zoom.us/';
      for (const lib of ['react', 'react-dom', 'redux', 'redux-thunk', 'react-redux', 'lodash']) await load(base + version + '/lib/vendor/' + lib + '.min.js');
      await load(base + 'zoom-meeting-' + version + '.min.js');
      ZoomMtg.setZoomJSLib(base + version + '/lib', '/av');
      ZoomMtg.preLoadWasm(); ZoomMtg.prepareWebSDK();
      ZoomMtg.inMeetingServiceListener('onUserIsInWaitingRoom', () => send('zoom:waiting'));
      ZoomMtg.init({ leaveUrl: origin + '/zoom-embed.html?left=1', patchJsMedia: true, isSupportAV: true, disableInvite: true, isShowJoiningErrorDialog: false,
        success: () => {
          status.hidden = true;
          ZoomMtg.join({ signature: p.signature, meetingNumber: p.meetingNumber, passWord: p.passWord, userName: p.userName, userEmail: p.userEmail, ...(p.zak ? { zak: p.zak } : {}),
            success: () => { status.hidden = true; document.getElementById('zmmtg-root').style.display = ''; send('zoom:joined'); }, error: err => fail(err) });
        }, error: err => fail(err) });
    } catch (err) { fail(err); }
  });
  function fail(err) {
    status.hidden = false;
    document.getElementById('zmmtg-root').style.display = 'none';
    status.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#111827;color:#fff;padding:24px;white-space:pre-wrap;overflow:auto;line-height:1.7';
    const message = ZoomErrors.message(err);
    status.textContent = message; send('zoom:error', { message });
  }
  send('zoom:ready');
})();
