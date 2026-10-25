// Chat box AI dùng chung: AiChat.mount(el, { classId, lessonId, dark, onLessonInfo })
const AiChat = (() => {
  // Markdown rất nhẹ: **đậm**, `mã`, xuống dòng. Luôn escape trước để tránh chèn HTML.
  const fmt = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');

  function mount(el, opts) {
    const state = { busy: false, messages: [], lessonId: opts.lessonId || null };
    el.innerHTML = `<div class="aic ${opts.dark ? 'dark' : ''}">
      <div class="aic-tools"><span data-ctx></span><button data-clear title="Xoá cuộc trò chuyện">Xoá hội thoại</button></div>
      <div class="aic-list" data-list></div>
      <div class="aic-sugg" data-sugg></div>
      <form class="aic-form" data-form><textarea rows="1" maxlength="1000" placeholder="Hỏi AI về bài học… (Enter để gửi)"></textarea><button aria-label="Gửi"><i data-lucide="send"></i></button></form></div>`;
    const $ = (s) => el.querySelector(s);
    const list = $('[data-list]'), input = $('textarea'), btn = $('[data-form] button');

    const suggestions = () => (state.mode === 'live'
      ? ['Giải thích slide này giúp em', 'Cho em thêm ví dụ', 'Từ này phát âm thế nào?']
      : state.lessonId ? ['Tóm tắt bài học hôm nay', 'Cho em 3 câu luyện tập', 'Giải thích ngữ pháp trong bài'] : ['Giúp em luyện hội thoại', 'Sửa câu tiếng Anh của em', 'Giải thích một cấu trúc ngữ pháp']);

    function paint() {
      if (!state.messages.length) {
        list.innerHTML = `<div class="aic-hello"><div class="emoji">🤖</div><b>Teacher Bot</b>Hỏi bất cứ điều gì về bài học. Bạn có thể viết tiếng Việt hoặc tiếng Anh.</div>`;
      } else {
        list.innerHTML = state.messages.map((m) => `<div class="aic-msg ${m.role === 'user' ? 'user' : m.role === 'error' ? 'err' : 'bot'}">${fmt(m.content)}</div>`).join('')
          + (state.busy ? '<div class="aic-typing"><i></i><i></i><i></i></div>' : '');
      }
      $('[data-sugg]').innerHTML = state.messages.length ? '' : suggestions().map((s) => `<button type="button">${esc(s)}</button>`).join('');
      $('[data-sugg]').querySelectorAll('button').forEach((b) => (b.onclick = () => send(b.textContent)));
      $('[data-ctx]').textContent = state.lessonTitle ? '📘 ' + state.lessonTitle : '💬 Hỏi đáp chung';
      list.scrollTop = list.scrollHeight;
      btn.disabled = state.busy;
      icons();
    }

    const query = () => `classId=${encodeURIComponent(opts.classId)}${state.lessonId ? '&lessonId=' + encodeURIComponent(state.lessonId) : ''}`;

    async function load() {
      try {
        const d = await api('/api/ai/chat?' + query());
        state.messages = d.messages;
        state.mode = d.mode;
        state.lessonTitle = d.lessonTitle;
        if (opts.onInfo) opts.onInfo(d);
      } catch (e) { state.messages = [{ role: 'error', content: e.message }]; }
      paint();
    }

    async function send(text) {
      text = (text || '').trim();
      if (!text || state.busy) return;
      state.messages.push({ role: 'user', content: text });
      state.busy = true;
      input.value = '';
      paint();
      try {
        const d = await api('/api/ai/chat', { method: 'POST', body: { classId: opts.classId, lessonId: state.lessonId, message: text } });
        state.messages.push({ role: 'assistant', content: d.reply });
      } catch (e) {
        state.messages.push({ role: 'error', content: e.message });
      }
      state.busy = false;
      paint();
    }

    $('[data-form]').onsubmit = (e) => { e.preventDefault(); send(input.value); };
    input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } };
    input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(110, input.scrollHeight) + 'px'; };
    $('[data-clear]').onclick = async () => {
      if (!state.messages.length) return;
      await api('/api/ai/chat?' + query(), { method: 'DELETE' }).catch(() => {});
      state.messages = [];
      paint();
    };

    load();
    return {
      reload: load,
      setLesson(id) { state.lessonId = id; load(); },
      // Slide đổi/hoạt động chốt -> chỉ cần tải lại ngữ cảnh chế độ (không xoá hội thoại)
    };
  }
  return { mount };
})();
