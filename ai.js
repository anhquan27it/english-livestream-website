// Cấu hình nhà cung cấp AI (chuẩn OpenAI-compatible, mặc định 9Router) và hàm gọi chat completion.
const store = require('./db');

const DEFAULT_BASE_URL = 'http://localhost:20128/v1';
const DEFAULT_MODEL = 'ag/gemini-3.8-flash-high';

function normalizeBaseUrl(url) {
  let u = String(url || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  // Người dùng hay dán http://localhost:20128 -> bổ sung /v1 cho chuẩn OpenAI
  if (!/\/v\d+$/i.test(u)) u += '/v1';
  return u;
}

function defaultSettings() {
  return {
    providers: [{
      id: '9router',
      name: '9Router (local)',
      baseUrl: normalizeBaseUrl(process.env.AI_BASE_URL || DEFAULT_BASE_URL),
      apiKey: process.env.AI_API_KEY || '',
      models: [process.env.AI_MODEL || DEFAULT_MODEL],
      enabled: true,
    }],
    active: { providerId: '9router', model: process.env.AI_MODEL || DEFAULT_MODEL },
    // Ghi đè riêng từng tác vụ: { providerId, model } hoặc null = dùng mặc định
    tasks: { lesson: null, chat: null },
    temperature: 0.6,
  };
}

function getSettings() {
  const data = store.data;
  if (!data.settings.ai) {
    data.settings.ai = defaultSettings();
    store.save();
  }
  return data.settings.ai;
}

// Bản gửi cho client: không bao giờ chứa khoá API
function publicSettings() {
  const s = getSettings();
  return {
    ...s,
    providers: s.providers.map((p) => ({
      id: p.id, name: p.name, baseUrl: p.baseUrl, models: p.models, enabled: p.enabled,
      hasKey: !!p.apiKey, keyHint: p.apiKey ? '••••' + p.apiKey.slice(-4) : '',
    })),
  };
}

function updateSettings(body) {
  const cur = getSettings();
  const next = { ...cur, providers: [] };
  const incoming = Array.isArray(body.providers) ? body.providers : cur.providers;
  const seen = new Set();
  for (const p of incoming) {
    const old = cur.providers.find((x) => x.id === p.id);
    const id = p.id || store.id('p');
    if (seen.has(id)) continue;
    seen.add(id);
    const baseUrl = normalizeBaseUrl(p.baseUrl);
    if (!baseUrl) throw new Error('Mỗi nhà cung cấp cần có Base URL.');
    const models = [...new Set((p.models || []).map((m) => String(m).trim()).filter(Boolean))];
    next.providers.push({
      id,
      name: String(p.name || 'Nhà cung cấp').trim().slice(0, 60),
      baseUrl,
      // apiKey không gửi lên (undefined) = giữ khoá cũ; chuỗi rỗng = xoá khoá
      apiKey: p.apiKey === undefined ? (old ? old.apiKey : '') : String(p.apiKey).trim(),
      models,
      enabled: p.enabled !== false,
    });
  }
  if (!next.providers.length) throw new Error('Cần ít nhất một nhà cung cấp AI.');
  const valid = (sel) => sel && next.providers.some((p) => p.id === sel.providerId) && sel.model;
  const first = next.providers[0];
  next.active = valid(body.active) ? { providerId: body.active.providerId, model: String(body.active.model).trim() } : valid(cur.active) ? cur.active : { providerId: first.id, model: first.models[0] || DEFAULT_MODEL };
  next.tasks = {};
  for (const t of ['lesson', 'chat']) {
    const sel = (body.tasks || cur.tasks || {})[t];
    next.tasks[t] = valid(sel) ? { providerId: sel.providerId, model: String(sel.model).trim() } : null;
  }
  if (typeof body.temperature === 'number') next.temperature = Math.min(1.5, Math.max(0, body.temperature));
  store.data.settings.ai = next;
  store.save();
  return publicSettings();
}

function resolve(task) {
  const s = getSettings();
  const sel = (task && s.tasks && s.tasks[task]) || s.active;
  const provider = s.providers.find((p) => p.id === sel.providerId && p.enabled) || s.providers.find((p) => p.enabled);
  if (!provider) throw new AiError('Chưa bật nhà cung cấp AI nào. Hãy vào Cài đặt AI.');
  return { provider, model: sel.model || provider.models[0] || DEFAULT_MODEL, temperature: s.temperature };
}

class AiError extends Error {}

function headers(provider) {
  const h = { 'Content-Type': 'application/json' };
  if (provider.apiKey) h.Authorization = 'Bearer ' + provider.apiKey;
  return h;
}

async function request(provider, path, init, timeoutMs) {
  try {
    return await fetch(provider.baseUrl + path, { ...init, headers: headers(provider), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new AiError(`AI không phản hồi sau ${Math.round(timeoutMs / 1000)} giây.`);
    throw new AiError(`Không kết nối được tới ${provider.baseUrl}. Hãy kiểm tra 9Router/nhà cung cấp đang chạy.`);
  }
}

async function failure(res) {
  const text = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
  if (res.status === 401 || res.status === 403) return new AiError('Nhà cung cấp AI từ chối khoá API (401/403). Kiểm tra lại API key trong Cài đặt AI.');
  return new AiError(`AI trả lỗi HTTP ${res.status}${text ? ': ' + text : ''}`);
}

function contentToText(content) {
  if (Array.isArray(content)) return content.map((p) => (typeof p === 'string' ? p : p && p.text) || '').join('');
  return String(content || '');
}

// messages: [{role, content}] -> chuỗi trả lời
async function chat({ task, messages, temperature, maxTokens, timeoutMs = 150000, providerId, model }) {
  const r = resolve(task);
  let provider = r.provider;
  if (providerId) provider = getSettings().providers.find((p) => p.id === providerId) || provider;
  const body = { model: model || r.model, messages, stream: false, temperature: temperature ?? r.temperature };
  if (maxTokens) body.max_tokens = maxTokens;
  const res = await request(provider, '/chat/completions', { method: 'POST', body: JSON.stringify(body) }, timeoutMs);
  if (!res.ok) throw await failure(res);
  const json = await res.json().catch(() => null);
  const msg = json && json.choices && json.choices[0] && json.choices[0].message;
  const text = contentToText(msg && msg.content).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!text) throw new AiError('AI trả về nội dung rỗng.');
  return text;
}

async function listModels(providerId) {
  const provider = getSettings().providers.find((p) => p.id === providerId);
  if (!provider) throw new AiError('Không tìm thấy nhà cung cấp.');
  const res = await request(provider, '/models', { method: 'GET' }, 20000);
  if (!res.ok) throw await failure(res);
  const json = await res.json().catch(() => ({}));
  return (json.data || []).map((m) => m.id).filter(Boolean).sort();
}

async function testConnection({ providerId, model }) {
  const t = Date.now();
  const text = await chat({ providerId, model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], maxTokens: 20, temperature: 0, timeoutMs: 60000 });
  return { reply: text.slice(0, 80), ms: Date.now() - t };
}

// Lấy JSON từ câu trả lời của AI: bỏ hàng rào ```, cắt từ { / [ đầu đến } / ] cuối
function extractJson(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.search(/[{[]/);
  if (start === -1) throw new AiError('AI không trả về JSON.');
  const open = t[start];
  const end = t.lastIndexOf(open === '{' ? '}' : ']');
  if (end <= start) throw new AiError('JSON của AI bị cắt dở.');
  t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch {
    // Lỗi thường gặp: dấu phẩy thừa cuối mảng/đối tượng
    try { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')); } catch { throw new AiError('AI trả JSON sai định dạng.'); }
  }
}

// Gọi AI và ép ra JSON; thử lại một lần nếu sai định dạng
async function chatJson(opts) {
  try {
    return extractJson(await chat(opts));
  } catch (e) {
    if (!(e instanceof AiError) || !/JSON/.test(e.message)) throw e;
    const retry = await chat({ ...opts, messages: [...opts.messages, { role: 'user', content: 'Your previous reply was not valid JSON. Reply again with ONLY the valid JSON, no commentary, no code fences.' }] });
    return extractJson(retry);
  }
}

module.exports = { AiError, getSettings, publicSettings, updateSettings, chat, chatJson, extractJson, listModels, testConnection, normalizeBaseUrl, DEFAULT_MODEL };
