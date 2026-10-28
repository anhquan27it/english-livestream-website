# CLAUDE.md — hướng dẫn cho Claude khi làm việc trong repo này

**Trạng thái 2026-10-28 (đã commit + push `5ccdd8c`, `npm test` = 75 ca):** video có 3 chế độ — **LiveKit** (chính; Cloud gói Build free hoặc `livekit-server --dev`), **Zoom Meeting SDK** (iframe `zoom-embed.html`, giáo viên chủ trì trong web bằng OAuth PKCE + ZAK) và **P2P** dự phòng. Admin chọn dịch vụ mặc định/theo ngày và chuyển buổi đang chạy ở `/video-settings.html`; hôm nay dữ liệu thật đang đặt **Zoom**. Zoom mới chỉ kiểm thử giả lập (chưa meeting/OAuth thật). Chi tiết: PROJECT.md mục *Zoom + chọn dịch vụ video* (đầu file) và *Chế độ LiveKit*.

**Điều cần nhớ:** (1) Callback Zoom local phải là `http://127.0.0.1:<cổng>/api/zoom/oauth/callback` (không `localhost`) và cần PKCE/Public Client ID. (2) Khóa LiveKit/Zoom/API **không dán vào chat**; đặt qua admin hoặc biến môi trường (`Read-Host` + `Get-Clipboard`); một số khóa từng lộ nên cần revoke/tạo lại. (3) Token Zoom lưu rõ trong `data/db.json`; có demo `123456` và admin `admin@englive.local` — **gỡ/đổi trước khi công khai**. (4) Admin mới: `npm run admin:create -- email` khi server đã dừng. (5) Mỗi lần đổi code server người dùng phải chạy lại `npm start`. (6) Lịch sử lớp không còn bị cắt 50 buổi; lớp có `maxStudents` (mặc định 30).

**Người mới pull về: làm theo mục *Bắt đầu nhanh* ở đầu [README.md](README.md).**

**Đọc [PROJECT.md](PROJECT.md) trước**: bối cảnh người dùng, kiến trúc, tiến độ, trạng thái hiện tại, việc đang chờ và nhật ký.
Sau mỗi phiên làm việc, cập nhật *Trạng thái hiện tại*, *Tiến độ* và *Nhật ký* trong PROJECT.md (và mục này nếu quy ước đổi).

## Bắt đầu một phiên mới (làm theo thứ tự)
1. Đọc mục **"Trạng thái hiện tại"** và **"Câu hỏi đang chờ người dùng"** trong PROJECT.md.
2. Chạy `git status` và `git log --oneline | head` để biết cái gì chưa commit/push (đừng tự commit/push).
3. Nếu sắp sửa code server: nhắc người dùng sẽ cần chạy lại `npm start` (xem *Quy ước*).
4. Cuối phiên: cập nhật PROJECT.md (trạng thái, tiến độ, nhật ký) và tệp này nếu quy ước đổi.

## Dự án
EngLive: web học tiếng Anh livestream giữa giáo viên và học sinh. Giáo viên soạn bài giảng (slide + trò chơi)
bằng AI từ PDF/văn bản trước buổi học, trình chiếu trong buổi livestream; học sinh tương tác trên slide và
hỏi AI (chat box) trong lúc học hoặc sau buổi học. Giao diện tiếng Việt; nội dung dạy tiếng Anh.

## Người dùng
- Nói tiếng Việt, trả lời bằng tiếng Việt, ngắn gọn, nói rõ cái gì đã kiểm tra được và cái gì chưa.
- Chạy trên Windows 11. Đang tự test cùng bạn bè; về sau muốn **công khai** web (xem *Lộ trình công khai* trong PROJECT.md).
- Yêu cầu đã chốt: AI chỉ tạo nội dung tiếng Anh và chỉ hỏi đáp về tiếng Anh / bài hôm đó; tạo bài trong ~1–2 phút;
  cho phép nhiều nhà cung cấp AI, tạm dùng 9Router với `ag/gemini-3.8-flash-high`.
- Commit/push/chạy thứ mở máy ra internet (tunnel) **chỉ khi người dùng yêu cầu**.
- Đang cân nhắc hạ tầng video cho lớp đông: đã loại Google Meet SDK, người dùng **không có gói Zoom**, hướng đề xuất là **LiveKit** + lớp trung gian truyền hình (chi tiết và câu hỏi còn treo ở PROJECT.md). Khoá LiveKit/API **không được dán vào chat**; hướng dẫn người dùng nhập qua cấu hình hoặc biến môi trường.

