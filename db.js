// Lưu trữ dữ liệu đơn giản bằng file JSON (đủ cho demo / lớp nhỏ)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'db.json');

let db = null;
let lockFile = null;
function lock() {
  const file = path.join(DATA_DIR, '.writer.lock');
  if (fs.existsSync(file)) {
    const pid = Number(fs.readFileSync(file, 'utf8'));
    try { process.kill(pid, 0); throw new Error('Thư mục dữ liệu đang được một tiến trình khác sử dụng. Dừng server cũ trước.'); }
    catch (e) { if (e.code !== 'ESRCH') throw e; fs.unlinkSync(file); }
  }
  const fd = fs.openSync(file, 'wx'); fs.writeFileSync(fd, String(process.pid)); fs.closeSync(fd); lockFile = file;
}
function unlock() { if (lockFile) { try { if (fs.readFileSync(lockFile, 'utf8') === String(process.pid)) fs.unlinkSync(lockFile); } catch {} lockFile = null; } }
process.on('exit', unlock);

function id(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

function classCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(chars.length)];
  return code;
}

function seed() {
  const teacher = { id: id('u'), name: 'Ms. Emily Tran', email: 'teacher@demo.com', role: 'teacher', password: hashPassword('123456'), createdAt: Date.now() };
  const s1 = { id: id('u'), name: 'Nguyễn Minh Anh', email: 'student1@demo.com', role: 'student', password: hashPassword('123456'), createdAt: Date.now() };
  const s2 = { id: id('u'), name: 'Trần Gia Bảo', email: 'student2@demo.com', role: 'student', password: hashPassword('123456'), createdAt: Date.now() };
  const s3 = { id: id('u'), name: 'Lê Thu Hà', email: 'student3@demo.com', role: 'student', password: hashPassword('123456'), createdAt: Date.now() };
  db.users.push(teacher, s1, s2, s3);
  db.classes.push({
    id: id('c'),
    name: 'IELTS Speaking 6.5+',
    level: 'B2',
    description: 'Luyện phản xạ Speaking Part 1–3, phát âm và từ vựng theo chủ đề.',
    color: 'violet',
    code: classCode(),
    teacherId: teacher.id,
    studentIds: [s1.id, s2.id],
    pendingIds: [],
    history: [],
    createdAt: Date.now(),
  });
  db.classes.push({
    id: id('c'),
    name: 'Communication English A2',
    level: 'A2',
    description: 'Tiếng Anh giao tiếp hằng ngày cho người mới bắt đầu.',
    color: 'orange',
    code: classCode(),
    teacherId: teacher.id,
    studentIds: [s1.id],
    pendingIds: [s3.id],
    history: [],
    createdAt: Date.now(),
  });
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
    catch (e) { throw new Error('Không đọc được db.json. Giữ nguyên file và khôi phục từ bản sao lưu: ' + e.message); }
  } else {
    db = { users: [], classes: [], tokens: {} };
    seed();
    save();
  }
  // Thêm các trường mới cho dữ liệu cũ
  db.settings = db.settings || {};
  db.lessons = db.lessons || [];
  db.chats = db.chats || [];
  for (const ch of db.chats) { // hội thoại cũ chưa có tiêu đề/ghim/loại
    const first = (ch.messages || []).find((m) => m.role === 'user');
    ch.title = ch.title || (first ? String(first.content).replace(/\s+/g, ' ').slice(0, 40) : 'Hội thoại');
    ch.kind = ch.kind || 'chat'; ch.pinned = !!ch.pinned;
    const last = (ch.messages || [])[(ch.messages || []).length - 1];
    ch.updatedAt = ch.updatedAt || (last && last.at) || Date.now(); ch.createdAt = ch.createdAt || ch.updatedAt;
  }
  db.recordings = db.recordings || [];
  db.pdfs = db.pdfs || [];
  for (const k of ['audit', 'schedules', 'assignments', 'submissions', 'vocabulary', 'activityResults']) db[k] = db[k] || [];
  db.liveSnapshots = db.liveSnapshots || {};
  db.aiUsage = db.aiUsage || {};
  db.settings.limits = { chatPerDay: 100, generationsPerDay: 20, maxParticipants: 100, storageMB: 2048, ...db.settings.limits };
  for (const c of db.classes) c.assistantIds = c.assistantIds || [];
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 50);
}

function flush() {
  clearTimeout(saveTimer);
  const tmp = FILE + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeFileSync(fd, JSON.stringify(db, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, FILE);
}

function backup() {
  flush();
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const name = 'db-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  fs.copyFileSync(FILE, path.join(dir, name));
  const files = fs.readdirSync(dir).filter(n => /^db-[\dTZ-]+\.json$/.test(n)).sort();
  for (const old of files.slice(0, -14)) fs.unlinkSync(path.join(dir, old));
  return name;
}

function audit(actor, action, target, detail = '') {
  db.audit.unshift({ id: id('log'), actorId: actor && actor.id, actorName: actor && actor.name, action, target, detail, at: Date.now() });
  db.audit = db.audit.slice(0, 2000); flush();
}

function consumeAI(userId, kind) {
  const day = new Date().toISOString().slice(0, 10);
  for (const key of Object.keys(db.aiUsage)) if (key.slice(0, 10) < new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10)) delete db.aiUsage[key];
  const key = day + ':' + userId;
  const usage = db.aiUsage[key] || (db.aiUsage[key] = { chat: 0, generation: 0 });
  const limit = kind === 'chat' ? db.settings.limits.chatPerDay : db.settings.limits.generationsPerDay;
  if (usage[kind] >= limit) return false;
  usage[kind]++; save(); return true;
}

// Cấu hình cục bộ chờ áp dụng khi đã giữ writer lock, tránh server cũ ghi đè tài khoản.
function applyAdminSetup() {
  if (!lockFile) throw new Error('Cần khóa dữ liệu trước khi nạp tài khoản admin.');
  const file = path.join(DATA_DIR, 'admin-setup.json');
  if (!fs.existsSync(file)) return;
  const setup = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof setup.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(setup.email) || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(setup.passwordHash || '')) throw new Error('Cấu hình khởi tạo admin không hợp lệ.');
  let user = db.users.find(u => u.email === setup.email.toLowerCase());
  if (user && user.role !== 'admin') throw new Error('Không ghi đè tài khoản giáo viên/học sinh bằng admin.');
  backup();
  if (!user) { user = { id: id('u'), email: setup.email.toLowerCase(), name: String(setup.name || 'Quản trị viên').slice(0, 100), role: 'admin', createdAt: Date.now() }; db.users.push(user); }
  user.password = setup.passwordHash; user.status = 'active';
  for (const [token, t] of Object.entries(db.tokens)) if (t.userId === user.id) delete db.tokens[token];
  audit(user, 'admin.local-setup.applied', user.id);
  fs.unlinkSync(file);
}

load();

module.exports = {
  dir: DATA_DIR,
  get data() { return db; },
  save,
  flush, backup, audit, consumeAI, lock, unlock, applyAdminSetup,
  id,
  hashPassword,
  verifyPassword,
  classCode,
};
