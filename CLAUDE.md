# CLAUDE.md — hướng dẫn cho Claude khi làm việc trong repo này

**Đọc [PROJECT.md](PROJECT.md) trước**: kế hoạch, kiến trúc, tiến độ từng hạng mục và nhật ký công việc.
Sau mỗi phiên làm việc, cập nhật mục *Tiến độ* và *Nhật ký* trong PROJECT.md.

## Dự án
EngLive: web học tiếng Anh livestream giữa giáo viên và học sinh. Giáo viên soạn bài giảng (slide + trò chơi)
bằng AI từ PDF/văn bản trước buổi học, trình chiếu trong buổi livestream; học sinh tương tác trên slide và
hỏi AI (chat box) trong lúc học hoặc sau buổi học. Ngôn ngữ giao diện: tiếng Việt; nội dung dạy: tiếng Anh.

## Lệnh
```bash
npm install
npm start          # http://localhost:3000
npm run dev        # tự reload khi sửa server
npm test           # smoke test end-to-end (tự dựng mock LLM, không cần 9Router)
```
Tài khoản mẫu (mật khẩu `123456`): `teacher@demo.com`, `student1@demo.com`, `student2@demo.com`, `student3@demo.com`.
Muốn reset dữ liệu: xoá `data/db.json`.

## Cấu trúc
- `server.js` — Express + Socket.IO: auth, lớp học, livestream signaling (WebRTC), chat, trình chiếu slide và hoạt động trực tiếp.
- `db.js` — lưu JSON (`data/db.json`), seed dữ liệu mẫu, migrate trường mới khi load.
- `ai.js` — cấu hình nhà cung cấp AI (OpenAI-compatible, mặc định 9Router) và hàm gọi chat completion.
- `lessons.js` — soạn bài giảng: schema scene, prompt, job sinh nội dung, route `/api/lessons`, chấm điểm hoạt động.
- `pdf.js` — trích văn bản từ PDF/txt/md.
- `public/` — giao diện thuần HTML/CSS/JS (không build step). `js/slides.js` render slide dùng chung cho editor, phòng live giáo viên và học sinh.
- `tests/` — mock LLM và smoke test.

## Quy ước
- Giữ phong cách code hiện có: CommonJS, không framework phía client, chú thích tiếng Việt ngắn gọn.
- Quyền truy cập kiểm tra ở **server** (API và Socket.IO), không tin client. Học sinh không bao giờ nhận đáp án
  của hoạt động trước khi giáo viên chốt.
- Khoá API của nhà cung cấp AI chỉ nằm ở server, không trả về client (chỉ trả bản che `••••`).
- AI trả JSON: luôn đi qua `extractJson` + chuẩn hoá `normalizeScene`, không tin định dạng thô.
- Không commit `data/` và `node_modules/`. Không commit/push nếu người dùng chưa yêu cầu.

## AI / 9Router
- Endpoint mặc định: `http://localhost:20128/v1` (OpenAI-compatible). Model mặc định: `ag/gemini-3.8-flash-high`.
- Cấu hình ở trang **Cài đặt AI** (giáo viên) hoặc biến môi trường `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`.
- Môi trường phát triển của Claude có thể **không gọi được** `localhost:20128` (kết nối treo); dùng mock trong `tests/` để kiểm thử và nhờ người dùng thử với 9Router thật.
