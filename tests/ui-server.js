// Server UI biệt lập, không đọc data/ thật, không gọi AI hoặc LiveKit Cloud.
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'englive-ui-'));
process.env.PORT = process.env.PORT || '3101';
delete process.env.LIVEKIT_URL; delete process.env.LIVEKIT_API_KEY; delete process.env.LIVEKIT_API_SECRET; delete process.env.LIVEKIT_DEV;
const seeded = spawnSync(process.execPath, ['scripts/create-admin.js', 'admin@test.com'], { cwd: path.join(__dirname, '..'), env: { ...process.env, ADMIN_PASSWORD: 'admin-test-password' }, encoding: 'utf8' });
if (seeded.status !== 0) throw new Error(seeded.stderr);
// Chỉ bổ sung lớp vào DATA_DIR tạm để kiểm tra tìm kiếm/phân trang giao diện.
const classCount = Math.min(200, Math.max(0, Number(process.env.QA_CLASS_COUNT) || 0));
if (classCount) {
  const file = path.join(process.env.DATA_DIR, 'db.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const teacher = data.users.find((u) => u.role === 'teacher');
  const student = data.users.find((u) => u.email === 'student1@demo.com');
  for (let i = data.classes.length; i < classCount; i++) {
    data.classes.push({ id: `c_qa_${i}`, name: `${['Giao tiếp', 'IELTS Foundation', 'Luyện phát âm', 'Tiếng Anh thiếu nhi'][i % 4]} — Nhóm ${String(i + 1).padStart(2, '0')}`,
      level: ['A1', 'A2', 'B1', 'B2'][i % 4], color: ['violet', 'teal', 'orange', 'blue', 'pink'][i % 5],
      description: 'Luyện kỹ năng nghe, nói và phản xạ tiếng Anh trong các tình huống hằng ngày.',
      code: `QA${String(i).padStart(4, '0')}`, teacherId: teacher.id, studentIds: i % 5 ? [student.id] : [],
      pendingIds: i % 5 ? [] : [student.id], assistantIds: [], history: [], createdAt: Date.now() });
  }
  fs.writeFileSync(file, JSON.stringify(data));
}
require('./mock-llm').createServer().listen(0, function () {
  process.env.AI_BASE_URL = 'http://127.0.0.1:' + this.address().port + '/v1';
  require('../server');
});
