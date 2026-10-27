// Giữ ngân sách chung cho các upload đang chạy để không vượt quota khi tải đồng thời.
const fs = require('fs'), path = require('path'), store = require('./db');
const pending = new Map();
function diskBytes(exclude = new Set()) {
  let bytes = 0;
  for (const kind of ['pdfs', 'recordings']) {
    const root = path.join(store.dir, kind);
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) { const f = path.join(root, name); if (!exclude.has(f)) { const stat = fs.statSync(f); if (stat.isFile()) bytes += stat.size; } }
  }
  return bytes;
}
function available(bytes) {
  return diskBytes(new Set(pending.keys())) + [...pending.values()].reduce((a, b) => a + b, 0) + bytes <= store.data.settings.limits.storageMB * 1048576;
}
function reserve(file) {
  pending.set(file, 0);
  return { grow(bytes) { if (!available(bytes)) return false; pending.set(file, pending.get(file) + bytes); return true; }, release() { pending.delete(file); } };
}
module.exports = { diskBytes, available, reserve };
