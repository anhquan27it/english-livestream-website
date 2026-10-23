// Lưu trữ dữ liệu đơn giản bằng file JSON (đủ cho demo / lớp nhỏ)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'db.json');

let db = null;

function id(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
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
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } else {
    db = { users: [], classes: [], tokens: {} };
    seed();
    save();
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  }, 50);
}

load();

module.exports = {
  get data() { return db; },
  save,
  id,
  hashPassword,
  verifyPassword,
  classCode,
};
