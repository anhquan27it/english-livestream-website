const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function createChatterbox({ home = path.join(__dirname, 'data/chatterbox'), spawnProcess = spawn } = {}) {
  let child, ready, readyResolve, readyReject, warmPromise, serial = 0, state = 'idle', model = 'nano', loadMs = null;
  const pending = new Map(), shared = new Map();
  function fail(error) {
    state = 'error'; readyReject?.(error); ready = null; warmPromise = null;
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); }
    pending.clear(); shared.clear();
  }
  function start() {
    if (ready) return ready;
    const python = path.join(home, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    if (!fs.existsSync(python) || !fs.existsSync(path.join(home, 'runtime.json'))) throw new Error('Chatterbox chưa được cài. Hãy chạy scripts/setup-chatterbox.ps1.');
    model = JSON.parse(fs.readFileSync(path.join(home, 'runtime.json'), 'utf8')).model;
    state = 'starting';
    ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    const log = fs.openSync(path.join(home, 'worker.log'), 'a');
    const running = child = spawnProcess(python, ['-u', path.join(__dirname, 'scripts/chatterbox_worker.py'), '--home', home], {
      windowsHide: true, stdio: ['pipe', 'pipe', log],
      env: { ...process.env, PYTHONUTF8: '1', HF_HOME: path.join(home, 'huggingface'), TORCH_HOME: path.join(home, 'torch') },
    });
    fs.closeSync(log);
    let buffer = '';
    const startupTimer = setTimeout(() => { child?.kill(); fail(new Error('Chatterbox khởi động quá lâu. Hãy thử lại.')); }, 120000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (child !== running) return;
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.type === 'ready') {
          clearTimeout(startupTimer); state = 'idle'; model = message.model || model; readyResolve(); continue;
        }
        if (message.type === 'model') {
          state = message.state; model = message.model || model;
          if (Number.isFinite(message.loadMs)) loadMs = message.loadMs;
          continue;
        }
        const task = pending.get(message.id);
        if (!task) continue;
        pending.delete(message.id); clearTimeout(task.timer);
        if (task.kind === 'warmup') {
          if (message.ok && message.warmed) task.resolve();
          else { state = 'error'; task.reject(new Error('Chatterbox chưa nạp được mô hình. Hãy thử lại.')); }
          continue;
        }
        if (!message.ok || !/^[a-f0-9]{64}\.wav$/.test(message.file || '')) task.reject(new Error('Chatterbox chưa tạo được âm thanh. Hãy thử lại.'));
        else fs.promises.readFile(path.join(home, 'audio', message.file)).then(task.resolve, () => task.reject(new Error('Không đọc được âm thanh Chatterbox. Hãy thử lại.')));
      }
    });
    child.stdin.on('error', () => fail(new Error('Dịch vụ giọng đọc đã dừng. Hãy thử lại.')));
    child.on('error', () => { clearTimeout(startupTimer); fail(new Error('Không khởi động được Chatterbox.')); });
    child.on('exit', () => { clearTimeout(startupTimer); if (child !== running) return; child = null; fail(new Error('Chatterbox đã dừng. Hãy thử lại.')); });
    return ready;
  }
  function warmup() {
    if (warmPromise) return warmPromise;
    warmPromise = (async () => {
      await start();
      const id = String(++serial);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); warmPromise = null; reject(new Error('Nạp giọng đọc quá lâu. Hãy thử lại.')); }, 180000);
        pending.set(id, { resolve, reject, timer, kind: 'warmup' });
        child.stdin.write(JSON.stringify({ id, command: 'warmup' }) + '\n');
      });
    })().catch(error => { warmPromise = null; throw error; });
    return warmPromise;
  }
  async function synthesize(text) {
    if (shared.has(text)) return shared.get(text);
    if (shared.size >= 4) throw new Error('Giọng đọc đang bận. Hãy thử lại sau ít giây.');
    const work = (async () => {
      await start();
      const id = String(++serial);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Tạo giọng đọc quá lâu. Hãy thử đoạn ngắn hơn.')); }, 180000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ id, text }) + '\n');
      });
    })();
    shared.set(text, work);
    try { return await work; } finally { shared.delete(text); }
  }
  function close() { child?.kill(); }
  return { synthesize, warmup, close, status: () => state, model: () => model, details: () => ({ loadMs }) };
}
module.exports = { createChatterbox };
