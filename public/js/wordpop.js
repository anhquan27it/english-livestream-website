// Tra từ nhanh trên slide: bấm một từ vựng của bài, hoặc bôi đen một từ/cụm từ tiếng Anh -> hộp nhỏ hiện
// phát âm, phiên âm, nghĩa, ví dụ và nút lưu vào sổ từ. Từ có trong bảng từ vựng của bài tra tức thì (không tốn AI);
// từ khác được tra bằng AI qua /api/ai/lookup (có bộ nhớ đệm ở máy chủ).
const WordPop = (() => {
  const lex = new Map();          // từ gốc (chữ thường) -> { word, ipa, meaning, example }
  const cache = new Map();        // kết quả tra AI đã có ở trình duyệt
  let classId = null, pop = null, shownFor = null, seq = 0;
  const SUFFIX = ['ies', 'ied', 'ing', 'es', 'ed', 's', 'd'];
  const clean = (w) => String(w || '').toLowerCase().replace(/^\(?to\)?\s+/, '').replace(/[“”"().,!?;:]/g, '').replace(/\s+/g, ' ').trim();
  const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const valid = (t) => /^[A-Za-z][A-Za-z'’ -]*$/.test(t) && t.split(' ').length <= 5 && t.length <= 50;

  // Tìm mục từ vựng theo dạng đã chia (takes -> take, studies -> study)
  function find(text) {
    const t = clean(text);
    if (lex.has(t)) return lex.get(t);
    for (const suf of SUFFIX) {
      if (!t.endsWith(suf) || t.length <= suf.length + 1) continue;
      const base = t.slice(0, -suf.length);
      for (const cand of [base, base + 'e', suf === 'ies' || suf === 'ied' ? base + 'y' : null]) if (cand && lex.has(cand)) return lex.get(cand);
    }
    return null;
  }

  function hide() { if (pop) { pop.remove(); pop = null; shownFor = null; } }

  function place(rect) {
    const w = Math.min(340, innerWidth - 16);
    pop.style.width = w + 'px';
    const h = pop.offsetHeight;
    let left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), innerWidth - w - 8);
    let top = rect.bottom + 8;
    if (top + h > innerHeight - 8) top = Math.max(8, rect.top - h - 8);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }

  function render(entry, rect, state) {
    const e = entry || {};
    const body = state === 'loading'
      ? '<div class="wp-load"><i></i> Đang tra…</div>'
      : state === 'error' ? `<div class="wp-err">${esc(e.error || 'Chưa tra được từ này.')}</div>`
        : `<div class="wp-mean">${esc(e.meaning || '')}</div>${e.example ? `<div class="wp-ex">“${esc(e.example)}”</div>` : ''}`;
    pop.innerHTML = `<div class="wp-head"><button type="button" class="wp-say" data-say title="Nghe phát âm" aria-label="Nghe phát âm"><i data-lucide="volume-2"></i></button><b>${esc(e.word || '')}</b>${e.ipa ? `<span class="wp-ipa">${esc(e.ipa)}</span>` : ''}${e.pos ? `<em>${esc(e.pos)}</em>` : ''}<button type="button" class="wp-x" data-x aria-label="Đóng">✕</button></div>${body}${state === 'ok' ? '<button type="button" class="wp-save" data-save>📒 Lưu vào sổ từ</button>' : ''}`;
    pop.querySelector('[data-x]').onclick = hide;
    pop.querySelector('[data-say]').onclick = () => speak(e.word || '');
    const save = pop.querySelector('[data-save]');
    if (save) save.onclick = async () => {
      save.disabled = true;
      try { await api('/api/learning/vocabulary', { method: 'POST', body: { word: e.word, meaning: e.meaning, example: e.example || '' } }); save.textContent = '✅ Đã lưu'; toast('Đã lưu "' + e.word + '" vào sổ từ', 'success'); }
      catch (err) { save.textContent = /đã lưu/i.test(err.message) ? '✅ Đã có trong sổ từ' : '⚠ ' + err.message; }
    };
    if (window.icons) icons();
    place(rect);
  }

  async function show(text, rect, context) {
    const t = clean(text);
    if (!valid(t)) return;
    const mine = ++seq;
    hide();
    pop = document.createElement('div');
    pop.id = 'wordPop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Tra từ');
    document.body.appendChild(pop);
    shownFor = t;
    const known = find(t);
    if (known) return render(known, rect, 'ok');
    render({ word: t }, rect, 'loading');
    const key = (classId || '') + '|' + t;
    try {
      let d = cache.get(key);
      if (!d) { d = await api('/api/ai/lookup', { method: 'POST', body: { classId, word: t, context } }); cache.set(key, d); }
      if (mine === seq && pop) render(d, rect, 'ok');
    } catch (err) { if (mine === seq && pop) render({ word: t, error: err.message }, rect, 'error'); }
  }

  // Bọc các từ vựng của bài trong chữ của slide (bài đọc, gạch đầu dòng, quy tắc, hội thoại, bảng)
  function wrapWords(root) {
    const keys = [...lex.keys()].filter((k) => k && /^[a-z]/.test(k)).sort((a, b) => b.length - a.length);
    if (!keys.length) return;
    const re = new RegExp("(?<![A-Za-z'’])(" + keys.map((k) => rx(k).replace(/ /g, '\\s+')).join('|') + ")(?:ies|ied|ing|es|ed|s|d)?(?![A-Za-z'’])", 'gi');
    const scopes = root.querySelectorAll('.sl-passage, .sl-bullets span, .sl-rule, .sl-dialogue p, .sl-table td');
    scopes.forEach((scope) => {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('button, .wp-w, script, input') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((n) => {
        const txt = n.nodeValue; re.lastIndex = 0;
        if (!re.test(txt)) return;
        re.lastIndex = 0;
        const frag = document.createDocumentFragment(); let last = 0, m;
        while ((m = re.exec(txt))) {
          if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
          const span = document.createElement('span'); span.className = 'wp-w'; span.textContent = m[0]; span.tabIndex = 0; span.setAttribute('role', 'button');
          frag.appendChild(span); last = m.index + m[0].length;
        }
        if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
        n.parentNode.replaceChild(frag, n);
      });
    });
  }

  // Gọi cuối Slides.render: nhớ từ vựng của slide và gắn sự kiện bấm
  function decorate(root, scene) {
    hide();
    if (scene && scene.vocab) scene.vocab.forEach((v) => { const k = clean(v.word); if (k) lex.set(k, { word: v.word, ipa: v.ipa, meaning: v.meaning, example: v.example, pos: '' }); });
    if (scene && scene.type === 'slide') wrapWords(root);
    root.querySelectorAll('.wp-w').forEach((w) => {
      const open = () => show(w.textContent, w.getBoundingClientRect(), w.parentElement.textContent);
      w.onclick = (e) => { e.stopPropagation(); open(); };
      w.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
  }

  // Bôi đen từ/cụm từ trong slide -> hiện hộp tra
  function onSelect() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const el = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (!el || !el.closest('.sl') || el.closest('button, input, textarea, select, #wordPop')) return;
    const text = clean(sel.toString());
    if (!valid(text) || text === shownFor) return;
    const block = el.closest('p, li, td, span, div') || el;
    show(text, range.getBoundingClientRect(), (block.textContent || '').slice(0, 240));
  }
  document.addEventListener('mouseup', () => setTimeout(onSelect, 20));
  document.addEventListener('touchend', () => setTimeout(onSelect, 350));
  document.addEventListener('mousedown', (e) => { if (pop && !e.target.closest('#wordPop') && !e.target.closest('.wp-w')) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  addEventListener('resize', hide);
  document.addEventListener('scroll', () => { if (pop) hide(); }, true);

  return { decorate, setClass(id) { classId = id || null; }, hide, find, lex };
})();
