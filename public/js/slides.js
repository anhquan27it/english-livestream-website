// Render slide/hoạt động dùng chung: editor (view), phòng live của giáo viên và học sinh.
// Slides.render(root, ctx) vẽ lại toàn bộ; ctx = { scene, full, activity, role, local, handlers }
//  - role 'view'    : xem trước/biên tập, scene là bản đầy đủ (có đáp án)
//  - role 'teacher' : scene công khai + full (đáp án) + activity.stats
//  - role 'student' : scene công khai + activity.{phase, play, answered, result}
const Slides = (() => {
  const LETTERS = 'ABCDEF';
  const TAGS = { quiz: 'Quiz', poll: 'Poll', match: 'Matching game', order: 'Word order', fill: 'Fill in the blank', speak: 'Read aloud' };

  const speakBtn = (w) => `<button class="sl-say" data-speak="${esc(w)}" title="Nghe phát âm" aria-label="Nghe phát âm"><i data-lucide="volume-2"></i></button>`;

  const hl = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>').replace(/\n/g, '<br>');
  const inlineSay = (t) => `<button class="sl-say inline" data-speak="${esc(t)}" title="Nghe phát âm" aria-label="Nghe phát âm"><i data-lucide="volume-2"></i></button>`;

  // Các khối nội dung của slide: bài đọc, quy tắc, bảng, hội thoại (theo bố cục AI/giáo viên chọn)
  function blocksHtml(sc) {
    let h = '';
    if (sc.passage) h += `<div class="sl-passage">${hl(sc.passage)}</div>`;
    if (sc.rule) {
      const r = sc.rule;
      h += `<div class="sl-rule">${r.name ? `<b class="rn">${esc(r.name)}</b>` : ''}${r.formula ? `<div class="rf">${esc(r.formula)}</div>` : ''}${r.explanation ? `<p>${esc(r.explanation)}</p>` : ''}${r.examples && r.examples.length ? `<ul>${r.examples.map((e) => `<li>${esc(e)}${inlineSay(e)}</li>`).join('')}</ul>` : ''}</div>`;
    }
    if (sc.table && sc.table.headers) {
      h += `<div class="sl-tablewrap"><table class="sl-table"><thead><tr>${sc.table.headers.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${sc.table.rows.map((r) => `<tr>${sc.table.headers.map((_, i) => `<td>${esc(r[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if (sc.dialogue && sc.dialogue.length) {
      const sides = {};
      h += `<div class="sl-dialogue">${sc.dialogue.map((d) => { if (!(d.speaker in sides)) sides[d.speaker] = Object.keys(sides).length % 2 ? 'r' : 'l'; return `<div class="dl ${sides[d.speaker]}"><span class="sp">${esc(d.speaker)}</span><p>${esc(d.text)}${inlineSay(d.text)}</p></div>`; }).join('')}</div>`;
    }
    return h;
  }

  function slideHtml(sc) {
    return `<div class="sl-head"><span class="sl-emoji">${esc(sc.emoji || '📘')}</span><h2>${esc(sc.title)}</h2></div>
      ${blocksHtml(sc)}
      ${sc.bullets && sc.bullets.length ? `<ul class="sl-bullets">${sc.bullets.map((b, i) => `<li><b>${i + 1}</b><span>${esc(b)}</span></li>`).join('')}</ul>` : ''}
      ${sc.vocab && sc.vocab.length ? `<div class="sl-vocab">${sc.vocab.map((v) => `<div class="sl-word">${speakBtn(v.word)}<b>${esc(v.word)}</b><i>${esc(v.ipa)}</i><span>${esc(v.meaning)}</span>${v.example ? `<small>“${esc(v.example)}”</small>` : ''}</div>`).join('')}</div>` : ''}`;
  }

  // Khối kết quả cá nhân + bảng xếp hạng sau khi giáo viên chốt
  function resultFooter(result, role) {
    if (!result) return '';
    let html = '';
    if (role === 'student' && result.me) {
      const m = result.me;
      html += m.answered
        ? `<div class="sl-me ${m.correct === false && m.fraction < 1 ? 'bad' : 'good'}">${m.correct ? '🎉 Chính xác!' : m.correct === null ? '✅ Cảm ơn bạn đã tham gia' : m.fraction > 0 ? '👍 Đúng một phần' : '❌ Chưa đúng'}${m.points ? ` <b>+${m.points}</b> điểm` : ''}${m.rank ? ` · Hạng #${m.rank} (${m.total} điểm)` : ''}</div>`
        : '<div class="sl-me bad">Bạn chưa trả lời câu này</div>';
    }
    if (role === 'teacher') html += `<div class="sl-me good">${result.answered}/${result.viewers} học sinh trả lời${result.type !== 'poll' ? ` · ${result.correctCount} đúng` : ''}</div>`;
    if (result.leaderboard && result.leaderboard.length && result.type !== 'poll') {
      html += `<ol class="sl-board">${result.leaderboard.map((r) => `<li><span>${esc(r.name)}</span><b>${r.points}</b></li>`).join('')}</ol>`;
    }
    return html;
  }

  // ----- Trắc nghiệm / bình chọn -----
  function choiceHtml(ctx) {
    const { scene, full, activity: act, role } = ctx;
    const isPoll = scene.type === 'poll';
    const sc = full || scene;
    const open = act && act.phase === 'open';
    const ended = act && act.phase === 'ended';
    const dist = ended ? act.result.distribution : act && act.stats ? act.stats.distribution : null;
    const total = dist ? dist.reduce((a, b) => a + b, 0) || 1 : 1;
    const playable = role === 'student' && open && !act.answered;
    const mine = ctx.local.pick;
    const answerIdx = ended ? act.result.reveal.answer : role === 'view' || role === 'teacher' ? sc.answer : null;
    const options = (act && act.play && act.play.options) || scene.options;
    const opts = options.map((o, i) => {
      const cls = [];
      if (answerIdx != null && !isPoll && (ended || role === 'view' || role === 'teacher')) cls.push(i === answerIdx ? 'correct' : ended ? 'wrong' : '');
      if (mine === i && role === 'student') cls.push('picked');
      if (!playable) cls.push('static');
      const bar = dist && (ended || role === 'teacher') ? `<em class="sl-bar" style="width:${Math.round((dist[i] / total) * 100)}%"></em><u>${dist[i]}</u>` : '';
      return `<button class="sl-opt ${cls.join(' ')}" data-i="${i}" ${playable ? '' : 'disabled'}><b>${LETTERS[i]}</b><span>${esc(o)}</span>${bar}</button>`;
    }).join('');
    let foot = '';
    if (role === 'student') {
      if (!act) foot = '<div class="sl-wait">⏳ Chờ giáo viên bắt đầu…</div>';
      else if (open && act.answered) foot = '<div class="sl-wait">✅ Đã gửi đáp án! Chờ giáo viên chốt kết quả…</div>';
      else if (open) foot = '<div class="sl-wait go">👆 Chọn một đáp án</div>';
    }
    if (ended) {
      const ex = !isPoll && act.result.reveal.explanation;
      foot = (ex ? `<div class="sl-explain">💡 ${esc(ex)}</div>` : '') + resultFooter(act.result, role);
    } else if (role === 'view' && !isPoll && sc.explanation) {
      foot = `<div class="sl-explain">💡 ${esc(sc.explanation)}</div>`;
    }
    return `<div class="sl-tag">${TAGS[scene.type]}</div><h2 class="sl-question">${esc(scene.question)}</h2><div class="sl-options">${opts}</div>${foot}`;
  }

  // ----- Ghép cặp -----
  function matchHtml(ctx) {
    const { scene, full, activity: act, role } = ctx;
    const sc = full || scene;
    const head = `<div class="sl-tag">${TAGS.match}</div><h2 class="sl-question">${esc(scene.title)}</h2><p class="sl-sub">${esc(scene.instruction || '')}</p>`;
    if (role === 'view' || (role === 'teacher' && (!act || act.phase === 'open') && sc.pairs)) {
      const prog = role === 'teacher' && act ? `<div class="sl-wait">📝 ${act.stats.answered} học sinh đã nộp</div>` : '';
      return head + `<div class="sl-pairs">${sc.pairs.map((p) => `<div><b>${esc(p.left)}</b><span>${esc(p.right)}</span></div>`).join('')}</div>${prog}`;
    }
    if (!act) return head + '<div class="sl-wait">⏳ Chờ giáo viên bắt đầu…</div>';
    if (act.phase === 'ended') {
      const rev = act.result.reveal.pairs;
      return head + `<div class="sl-pairs">${rev.map((p) => `<div><b>${esc(p.left)}</b><span>${esc(p.right)}</span></div>`).join('')}</div>${resultFooter(act.result, role)}`;
    }
    const { lefts, rights } = act.play;
    const L = ctx.local;
    L.pairs = L.pairs || lefts.map(() => null);
    const done = L.pairs.every((x) => x !== null);
    const hue = (i) => `--c:${(i * 67 + 250) % 360}`;
    if (act.answered) return head + '<div class="sl-wait">✅ Đã gửi đáp án! Chờ giáo viên chốt kết quả…</div>';
    return head + `<div class="sl-mgrid">
      <div class="col">${lefts.map((l, i) => `<button class="sl-m ${L.sel === i ? 'sel' : ''} ${L.pairs[i] !== null ? 'paired' : ''}" data-l="${i}" style="${L.pairs[i] !== null ? hue(i) : ''}">${esc(l)}</button>`).join('')}</div>
      <div class="col">${rights.map((r, j) => { const owner = L.pairs.indexOf(j); return `<button class="sl-m ${owner >= 0 ? 'paired' : ''}" data-r="${j}" style="${owner >= 0 ? hue(owner) : ''}">${esc(r)}</button>`; }).join('')}</div>
    </div><div class="sl-actions"><button class="btn btn-primary" data-submit ${done ? '' : 'disabled'}>Nộp bài</button></div>`;
  }

  // ----- Xếp từ thành câu -----
  function orderHtml(ctx) {
    const { scene, full, activity: act, role } = ctx;
    const sc = full || scene;
    const head = `<div class="sl-tag">${TAGS.order}</div><h2 class="sl-question">${esc(scene.title)}</h2>${scene.translation ? `<p class="sl-sub">💬 ${esc(scene.translation)}</p>` : ''}`;
    if (role === 'view' || (role === 'teacher' && (!act || act.phase === 'open'))) {
      const prog = role === 'teacher' && act ? `<div class="sl-wait">📝 ${act.stats.answered} học sinh đã nộp</div>` : '';
      return head + `<div class="sl-line">${sc.sentence.split(' ').map((w) => `<span class="sl-chip static">${esc(w)}</span>`).join('')}</div>${prog}`;
    }
    if (!act) return head + '<div class="sl-wait">⏳ Chờ giáo viên bắt đầu…</div>';
    if (act.phase === 'ended') {
      return head + `<div class="sl-line">${act.result.reveal.sentence.split(' ').map((w) => `<span class="sl-chip ok">${esc(w)}</span>`).join('')}</div>${resultFooter(act.result, role)}`;
    }
    if (act.answered) return head + '<div class="sl-wait">✅ Đã gửi đáp án! Chờ giáo viên chốt kết quả…</div>';
    const L = ctx.local;
    const words = act.play.words;
    L.picked = L.picked || [];
    const bank = words.map((w, i) => (L.picked.includes(i) ? '' : `<button class="sl-chip" data-bank="${i}">${esc(w)}</button>`)).join('');
    const line = L.picked.map((i, k) => `<button class="sl-chip pick" data-line="${k}">${esc(words[i])}</button>`).join('');
    return head + `<div class="sl-line target ${L.picked.length ? '' : 'empty'}">${line || '<small>Bấm các từ bên dưới để xếp thành câu</small>'}</div>
      <div class="sl-line bank">${bank}</div>
      <div class="sl-actions"><button class="btn btn-outline btn-sm" data-clear>Làm lại</button><button class="btn btn-primary" data-submit ${L.picked.length === words.length ? '' : 'disabled'}>Nộp bài</button></div>`;
  }

  // ----- Điền từ (gõ đáp án) -----
  function fillHtml(ctx) {
    const { scene, full, activity: act, role } = ctx;
    const sc = full || scene;
    const parts = scene.sentence.split('___');
    const head = `<div class="sl-tag">${TAGS.fill}</div><h2 class="sl-question">${esc(scene.title)}</h2>${scene.hint ? `<p class="sl-sub">💡 ${esc(scene.hint)}</p>` : ''}${scene.translation ? `<p class="sl-sub">💬 ${esc(scene.translation)}</p>` : ''}`;
    const sentence = (render) => `<p class="sl-gap">${parts.map((p, i) => esc(p) + (i < parts.length - 1 ? render(i) : '')).join('')}</p>`;
    if (role === 'view' || (role === 'teacher' && (!act || act.phase === 'open') && sc.answers)) {
      const prog = role === 'teacher' && act ? `<div class="sl-wait">📝 ${act.stats.answered} học sinh đã nộp</div>` : '';
      return head + sentence((i) => `<span class="gap ok">${esc(sc.answers[i][0])}</span>`) + prog;
    }
    if (!act) return head + '<div class="sl-wait">⏳ Chờ giáo viên bắt đầu…</div>';
    const L = ctx.local;
    L.vals = L.vals || [];
    if (act.phase === 'ended') {
      const ans = act.result.reveal.answers;
      const ok = act.result.me && act.result.me.detail ? act.result.me.detail.blanks : null;
      return head + sentence((i) => (ok && !ok[i]
        ? `<span class="gap bad"><s>${esc(L.vals[i] || '—')}</s> → ${esc(ans[i])}</span>`
        : `<span class="gap ok">${esc(ans[i])}</span>`)) + resultFooter(act.result, role);
    }
    if (act.answered) return head + '<div class="sl-wait">✅ Đã gửi đáp án! Chờ giáo viên chốt kết quả…</div>';
    const n = act.play.blanks;
    const done = Array.from({ length: n }, (_, i) => (L.vals[i] || '').trim()).every(Boolean);
    return head + sentence((i) => `<input class="sl-blank" data-b="${i}" value="${esc(L.vals[i] || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:${Math.max(6, (L.vals[i] || '').length + 2)}ch" />`)
      + `<div class="sl-actions"><button class="btn btn-primary" data-submit-fill ${done ? '' : 'disabled'}>Nộp bài</button></div>`;
  }

  // ----- Đọc to (chấm phát âm bằng nhận dạng giọng nói của trình duyệt) -----
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function speakHtml(ctx) {
    const { scene, full, activity: act, role } = ctx;
    const head = `<div class="sl-tag">${TAGS.speak}</div><h2 class="sl-question">${esc(scene.title)}</h2>`;
    const target = (full && full.sentence) || (act && act.play && act.play.sentence) || (act && act.result && act.result.reveal.sentence) || '';
    const trans = scene.translation ? `<p class="sl-sub">💬 ${esc(scene.translation)}</p>` : '';
    if (role === 'view' || (role === 'teacher' && (!act || act.phase === 'open'))) {
      const prog = role === 'teacher' && act ? `<div class="sl-wait">📝 ${act.stats.answered} học sinh đã đọc</div>` : '';
      return head + `<p class="sl-say-target">${esc(target)}${inlineSay(target)}</p>${trans}${prog}`;
    }
    if (!act) return head + '<div class="sl-wait">⏳ Chờ giáo viên bắt đầu…</div>';
    const L = ctx.local;
    if (act.phase === 'ended') {
      const det = act.result.me && act.result.me.detail;
      const words = det ? det.words.map((w) => `<span class="sw ${w.ok ? 'ok' : 'bad'}">${esc(w.w)}</span>`).join(' ') : esc(target);
      return head + `<p class="sl-say-target">${words}</p>${det && det.transcript ? `<p class="sl-sub">Bạn đã nói: “${esc(det.transcript)}”</p>` : ''}${trans}${resultFooter(act.result, role)}`;
    }
    if (act.answered) return head + `<p class="sl-say-target">${esc(target)}</p><div class="sl-wait">✅ Đã gửi bài đọc! Chờ giáo viên chốt kết quả…</div>`;
    if (!SR) return head + `<p class="sl-say-target">${esc(target)}</p><div class="sl-wait">⚠️ Trình duyệt này không hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome hoặc Edge.</div>`;
    return head + `<p class="sl-say-target">${esc(target)}${inlineSay(target)}</p>${trans}
      <div class="sl-actions" style="flex-wrap:wrap;align-items:center">
        <button class="btn ${L.listening ? 'btn-live' : 'btn-primary'}" data-rec ${L.listening ? 'disabled' : ''}><i data-lucide="mic"></i> ${L.listening ? 'Đang nghe…' : L.transcript ? 'Đọc lại' : 'Bấm để đọc'}</button>
        ${L.transcript ? `<button class="btn btn-accent" data-speak-submit>Nộp bài</button>` : ''}
      </div>
      ${L.transcript ? `<p class="sl-sub">Máy nghe được: “${esc(L.transcript)}”</p>` : ''}${L.error ? `<p class="sl-sub" style="color:var(--pink)">Không nghe được (${esc(L.error)}). Hãy kiểm tra quyền micro rồi thử lại.</p>` : ''}`;
  }

  function render(root, ctx) {
    ctx.local = ctx.local || {};
    const sc = ctx.scene;
    if (!sc) { root.innerHTML = ''; return; }
    const body = sc.type === 'slide' ? slideHtml(sc) : sc.type === 'quiz' || sc.type === 'poll' ? choiceHtml(ctx) : sc.type === 'match' ? matchHtml(ctx) : sc.type === 'fill' ? fillHtml(ctx) : sc.type === 'speak' ? speakHtml(ctx) : orderHtml(ctx);
    const act = ctx.activity;
    const timer = act && act.phase === 'open' && act.localEnds ? `<div class="sl-timer" data-deadline="${act.localEnds}" data-dur="${act.durationMs}"><span>⏱ <b></b></span><i><em></em></i></div>` : '';
    root.innerHTML = `<div class="sl sl-${sc.type}"><div class="sl-in">${timer}${body}</div></div>`;
    bind(root, ctx);
    icons();
    if (typeof WordPop !== 'undefined') WordPop.decorate(root, sc); // bấm từ vựng / bôi đen từ để tra nhanh
  }

  function bind(root, ctx) {
    const L = ctx.local;
    const again = () => render(root, ctx);
    root.querySelectorAll('[data-speak]').forEach((b) => (b.onclick = () => speak(b.dataset.speak)));
    root.querySelectorAll('.sl-opt:not(.static)').forEach((b) => (b.onclick = () => {
      L.pick = +b.dataset.i;
      ctx.handlers.answer(L.pick, () => { L.pick = undefined; again(); });
      again();
    }));
    root.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { L.sel = L.sel === +b.dataset.l ? null : +b.dataset.l; again(); }));
    root.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => {
      const j = +b.dataset.r;
      const owner = L.pairs.indexOf(j);
      if (owner >= 0 && L.sel == null) { L.pairs[owner] = null; return again(); }
      if (L.sel == null) return;
      if (owner >= 0) L.pairs[owner] = null;
      L.pairs[L.sel] = j;
      L.sel = null;
      again();
    }));
    root.querySelectorAll('[data-bank]').forEach((b) => (b.onclick = () => { L.picked.push(+b.dataset.bank); again(); }));
    root.querySelectorAll('[data-line]').forEach((b) => (b.onclick = () => { L.picked.splice(+b.dataset.line, 1); again(); }));
    root.querySelectorAll('[data-clear]').forEach((b) => (b.onclick = () => { L.picked = []; again(); }));
    root.querySelectorAll('.sl-blank').forEach((el, idx, all) => {
      const n = ctx.activity.play.blanks;
      const filled = () => Array.from({ length: n }, (_, i) => (L.vals[i] || '').trim()).every(Boolean);
      el.oninput = () => {
        L.vals = L.vals || [];
        L.vals[+el.dataset.b] = el.value;
        el.style.width = Math.max(6, el.value.length + 2) + 'ch';
        const btn = root.querySelector('[data-submit-fill]');
        if (btn) btn.disabled = !filled();
      };
      el.onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (idx < all.length - 1) all[idx + 1].focus();
        else if (filled()) root.querySelector('[data-submit-fill]').click();
      };
    });
    root.querySelectorAll('[data-submit-fill]').forEach((b) => (b.onclick = () => {
      const n = ctx.activity.play.blanks;
      ctx.handlers.answer(Array.from({ length: n }, (_, i) => (L.vals[i] || '').trim()), () => again());
    }));
    root.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => {
      if (!SR || L.listening) return;
      const r = new SR();
      r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1;
      L.error = null; L.listening = true;
      r.onresult = (e) => { L.transcript = e.results[0][0].transcript; };
      r.onerror = (e) => { L.error = e.error; };
      r.onend = () => { L.listening = false; again(); };
      try { r.start(); } catch { L.listening = false; }
      again();
    }));
    root.querySelectorAll('[data-speak-submit]').forEach((b) => (b.onclick = () => ctx.handlers.answer({ transcript: L.transcript }, () => again())));
    root.querySelectorAll('[data-submit]').forEach((b) => (b.onclick = () => {
      const play = ctx.activity.play;
      const answer = ctx.scene.type === 'match' ? L.pairs.map((j) => play.rights[j]) : L.picked.map((i) => play.words[i]);
      ctx.handlers.answer(answer, () => again());
    }));
  }

  return { render, TAGS };
})();
