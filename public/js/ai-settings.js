const me = Auth.require('admin');
const PRESETS = [
  { name: '9Router (local)', baseUrl: 'http://localhost:20128/v1', models: ['ag/gemini-3.8-flash-high'] },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini'] },
  { name: 'Google Gemini (OpenAI-compatible)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-2.5-flash'] },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: [] },
  { name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', models: [] },
  { name: 'Tuỳ chỉnh (OpenAI-compatible)', baseUrl: '', models: [] },
];

let st = null;        // bản làm việc: { providers, active, tasks, temperature }
let keys = {};        // providerId -> khoá mới nhập (không có = giữ khoá cũ trên server)
let dirty = false;
const $ = (id) => document.getElementById(id);

if (me) {
  buildSidebar('teacher', 'ai');
  setupShell(me);
  $('presetSel').innerHTML = PRESETS.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
  $('addProv').onclick = addProvider;
  $('saveBtn').onclick = () => save();
  load();
}

async function load() {
  try {
    st = (await api('/api/ai/settings')).settings;
    keys = {};
    markDirty(false);
    render();
  } catch (e) { toast(e.message, 'error'); }
}

function markDirty(v) {
  dirty = v;
  $('saveState').className = 'saved' + (v ? ' dirty' : '');
  $('saveState').innerHTML = v ? 'Có thay đổi chưa lưu' : '<i data-lucide="check"></i> Đã lưu';
  icons();
}

function provOptions(selected, withNone) {
  return (withNone ? `<option value="">Mặc định</option>` : '') + st.providers.map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}

function render() {
  $('actProv').innerHTML = provOptions(st.active.providerId);
  $('actModel').value = st.active.model;
  for (const t of ['lesson', 'chat']) {
    $(t + 'Prov').innerHTML = provOptions(st.tasks[t] && st.tasks[t].providerId, true);
    $(t + 'Model').value = st.tasks[t] ? st.tasks[t].model : '';
  }
  $('temp').value = st.temperature;
  $('tempVal').textContent = st.temperature;
  const allModels = [...new Set(st.providers.flatMap((p) => p.models))];
  $('modelList').innerHTML = allModels.map((m) => `<option value="${esc(m)}">`).join('');

  $('actProv').onchange = () => { st.active.providerId = $('actProv').value; markDirty(true); };
  $('actModel').oninput = () => { st.active.model = $('actModel').value; markDirty(true); };
  for (const t of ['lesson', 'chat']) {
    const upd = () => {
      const pid = $(t + 'Prov').value, model = $(t + 'Model').value.trim();
      st.tasks[t] = pid && model ? { providerId: pid, model } : null;
      markDirty(true);
    };
    $(t + 'Prov').onchange = upd;
    $(t + 'Model').oninput = upd;
  }
  $('temp').oninput = () => { st.temperature = +$('temp').value; $('tempVal').textContent = st.temperature; markDirty(true); };
  renderProviders();
}

function renderProviders() {
  $('provList').innerHTML = st.providers.map((p, i) => `
    <div class="prov ${p.id === st.active.providerId ? 'active' : ''}" data-i="${i}">
      <div class="prov-head">
        <h3><span class="tone-violet" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center"><i data-lucide="plug-zap"></i></span>
          <input class="input" data-f="name" value="${esc(p.name)}" style="font-weight:800;max-width:300px" /></h3>
        <div style="display:flex;gap:8px;align-items:center">
          <label class="chip chip-muted" style="cursor:pointer"><input type="checkbox" data-f="enabled" ${p.enabled ? 'checked' : ''} /> Bật</label>
          <button class="icon-btn" data-act="del" title="Xoá nhà cung cấp"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Base URL</label><input class="input" data-f="baseUrl" value="${esc(p.baseUrl)}" placeholder="http://localhost:20128/v1" /></div>
        <div class="field"><label>API key ${p.hasKey ? `<span class="chip chip-ok">${esc(p.keyHint)}</span>` : '<span class="chip chip-warn">chưa có</span>'}</label>
          <input class="input" data-f="apiKey" type="password" autocomplete="off" placeholder="${p.hasKey ? 'Để trống để giữ khoá hiện tại' : 'Dán API key (nếu nhà cung cấp yêu cầu)'}" /></div>
      </div>
      <div class="field"><label>Models</label>
        <div class="model-tags">${p.models.map((m) => `<button type="button" class="${p.id === st.active.providerId && m === st.active.model ? 'on' : ''}" data-model="${esc(m)}" title="Bấm để chọn làm mặc định">${esc(m)}</button>`).join('') || '<span class="hint">Chưa có model. Thêm tên model hoặc bấm “Lấy danh sách”.</span>'}</div>
        <div class="inline-form" style="margin:10px 0 0"><input class="input" data-f="newModel" placeholder="Thêm model, ví dụ ag/gemini-3.8-flash-high" /><button class="btn btn-outline" data-act="addModel">Thêm</button></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" data-act="fetch"><i data-lucide="list"></i> Lấy danh sách model</button>
        <button class="btn btn-primary btn-sm" data-act="test"><i data-lucide="zap"></i> Lưu &amp; kiểm tra kết nối</button>
        <button class="btn btn-ghost btn-sm" data-act="removeModel" ${p.models.length ? '' : 'hidden'}>Xoá model cuối</button>
      </div>
      <div class="test-out" data-out></div>
    </div>`).join('');
  icons();
  $('provList').querySelectorAll('.prov').forEach((el) => {
    const p = st.providers[+el.dataset.i];
    el.querySelectorAll('[data-f]').forEach((inp) => {
      inp.oninput = inp.onchange = () => {
        const f = inp.dataset.f;
        if (f === 'enabled') p.enabled = inp.checked;
        else if (f === 'apiKey') keys[p.id] = inp.value;
        else if (f !== 'newModel') p[f] = inp.value;
        if (f !== 'newModel') markDirty(true);
      };
    });
    el.querySelectorAll('[data-model]').forEach((b) => (b.onclick = () => {
      st.active = { providerId: p.id, model: b.dataset.model };
      markDirty(true);
      render();
    }));
    el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => act(b.dataset.act, p, el)));
  });
}

