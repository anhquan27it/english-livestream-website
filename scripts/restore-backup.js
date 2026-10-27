// Dừng server trước khi khôi phục. Không nhận đường dẫn bên ngoài thư mục backups.
const fs = require('fs');
const path = require('path');
const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const name = process.argv[2] || '';
if (!/^db-[\dTZ-]+\.json$/.test(name)) throw new Error('Chạy khi server đã dừng: npm run backup:restore -- db-....json');
const lock = path.join(dir, '.writer.lock');
if (fs.existsSync(lock)) {
  const pid = Number(fs.readFileSync(lock, 'utf8'));
  try { process.kill(pid, 0); throw new Error('Server vẫn đang dùng dữ liệu. Dừng server trước khi khôi phục.'); }
  catch (e) { if (e.code !== 'ESRCH') throw e; fs.unlinkSync(lock); }
}
fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
process.on('exit', () => { try { if (fs.readFileSync(lock, 'utf8') === String(process.pid)) fs.unlinkSync(lock); } catch {} });
const file = path.join(dir, 'backups', name);
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(data.users) || !Array.isArray(data.classes) || !data.tokens) throw new Error('Bản sao không đúng định dạng EngLive.');
const current = path.join(dir, 'db.json');
if (fs.existsSync(current)) fs.copyFileSync(current, path.join(dir, 'backups', 'before-restore-' + Date.now() + '.json'));
data.tokens = {}; // mọi người đăng nhập lại sau khi khôi phục
const tmp = path.join(dir, 'restore.tmp');
fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
fs.renameSync(tmp, current);
console.log('Đã khôi phục. Khởi động server rồi đăng nhập lại. Tệp PDF/video cần được sao lưu riêng.');
