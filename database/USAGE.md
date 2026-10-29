# Dùng PostgreSQL trong EngLive

## Trạng thái hiện tại

Đã chuyển dữ liệu thật ngày 29/10/2026 sang PostgreSQL 18.6: 7 tài khoản, 3 lớp, 39 buổi học, 3 bài giảng, 1 bài tập, 7 hội thoại và 2 PDF. Nội dung được đối chiếu toàn bộ sau khi nhập. DB `englive`, schema `englive`, tài khoản ứng dụng `englive_app` không có quyền superuser/tạo DB/tạo role. Web đọc cấu hình nguồn lưu ở `data/storage.json` và hiện chọn `postgres`.

## Mỗi lần sử dụng

1. PostgreSQL service `postgresql-x64-18` phải Running (mặc định chạy theo Windows).
2. Mở PowerShell tại D:\EN-Learning-Streaming, đặt cấu hình LiveKit nếu dùng, rồi `npm start` như cũ. Phải thấy **Database: postgres**.
3. Mở http://localhost:3000. Nếu chia sẻ Internet, bấm MO-LINK-WEB.cmd; không mở thêm một `npm start` nữa.

Không cần mở pgAdmin để web chạy. AI/9Router và LiveKit self-host vẫn là dịch vụ riêng. Không cần nhập lại mật khẩu postgres mỗi lần: web dùng tài khoản riêng qua cấu hình local.

## Kiểm tra kết nối và dữ liệu

```powershell
npm run db:status
npm run db:verify
```

`db:status` in tên DB, role, số bản ghi thật và nguồn đã chọn; không in mật khẩu/token. `db:verify` tạo schema QA riêng trên PostgreSQL thật, thử FK/rollback rồi dọn, không sửa bảng englive. Kiểm tra http://localhost:3000/healthz phải có `storage: "postgres"`.

Trong pgAdmin: Register → Server, đặt tên hiển thị EngLive Local; Connection: host `127.0.0.1`, port `5432`, maintenance DB `postgres`, username `postgres`, mật khẩu mới bạn đã đặt. Không gửi mật khẩu vào chat. Refresh → Databases → englive → Schemas → englive → Tables.

Query Tool, chọn database **englive**:

```sql
SELECT current_database(), current_user;
SELECT id, name, email, role FROM englive.users ORDER BY email;
SELECT id, name, teacher_id FROM englive.classes;
SELECT count(*) AS so_buoi FROM englive.class_sessions;
SELECT count(*) AS thanh_vien FROM englive.class_memberships;
SELECT version, applied_at FROM englive.schema_migrations ORDER BY version;
```

Không sửa trực tiếp các bảng trong pgAdmin khi web đang chạy: bản hiện tại có cache một writer. Dùng giao diện EngLive để quản lý, sau đó Refresh/SELECT lại sẽ thấy dữ liệu mới. Tránh chụp toàn cột document của users vì chứa hash mật khẩu.

## Cấu hình và bí mật

- `data/postgres.local.json`: kết nối ứng dụng, có mật khẩu ngẫu nhiên riêng; ngoài Git, ACL user/SYSTEM.
- `data/postgres.key`: khóa AES-256-GCM dùng giải mã settings và runtime entries (token, Zoom, snapshot và các trường phụ). **Phải sao lưu khóa riêng, an toàn. Mất khóa sẽ không đọc được phần mã hóa trong DB.**
- `data/storage.json`: nguồn lưu đã chọn.
- `data/db.json`: bản JSON cũ giữ lại khi chuyển; **không phải dữ liệu mới nhất sau khi web dùng PostgreSQL**. Không sửa nó để thay dữ liệu web.
- `data/backups/before-postgres-*.json`: bản trước chuyển đổi, không tự xóa.

Không đưa những tệp này lên Git hoặc vào chat; không mở cổng 5432 qua Cloudflare Tunnel. Backup JSON có thể chứa token/cấu hình rõ, chỉ admin được tải; bảo vệ backup như dữ liệu bí mật.

## Sao lưu và khôi phục

Có backup JSON tại khởi động/hằng ngày, hoặc tạo/tải từ trang admin. Backup này xuất từ PostgreSQL hiện tại, không lấy db.json cũ. Sao lưu thêm PDF/video/audio trong `data/pdfs`, `data/recordings`, `data/listening` và khóa giải mã riêng. Trước deploy thật nên có bản sao ngoài máy và thử khôi phục trên môi trường riêng.

Khôi phục backup EngLive: dừng server bằng Ctrl+C, rồi:

```powershell
npm run backup:restore -- db-TEN-BAN-SAO.json
npm start
```

Chỉ nhận tệp trong data/backups, không ghi khi server còn giữ khóa. Công cụ tạo backup trước restore, cập nhật PostgreSQL trong transaction và thu hồi phiên cũ; mọi người đăng nhập lại. File PDF/video không nằm trong JSON.

Có thể Backup bằng pgAdmin (Custom) hoặc pg_dump cho toàn DB; khi dùng backup SQL, phải giữ postgres.key riêng để giải mã. Restore sang DB thử trước để kiểm chứng, không ghi đè DB đang phục vụ lớp.

## Nếu cần quay lại JSON

Dừng server, rồi:

```powershell
npm run db:rollback
npm start
```

Công cụ **xuất dữ liệu PostgreSQL mới nhất** về JSON rồi chọn driver json. Không chỉ đổi profile thủ công sang bản db.json cũ, vì sẽ làm mất thay đổi sau cutover. Giữ DB PostgreSQL và key. Muốn quay lại PostgreSQL sau rollback phải lên kế hoạch nhập lại thay đổi, không chạy activate để ghi đè DB có sẵn.

## Kiểm thử và giới hạn hiện tại

`npm test`: 81 ca với JSON. `npm run test:postgres:app`: cùng 81 ca với PostgreSQL thật/schema QA. AI và video vẫn giả lập trong các ca đó. `npm run test:postgres:runtime` kiểm tra mã hóa, một writer, chỉ ghi hàng thay đổi, đọc sau restart, backup/restore và rollback về JSON mới nhất.

Đây là lớp tương thích lưu bền cho kiến trúc hiện tại: dữ liệu theo entity, mỗi thay đổi lưu bằng transaction; HTTP thành công chờ flush. Đọc vẫn qua cache, giao tiếp lưu dùng worker với chờ đồng bộ để giữ API cũ. **Chỉ chạy một tiến trình ứng dụng**, có advisory lock PostgreSQL và writer lock DATA_DIR. Chưa phải multi-server hoặc kiểm chứng tải 10 lớp × 30 học sinh. Muốn mở rộng cần repository truy vấn bất đồng bộ, phối hợp trạng thái Socket.IO và đo tải thật; không bật PM2 cluster chỉ vì đã dùng PostgreSQL.

File PDF/bản ghi giữ lại khi xóa lớp là kho lưu trữ độc lập; lớp bị xóa thì quyền vào lớp không còn. Không xóa file trong data bằng tay khi web đang hoạt động.
