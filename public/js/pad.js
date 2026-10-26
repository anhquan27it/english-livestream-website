// Bảng viết cộng tác: học sinh viết trong khung riêng (tự gửi cho giáo viên khi gõ), giáo viên chiếu một bài cho cả lớp
// và tô màu sửa lỗi bằng cách bôi đen đoạn văn. Màu: đỏ = lỗi, vàng = gợi ý, xanh lá = hay, xanh dương = ghi chú.
const PadLive = (() => {
  const o = {};            // { isTeacher, socket, stage, panel }
  let state = null;        // { prompt, featured: {userId,name,text,marks[]}|null, mine | entries }
  let layer = null;        // lớp phủ trên sân khấu
  let entries = new Map(); // giáo viên: userId -> {name,text,at}
  let sendTimer = null;
  const COLOR_LABEL = { red: 'Lỗi', yellow: 'Gợi ý', green: 'Hay', blue: 'Ghi chú' };

  // Hiển thị văn bản kèm các vùng tô màu. Nội dung chữ giữ nguyên (không thêm chữ), phần "sửa thành" vẽ bằng CSS ::after
  // để vị trí chọn của giáo viên (tính theo ký tự) luôn khớp với văn bản gốc.
  function renderMarked(text, marks) {
    const ms = (marks || []).map((m, i) => ({ ...m, i })).sort((a, b) => a.start - b.start);
    let pos = 0, html = '';
    for (const m of ms) {
      if (m.start < pos) continue;
      html += esc(text.slice(pos, m.start));
      html += `<span class="pm ${m.color}" data-i="${m.i}"${m.fix ? ` data-fix="${esc(m.fix)}"` : ''}${m.note ? ` title="${esc(m.note)}"` : ''}>${esc(text.slice(m.start, m.end))}</span>`;
      pos = m.end;
    }
    return html + esc(text.slice(pos));
  }

  function notesList(f) {
    const items = (f.marks || []).filter((m) => m.note || m.fix);
    if (!items.length) return '';
    return `<ul class="pad-notes">${items.map((m) => `<li class="${m.color}"><b>“${esc(f.text.slice(m.start, m.end))}”</b>${m.fix ? ` → <i>${esc(m.fix)}</i>` : ''}${m.note ? ` <span>${esc(m.note)}</span>` : ''}</li>`).join('')}</ul>`;
  }

  function init(opts) {
    Object.assign(o, opts);
    layer = document.createElement('div');
    layer.id = 'padLayer';
    layer.hidden = true;
    o.stage.appendChild(layer);
    o.socket.on('pad:state', apply);
    o.socket.on('pad:marks', ({ userId, marks }) => {
      if (state && state.featured && state.featured.userId === userId) { state.featured.marks = marks; paintFeatured(); if (o.isTeacher) paintTeacherFeatured(); }
    });
    if (o.isTeacher) {
      o.socket.on('pad:entry', (e) => { entries.set(e.userId, e); if (state) paintEntries(); });
      paintTeacher();
    }
  }

  function apply(st) {
    const wasOpen = !!state;
    state = st;
    if (o.isTeacher) entries = new Map((st && st.entries || []).map((e) => [e.userId, e]));
    if (!st) { layer.hidden = true; layer.innerHTML = ''; if (o.isTeacher) paintTeacher(); return; }
    layer.hidden = o.isTeacher && !st.featured; // giáo viên chỉ thấy lớp phủ khi đã chiếu một bài
    if (!wasOpen || !layer.querySelector('.pad-card')) buildLayer();
    paintFeatured();
    if (o.isTeacher) paintTeacher();
  }

  // ----- Lớp phủ trên sân khấu (học sinh: ô viết + bài được chọn; giáo viên: chỉ bài được chọn) -----
  function buildLayer() {
    layer.innerHTML = `<div class="pad-card">
      <div class="pad-head"><b>✍️ <span></span></b><button class="icon-btn" data-min title="Thu nhỏ / mở rộng"><i data-lucide="minimize-2"></i></button></div>
      <div class="pad-feat" hidden></div>
      ${o.isTeacher ? '' : '<div class="pad-mine"><textarea maxlength="1500" placeholder="Viết bài của bạn ở đây… (tự động gửi cho giáo viên)"></textarea><small>0 từ</small></div>'}
    </div><button class="btn btn-accent pad-open" hidden>✍️ Mở bảng viết</button>`;
    layer.querySelector('.pad-head span').textContent = state.prompt;
    const card = layer.querySelector('.pad-card'), openBtn = layer.querySelector('.pad-open');
    layer.querySelector('[data-min]').onclick = () => { card.hidden = true; openBtn.hidden = false; };
    openBtn.onclick = () => { card.hidden = false; openBtn.hidden = true; };
    const ta = layer.querySelector('textarea');
    if (ta) {
      ta.value = state.mine || '';
      const count = () => (layer.querySelector('.pad-mine small').textContent = (ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0) + ' từ');
      count();
      ta.oninput = () => {
        count();
        clearTimeout(sendTimer);
        sendTimer = setTimeout(() => o.socket.emit('pad:write', { text: ta.value }), 350);
      };
      ta.onblur = () => { clearTimeout(sendTimer); o.socket.emit('pad:write', { text: ta.value }); };
    }
    icons();
  }

  function paintFeatured() {
    const box = layer.querySelector('.pad-feat');
    if (!box) return;
    const f = state && state.featured;
    layer.querySelector('.pad-card').classList.toggle('has-feat', !!f);
    box.hidden = !f;
    if (o.isTeacher) layer.hidden = !f;
    if (f) box.innerHTML = `<div class="pad-feat-head">📌 Bài của <b>${esc(f.name)}</b></div><div class="pad-text">${renderMarked(f.text, f.marks)}</div>${notesList(f)}`;
  }

  // ----- Giáo viên: bảng điều khiển -----
  function paintTeacher() {
    const p = o.panel;
    if (!state) {
      p.innerHTML = `<div class="panel-heading">Bảng viết cộng tác</div>
        <p style="color:#a9a6c9;font-size:14px;margin:0 8px 12px">Học sinh viết bài ngắn trên máy của mình; bạn xem trực tiếp, chọn một bài chiếu cho cả lớp rồi tô màu sửa lỗi.</p>
        <div class="field"><input class="input" id="padPrompt" maxlength="300" placeholder="Đề bài, VD: Write 3 sentences about your weekend." style="background:rgba(255,255,255,.07);color:#fff;border-color:rgba(255,255,255,.15)" /></div>
        <button class="btn btn-accent btn-block" id="padOpen"><i data-lucide="pen-line"></i> Mở bảng viết</button>`;
      icons();
      p.querySelector('#padOpen').onclick = () => o.socket.emit('pad:open', { prompt: p.querySelector('#padPrompt').value });
      return;
    }
    p.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><b style="font-size:14px">✍️ ${esc(state.prompt)}</b><button class="icon-btn" id="padClose" title="Đóng bảng viết" style="color:#a9a6c9"><i data-lucide="square"></i></button></div>
      <div class="panel-heading">Bài của học sinh <span id="padCount"></span></div><div id="padEntries"></div>
      <div id="padFeatWrap"></div>`;
    icons();
    p.querySelector('#padClose').onclick = () => o.socket.emit('pad:close');
    paintEntries();
    paintTeacherFeatured();
  }

  function paintEntries() {
    const box = o.panel.querySelector('#padEntries');
    if (!box) return;
    const list = [...entries.values()].sort((a, b) => b.at - a.at);
    o.panel.querySelector('#padCount').textContent = `· ${list.length}`;
    const fid = state && state.featured && state.featured.userId;
    box.innerHTML = list.length ? list.map((e) => `<div class="viewer pad-entry ${e.userId === fid ? 'on' : ''}">${avatar(e.name, 'sm round')}
        <div class="info">${esc(e.name)}<small>${esc(e.text.slice(0, 90)) || '…'}</small></div>
        <button class="btn btn-sm ${e.userId === fid ? 'btn-accent' : 'btn-outline'}" data-feat="${e.userId}" style="${e.userId === fid ? '' : 'background:transparent;color:#fff;border-color:rgba(255,255,255,.2)'}">${e.userId === fid ? 'Đang chiếu' : 'Chiếu & sửa'}</button></div>`).join('')
      : '<div class="empty" style="color:#8885ab"><div class="emoji">📝</div>Chưa có học sinh nào viết.</div>';
    box.querySelectorAll('[data-feat]').forEach((b) => (b.onclick = () => o.socket.emit('pad:feature', { userId: b.dataset.feat })));
  }

  function paintTeacherFeatured() {
    const wrap = o.panel.querySelector('#padFeatWrap');
    if (!wrap) return;
    const f = state && state.featured;
    if (!f) { wrap.innerHTML = ''; return; }
    const colors = Object.entries(COLOR_LABEL);
    wrap.innerHTML = `<div class="panel-heading">Sửa bài của ${esc(f.name)}</div>
      <p style="color:#a9a6c9;font-size:13px;margin:0 8px 8px">Bôi đen một đoạn trong bài, nhập “sửa thành” hoặc ghi chú (tuỳ chọn) rồi bấm màu. Cả lớp thấy ngay.</p>
      <div class="pad-text pad-edit" id="padText">${renderMarked(f.text, f.marks)}</div>
      <div class="pad-tools">
        <input class="input" id="padFix" placeholder="Sửa thành…" maxlength="200" />
        <input class="input" id="padNote" placeholder="Ghi chú…" maxlength="200" />
        <div class="pad-colors">${colors.map(([c, l]) => `<button class="pc ${c}" data-color="${c}">${l}</button>`).join('')}</div>
      </div>
      ${f.marks.length ? `<div class="lp-list" style="margin-top:8px">${f.marks.map((m, i) => `<button data-un="${i}"><i>✕</i><span>“${esc(f.text.slice(m.start, m.end))}”${m.fix ? ' → ' + esc(m.fix) : ''}</span><em>${COLOR_LABEL[m.color]}</em></button>`).join('')}</div><button class="btn btn-sm btn-outline" id="padClear" style="margin-top:8px;background:transparent;color:#fff;border-color:rgba(255,255,255,.2)">Xoá hết ghi chú</button>` : ''}
      <button class="btn btn-sm btn-outline" id="padUnfeature" style="margin-top:8px;background:transparent;color:#fff;border-color:rgba(255,255,255,.2)">Bỏ chiếu bài này</button>`;
    const box = wrap.querySelector('#padText');
    // Giữ vùng bôi đen khi bấm nút màu
    wrap.querySelectorAll('.pc').forEach((b) => {
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => {
        const sel = selection(box);
        if (!sel) return toast('Hãy bôi đen một đoạn trong bài trước.', 'error');
        o.socket.emit('pad:mark', { ...sel, color: b.dataset.color, fix: wrap.querySelector('#padFix').value, note: wrap.querySelector('#padNote').value }, (r) => {
          if (r && r.error) return toast(r.error, 'error');
          wrap.querySelector('#padFix').value = ''; wrap.querySelector('#padNote').value = '';
          getSelection().removeAllRanges();
        });
      };
    });
    wrap.querySelectorAll('[data-un]').forEach((b) => (b.onclick = () => o.socket.emit('pad:unmark', { index: +b.dataset.un })));
    const clr = wrap.querySelector('#padClear'); if (clr) clr.onclick = () => o.socket.emit('pad:unmark', { index: 'all' });
    wrap.querySelector('#padUnfeature').onclick = () => o.socket.emit('pad:feature', { userId: null });
  }

  // Vị trí ký tự của vùng đang bôi đen trong phần tử `box`
  function selection(box) {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    if (!box.contains(r.commonAncestorContainer)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(box);
    pre.setEnd(r.startContainer, r.startOffset);
    const start = pre.toString().length;
    const end = start + r.toString().length;
    return end > start ? { start, end } : null;
  }

  return { init, apply, renderMarked, get open() { return !!state; } };
})();
