// Bài tập đa dạng cho trang Học tập: giáo viên soạn (tay hoặc AI), học sinh làm và xem kết quả, giáo viên xem thống kê.
// Mọi việc chấm điểm và giữ đáp án nằm ở máy chủ; file này chỉ vẽ giao diện và gom câu trả lời.
const Exercises = (() => {
  const TYPES = {
    mcq: { icon: '🔘', label: 'Trắc nghiệm', hint: 'Chọn 1 đáp án đúng; có thể thêm câu để học sinh nghe (nghe hiểu)' },
    tf: { icon: '✅', label: 'Đúng / Sai', hint: 'Nhận định đúng hoặc sai' },
    fill: { icon: '✏️', label: 'Điền chỗ trống', hint: 'Viết ___ ở chỗ trống, nhập các đáp án chấp nhận được' },
    order: { icon: '🔀', label: 'Sắp xếp câu', hint: 'Học sinh xếp các từ thành câu đúng' },
    match: { icon: '🔗', label: 'Nối cặp', hint: 'Nối từ/cụm từ với nghĩa hoặc câu trả lời' },
    short: { icon: '💬', label: 'Trả lời ngắn', hint: 'Có đáp án thì tự chấm; để trống thì giáo viên chấm tay' },
    essay: { icon: '📝', label: 'Viết đoạn', hint: 'Giáo viên chấm tay' },
    speak: { icon: '🎤', label: 'Luyện nói', hint: 'Học sinh đọc to câu mẫu, trình duyệt nhận dạng và tự chấm độ giống' },
  };
  const STATUS = { true: '✅', false: '❌', partial: '🟡' };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const dateText = (t) => new Date(t).toLocaleString('vi-VN');
  const blankCount = (t) => Math.max(0, String(t || '').split('___').length - 1);
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const hasItems = (a) => !!(a.items && a.items.length);
  const summary = (a) => { const c = {}; (a.items || []).forEach((i) => { c[i.type] = (c[i.type] || 0) + 1; }); return Object.entries(c).map(([t, n]) => `${TYPES[t].icon} ${n}`).join(' · '); };

  // ====================== Giáo viên: soạn bài ======================
  function blankItem(type) {
    const base = { type, points: 1, explain: '' };
    if (type === 'mcq') return { ...base, q: '', options: ['', '', '', ''], answer: 0, tts: '' };
    if (type === 'tf') return { ...base, q: '', answer: true };
    if (type === 'fill') return { ...base, text: '', blanks: [''] };
    if (type === 'order') return { ...base, answer: '' };
    if (type === 'match') return { ...base, q: '', pairs: [['', ''], ['', '']] };
    if (type === 'short') return { ...base, q: '', answers: '' };
    if (type === 'essay') return { ...base, q: '', minWords: 0 };
    return { ...base, target: '', q: '' };
  }
  // Câu từ API/AI (mảng) -> dạng đang sửa (chuỗi)
  function toEditable(it) {
    const e = { ...it };
    if (it.type === 'fill') e.blanks = it.blanks.map((b) => b.join(' | '));
    if (it.type === 'short') e.answers = (it.answers || []).join(' | ');
    if (it.type === 'mcq') e.options = [...it.options];
    if (it.type === 'match') e.pairs = it.pairs.map((p) => [...p]);
    return e;
  }
  function toPayload(e) {
    const it = { ...e };
    if (e.type === 'fill') { const n = blankCount(e.text); it.blanks = Array.from({ length: n }, (_, i) => String(e.blanks[i] || '').split('|').map((s) => s.trim()).filter(Boolean)); }
    if (e.type === 'short') it.answers = String(e.answers || '').split('|').map((s) => s.trim()).filter(Boolean);
    if (e.type === 'mcq') { const keep = e.options.map((o, i) => [o.trim(), i]).filter(([o]) => o); it.options = keep.map(([o]) => o); it.answer = Math.max(0, keep.findIndex(([, i]) => i === e.answer)); }
    return it;
  }

  function itemEditor(it, i, n) {
    const f = (k, v, extra = '') => `data-i="${i}" data-k="${k}" ${extra}`;
    const T = TYPES[it.type];
    let body = '';
    if (it.type === 'mcq') {
      body = `<label>Câu hỏi<textarea class="input" rows="2" ${f('q')}>${esc(it.q)}</textarea></label>
        <div class="ex-opts">${it.options.map((o, j) => `<div class="ex-optrow"><input type="radio" name="ans${i}" ${it.answer === j ? 'checked' : ''} data-i="${i}" data-correct="${j}" title="Đáp án đúng"><input class="input" placeholder="Đáp án ${String.fromCharCode(65 + j)}" value="${esc(o)}" data-i="${i}" data-k="options" data-j="${j}"></div>`).join('')}</div>
        ${it.options.length < 6 ? `<button type="button" class="btn btn-outline btn-sm" data-addopt="${i}">+ Thêm đáp án</button>` : ''}
        <label>Câu để học sinh nghe (tuỳ chọn, tiếng Anh) <input class="input" maxlength="300" placeholder="Có nội dung này thì câu hỏi trở thành bài nghe hiểu" value="${esc(it.tts)}" ${f('tts')}></label>`;
    } else if (it.type === 'tf') {
      body = `<label>Nhận định<textarea class="input" rows="2" ${f('q')}>${esc(it.q)}</textarea></label>
        <div class="ex-optrow"><label><input type="radio" name="tf${i}" ${it.answer === true ? 'checked' : ''} data-i="${i}" data-tf="true"> Đúng</label><label><input type="radio" name="tf${i}" ${it.answer === false ? 'checked' : ''} data-i="${i}" data-tf="false"> Sai</label></div>`;
    } else if (it.type === 'fill') {
      const n = blankCount(it.text);
      body = `<label>Câu (dùng ___ cho chỗ trống)<input class="input" maxlength="400" placeholder="She ___ to school every day." value="${esc(it.text)}" ${f('text', '', 'data-refresh="1"')}></label>
        ${Array.from({ length: n }, (_, j) => `<label>Đáp án chỗ trống ${j + 1} (nhiều đáp án cách nhau bằng |)<input class="input" value="${esc(it.blanks[j] || '')}" data-i="${i}" data-k="blanks" data-j="${j}" placeholder="goes | walks"></label>`).join('') || '<p class="op-note">Chưa có chỗ trống nào.</p>'}`;
    } else if (it.type === 'order') {
      body = `<label>Câu hoàn chỉnh (học sinh sẽ nhận các từ bị xáo trộn)<input class="input" maxlength="200" placeholder="I am going to travel to Japan." value="${esc(it.answer)}" ${f('answer')}></label>`;
    } else if (it.type === 'match') {
      body = `<label>Hướng dẫn (tuỳ chọn)<input class="input" maxlength="200" value="${esc(it.q)}" ${f('q')}></label>
        ${it.pairs.map((p, j) => `<div class="ex-pair"><input class="input" placeholder="Vế trái" value="${esc(p[0])}" data-i="${i}" data-k="pairs" data-j="${j}" data-side="0"><span>→</span><input class="input" placeholder="Vế phải" value="${esc(p[1])}" data-i="${i}" data-k="pairs" data-j="${j}" data-side="1">${it.pairs.length > 2 ? `<button type="button" class="icon-btn" data-delpair="${i}:${j}" title="Xóa cặp">✕</button>` : ''}</div>`).join('')}
        ${it.pairs.length < 8 ? `<button type="button" class="btn btn-outline btn-sm" data-addpair="${i}">+ Thêm cặp</button>` : ''}`;
    } else if (it.type === 'short') {
      body = `<label>Câu hỏi<textarea class="input" rows="2" ${f('q')}>${esc(it.q)}</textarea></label>
        <label>Đáp án chấp nhận (cách nhau bằng |; để trống = giáo viên chấm tay)<input class="input" value="${esc(it.answers)}" ${f('answers')} placeholder="went | has gone"></label>`;
    } else if (it.type === 'essay') {
      body = `<label>Đề bài<textarea class="input" rows="3" ${f('q')}>${esc(it.q)}</textarea></label><label>Số từ tối thiểu gợi ý (0 = không yêu cầu)<input class="input" type="number" min="0" max="500" value="${it.minWords}" ${f('minWords')}></label>`;
    } else {
      body = `<label>Câu để học sinh đọc to (tiếng Anh)<input class="input" maxlength="200" placeholder="Where is the departure gate?" value="${esc(it.target)}" ${f('target')}></label><label>Hướng dẫn (tuỳ chọn)<input class="input" maxlength="200" value="${esc(it.q)}" ${f('q')}></label>`;
    }
    return `<div class="ex-item" data-card="${i}"><div class="ex-head"><b>${T.icon} Câu ${i + 1} · ${T.label}</b><span class="ex-tools"><label>Điểm <input class="input ex-pts" type="number" min="0.5" max="10" step="0.5" value="${it.points}" ${f('points')}></label><button type="button" class="icon-btn" data-move="${i}:-1" ${i === 0 ? 'disabled' : ''} title="Lên">↑</button><button type="button" class="icon-btn" data-move="${i}:1" ${i === n - 1 ? 'disabled' : ''} title="Xuống">↓</button><button type="button" class="icon-btn" data-dup="${i}" title="Nhân đôi">⧉</button><button type="button" class="icon-btn" data-del="${i}" title="Xóa câu">🗑</button></span></div>${body}<label>Giải thích sau khi chấm (tuỳ chọn)<input class="input" maxlength="400" value="${esc(it.explain)}" ${f('explain')}></label></div>`;
  }

  // ctx: { classes: [{id,name,level}], assignment?: (sửa), onSaved }
  function builder(ctx) {
    let items = [];
    const classes = ctx.classes;
    const m = openModal(`<h3>Giao bài tập ✍️</h3><div class="ex-builder">
      <div class="ex-grid">
        <label>Lớp<select class="input" id="exClass">${classes.map((c) => `<option value="${c.id}" data-level="${esc(c.level || '')}">${esc(c.name)}</option>`).join('')}</select></label>
        <label>Tên bài<input class="input" id="exTitle" maxlength="120" placeholder="VD: Past simple – luyện tập"></label>
        <label>Hạn nộp<input class="input" id="exDue" type="datetime-local"></label>
        <label>Số lần được làm<select class="input" id="exAttempts"><option value="1">1 lần</option><option value="2">2 lần</option><option value="3">3 lần</option><option value="5">5 lần</option></select></label>
        <label>Cho xem đáp án<select class="input" id="exReveal"><option value="submit">Ngay sau khi nộp</option><option value="due">Sau hạn nộp</option><option value="never">Không hiện</option></select></label>
      </div>
      <label>Mô tả / hướng dẫn (tuỳ chọn nếu đã có câu hỏi)<textarea class="input" id="exPrompt" rows="2" maxlength="5000" placeholder="VD: Làm bài trước thứ Sáu, nghe kỹ phần nghe hiểu."></textarea></label>
      <details class="ex-ai"><summary>✨ Tạo câu hỏi bằng AI</summary>
        <div class="ex-grid"><label>Chủ đề / ngữ pháp<input class="input" id="aiTopic" maxlength="300" placeholder="VD: Present perfect, từ vựng chủ đề du lịch"></label>
        <label>Trình độ<select class="input" id="aiLevel">${['A1', 'A2', 'B1', 'B2', 'C1'].map((l) => `<option>${l}</option>`).join('')}</select></label>
        <label>Số câu<input class="input" id="aiCount" type="number" min="1" max="20" value="8"></label></div>
        <div class="ex-types" id="aiTypes">${Object.entries(TYPES).map(([k, t]) => `<label class="ex-chip"><input type="checkbox" value="${k}" ${['mcq', 'fill', 'tf', 'order'].includes(k) ? 'checked' : ''}> ${t.icon} ${t.label}</label>`).join('')}</div>
        <label>Văn bản nguồn (tuỳ chọn — AI chỉ bám vào nội dung này)<textarea class="input" id="aiSource" rows="3" maxlength="6000" placeholder="Dán đoạn văn, hội thoại hoặc ghi chú bài học…"></textarea></label>
        <button type="button" class="btn btn-primary btn-sm" id="aiGo">✨ Tạo câu hỏi</button> <span class="op-note" id="aiNote">Câu AI tạo sẽ được thêm vào danh sách bên dưới để bạn xem lại trước khi giao.</span></details>
      <div id="exItems"></div>
      <div class="ex-add"><b>Thêm câu:</b> ${Object.entries(TYPES).map(([k, t]) => `<button type="button" class="btn btn-outline btn-sm" data-add="${k}" title="${esc(t.hint)}">${t.icon} ${t.label}</button>`).join('')}</div>
      <div class="form-error" id="exError" role="alert"></div>
      <div class="modal-actions"><span class="op-note" id="exTotal"></span><button class="btn btn-primary" id="exSave">Giao bài</button></div></div>`, { wide: true });
    const $ = (s) => m.querySelector(s);
    const total = () => { const pts = items.reduce((n, i) => n + (+i.points || 0), 0); $('#exTotal').textContent = items.length ? `${items.length} câu · tổng ${pts} điểm (quy về thang 10)` : 'Chưa có câu hỏi: bài sẽ là dạng viết tự luận theo mô tả.'; };
    const draw = () => {
      $('#exItems').innerHTML = items.map((it, i) => itemEditor(it, i, items.length)).join('');
      total(); icons();
    };
    draw();
    // Cập nhật trạng thái từ ô nhập (không vẽ lại để giữ con trỏ), trừ ô cần cập nhật cấu trúc
    m.addEventListener('input', (e) => {
      const t = e.target, i = t.dataset.i;
      if (i === undefined || t.dataset.k === undefined) return;
      const it = items[+i], k = t.dataset.k;
      if (k === 'options') it.options[+t.dataset.j] = t.value;
      else if (k === 'blanks') it.blanks[+t.dataset.j] = t.value;
      else if (k === 'pairs') it.pairs[+t.dataset.j][+t.dataset.side] = t.value;
      else if (k === 'points' || k === 'minWords') it[k] = +t.value;
      else it[k] = t.value;
      if (t.dataset.refresh) { const pos = t.selectionStart; draw(); const el = m.querySelector(`[data-i="${i}"][data-k="${k}"]`); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch { /* không hỗ trợ */ } } }
      if (k === 'points') total();
    });
    m.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.correct !== undefined) items[+t.dataset.i].answer = +t.dataset.correct;
      if (t.dataset.tf !== undefined) items[+t.dataset.i].answer = t.dataset.tf === 'true';
    });
    m.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.add) { items.push(blankItem(b.dataset.add)); draw(); m.querySelector('#exItems').lastElementChild?.scrollIntoView({ block: 'nearest' }); }
      else if (b.dataset.del !== undefined) { items.splice(+b.dataset.del, 1); draw(); }
      else if (b.dataset.dup !== undefined) { const c = JSON.parse(JSON.stringify(items[+b.dataset.dup])); delete c.id; items.splice(+b.dataset.dup + 1, 0, c); draw(); }
      else if (b.dataset.move) { const [i, d] = b.dataset.move.split(':').map(Number); [items[i], items[i + d]] = [items[i + d], items[i]]; draw(); }
      else if (b.dataset.addopt !== undefined) { items[+b.dataset.addopt].options.push(''); draw(); }
      else if (b.dataset.addpair !== undefined) { items[+b.dataset.addpair].pairs.push(['', '']); draw(); }
      else if (b.dataset.delpair) { const [i, j] = b.dataset.delpair.split(':').map(Number); items[i].pairs.splice(j, 1); draw(); }
    });
    $('#aiLevel').value = (classes[0] && ['A1', 'A2', 'B1', 'B2', 'C1'].includes(classes[0].level)) ? classes[0].level : 'A2';
    $('#exClass').onchange = () => { const lv = $('#exClass').selectedOptions[0].dataset.level; if (['A1', 'A2', 'B1', 'B2', 'C1'].includes(lv)) $('#aiLevel').value = lv; };
    $('#aiGo').onclick = async () => {
      const types = [...m.querySelectorAll('#aiTypes input:checked')].map((x) => x.value);
      if (!types.length) return toast('Chọn ít nhất một dạng câu hỏi.', 'error');
      const btn = $('#aiGo'); btn.disabled = true; $('#aiNote').textContent = 'AI đang soạn câu hỏi… (có thể mất 30–60 giây)';
      try {
        const d = await api('/api/learning/assignments/generate', { method: 'POST', body: { classId: $('#exClass').value, topic: $('#aiTopic').value, level: $('#aiLevel').value, count: +$('#aiCount').value, types, source: $('#aiSource').value } });
        items.push(...d.items.map(toEditable)); draw();
        $('#aiNote').textContent = `Đã thêm ${d.items.length} câu. Hãy đọc lại và sửa nếu cần trước khi giao.`;
      } catch (err) { $('#aiNote').textContent = err.message; }
      btn.disabled = false;
    };
    $('#exSave').onclick = async () => {
      const btn = $('#exSave'); $('#exError').textContent = '';
      const due = $('#exDue').value ? new Date($('#exDue').value).getTime() : NaN;
      btn.disabled = true;
      try {
        await api('/api/learning/assignments', { method: 'POST', body: { classId: $('#exClass').value, title: $('#exTitle').value, prompt: $('#exPrompt').value, dueAt: due, items: items.map(toPayload), settings: { maxAttempts: +$('#exAttempts').value, reveal: $('#exReveal').value } } });
        m.close(); toast('Đã giao bài tập', 'success'); if (ctx.onSaved) ctx.onSaved();
      } catch (err) { $('#exError').textContent = err.message; btn.disabled = false; }
    };
  }

  // ====================== Học sinh: làm bài ======================
  function itemPlayer(it, i, saved) {
    const wrap = (head, body) => `<div class="ex-item" data-id="${it.id}"><div class="ex-q"><span class="ex-num">${i + 1}</span><div>${head} <small class="ex-pts-note">${it.points} điểm</small></div></div>${body}</div>`;
    const choice = (name, value, label, on) => `<label class="ex-choice"><input type="radio" name="${name}" value="${value}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
    if (it.type === 'mcq') return wrap((it.tts ? `<button type="button" class="btn btn-outline btn-sm" data-tts="${esc(it.tts)}">🔊 Nghe</button> ` : '') + `<b>${esc(it.q)}</b>`, `<div class="ex-choices">${it.options.map((o, j) => choice('q_' + it.id, j, esc(o), saved === j)).join('')}</div>`);
    if (it.type === 'tf') return wrap(`<b>${esc(it.q)}</b>`, `<div class="ex-choices row">${choice('q_' + it.id, 'true', 'Đúng', saved === true)}${choice('q_' + it.id, 'false', 'Sai', saved === false)}</div>`);
    if (it.type === 'fill') { const parts = it.text.split('___'); return wrap(`<span class="ex-fill">${parts.map((p, j) => esc(p) + (j < parts.length - 1 ? `<input class="input ex-blank" data-blank="${j}" autocomplete="off" value="${esc((saved || [])[j] || '')}">` : '')).join('')}</span>`, ''); }
    if (it.type === 'order') return wrap('<b>Sắp xếp thành câu đúng</b>', '<div class="ex-line" data-line></div><div class="ex-pool" data-pool></div>');
    if (it.type === 'match') return wrap(`<b>${esc(it.q || 'Nối các cặp tương ứng')}</b>`, it.lefts.map((l, j) => `<div class="ex-pair"><span class="ex-left">${esc(l)}</span><span>→</span><select class="input" data-match="${j}"><option value="">— chọn —</option>${it.rights.map((r) => `<option ${(saved || [])[j] === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>`).join(''));
    if (it.type === 'short') return wrap(`<b>${esc(it.q)}</b>`, `<input class="input" data-short autocomplete="off" value="${esc(saved || '')}" placeholder="Câu trả lời của bạn">${it.manual ? '<small class="op-note">Giáo viên sẽ chấm câu này.</small>' : ''}`);
    if (it.type === 'essay') return wrap(`<b>${esc(it.q)}</b>`, `<textarea class="input" rows="5" maxlength="6000" data-essay placeholder="Viết bài của bạn…">${esc(saved || '')}</textarea><small class="op-note" data-wc></small>`);
    return wrap(`<b>${esc(it.q || 'Đọc to câu sau')}</b>`, `<p class="ex-target">${esc(it.target)} <button type="button" class="btn btn-outline btn-sm" data-tts="${esc(it.target)}">🔊 Nghe mẫu</button></p>${SR ? `<button type="button" class="btn btn-primary btn-sm" data-rec>🎤 Bấm để đọc</button> <span class="ex-heard" data-heard>${esc(saved || '')}</span>` : `<input class="input" data-short autocomplete="off" placeholder="Trình duyệt không hỗ trợ ghi âm — gõ lại câu bạn đọc" value="${esc(saved || '')}">`}`);
  }

  function player(a, mySub, ctx) {
    const answers = {};
    const m = openModal(`<h3>${esc(a.title)}</h3><p class="op-note">Hạn nộp: ${esc(dateText(a.dueAt))} · ${a.items.length} câu · làm tối đa ${(a.settings && a.settings.maxAttempts) || 1} lần${mySub ? ` · bạn đã làm ${mySub.attempts || 1} lần` : ''} (tính điểm cao nhất)</p>${a.prompt ? `<div class="op-pre">${esc(a.prompt)}</div>` : ''}
      <div class="ex-player">${a.items.map((it, i) => itemPlayer(it, i, mySub && mySub.answers && mySub.answers[it.id])).join('')}</div>
      <div class="form-error" id="pError" role="alert"></div><div class="modal-actions"><span class="op-note" id="pProg"></span><button class="btn btn-primary" id="pSubmit">Nộp bài</button></div>`, { wide: true });
    const prev = (mySub && mySub.answers) || {};
    const progress = () => { const n = a.items.filter((it) => { const v = answers[it.id]; return v !== undefined && v !== '' && !(Array.isArray(v) && v.every((x) => !x)); }).length; m.querySelector('#pProg').textContent = `Đã trả lời ${n}/${a.items.length} câu`; };
    a.items.forEach((it) => {
      const root = m.querySelector(`.ex-item[data-id="${it.id}"]`);
      const q = (s) => root.querySelector(s), all = (s) => [...root.querySelectorAll(s)];
      if (prev[it.id] !== undefined) answers[it.id] = prev[it.id];
      if (it.type === 'mcq') all('input[type=radio]').forEach((r) => (r.onchange = () => { answers[it.id] = +r.value; progress(); }));
      if (it.type === 'tf') all('input[type=radio]').forEach((r) => (r.onchange = () => { answers[it.id] = r.value === 'true'; progress(); }));
      if (it.type === 'fill') all('[data-blank]').forEach((inp) => (inp.oninput = () => { const arr = all('[data-blank]').map((x) => x.value); answers[it.id] = arr; progress(); }));
      if (it.type === 'match') all('[data-match]').forEach((sel) => (sel.onchange = () => { answers[it.id] = all('[data-match]').map((x) => x.value); progress(); }));
      if (it.type === 'short') all('[data-short]').forEach((inp) => (inp.oninput = () => { answers[it.id] = inp.value; progress(); }));
      if (it.type === 'essay') { const ta = q('[data-essay]'), wc = q('[data-wc]'); const upd = () => { const n = (ta.value.trim().match(/\S+/g) || []).length; answers[it.id] = ta.value; wc.textContent = `${it.minWords ? `Tối thiểu ${it.minWords} từ · ` : ''}${n} từ · giáo viên chấm`; progress(); }; ta.oninput = upd; upd(); }
      if (it.type === 'order') {
        let line = Array.isArray(prev[it.id]) ? [...prev[it.id]] : []; let pool = shuffle(it.tokens);
        line.forEach((w) => { const k = pool.indexOf(w); if (k >= 0) pool.splice(k, 1); });
        const drawOrder = () => { q('[data-line]').innerHTML = line.map((w, k) => `<button type="button" class="ex-word on" data-back="${k}">${esc(w)}</button>`).join('') || '<span class="op-note">Bấm các từ bên dưới để xếp câu</span>'; q('[data-pool]').innerHTML = pool.map((w, k) => `<button type="button" class="ex-word" data-take="${k}">${esc(w)}</button>`).join(''); q('[data-line]').querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => { pool.push(line.splice(+b.dataset.back, 1)[0]); answers[it.id] = [...line]; drawOrder(); progress(); })); q('[data-pool]').querySelectorAll('[data-take]').forEach((b) => (b.onclick = () => { line.push(pool.splice(+b.dataset.take, 1)[0]); answers[it.id] = [...line]; drawOrder(); progress(); })); };
        drawOrder();
      }
      if (it.type === 'speak') {
        const rec = q('[data-rec]');
        if (rec) rec.onclick = () => {
          const r = new SR(); r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1;
          rec.disabled = true; rec.textContent = '🎙 Đang nghe…';
          r.onresult = (ev) => { const t = ev.results[0][0].transcript; answers[it.id] = t; q('[data-heard]').textContent = '“' + t + '”'; progress(); };
          r.onerror = (ev) => toast(ev.error === 'not-allowed' ? 'Hãy cho phép trình duyệt dùng micro.' : 'Không nhận dạng được, thử lại nhé.', 'error');
          r.onend = () => { rec.disabled = false; rec.textContent = '🎤 Đọc lại'; };
          try { r.start(); } catch { rec.disabled = false; }
        };
      }
    });
    m.querySelectorAll('[data-tts]').forEach((b) => (b.onclick = () => speak(b.dataset.tts)));
    progress();
    m.querySelector('#pSubmit').onclick = async () => {
      const btn = m.querySelector('#pSubmit'), err = m.querySelector('#pError'); err.textContent = '';
      const left = a.items.length - a.items.filter((it) => answers[it.id] !== undefined && answers[it.id] !== '').length;
      if (left && !(await confirmModal('Còn câu chưa làm', `Bạn còn ${left} câu chưa trả lời. Vẫn nộp bài?`, 'Nộp bài', false))) return;
      btn.disabled = true;
      try {
        const d = await api('/api/learning/assignments/' + a.id + '/submit', { method: 'POST', body: { answers } });
        m.close(); if (ctx.onSubmitted) ctx.onSubmitted(); result(a, d.submission, ctx);
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    };
  }

  // ====================== Kết quả (học sinh và giáo viên) ======================
  function answerText(it, v) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.some((x) => x))) return '<i>Chưa trả lời</i>';
    if (it.type === 'mcq') return esc(it.options ? it.options[v] : v);
    if (it.type === 'tf') return v ? 'Đúng' : 'Sai';
    if (it.type === 'fill') return v.map((x) => esc(x || '…')).join(' · ');
    if (it.type === 'order') return esc(v.join(' '));
    if (it.type === 'match') return v.map((x, j) => esc((it.lefts ? it.lefts[j] : it.pairs ? it.pairs[j][0] : '') + ' → ' + (x || '…'))).join('<br>');
    return esc(v);
  }
  function expectedText(it, d) {
    const e = d.expected;
    if (e === undefined || e === null) return '';
    return Array.isArray(e) ? e.map(esc).join(it.type === 'match' ? '<br>' : ' · ') : esc(e);
  }
  function resultBody(a, s, manage) {
    const items = a.items;
    return `<div class="ex-score"><b>${s.score !== undefined ? s.score + '/10' : (s.autoScore ?? 0) + '/10*'}</b><span>${s.needsManual && s.gradedBy !== 'auto' && s.score === undefined ? '* Điểm tạm (phần tự chấm) — chờ giáo viên chấm các câu còn lại' : s.gradedBy === 'auto' ? 'Điểm tự động' : 'Đã chấm bởi giáo viên'}${s.feedback ? ' · ' + esc(s.feedback) : ''}</span></div>
      ${(s.detail || []).map((d, i) => { const it = items.find((x) => x.id === d.id) || {}; const exp = expectedText(it, d); return `<div class="ex-res ${d.correct === true ? 'ok' : d.correct === 'partial' ? 'part' : d.correct === false ? 'bad' : 'manual'}"><div><b>${i + 1}. ${TYPES[it.type] ? TYPES[it.type].icon : ''} ${esc(it.q || it.text || it.target || it.answer || (TYPES[it.type] ? TYPES[it.type].label : ''))}</b> <span class="ex-badge">${d.correct === null ? '⏳ chờ chấm' : STATUS[d.correct] + ' ' + d.earned + '/' + d.max}</span></div><div class="ex-yours">${manage ? 'Học sinh' : 'Bạn'}: ${answerText(it, (s.answers || {})[d.id])}</div>${exp && d.correct !== true ? `<div class="ex-exp">Đáp án: ${exp}</div>` : ''}${d.explain ? `<div class="op-note">💡 ${esc(d.explain)}</div>` : ''}${d.similarity !== undefined ? `<div class="op-note">Độ giống: ${Math.round(d.similarity * 100)}%</div>` : ''}</div>`; }).join('')}`;
  }
  function result(a, s, ctx) {
    openModal(`<h3>Kết quả · ${esc(a.title)}</h3><p class="op-note">Lần làm thứ ${s.attempts || 1}/${(a.settings && a.settings.maxAttempts) || 1} · điểm tính theo lần cao nhất</p>${resultBody(a, s, false)}<div class="modal-actions"><button class="btn btn-outline" data-close>Đóng</button></div>`, { wide: true });
  }

  // ====================== Giáo viên: thống kê ======================
  async function statsModal(a, ctx) {
    try {
      const { stats } = await api('/api/learning/assignments/' + a.id + '/stats');
      openModal(`<h3>Thống kê · ${esc(a.title)}</h3><p class="op-note">${stats.students.length} học sinh đã nộp. Tỉ lệ đúng càng thấp càng cần ôn lại.</p>
        ${stats.perItem.length ? `<h4>Tỉ lệ đúng từng câu</h4>${stats.perItem.map((p, i) => `<div class="ex-bar"><span>${i + 1}. ${TYPES[p.type].icon} ${esc(String(p.label).slice(0, 60))}</span><div><i style="width:${p.rate ?? 0}%" class="${p.rate !== null && p.rate < 50 ? 'low' : ''}"></i></div><b>${p.rate === null ? 'chấm tay' : p.rate + '%'}</b></div>`).join('')}` : ''}
        <h4>Học sinh</h4><table class="op-table"><thead><tr><th>Tên</th><th>Lần làm</th><th>Điểm tự động</th><th>Điểm cuối</th></tr></thead><tbody>${stats.students.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.attempts}</td><td>${s.autoScore ?? '—'}</td><td>${s.score ?? (s.needsManual ? 'chờ chấm' : '—')}</td></tr>`).join('') || '<tr><td colspan="4">Chưa có bài nộp.</td></tr>'}</tbody></table>
        <div class="modal-actions"><button class="btn btn-outline" data-close>Đóng</button></div>`, { wide: true });
    } catch (e) { toast(e.message, 'error'); }
  }

  // ====================== Thẻ bài tập trong tab "Bài tập" ======================
  function card(a, ctx) {
    const { data, me } = ctx, mine = data.submissions.find((s) => s.assignmentId === a.id && s.userId === me.id);
    const subs = data.submissions.filter((s) => s.assignmentId === a.id), manage = ctx.manager(a.classId), items = hasItems(a);
    const max = (a.settings && a.settings.maxAttempts) || 1, open = Date.now() <= a.dueAt;
    const meta = `${esc(ctx.className(a.classId))} · Hạn nộp: ${esc(dateText(a.dueAt))}${items ? ' · ' + summary(a) : ''}`;
    let body = a.prompt ? `<div class="op-pre">${esc(a.prompt)}</div>` : '';
    if (me.role === 'student') {
      if (items) body += `<div class="op-actions">${open && (!mine || (mine.attempts || 1) < max) ? `<button class="btn btn-primary" data-ex-do="${a.id}">${mine ? 'Làm lại' : 'Làm bài'}</button>` : ''}${mine ? `<button class="btn btn-outline" data-ex-result="${a.id}">Xem kết quả</button>` : ''}</div>${mine ? `<p class="op-note">${mine.score !== undefined ? `Điểm: ${mine.score}/10` : 'Chờ giáo viên chấm (điểm tạm ' + (mine.autoScore ?? 0) + '/10)'} · đã làm ${mine.attempts || 1}/${max} lần</p>` : ''}`;
      else body += `<button class="btn btn-primary" data-submit="${a.id}">Viết / sửa bài làm</button>`;
    }
    if (manage) body += `<div class="op-actions">${items ? `<button class="btn btn-outline" data-ex-stats="${a.id}">📊 Thống kê</button>` : ''}<button class="btn btn-outline" data-ex-edit="${a.id}">✏️ Sửa tên/hạn</button><button class="btn btn-outline" data-ex-del="${a.id}">🗑 Xóa</button></div>`;
    const visible = manage ? subs : subs.filter((s) => s.userId === me.id);
    body += visible.map((s) => items
      ? (manage ? `<div class="op-pre" style="margin-top:12px"><b>${esc(s.name)}</b> · ${esc(dateText(s.submittedAt))} · lần ${s.attempts || 1}<p>${s.score !== undefined ? `Điểm: ${s.score}/10${s.gradedBy === 'auto' ? ' (tự động)' : ''}` : `Chờ chấm · điểm tạm ${s.autoScore ?? 0}/10`}${s.feedback ? ' · ' + esc(s.feedback) : ''}</p><button class="btn btn-outline" data-ex-view="${s.id}">Xem bài làm</button> <button class="btn btn-outline" data-grade="${s.id}">Chấm / nhận xét</button></div>` : '')
      : `<div class="op-pre" style="margin-top:12px"><b>${esc(s.name)}</b> · ${esc(dateText(s.submittedAt))}<p>${esc(s.content)}</p><p>${s.gradedAt ? `Điểm: ${s.score}/10 · ${esc(s.feedback)}` : 'Chưa chấm'}</p>${manage ? `<button class="btn btn-outline" data-grade="${s.id}">Chấm / nhận xét</button>` : ''}</div>`).join('');
    return `<section class="card op-card"><h2>${esc(a.title)}</h2><p>${meta}</p>${body}</section>`;
  }

  function bind(root, ctx) {
    const find = (id) => ctx.data.assignments.find((a) => a.id === id);
    root.querySelectorAll('[data-ex-do]').forEach((b) => (b.onclick = () => { const a = find(b.dataset.exDo); player(a, ctx.data.submissions.find((s) => s.assignmentId === a.id && s.userId === ctx.me.id), ctx); }));
    root.querySelectorAll('[data-ex-result]').forEach((b) => (b.onclick = () => { const a = find(b.dataset.exResult); result(a, ctx.data.submissions.find((s) => s.assignmentId === a.id && s.userId === ctx.me.id), ctx); }));
    root.querySelectorAll('[data-ex-stats]').forEach((b) => (b.onclick = () => statsModal(find(b.dataset.exStats), ctx)));
    root.querySelectorAll('[data-ex-view]').forEach((b) => (b.onclick = () => { const s = ctx.data.submissions.find((x) => x.id === b.dataset.exView), a = find(s.assignmentId); openModal(`<h3>${esc(s.name)} · ${esc(a.title)}</h3>${resultBody({ ...a }, { ...s, detail: (s.detail || []).map((d) => { const it = a.items.find((x) => x.id === d.id); return { ...d, expected: it ? teacherExpected(it) : undefined, explain: it && it.explain }; }) }, true)}<div class="modal-actions"><button class="btn btn-outline" data-close>Đóng</button></div>`, { wide: true }); }));
    root.querySelectorAll('[data-ex-del]').forEach((b) => (b.onclick = async () => { const a = find(b.dataset.exDel); if (await confirmModal('Xóa bài tập?', `"${a.title}" và toàn bộ bài nộp sẽ bị xóa.`, 'Xóa')) ctx.run(() => api('/api/learning/assignments/' + a.id, { method: 'DELETE' })); }));
    root.querySelectorAll('[data-ex-edit]').forEach((b) => (b.onclick = () => {
      const a = find(b.dataset.exEdit);
      ctx.form('Sửa bài tập', `<label>Tên bài<input class="input" name="title" maxlength="120" value="${esc(a.title)}" required></label><label>Hạn nộp mới<input class="input" type="datetime-local" name="dueAt" value="${new Date(a.dueAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" required></label><label>Mô tả<textarea class="input" name="prompt" maxlength="5000" rows="3">${esc(a.prompt || '')}</textarea></label>`, (fd) => api('/api/learning/assignments/' + a.id, { method: 'PATCH', body: { title: fd.get('title'), prompt: fd.get('prompt'), dueAt: new Date(fd.get('dueAt')).getTime() } }));
    }));
  }
  // Giáo viên thấy đáp án đúng ngay từ dữ liệu đầy đủ
  function teacherExpected(it) {
    if (it.type === 'mcq') return it.options[it.answer];
    if (it.type === 'tf') return it.answer ? 'Đúng' : 'Sai';
    if (it.type === 'fill') return it.blanks.map((b) => b[0]);
    if (it.type === 'order') return it.answer;
    if (it.type === 'match') return it.pairs.map((p) => p[0] + ' → ' + p[1]);
    if (it.type === 'short') return (it.answers || [])[0] || null;
    if (it.type === 'speak') return it.target;
    return null;
  }

  return { builder, card, bind, hasItems };
})();
