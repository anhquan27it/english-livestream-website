# PostgreSQL cho EngLive — trạng thái và sử dụng

**CẬP NHẬT MỚI NHẤT: đã chuyển backend và dữ liệu thật sang PostgreSQL. Đọc [USAGE.md](USAGE.md) để sử dụng/kiểm tra/backup/rollback. Các ghi chép bên dưới là lịch sử chuẩn bị trước khi tích hợp, không dùng để kết luận web còn JSON.**

**Chưa chuyển web sang PostgreSQL.** `db.js` hiện vẫn là JSON. Bộ này chuẩn bị schema PostgreSQL và công cụ nhập bản sao để kiểm chứng trước khi thay lớp lưu trữ của backend. Không sửa/xóa db.json và không coi import thành công là đã chuyển nguồn ghi. Không chạy nhiều bản web cùng ghi một DB.

**Cập nhật 29/10:** bản cài Windows đã được sửa, service Running. Người dùng đã nhập mật khẩu postgres mới qua công cụ khôi phục, tạo database englive + englive_app và schema thật thành công. Xác thực ban đầu đã phục hồi, không còn rule trust tạm. `npm run db:verify` đã đạt trên PostgreSQL 18.6 thật. Các bảng nghiệp vụ còn trống; chưa import/cutover, phần mô tả cài lỗi dưới đây là ghi nhận cũ.

## 1. Hoàn tất cài PostgreSQL Windows

Trong lần kiểm tra 29/10/2026: có thư mục PostgreSQL 18 nhưng không có service `postgresql-x64-18`, không có listener 5432, thiếu `pg_ctl.exe`/`initdb.exe`; `postgres.exe --version` không thành công. Cần chạy lại bộ cài chính thức đã tải, chọn **PostgreSQL Server**, **Command Line Tools**, **pgAdmin 4**. Giữ bản sao nếu đã có dữ liệu riêng, không xóa thư mục data hoặc tự reset mật khẩu. Đọc lỗi cuối bộ cài nếu service không tạo được. Nếu cài báo thiếu Visual C++ runtime, cài runtime Microsoft được bộ cài yêu cầu.

Mở `services.msc`, tìm PostgreSQL và kiểm tra Running. Cổng mặc định 5432. Mật khẩu user `postgres` là mật khẩu đặt lúc cài; không phải mật khẩu Windows hay tài khoản EngLive. Không gửi mật khẩu vào chat.

## 2. Tạo database và tài khoản ứng dụng

Tại PowerShell trong thư mục dự án:

```powershell
npm run db:setup
```

Script hỏi mật khẩu bằng ô nhập ẩn trên máy. Khi kết nối thành công, nó tạo database **englive**, user **englive_app** riêng (không superuser), schema **englive**. Không đổi mật khẩu postgres. Nếu đã có DB/role cùng tên nhưng chưa có cấu hình, script từ chối ghi đè để người vận hành kiểm tra.

Mật khẩu ứng dụng ngẫu nhiên lưu trong `data/postgres.local.json`, ngoài Git, giới hạn ACL cho user hiện tại và SYSTEM. Không gửi/commit tệp này. Mật khẩu quản trị chỉ truyền tạm cho tiến trình setup, không lưu hoặc in ra log. Không mở cổng 5432 ra Internet/Cloudflare Tunnel. Khi deploy, cung cấp chuỗi kết nối qua biến `DATABASE_URL`, bật TLS phù hợp nhà cung cấp; chưa tự áp dụng biến này cho web.

## 3. Kiểm tra

```powershell
npm run db:status
npm run db:plan
npm run test:postgres
npm run db:verify
```

- `db:status`: kiểm tra kết nối, tên DB/role và bảng. Thống kê estimated_rows chỉ ước tính, không dùng để nghiệm thu.
- `db:plan`: chỉ đọc JSON và đếm số bản ghi dự kiến; không ghi DB và không in khóa/hash mật khẩu.
- `test:postgres`: kiểm thử schema trên PostgreSQL nhúng, không phải xác nhận Windows PostgreSQL hoặc backend đã dùng DB này.
- `db:verify`: kiểm tra kết nối/quyền/schema/transaction trên PostgreSQL thật trong schema QA riêng, tự xóa sau kiểm thử; không tác động bảng englive. Yêu cầu DB englive và role englive_app đúng cấu hình local.

Trong **pgAdmin**: kết nối localhost, cổng 5432, maintenance database postgres, username postgres và mật khẩu bạn đã đặt. Refresh Databases → englive → Schemas → englive → Tables. Chỉ dùng query đọc để kiểm tra:

```sql
SELECT current_database(), current_user;
SELECT id, name, email, role FROM englive.users;
SELECT id, name, teacher_id FROM englive.classes;
SELECT count(*) FROM englive.class_memberships;
SELECT count(*) FROM englive.class_sessions;
SELECT * FROM englive.imports;
```

Không chọn toàn bộ document của users khi chụp/chia sẻ ảnh vì chứa hash mật khẩu. Settings và tài liệu có thể chứa dữ liệu riêng của lớp.

## 4. Nhập bản sao dữ liệu hiện tại

Chỉ chạy sau khi kết thúc buổi học và dừng server ghi JSON; công cụ từ chối nếu writer lock còn sống. Nếu dùng launcher tunnel, Stop có thể dừng server do launcher mở; server mở thủ công phải dừng tại terminal của nó. Không xóa writer lock để lách kiểm tra.

```powershell
npm run db:import
npm run db:status
```

Import **chỉ vào DB đích trống**, chạy transaction, đối chiếu count từng bảng trước COMMIT; lỗi thì ROLLBACK. Giữ ID và hash mật khẩu, tách thành viên/lịch sử lớp thành các bảng riêng; các entity còn lại mỗi bản ghi một hàng JSONB với cột quan hệ/index. Dữ liệu mồ côi/trùng bị khóa ngoại/unique từ chối, không âm thầm xóa để import qua.

Đây là bản sao chuẩn bị: **không nhập phiên đăng nhập, Zoom OAuth, live snapshots, aiUsage và khóa cấu hình AI/video**; cần xử lý các phần này rõ ràng khi chuyển backend. PDF/video/audio vẫn ở ổ đĩa, bảng chỉ lưu metadata. Chưa tự chuyển server đang chạy sang DB này; nếu bật lại server JSON và sửa dữ liệu thì bản import sẽ cũ. Cần cutover có kiểm soát ở bước tích hợp backend, không ghi song song hai nguồn.

## 5. Sao lưu khi database đã có dữ liệu

Trong pgAdmin chọn database englive → Backup → chọn Custom, chọn tên file ngoài thư mục cài PostgreSQL. Kiểm tra Restore sang DB thử trước khi coi backup đáng tin. Sao lưu riêng `data/pdfs`, `data/recordings`, `data/listening` nếu có; không chỉ sao lưu SQL. Bảo vệ file cấu hình và bản sao lưu bằng quyền truy cập phù hợp.

## Phần còn lại trước khi đổi web sang PostgreSQL

Thay các module đang sửa trực tiếp `store.data` bằng repository/query và transaction, xử lý concurrency sĩ số/lịch, đọc dữ liệu mới từ PostgreSQL, lưu phiên/token an toàn, checkpoint phòng, kiểm thử restart/restore/quyền, nhập cuối cùng lúc không còn writer JSON và có rollback. **Không nhét cả db.json vào một hàng hoặc chỉ đổi DATABASE_URL rồi báo đã hoàn tất.**
