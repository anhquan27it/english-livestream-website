const ZoomLive = (() => {
  let frame, options, generation = 0, listener, joined = false;
  function disconnect() {
    generation++;
    if (listener) removeEventListener('message', listener);
    if (frame) {
      const old = frame;
      const cleanup = () => { old.remove(); removeEventListener('message', closed); clearTimeout(timer); };
      const closed = e => { if (e.origin === location.origin && e.source === old.contentWindow && ['zoom:closed', 'zoom:left'].includes(e.data?.type)) cleanup(); };
      const timer = setTimeout(cleanup, 2500);
      addEventListener('message', closed); old.contentWindow?.postMessage({ type: 'zoom:leave' }, location.origin);
    }
    frame = null; listener = null; joined = false;
  }
  function connect(opts) {
    if (frame) return;
    options = opts; const current = ++generation;
    frame = document.createElement('iframe');
    frame.title = 'Zoom Meeting'; frame.id = 'zoomFrame'; frame.allow = 'camera; microphone; display-capture; fullscreen; autoplay; clipboard-write'; frame.referrerPolicy = 'no-referrer';
    listener = async e => {
      if (e.origin !== location.origin || e.source !== frame?.contentWindow || current !== generation) return;
      if (e.data?.type === 'zoom:ready') {
        try {
          const credentials = await api('/api/zoom/join', { method: 'POST', body: { classId: options.classId } });
          if (current !== generation) return;
          if (credentials.hostInDesktop) options.onStatus('Giáo viên: mở phòng bằng ứng dụng Zoom trước, sau đó vào web. Quản lý chủ trì ở ứng dụng Zoom; tắt âm thanh ở một nơi để tránh vọng.');
          frame.contentWindow.postMessage({ type: 'zoom:join', credentials }, location.origin);
        } catch (err) { if (current === generation) options.onStatus(err.message, true); }
      }
      if (e.data?.type === 'zoom:joined') { joined = true; if (options.onState) options.onState('joined'); options.onStatus('Đã kết nối Zoom. Dùng micro, camera, chia sẻ màn hình và chia nhóm trong khung Zoom.'); }
      if (e.data?.type === 'zoom:waiting') { if (options.onState) options.onState('waiting'); options.onStatus('Đang chờ chủ trì Zoom cho vào phòng.'); }
      if (e.data?.type === 'zoom:error' && options.onState) options.onState('error');
      if (e.data?.type === 'zoom:error') options.onStatus(e.data.message || 'Không kết nối được Zoom.', true);
      if (e.data?.type === 'zoom:left') { joined = false; if (options.onState) options.onState('left'); options.onStatus('Đã rời Zoom. Bạn vẫn có thể xem slide và chat. Bấm Kết nối Zoom để vào lại.'); }
    };
    addEventListener('message', listener); frame.src = '/zoom-embed.html'; options.container.replaceChildren(frame);
  }
  const retry = () => { if (joined) return toast('Zoom đang kết nối. Hãy sử dụng điều khiển trong khung Zoom.'); const opts = options; disconnect(); if (opts) connect(opts); };
  return { connect, disconnect, retry };
})();
