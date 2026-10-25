// Render slide/hoạt động dùng chung: editor (view), phòng live của giáo viên và học sinh.
// Slides.render(root, ctx) vẽ lại toàn bộ; ctx = { scene, full, activity, role, local, handlers }
//  - role 'view'    : xem trước/biên tập, scene là bản đầy đủ (có đáp án)
//  - role 'teacher' : scene công khai + full (đáp án) + activity.stats
//  - role 'student' : scene công khai + activity.{phase, play, answered, result}
const Slides = (() => {
  const LETTERS = 'ABCDEF';
  const TAGS = { quiz: 'Quiz', poll: 'Poll', match: 'Matching game', order: 'Word order' };

  const speakBtn = (w) => `<button class="sl-say" data-speak="${esc(w)}" title="Nghe phát âm" aria-label="Nghe phát âm"><i data-lucide="volume-2"></i></button>`;

  function slideHtml(sc) {
    return `<div class="sl-head"><span class="sl-emoji">${esc(sc.emoji || '📘')}</span><h2>${esc(sc.title)}</h2></div>
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

  function render(root, ctx) {
    ctx.local = ctx.local || {};
    const sc = ctx.scene;
    if (!sc) { root.innerHTML = ''; return; }
    const body = sc.type === 'slide' ? slideHtml(sc) : sc.type === 'quiz' || sc.type === 'poll' ? choiceHtml(ctx) : sc.type === 'match' ? matchHtml(ctx) : orderHtml(ctx);
    root.innerHTML = `<div class="sl sl-${sc.type}"><div class="sl-in">${body}</div></div>`;
    bind(root, ctx);
    icons();
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
    root.querySelectorAll('[data-submit]').forEach((b) => (b.onclick = () => {
      const play = ctx.activity.play;
      const answer = ctx.scene.type === 'match' ? L.pairs.map((j) => play.rights[j]) : L.picked.map((i) => play.words[i]);
      ctx.handlers.answer(answer, () => again());
    }));
  }

  return { render, TAGS };
})();
