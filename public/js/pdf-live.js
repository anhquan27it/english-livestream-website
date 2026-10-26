// Chiếu tệp PDF trực tiếp: giáo viên tải PDF lên lớp và lật trang; học sinh vẽ đúng trang đó bằng pdf.js (tải từ CDN).
// Hiển thị trong cùng khung #slideLayer với slide AI; hai kiểu chiếu loại trừ nhau (máy chủ bảo đảm).
const PdfLive = (() => {
  const o = {};                 // { isTeacher, socket, classId, stage, layer, panel }
  let state = null;             // { id, name, page }
  let doc = null, docId = null, loading = null;
  let renderTask = null;
  let active = false;
  const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  function init(opts) {
    Object.assign(o, opts);
    if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;
    o.socket.on('pdf:state', apply);
    addEventListener('resize', () => active && showPage());
  }

  async function load(id) {
    if (!window.pdfjsLib) throw new Error('Không tải được thư viện đọc PDF (kiểm tra kết nối mạng).');
    if (docId === id && doc) return doc;
    docId = id;
    doc = null;
    loading = pdfjsLib.getDocument({ url: `/api/pdfs/${id}/file?token=${encodeURIComponent(Auth.token)}` }).promise;
    doc = await loading;
    return doc;
  }

  async function apply(st) {
    state = st;
    active = !!st;
    if (!st) {
      doc = null; docId = null;
      // Chỉ xoá khung nếu đang hiển thị PDF (bài giảng AI có thể vừa được chiếu vào cùng khung)
      if (o.layer.querySelector('.pdf-wrap')) { o.layer.innerHTML = ''; o.stage.classList.remove('with-slide'); }
      LessonLive.refresh();
      return;
    }
    o.stage.classList.add('with-slide');
    try { await showPage(); } catch (e) { o.layer.innerHTML = `<div class="pdf-wrap"><div class="empty" style="color:#fff">${esc(e.message)}</div></div>`; }
    LessonLive.refresh();
  }

  async function showPage() {
    if (!state) return;
    const d = await load(state.id);
    const num = Math.min(Math.max(1, state.page), d.numPages);
    let wrap = o.layer.querySelector('.pdf-wrap');
    if (!wrap) {
      o.layer.innerHTML = '<div class="pdf-wrap"><canvas></canvas><div class="pdf-badge"></div></div>';
      wrap = o.layer.querySelector('.pdf-wrap');
    }
    const canvas = wrap.querySelector('canvas');
    const page = await d.getPage(num);
    const box = wrap.getBoundingClientRect();
    const base = page.getViewport({ scale: 1 });
    const scale = Math.max(0.2, Math.min((box.width - 8) / base.width, (box.height - 8) / base.height));
    const dpr = window.devicePixelRatio || 1;
    const vp = page.getViewport({ scale: scale * dpr });
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.style.width = vp.width / dpr + 'px'; canvas.style.height = vp.height / dpr + 'px';
    if (renderTask) { try { renderTask.cancel(); } catch {} }
    renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
    try { await renderTask.promise; } catch { /* bị huỷ vì đổi trang quá nhanh */ }
    wrap.querySelector('.pdf-badge').textContent = `${state.name} · trang ${num} / ${d.numPages}`;
    state.total = d.numPages;
  }

  // ----- Giáo viên -----
  const go = (n) => {
    if (!state) return;
    const total = state.total || 9999;
    o.socket.emit('pdf:goto', { page: Math.min(total, Math.max(1, n)) });
  };

  function paintPanel(p) {
    p.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px">
        <b style="font-size:15px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📄 ${esc(state.name)}</b>
        <button class="icon-btn" data-stop title="Dừng chiếu PDF" style="color:#a9a6c9"><i data-lucide="square"></i></button></div>
      <div class="lp-nav"><button data-nav="-1" ${state.page <= 1 ? 'disabled' : ''} title="Trang trước (←)"><i data-lucide="chevron-left"></i></button>
        <span class="count">Trang ${state.page}${state.total ? ' / ' + state.total : ''}</span>
        <button data-nav="1" ${state.total && state.page >= state.total ? 'disabled' : ''} title="Trang sau (→)"><i data-lucide="chevron-right"></i></button></div>
      <div class="field"><input class="input" type="number" min="1" data-jump placeholder="Nhảy tới trang…" style="background:rgba(255,255,255,.07);color:#fff;border-color:rgba(255,255,255,.15)" /></div>
      <p style="color:#a9a6c9;font-size:13px">Học sinh thấy đúng trang bạn đang mở. Phím ← → để lật trang.</p>`;
    icons();
    p.querySelector('[data-stop]').onclick = () => o.socket.emit('pdf:stop');
    p.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(state.page + +b.dataset.nav)));
    p.querySelector('[data-jump]').onkeydown = (e) => { if (e.key === 'Enter') go(parseInt(e.target.value) || 1); };
  }

  async function mountPicker(box) {
    box.innerHTML = '<div class="panel-heading">Hoặc chiếu tệp PDF</div><div class="lp-pick" id="pdfList"></div>';
    const list = box.querySelector('#pdfList');
    const paint = async () => {
      let pdfs = [];
      try { pdfs = (await api(`/api/classes/${o.classId}/pdfs`)).pdfs; } catch {}
      list.innerHTML = pdfs.map((f) => `<button class="lp-lesson" data-pdf="${f.id}"><span style="font-size:24px">📄</span><span style="flex:1;min-width:0"><b>${esc(f.name)}</b><small>${(f.size / 1048576).toFixed(1)} MB</small></span><i data-lucide="play"></i></button>`).join('')
        + `<label class="btn btn-outline btn-block" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.2);cursor:pointer"><i data-lucide="upload"></i> Tải PDF mới lên<input type="file" accept="application/pdf,.pdf" hidden id="pdfFile" /></label>`;
      icons();
      list.querySelectorAll('[data-pdf]').forEach((b) => (b.onclick = () => present(b.dataset.pdf)));
      list.querySelector('#pdfFile').onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          toast('Đang tải ' + f.name + '…');
          const res = await fetch(`/api/classes/${o.classId}/pdfs`, { method: 'POST', headers: { Authorization: 'Bearer ' + Auth.token, 'X-Filename': encodeURIComponent(f.name) }, body: f });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error);
          present(d.pdf.id);
        } catch (err) { toast(err.message, 'error'); }
      };
    };
    paint();
  }

  function present(fileId) {
    o.socket.emit('pdf:present', { fileId }, (r) => r && r.error && toast(r.error, 'error'));
  }

  addEventListener('keydown', (e) => {
    if (!active || !o.isTeacher || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.querySelector('.modal-backdrop')) return;
    if (e.key === 'ArrowRight') go(state.page + 1);
    if (e.key === 'ArrowLeft') go(state.page - 1);
  });

  return { init, apply, paintPanel, mountPicker, get active() { return active; } };
})();
