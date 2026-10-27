// Tạo admin riêng khi server đã dừng: npm run admin:create -- admin@englive.local
const crypto = require('crypto');
const store = require('../db');
const email = String(process.argv[2] || 'admin@englive.local').trim().toLowerCase();
const name = String(process.argv[3] || 'Quản trị viên').trim().slice(0, 100);
const supplied = process.env.ADMIN_PASSWORD;
const password = supplied || ('Admin-' + crypto.randomBytes(15).toString('base64url'));
try {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name) throw new Error('Email hoặc tên không hợp lệ.');
  if (password.length < 8 || password.length > 128) throw new Error('Mật khẩu admin cần 8–128 ký tự.');
  store.lock();
  if (store.data.users.some(u => u.email === email)) throw new Error('Email đã tồn tại. Chọn email mới; lệnh này không nâng quyền hoặc ghi đè tài khoản cũ.');
  const user = { id: store.id('u'), name, email, role: 'admin', status: 'active', password: store.hashPassword(password), createdAt: Date.now() };
  store.data.users.push(user);
  store.audit(user, 'admin.created', user.id); store.backup();
  console.log('Đã tạo tài khoản admin riêng: ' + email);
  if (!supplied) console.log('Mật khẩu ban đầu (chỉ hiển thị lần này): ' + password);
  console.log('Đăng nhập tại /admin.html. Đổi mật khẩu trong Học tập → Tài khoản. Các tài khoản giáo viên được giữ nguyên.');
} catch (e) { console.error(e.message); process.exitCode = 1; }
