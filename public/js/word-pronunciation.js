// Ported from origin/nhanh_2 (a5642fb). Selection translation within lesson slides.
// Text is always rendered with textContent. Speech uses EngLive's existing browser voice.
(() => {
  const cache = new Map();
  const translations = new Map();
  let translationController;
  let panel, wordEl, ipaEl, statusEl, listen, retryIPA, retryTranslation, controller, timer, current = '', selectionSlide;
  let version = 0;
  function stop() {
    window.speechSynthesis?.cancel();
  }
  function close() {
    version++;
    controller?.abort();
    translationController?.abort();
    if (panel) panel.hidden = true;
    current = '';
    selectionSlide = null;
    stop();
  }
  function create() {
    if (panel) return;
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = '/css/word-pronunciation.css?v=englive-1';
    css.onload = () => { if (panel && !panel.hidden && panel.selectionRect) position(panel.selectionRect); };
    document.head.appendChild(css);
    panel = document.createElement('section');
    panel.id = 'word-pronunciation'; panel.hidden = true;
    panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Dịch và phát âm tiếng Anh');
    panel.innerHTML = '<button class="wp-close" type="button" aria-label="Đóng">×</button><div class="wp-title">PHÁT ÂM TIẾNG ANH</div><strong class="wp-word"></strong><div class="wp-ipa" aria-live="polite"></div><button class="wp-listen" type="button">🔊 Nghe phát âm</button><p class="wp-status" role="status"></p><a href="https://dictionaryapi.dev/" target="_blank" rel="noopener noreferrer">Nguồn phiên âm: Free Dictionary API</a>';
    wordEl = panel.querySelector('.wp-word'); ipaEl = panel.querySelector('.wp-ipa');
    panel.querySelector('.wp-title').textContent = 'DỊCH & PHÁT ÂM';
    const source = document.createElement('a');
    source.href = 'https://github.com/translate-tools/linguist';
    source.target = '_blank'; source.rel = 'noopener noreferrer';
    source.textContent = ' · Dịch: Google qua AnyLang (Linguist)'; panel.appendChild(source);
    statusEl = panel.querySelector('.wp-status'); listen = panel.querySelector('.wp-listen');
    listen.textContent = '🔊 Nghe';
    listen.title = 'Đọc tiếng Anh bằng giọng của trình duyệt';
    const ipaSource = panel.querySelector('a');
    ipaSource.href = 'https://github.com/cmusphinx/cmudict';
    ipaSource.textContent = 'Phiên âm: CMU (Mỹ) / Free Dictionary API';
    retryIPA = document.createElement('button');
    retryIPA.type = 'button'; retryIPA.className = 'wp-retry'; retryIPA.hidden = true;
    retryIPA.textContent = 'Thử lại phiên âm';
    listen.after(retryIPA);
    const info = document.createElement('details'); info.className = 'wp-info';
    const summary = document.createElement('summary'); summary.textContent = 'Chi tiết';
    const description = document.createElement('p'); description.textContent = 'Phiên âm từng từ; CMU dùng giọng Mỹ. Giọng đọc do trình duyệt cung cấp. Văn bản được chọn được gửi tới dịch vụ Google để dịch Anh–Việt.';
    info.append(summary, description, ipaSource, source);
    panel.appendChild(info);
    info.addEventListener('toggle', () => { if (!panel.hidden) position(panel.selectionRect); });
    retryIPA.onclick = () => loadPronunciation(current, panel.selectionRect, version);
    retryTranslation = document.createElement('button');
    retryTranslation.type = 'button'; retryTranslation.className = 'wp-retry'; retryTranslation.hidden = true;
    retryTranslation.textContent = 'Thử dịch lại';
    retryTranslation.onclick = () => translate(current, version);
    wordEl.after(retryTranslation);
    panel.querySelector('.wp-close').onclick = close;
    // Keep the highlighted word when pressing the speaker with a mouse.
    panel.addEventListener('mousedown', e => e.preventDefault());
    document.body.appendChild(panel);
  }
  function position(rect) {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    panel.style.left = Math.max(left + 8, Math.min(rect.left, left + width - panel.offsetWidth - 8)) + 'px';
    let y = rect.bottom + 10;
    if (y + panel.offsetHeight > top + height - 8) y = rect.top - panel.offsetHeight - 10;
    panel.style.top = Math.max(top + 8, y) + 'px';
  }
  function play(word) {
    stop();
    speak(word);
  }
  function render(data, word) {
    const entries = data.entries || [];
    listen.disabled = data.recognized === false;
    ipaEl.replaceChildren();
    if (entries.length) {
      const fragment = document.createDocumentFragment();
      for (const entry of entries) {
        const item = document.createElement('span'); item.className = 'wp-entry';
        const label = document.createElement('span'); label.className = 'wp-entry-word';
        label.textContent = entry.word + ':';
        const phonetic = document.createElement('span');
        phonetic.textContent = entry.ipa || 'chưa tra được phiên âm';
        item.append(label, phonetic); fragment.appendChild(item);
      }
      ipaEl.appendChild(fragment);
    } else ipaEl.textContent = 'Chưa tải được dữ liệu phiên âm. Bấm thử lại.';
    if (data.recognized === false) ipaEl.textContent = 'Chưa có đủ dữ liệu để xác nhận cách đọc của vùng chọn này.';
    const available = entries.some(entry => entry.ipa);
    statusEl.hidden = available && data.recognized !== false;
    statusEl.textContent = data.recognized === false ? 'Hãy chọn trọn từ tiếng Anh hoặc thêm ngữ cảnh.' : available ? 'Phiên âm từng từ; CMU dùng giọng Mỹ.' : 'Bạn vẫn có thể nghe văn bản bằng giọng của trình duyệt.';
    retryIPA.hidden = entries.length > 0 && !data.partial;
    listen.onclick = () => play(word);
  }
  async function translate(word, request) {
    translationController?.abort();
    retryTranslation.hidden = true;
    const key = word;
    if (translations.has(key)) { wordEl.textContent = translations.get(key); return; }
    wordEl.textContent = 'Đang dịch sang tiếng Việt…';
    const lookup = new AbortController();
    translationController = lookup;
    const timeout = setTimeout(() => lookup.abort(), 12000);
    try {
      if (!Auth.token) throw new Error('login');
      const response = await fetch('/api/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + Auth.token },
        body: JSON.stringify({ text: word }), signal: lookup.signal,
      });
      if (!response.ok) throw new Error(response.status === 422 || response.status === 400 ? 'unrecognized' : response.status === 404 ? 'server-update' : response.status === 429 ? 'rate' : response.status === 401 ? 'login' : 'translation');
      const data = await response.json();
      const translated = data.translation;
      if (typeof translated !== 'string' || !translated.trim() || translated.length > 6000) throw new Error('translation');
      if (request !== version) return;
      if (translations.size >= 200) translations.delete(translations.keys().next().value);
      translations.set(key, translated);
      wordEl.textContent = translated;
    } catch (error) {
      if (request === version) {
        wordEl.textContent = error.message === 'unrecognized' ? 'Chưa nhận diện được từ tiếng Anh. Hãy chọn trọn từ hoặc thêm ngữ cảnh.' : error.message === 'server-update' ? 'Máy chủ chưa cập nhật chức năng dịch. Hãy khởi động lại hệ thống.' : error.message === 'login' ? 'Đăng nhập để sử dụng dịch Anh–Việt.' : error.message === 'rate' ? 'Bạn dịch hơi nhanh. Hãy đợi một chút rồi thử lại.' : 'Chưa dịch được. Hãy thử lại sau.';
        retryTranslation.hidden = false;
      }
    } finally {
      clearTimeout(timeout);
      if (request === version && !panel.hidden) position(panel.selectionRect);
    }
  }
  async function show(word, rect, slide) {
    create(); stop(); controller?.abort();
    if (typeof WordPop !== 'undefined') WordPop.hide();
    const request = ++version;
    current = word; panel.hidden = false;
    selectionSlide = slide;
    panel.dataset.long = String(word.length > 60 || word.split(/\s+/).length > 8);
    panel.querySelector('.wp-info').open = false;
    panel.selectionRect = rect;
    wordEl.title = word;
    translate(word, request);
    loadPronunciation(word, rect, request);
  }
  async function loadPronunciation(word, rect, request) {
    controller?.abort();
    ipaEl.textContent = 'Đang tra phiên âm…';
    retryIPA.hidden = true;
    listen.disabled = false;
    statusEl.textContent = 'Bấm nút để nghe cách đọc.';
    statusEl.hidden = true;
    listen.onclick = () => play(word);
    position(rect);
    const key = word.toLowerCase().replace(/[‘’ʼ]/g, "'");
    if (cache.has(key)) { render(cache.get(key), word); position(rect); return; }
    const lookup = new AbortController();
    controller = lookup;
    const timeout = setTimeout(() => lookup.abort(), 12000);
    try {
      const response = await fetch('/api/pronunciation', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(Auth.token ? { Authorization: 'Bearer ' + Auth.token } : {}) },
        body: JSON.stringify({ text: word }), signal: lookup.signal,
      });
      if (!response.ok) throw new Error('pronunciation');
      const result = await response.json();
      if (!Array.isArray(result.entries) || !result.entries.length) throw new Error('pronunciation');
      if (request !== version) return;
      if (!result.partial) {
        if (cache.size >= 200) cache.delete(cache.keys().next().value);
        cache.set(key, result);
      }
      render(result, word);
    } catch {
      if (request !== version) return;
      render({}, word);
    } finally {
      clearTimeout(timeout);
      if (request === version && !panel.hidden) position(rect);
    }
  }
  function checkSelection() {
    const selection = window.getSelection();
    if (panel?.contains(document.activeElement) && (!selection || selection.isCollapsed)) return;
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) { close(); return; }
    const range = selection.getRangeAt(0);
    const element = node => node.nodeType === 1 ? node : node.parentElement;
    if (panel?.contains(range.commonAncestorContainer)) return;
    const startSlide = element(range.startContainer)?.closest('[data-translation-slide]');
    const endSlide = element(range.endContainer)?.closest('[data-translation-slide]');
    if (!startSlide || startSlide !== endSlide) { close(); return; }
    const excluded = 'button,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-no-pronunciation]';
    if ([range.startContainer, range.endContainer].some(n => element(n)?.closest(excluded))) { close(); return; }
    const raw = selection.toString();
    const word = raw.trim();
    const rules = window.SelectionText;
    if (!rules?.analyze(word).valid) { close(); return; }
    // Inspect neighboring text in the same block, including across inline markup.
    const blocks = 'p,li,td,th,h1,h2,h3,h4,h5,h6,div,section,article,main,blockquote,pre';
    const startRoot = element(range.startContainer)?.closest(blocks) || document.body;
    const endRoot = element(range.endContainer)?.closest(blocks) || document.body;
    const before = document.createRange(); before.selectNodeContents(startRoot);
    before.setEnd(range.startContainer, range.startOffset);
    const after = document.createRange(); after.selectNodeContents(endRoot);
    after.setStart(range.endContainer, range.endOffset);
    // Buttons and list markers are separate UI elements, not letters of the adjacent word.
    const boundaryText = context => {
      const contents = context.cloneContents();
      contents.querySelectorAll('button, [data-selection-boundary-ignore]').forEach(node => node.replaceWith(document.createTextNode(' ')));
      return contents.textContent;
    };
    if (rules.splitsWord(boundaryText(before).slice(-2), raw.slice(0, 2)) || rules.splitsWord(raw.slice(-2), boundaryText(after).slice(0, 2))) { close(); return; }
    if (current === word && panel && !panel.hidden) return;
    show(word, range.getBoundingClientRect(), startSlide);
  }
  document.addEventListener('selectionchange', () => {
    clearTimeout(timer); timer = setTimeout(checkSelection, 250);
  });
  document.addEventListener('pointerup', e => {
    if (!panel?.contains(e.target)) { clearTimeout(timer); timer = setTimeout(checkSelection, 20); }
  });
  document.addEventListener('pointerdown', e => { if (panel && !panel.hidden && !panel.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.addEventListener('scroll', e => { if (!panel?.contains(e.target)) close(); }, true);
  window.addEventListener('resize', close);
  window.SlideTranslation = { close, closeWithin(root) {
    if (selectionSlide && root.contains(selectionSlide)) close();
  } };
})();
