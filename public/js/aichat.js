// Chat box AI dùng chung: AiChat.mount(el, { classId, lessonId, dark, initialChatId, onInfo, onChatsChanged })
// Mỗi bài/chung có nhiều hội thoại: tạo mới (chọn kiểu luyện), đổi tên, ghim, xóa; đọc to câu tiếng Anh; bấm từ in đậm để lưu vào sổ từ.
const AiChat = (() => {
  const KINDS = {
    chat: { icon: '💬', label: 'Hỏi đáp', hint: 'Hỏi bất kỳ điều gì về bài học hoặc tiếng Anh' },
    roleplay: { icon: '🎭', label: 'Đóng vai hội thoại', hint: 'Luyện nói với AI theo một tình huống, AI nhắc lỗi sau mỗi lượt' },
    correct: { icon: '✍️', label: 'Sửa câu / bài viết', hint: 'Gửi câu hoặc đoạn tiếng Anh để được sửa và giải thích lỗi' },
    quiz: { icon: '📝', label: 'Kiểm tra nhanh', hint: 'AI hỏi từng câu, chấm và giải thích, tổng kết sau 5 câu' },
  };
  // AI đôi khi trả LaTeX ($\rightarrow$, \text{...}) hoặc *nghiêng*: đổi thành chữ thường để không hiện ký tự lạ.
  const cleanMath = (t) => t
    .replace(/\\(?:long)?rightarrow|\\to\b/g, '→')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\times/g, '×')
    .replace(/\$(?=[^\s\d$])([^$\n]{1,100}?)(?<=\S)\$/g, '$1'); // $...$ (không đụng "$5")
  const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  const isWord = (t) => /^[A-Za-z][A-Za-z'’\- ]{0,38}$/.test(t) && t.trim().split(/\s+/).length <= 4;
  // Markdown rất nhẹ: **đậm**, *nghiêng*, `mã`, gạch đầu dòng, xuống dòng. Luôn escape trước để tránh chèn HTML.
  // Từ tiếng Anh in đậm trở thành nút "lưu vào sổ từ".
  const fmt = (t) => esc(cleanMath(t))
    .replace(/^(\s*)[*-] /gm, '$1• ')
    .replace(/\*\*(.+?)\*\*/g, (m, w) => (isWord(w) ? `<b class="aic-w" data-w="${w}" title="Bấm để lưu vào sổ từ">${w}</b>` : `<b>${w}</b>`))
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const plain = (t) => cleanMath(t).replace(/\*\*/g, '').replace(/^\s*[*-] /gm, '').replace(/`/g, '');
  // Chỉ đọc các câu không có dấu tiếng Việt (giọng đọc tiếng Anh đọc tiếng Việt rất tệ)
  const englishPart = (t) => plain(t).split(/\n+/).flatMap((l) => l.split(/(?<=[.!?])\s+/)).map((s) => s.replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '').trim()).filter((s) => s && !VI.test(s) && /[A-Za-z]/.test(s)).join(' ');
  const ago = (t) => {
    const m = Math.round((Date.now() - (t || 0)) / 60000);
    return m < 1 ? 'vừa xong' : m < 60 ? m + ' phút trước' : m < 1440 ? Math.round(m / 60) + ' giờ trước' : Math.round(m / 1440) + ' ngày trước';
  };

  function mount(el, opts) {
    const state = { busy: false, messages: [], lessonId: opts.lessonId || null, chatId: opts.initialChatId || null, kind: 'chat', title: '', pinned: false, chats: [], panel: null, fresh: false };
    el.innerHTML = `<div class="aic ${opts.dark ? 'dark' : ''}">
      <div class="aic-bar">
        <button type="button" class="aic-title" data-list-toggle title="Danh sách hội thoại"><span data-title>Hội thoại mới</span><i data-lucide="chevron-down"></i></button>
        <button type="button" class="aic-ibtn" data-pin title="Ghim hội thoại"><i data-lucide="pin"></i></button>
        <button type="button" class="aic-ibtn" data-new title="Hội thoại mới"><i data-lucide="message-square-plus"></i></button>
      </div>
      <div class="aic-ctx" data-ctx></div>
      <div class="aic-panel" data-panel hidden></div>
      <div class="aic-list" data-list></div>
      <div class="aic-sugg" data-sugg></div>
      <form class="aic-form" data-form><textarea rows="1" maxlength="1000" placeholder="Hỏi AI về bài học… (Enter để gửi)"></textarea><button aria-label="Gửi"><i data-lucide="send"></i></button></form></div>`;
    const $ = (s) => el.querySelector(s);
    const list = $('[data-list]'), input = $('textarea'), btn = $('[data-form] button');

    const suggestions = () => {
      if (state.kind === 'roleplay') return ["Let's role-play: ordering food at a restaurant", "Let's role-play: checking in at a hotel", "Let's role-play: a job interview"];
      if (state.kind === 'correct') return ['I go to school yesterday and meet my friend.', 'She don\'t like coffee.', 'Sửa giúp em đoạn văn em viết nhé'];
      if (state.kind === 'quiz') return ['Bắt đầu kiểm tra 5 câu', 'Kiểm tra từ vựng của bài này', 'Kiểm tra ngữ pháp bài này'];
      return state.mode === 'live'
        ? ['Giải thích slide này giúp em', 'Cho em thêm ví dụ', 'Từ này phát âm thế nào?']
        : state.lessonId ? ['Tóm tắt bài học hôm nay', 'Cho em 3 câu luyện tập', 'Giải thích ngữ pháp trong bài'] : ['Giúp em luyện hội thoại', 'Sửa câu tiếng Anh của em', 'Giải thích một cấu trúc ngữ pháp'];
    };

    function paint() {
      const k = KINDS[state.kind] || KINDS.chat;
      if (!state.messages.length) {
        list.innerHTML = `<div class="aic-hello"><div class="emoji">${k.icon}</div><b>${state.chatId ? esc(state.title) : 'Teacher Bot · ' + k.label}</b>${esc(k.hint)}. Bạn có thể viết tiếng Việt hoặc tiếng Anh.</div>`;
      } else {
        list.innerHTML = state.messages.map((m, i) => m.role === 'assistant'
          ? `<div class="aic-msg bot" data-i="${i}">${fmt(m.content)}<button type="button" class="aic-spk" data-say="${i}" title="Nghe phần tiếng Anh"><i data-lucide="volume-2"></i></button></div>`
          : `<div class="aic-msg ${m.role === 'user' ? 'user' : 'err'}" data-i="${i}">${fmt(m.content)}</div>`).join('')
          + (state.busy ? '<div class="aic-typing"><i></i><i></i><i></i></div>' : '');
        list.querySelectorAll('[data-say]').forEach((b) => (b.onclick = () => {
          const text = englishPart(state.messages[+b.dataset.say].content);
          if (!text) return toast('Tin nhắn này không có câu tiếng Anh để đọc.');
          speak(text);
        }));
        list.querySelectorAll('.aic-w').forEach((w) => (w.onclick = () => saveWord(w)));
      }
      $('[data-sugg]').innerHTML = state.messages.length ? '' : suggestions().map((s) => `<button type="button">${esc(s)}</button>`).join('');
      $('[data-sugg]').querySelectorAll('button').forEach((b) => (b.onclick = () => send(b.textContent)));
      $('[data-ctx]').textContent = (state.lessonTitle ? '📘 ' + state.lessonTitle : '💬 Hỏi đáp chung') + (state.kind !== 'chat' ? ' · ' + k.icon + ' ' + k.label : '');
      $('[data-title]').textContent = state.chatId ? (state.title || 'Hội thoại') : 'Hội thoại mới';
      const pin = $('[data-pin]');
      pin.classList.toggle('on', state.pinned); pin.disabled = !state.chatId;
      pin.title = state.pinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại quan trọng';
      list.scrollTop = list.scrollHeight;
      btn.disabled = state.busy;
      icons();
    }

    // ----- Danh sách hội thoại / chọn kiểu hội thoại mới -----
    const panel = $('[data-panel]');
    function showPanel(mode) {
      state.panel = state.panel === mode ? null : mode;
      panel.hidden = !state.panel;
      if (state.panel === 'new') {
        panel.innerHTML = '<div class="aic-ph">Chọn kiểu hội thoại mới</div>' + Object.entries(KINDS).map(([k, v]) => `<button type="button" class="aic-kind" data-kind="${k}"><span>${v.icon}</span><span><b>${v.label}</b><small>${esc(v.hint)}</small></span></button>`).join('');
        panel.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => newChat(b.dataset.kind)));
      } else if (state.panel === 'list') {
        paintList();
      }
      icons();
    }
    function paintList() {
      if (state.panel !== 'list') return;
      panel.innerHTML = state.chats.length
        ? state.chats.map((c) => `<div class="aic-row ${c.id === state.chatId ? 'active' : ''}" data-id="${c.id}"><button type="button" class="aic-open" data-open="${c.id}"><span>${c.pinned ? '📌' : (KINDS[c.kind] || KINDS.chat).icon}</span><span><b>${esc(c.title)}</b><small>${ago(c.updatedAt)} · ${c.messageCount} tin</small></span></button>`
          + `<button type="button" class="aic-ibtn" data-rowpin="${c.id}" title="${c.pinned ? 'Bỏ ghim' : 'Ghim'}"><i data-lucide="${c.pinned ? 'pin-off' : 'pin'}"></i></button>`
          + `<button type="button" class="aic-ibtn" data-rowren="${c.id}" title="Đổi tên"><i data-lucide="pencil"></i></button>`
          + `<button type="button" class="aic-ibtn danger" data-rowdel="${c.id}" title="Xóa"><i data-lucide="trash-2"></i></button></div>`).join('')
        : '<div class="aic-ph">Chưa có hội thoại nào ở mục này. Bấm dấu + để tạo mới.</div>';
      panel.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { state.chatId = b.dataset.open; state.panel = null; panel.hidden = true; load(); }));
      panel.querySelectorAll('[data-rowpin]').forEach((b) => (b.onclick = () => togglePin(b.dataset.rowpin)));
      panel.querySelectorAll('[data-rowren]').forEach((b) => (b.onclick = () => rename(b.dataset.rowren)));
      panel.querySelectorAll('[data-rowdel]').forEach((b) => (b.onclick = () => remove(b.dataset.rowdel)));
      icons();
    }
    const changed = () => { if (opts.onChatsChanged) opts.onChatsChanged(); };
    async function loadList() {
      try { state.chats = (await api('/api/ai/chats?classId=' + encodeURIComponent(opts.classId) + '&lessonId=' + encodeURIComponent(state.lessonId || ''))).chats; } catch { state.chats = []; }
      paintList();
    }
    function newChat(kind) {
      state.chatId = null; state.kind = kind; state.title = ''; state.pinned = false; state.messages = []; state.fresh = true;
      state.panel = null; panel.hidden = true;
      paint(); input.focus();
    }
    async function togglePin(id) {
      const c = state.chats.find((x) => x.id === id); if (!c) return;
      try {
        await api('/api/ai/chats/' + id, { method: 'PATCH', body: { pinned: !c.pinned } });
        toast(c.pinned ? 'Đã bỏ ghim' : '📌 Đã ghim hội thoại', 'success');
        if (id === state.chatId) state.pinned = !c.pinned;
        await loadList(); paint(); changed();
      } catch (e) { toast(e.message, 'error'); }
    }
    async function rename(id) {
      const c = state.chats.find((x) => x.id === id); if (!c) return;
      const m = openModal(`<h3>Đổi tên hội thoại</h3><form class="stack"><label class="field">Tên mới<input class="input" name="t" maxlength="60" value="${esc(c.title)}" required></label><div class="modal-actions"><button class="btn btn-primary">Lưu</button></div></form>`);
      m.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api('/api/ai/chats/' + id, { method: 'PATCH', body: { title: new FormData(e.target).get('t') } });
          m.close(); if (id === state.chatId) state.title = new FormData(e.target).get('t').trim();
          await loadList(); paint(); changed();
        } catch (err) { toast(err.message, 'error'); }
      };
    }
    async function remove(id) {
      const c = state.chats.find((x) => x.id === id); if (!c) return;
      if (!(await confirmModal('Xóa hội thoại này?', `"${c.title}" sẽ bị xóa vĩnh viễn.`))) return;
      try {
        await api('/api/ai/chats/' + id, { method: 'DELETE' });
        if (id === state.chatId) { state.chatId = null; state.messages = []; state.title = ''; state.pinned = false; state.kind = 'chat'; }
        await loadList(); paint(); changed();
      } catch (e) { toast(e.message, 'error'); }
    }

    // ----- Lưu từ in đậm vào sổ từ -----
    function saveWord(node) {
      const word = node.dataset.w, i = +node.closest('.aic-msg').dataset.i, text = plain(state.messages[i].content);
      const line = (text.split(/\n/).find((l) => l.toLowerCase().includes(word.toLowerCase())) || '').trim();
      const after = line.slice(line.toLowerCase().indexOf(word.toLowerCase()) + word.length);
      const mean = (after.match(/^\s*(?:[:\-–—]|\()\s*([^.\n)]{2,120})/) || [])[1] || '';
      const example = VI.test(line) ? '' : line.slice(0, 200);
      const m = openModal(`<h3>Lưu vào sổ từ 📒</h3><form class="stack">
        <label class="field">Từ / cụm từ<input class="input" name="word" maxlength="100" value="${esc(word)}" required></label>
        <label class="field">Nghĩa<input class="input" name="meaning" maxlength="300" value="${esc(mean.trim())}" placeholder="Nghĩa tiếng Việt" required></label>
        <label class="field">Ví dụ<input class="input" name="example" maxlength="500" value="${esc(example)}"></label>
        <div class="modal-actions"><button class="btn btn-primary">Lưu</button></div></form>`);
      m.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try { await api('/api/learning/vocabulary', { method: 'POST', body: { word: f.get('word'), meaning: f.get('meaning'), example: f.get('example') } }); m.close(); toast('Đã lưu "' + f.get('word') + '" vào sổ từ', 'success'); }
        catch (err) { toast(err.message, 'error'); }
      };
    }

    const query = () => `classId=${encodeURIComponent(opts.classId)}${state.lessonId ? '&lessonId=' + encodeURIComponent(state.lessonId) : ''}${state.chatId ? '&chatId=' + encodeURIComponent(state.chatId) : ''}`;

    async function load() {
      state.fresh = false;
      try {
        let d;
        try { d = await api('/api/ai/chat?' + query()); }
        catch (e) { if (!state.chatId) throw e; state.chatId = null; d = await api('/api/ai/chat?' + query()); } // hội thoại đã bị xóa: mở bản gần nhất
        state.messages = d.messages;
        state.mode = d.mode;
        state.lessonTitle = d.lessonTitle;
        state.chatId = d.chatId; state.title = d.title || ''; state.pinned = !!d.pinned; state.kind = d.kind || 'chat';
        if (opts.onInfo) opts.onInfo(d);
      } catch (e) { state.messages = [{ role: 'error', content: e.message }]; }
      paint();
      loadList();
    }

    async function send(text) {
      text = (text || '').trim();
      if (!text || state.busy) return;
      state.messages.push({ role: 'user', content: text });
      state.busy = true; state.fresh = false;
      input.value = ''; input.style.height = 'auto';
      state.panel = null; panel.hidden = true;
      paint();
      try {
        const body = { classId: opts.classId, lessonId: state.lessonId, message: text };
        if (state.chatId) body.chatId = state.chatId; else { body.newChat = true; body.kind = state.kind; }
        const d = await api('/api/ai/chat', { method: 'POST', body });
        state.messages.push({ role: 'assistant', content: d.reply });
        const isNew = !state.chatId;
        state.chatId = d.chatId; state.title = d.title || state.title; state.kind = d.kind || state.kind;
        loadList(); if (isNew) changed();
      } catch (e) {
        state.messages.push({ role: 'error', content: e.message });
      }
      state.busy = false;
      paint();
    }

    $('[data-form]').onsubmit = (e) => { e.preventDefault(); send(input.value); };
    input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } };
    input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(110, input.scrollHeight) + 'px'; };
    $('[data-new]').onclick = () => showPanel('new');
    $('[data-list-toggle]').onclick = () => { showPanel('list'); if (state.panel === 'list') loadList(); };
    $('[data-pin]').onclick = () => state.chatId && togglePin(state.chatId);

    load();
    return {
      reload: () => { if (!state.fresh) load(); }, // đang mở hội thoại mới chưa gõ gì thì giữ nguyên
      setLesson(id) { state.lessonId = id; state.chatId = null; state.kind = 'chat'; load(); },
      open(chatId) { state.chatId = chatId; load(); },
      // Slide đổi/hoạt động chốt -> chỉ cần tải lại ngữ cảnh chế độ (không xoá hội thoại)
    };
  }
  return { mount };
})();