async function act(name, p, el) {
  const idx = +el.dataset.i;
  // render() sau khi lưu thay mới toàn bộ DOM, nên luôn tra lại ô kết quả theo vị trí
  const outEl = () => document.querySelectorAll('.prov')[idx].querySelector('[data-out]');
  if (name === 'addModel') {
    const inp = el.querySelector('[data-f=newModel]');
    const m = inp.value.trim();
    if (m && !p.models.includes(m)) p.models.push(m);
    if (m && st.active.providerId === p.id && !st.active.model) st.active.model = m;
    markDirty(true);
    return render();
  }
  if (name === 'removeModel') { p.models.pop(); markDirty(true); return render(); }
  if (name === 'del') {
    if (st.providers.length === 1) return toast('Cần giữ ít nhất một nhà cung cấp.', 'error');
    if (!(await confirmModal('Xoá nhà cung cấp?', `Xoá "${p.name}" khỏi danh sách.`, 'Xoá'))) return;
    st.providers = st.providers.filter((x) => x !== p);
    if (st.active.providerId === p.id) st.active = { providerId: st.providers[0].id, model: st.providers[0].models[0] || '' };
    for (const t of ['lesson', 'chat']) if (st.tasks[t] && st.tasks[t].providerId === p.id) st.tasks[t] = null;
    markDirty(true);
    return render();
  }
  if (name === 'fetch' || name === 'test') {
    if (!(await save(true))) return;
    let out = outEl();
    out.className = 'test-out'; out.textContent = 'Đang kiểm tra…';
    const fresh = st.providers[idx];
    try {
      if (name === 'fetch') {
        const { models } = await api('/api/ai/models/' + fresh.id);
        fresh.models = [...new Set([...fresh.models, ...models])];
        markDirty(true);
        render();
        outEl().textContent = `Đã lấy ${models.length} model — nhớ bấm Lưu để giữ lại.`;
        return;
      } else {
        const model = (st.active.providerId === fresh.id && st.active.model) || fresh.models[0] || '';
        const r = await api('/api/ai/test', { method: 'POST', body: { providerId: fresh.id, model } });
        out.className = 'test-out ok';
        out.textContent = `✅ Kết nối OK (${r.ms} ms) · model ${model || '(mặc định)'} trả lời: “${r.reply}”`;
      }
    } catch (e) {
      out = outEl();
      out.className = 'test-out err';
      out.textContent = '❌ ' + e.message;
    }
  }
}

function addProvider() {
  const preset = PRESETS[+$('presetSel').value];
  st.providers.push({ id: '', name: preset.name, baseUrl: preset.baseUrl, models: [...preset.models], enabled: true, hasKey: false, keyHint: '' });
  markDirty(true);
  render();
  const last = $('provList').lastElementChild;
  if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function save(quiet) {
  try {
    const body = {
      providers: st.providers.map((p) => ({ id: p.id || undefined, name: p.name, baseUrl: p.baseUrl, models: p.models, enabled: p.enabled, ...(keys[p.id] !== undefined && p.id ? { apiKey: keys[p.id] } : {}) })),
      active: st.active, tasks: st.tasks, temperature: st.temperature,
    };
    // Nhà cung cấp mới (chưa có id) gửi kèm khoá nhập ở ô tương ứng
    document.querySelectorAll('.prov').forEach((el) => {
      const p = st.providers[+el.dataset.i];
      if (!p.id) { const v = el.querySelector('[data-f=apiKey]').value; if (v) body.providers[+el.dataset.i].apiKey = v; }
    });
    const prevActive = st.providers.find((p) => p.id === st.active.providerId);
    const activeIdx = st.providers.indexOf(prevActive);
    const res = (await api('/api/ai/settings', { method: 'PUT', body })).settings;
    // Nhà cung cấp mới được cấp id: giữ lựa chọn mặc định theo vị trí
    if (!st.active.providerId && activeIdx >= 0) res.active = { providerId: res.providers[activeIdx].id, model: st.active.model };
    st = res;
    keys = {};
    markDirty(false);
    render();
    if (!quiet) toast('Đã lưu cài đặt AI', 'success');
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}