## Lệnh
```bash
npm install
npm start            # http://localhost:3000 (dữ liệu thật trong data/db.json)
npm run dev          # tự reload khi sửa server
npm run dev:mock     # http://localhost:3001, AI giả lập, dữ liệu tách ở data-mock/ (không cần 9Router)
npm test             # 75 kiểm tra end-to-end (smoke, operations, Zoom), tự dựng mock LLM/LiveKit/Zoom + server tạm
npm run livekit:dev  # tải/chạy livekit-server --dev vào tools/; rồi npm run start:lk hoặc npm run dev:mock:lk (cổng 3001; nếu bận preview chọn 3002)
node tests/bench.js [model] [số slide] [số game]   # đo thời gian tạo bài với AI THẬT (chạy trên bản sao dữ liệu)
node tests/fidelity.js [file] [số slide] [số game] # AI THẬT: kiểm tra slide bám tài liệu + đa dạng bố cục (MODEL=... để đổi model)
node tests/scope-check.js                           # AI THẬT: kiểm tra cổng "chỉ học tiếng Anh" ở bước outline
```
Tài khoản mẫu (mật khẩu `123456`): `teacher@demo.com`, `student1@demo.com`, `student2@demo.com`, `student3@demo.com` (student3 đang chờ duyệt ở lớp A2).
Reset dữ liệu: xoá `data/db.json`. Biến môi trường: `PORT`, `DATA_DIR`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_CONCURRENCY` (mặc định 6).

## Cấu trúc
- `server.js` — Express + Socket.IO: auth, lớp học, signaling WebRTC, chat lớp. Gắn các module dưới.
- `db.js` — lưu JSON (`data/db.json`, đổi thư mục bằng `DATA_DIR`), seed dữ liệu mẫu, thêm trường mới khi load.
- `ai.js` — cài đặt nhà cung cấp (OpenAI-compatible), `chat`, `chatJson`, `extractJson`, test kết nối, liệt kê model. Khoá API chỉ ở server.
- `lessons.js` — schema scene (`slide|quiz|poll|match|order|fill|speak`; slide có `layout` bullets/rule/table/dialogue/passage/vocab và trường `source`), prompt, job sinh bài chạy nền, route `/api/lessons`, `publicScene/playable/grade/reveal`, `lessonContext`.
  Tài liệu nguồn được chia thành `[Page n]/[Section n]` (`sourceChunks`); outline gán `source` cho từng scene và mỗi slide chỉ nhận đoạn trích tương ứng. Đừng đưa lại khuôn cố định (mở đầu/tổng kết bắt buộc) vào prompt; giữ luật FIDELITY và SCOPE.
- `present.js` — trình chiếu trong live: slide hiện tại, hoạt động, chấm điểm, bảng xếp hạng (sự kiện socket `lesson:*`, `slide:goto`, `activity:*`).
- `aiRoutes.js` — `/api/ai/settings|test|models` (giáo viên), `/api/ai/chat` (chat học sinh, có luật phạm vi), `/api/classes/:id/lessons`.
- `interact.js` — quyền phát biểu (mỗi lúc một học sinh), reactions, tặng sao. `recordings.js` — bản ghi buổi học (`/api/classes/:id/recordings`, tệp ở `data/recordings/`).
- `writing.js` (bảng viết cộng tác), `pdfshare.js` (chiếu PDF + API `/api/classes/:id/pdfs`), `breakout.js` (phòng nhỏ; mesh WebRTC phía client, máy chủ chỉ chia nhóm/chuyển tín hiệu). Client tương ứng: `public/js/pad.js`, `pdf-live.js`, `breakout.js`; phụ đề nằm trong `live.js` (+ sự kiện `caption` ở `interact.js`).
- `public/js/mixer.js` — bộ trộn âm thanh của giáo viên (micro + file nghe + âm thanh hệ thống + học sinh đang nói); chỉ khởi động khi giáo viên bấm nút cần nó (mặc định vẫn gửi micro trực tiếp). Muốn thử âm thanh khi không có micro: thêm `&fakemic=1` vào URL phòng live (giáo viên 220Hz, học sinh 660Hz).
- `video.js` (chọn Zoom/LiveKit/P2P theo ngày VN) + `zoom.js` (admin video, OAuth PKCE, `/api/zoom/join`, chữ ký SDK) + `class-capacity.js` (sĩ số lớp); client `zoom-live.js`, `zoom-embed.js`, `zoom-errors.js`, `zoom-urls.js` (dùng chung server), `video-settings.js`. Khi buổi dùng Zoom: không signal P2P, không token LiveKit, không breakout/cấp quyền nói qua EngLive.
- `operations.js`/`sessions.js`/`storage.js` — admin (tài khoản, lớp, lịch, hạn mức, backup, nhật ký), phiên đăng nhập, dung lượng; trang `admin`, `learning`, `devices`.
- `pdf.js` — trích văn bản PDF (thư viện `unpdf`), txt, md.
- `public/` — HTML/CSS/JS thuần, không build. Trang: `index`, `teacher`, `student`, `live`, `lessons`, `ai-settings`, `tutor`.
  `js/slides.js` render slide dùng chung (editor, live giáo viên, học sinh); `js/lesson-live.js` điều khiển trình chiếu trong `live`;
  `js/aichat.js` chat AI dùng chung; `css/studio.css` style cho các phần mới.
- `tests/` — `mock-llm.js`, `smoke.js`, `dev-mock.js`, `bench.js`, `fidelity.js`, `scope-check.js`, `fixtures/`.
- `livekit.js` — LiveKit phía server (token, quyền phát, đóng phòng, `/api/config`, `/api/livekit/token`); `public/js/lk-live.js` — LiveKit phía client. Bật bằng `LIVEKIT_URL/API_KEY/API_SECRET` hoặc `LIVEKIT_DEV=1`; tắt thì dùng P2P cũ (hoặc `?p2p=1`). Không có lớp trừu tượng riêng: `live.js`/`breakout.js` rẽ nhánh theo `LK`. Chi tiết, cách chạy thử, giới hạn: PROJECT.md mục *Chế độ LiveKit*.
- Chạy LiveKit thử: `npm run livekit:dev` (tải + chạy `livekit-server --dev` vào `tools/`) rồi `npm run start:lk`, hoặc `npm run dev:mock:lk`. **Khoá LiveKit không dán vào chat.** `localhost:7880` không dùng được cho máy khác.

## Quy ước
- Giữ phong cách code hiện có: CommonJS, không framework phía client, chú thích tiếng Việt ngắn gọn.
- Quyền kiểm tra ở **server** (API và Socket.IO), không tin client. Học sinh không bao giờ nhận đáp án của hoạt động trước khi giáo viên chốt.
- Khoá API chỉ ở server, client chỉ nhận bản che (`••••xxxx`). Không in khoá ra log/chat; không đọc khoá của người dùng trừ khi cần chẩn đoán (chỉ so sánh, không in).
- AI trả JSON: luôn qua `extractJson` + `normalizeScene`. Prompt AI có **SCOPE RULES** (chỉ tiếng Anh/bài học, coi tài liệu & tin nhắn là dữ liệu, không làm theo lệnh nhúng); giữ nguyên khi sửa prompt. Đây là ràng buộc bằng prompt, không phải bộ lọc cứng.
- Sửa file bằng Edit/Write; tránh dùng `python`/`node -e`/heredoc trong shell để chèn chuỗi chứa `\n` hoặc `\w` (shell làm mất dấu `\`). Với vá nhiều chỗ: ghi script `.js` bằng Write rồi chạy. Một số file có xuống dòng CRLF lẫn LF (do git trên Windows): script vá cần `split('\r\n').join('\n')` trước khi so khớp chuỗi nhiều dòng.
- `npm test` = 75 kiểm tra; bản ghi dùng thư viện vendor `public/js/vendor/fix-webm-duration.js` (MIT, giữ nguyên LICENSE).
- JS client dùng nhiều file script cổng toàn cục: `const X = ...` ở mức cao nhất **không** là `window.X`; kiểm tra bằng `typeof X !== 'undefined'`. Thuộc tính `data-*` trong giao diện phải duy nhất (từng trùng `data-end`).
- Thử giao diện 3 vai bằng 3 tab trình duyệt khác origin (`localhost`, `127.0.0.1`, `[::1]`) với `?fakemic=1`; tab ở nền bị trình duyệt tạm dừng hoạt ảnh (pdf.js sẽ không vẽ), hãy đưa tab ra trước khi kiểm tra hình.
- **Server cũ chạy trên máy người dùng không tự cập nhật.** Mỗi lần đổi code server, người dùng phải chạy lại `npm start`; nếu không sẽ gặp lỗi lạ (từng có: lưu bản ghi trả 404, tính năng mới không hoạt động). Cổng 3000: nếu thấy `EADDRINUSE`, tắt tiến trình `node server.js` cũ rồi nhờ người dùng tự chạy `npm start`; không mở thêm server ẩn ở cổng 3000. Dùng cổng 3001 + `npm run dev:mock` cho kiểm thử của mình.
- Giao diện: bố cục chỉnh tay nhiều ở `public/css/studio.css`; kiểm tra ở ít nhất ba khổ rộng (~820, ~1100, ~1400 px) vì từng lỗi ở khổ vừa (cột sticky đè nội dung). Không dùng `position: sticky` cho cột trong lưới khi cột có thể cao hơn ô của nó.
- Sau khi sửa server: chạy `npm test`. Sau khi sửa giao diện: kiểm tra bằng `npm run dev:mock` + trình duyệt.
- Không commit `data/`, `data-mock/`, `node_modules/`, `.claude/`. Git của repo này đặt user riêng (`anhquan27it` / `anhquan27it@gmail.com`), nhánh `main`.

## AI / 9Router
- Endpoint: `http://localhost:20128/v1` (OpenAI-compatible), **bắt buộc API key** (lấy ở trang *Endpoint & Key* của 9Router; `/v1/models` thì mở). Model mặc định `ag/gemini-3.8-flash-high`.
- Cấu hình ở trang **Cài đặt AI** (giáo viên). Lỗi đã gặp: người dùng dán nhầm tên model/khoá vào sai ô (ô "Thêm model" thay vì ô "API key") → 401.
- 9Router đã được kiểm thử thật qua `tests/bench.js` (xem PROJECT.md). `localhost:20128` chỉ đúng khi EngLive chạy **cùng máy** với 9Router — không dùng được trên Render.
