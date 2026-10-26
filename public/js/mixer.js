// Bộ trộn âm thanh phía giáo viên (Web Audio): gộp micro, file nghe, âm thanh hệ thống và học sinh đang phát biểu
// thành một luồng gửi cho cả lớp. Có hai đầu ra:
//  - allTrack : mọi nguồn (gửi cho cả lớp)
//  - exclTrack: mọi nguồn TRỪ học sinh đang phát biểu (gửi riêng cho học sinh đó để không nghe lại tiếng mình)
// Mixer chỉ khởi động khi giáo viên bấm một nút cần đến nó (cần thao tác người dùng để AudioContext chạy).
const Mixer = (() => {
  let ac = null, all = null, excl = null;
  let micNode = null, speakerNode = null, speakerEl = null, fileNode = null, sysNode = null;

  const both = (node) => { node.connect(all); node.connect(excl); };

  function start(micTrack) {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      all = ac.createMediaStreamDestination();
      excl = ac.createMediaStreamDestination();
      if (micTrack) { micNode = ac.createMediaStreamSource(new MediaStream([micTrack])); both(micNode); }
    }
    if (ac.state !== 'running') ac.resume().catch(() => {});
    return ac;
  }

  // Giọng học sinh: chỉ vào luồng chung (không trả lại chính họ), và giáo viên cũng nghe được
  function attachSpeaker(track) {
    detachSpeaker();
    speakerEl = new Audio();
    speakerEl.muted = true; // Chrome cần một phần tử media giữ luồng WebRTC thì Web Audio mới nhận được dữ liệu
    speakerEl.srcObject = new MediaStream([track]);
    speakerEl.play().catch(() => {});
    speakerNode = ac.createMediaStreamSource(speakerEl.srcObject);
    speakerNode.connect(all);
    speakerNode.connect(ac.destination);
  }
  function detachSpeaker() {
    if (speakerNode) { speakerNode.disconnect(); speakerNode = null; }
    if (speakerEl) { speakerEl.srcObject = null; speakerEl = null; }
  }

  // Mỗi phần tử <audio> chỉ nối được một lần; giáo viên vẫn nghe lại qua loa của mình
  function attachFile(el) {
    if (fileNode) return;
    fileNode = ac.createMediaElementSource(el);
    both(fileNode);
    fileNode.connect(ac.destination);
  }

  function attachSystem(track) {
    detachSystem();
    sysNode = ac.createMediaStreamSource(new MediaStream([track]));
    both(sysNode);
  }
  function detachSystem() {
    if (sysNode) { sysNode.disconnect(); sysNode = null; }
  }

  return {
    start, attachSpeaker, detachSpeaker, attachFile, attachSystem, detachSystem,
    get active() { return !!ac; },
    get state() { return ac && ac.state; },
    get allTrack() { return all.stream.getAudioTracks()[0]; },
    get exclTrack() { return excl.stream.getAudioTracks()[0]; },
  };
})();
