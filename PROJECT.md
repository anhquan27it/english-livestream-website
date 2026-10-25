# PROJECT.md — kế hoạch & tiến độ EngLive

Cập nhật lần cuối: 2026-10-25 (xong giai đoạn 1–5, còn thử với 9Router thật)

## Mục tiêu
1. **Trước buổi học**: giáo viên tải PDF/văn bản (hoặc chỉ nhập chủ đề) → AI sinh *bài giảng* gồm slide, trò chơi/câu hỏi tương tác → giáo viên xem, sửa, lưu.
2. **Trong buổi livestream**: giáo viên chọn bài giảng đã lưu, trình chiếu cho cả lớp; học sinh bấm trả lời trên slide (quiz, ghép từ, xếp câu, bình chọn), có bảng xếp hạng trực tiếp.
3. **Chat box AI** cho học sinh: hỏi đáp lúc đang học (AI biết slide hiện tại) và sau buổi học (hỏi về bài giảng giáo viên đã dạy hôm đó).
4. **Cài đặt AI** linh hoạt: nhiều nhà cung cấp OpenAI-compatible, tạm thời dùng 9Router (`http://localhost:20128`, model `ag/gemini-3.8-flash-high`).

Nền tảng đã có (xong từ trước): đăng nhập 2 vai trò, lớp học + mã lớp + duyệt học sinh, livestream WebRTC, chat lớp, giơ tay, thẻ từ vựng, lịch sử buổi học.

## Quyết định kiến trúc
**OpenMAIC** ([THU-MAIC/OpenMAIC](https://github.com/THU-MAIC/OpenMAIC), MIT) là ứng dụng Next.js 16 + PostgreSQL + pnpm, cần
Docker/Postgres (máy này chưa có `docker`, `pnpm`, `psql`). Nhúng nguyên app vào EngLive sẽ kéo theo cả stack đó
và hai hệ thống tài khoản riêng. Vì vậy:

- **Chọn: tích hợp mềm — tái hiện quy trình của OpenMAIC ngay trong EngLive** (không dùng chung code, chỉ mượn ý tưởng):
  *tài liệu → outline (giáo viên duyệt) → sinh từng scene (slide / quiz / tương tác) → chỉnh sửa → trình chiếu*.
  Sinh nội dung chạy nền trên server (đóng tab không mất), giống hướng "server-first" của OpenMAIC.
- Tham khảo mã nguồn OpenMAIC ở `lib/generation-run-client`, `lib/prompts`, `lib/quiz`, `lib/document`.
- **Phương án sau (tuỳ chọn)**: chạy OpenMAIC riêng (Docker) và nhập bài qua export `.html`/ZIP của nó làm một loại scene "nhúng iframe".
  Chưa làm; xem Giai đoạn 6.

Các lựa chọn khác:
- AI: lớp `ai.js` gọi `POST {baseUrl}/chat/completions` (chuẩn OpenAI). Thêm nhà cung cấp mới = thêm một dòng trong Cài đặt AI.
- Scene types: `slide`, `quiz` (trắc nghiệm), `poll` (bình chọn, không có đáp án), `match` (ghép cặp), `order` (xếp từ thành câu).
- Dữ liệu: JSON file như cũ (`data/db.json`). Trên Render Free dữ liệu mất khi restart; muốn bền cần Postgres/volume (Giai đoạn 6).
- Slide render bằng HTML/CSS thuần (`public/js/slides.js`), không dùng thư viện slide.

## Tiến độ
Ký hiệu: ✅ xong · 🟡 đang làm · ⬜ chưa làm

### Giai đoạn 0 — Nền tảng livestream ✅
- ✅ Auth + phân quyền giáo viên/học sinh, lớp học, mã lớp, duyệt học sinh
- ✅ Livestream WebRTC (camera/micro/chia sẻ màn hình), chat, giơ tay, thẻ từ vựng, lịch sử
- ✅ Triển khai Render (`render.yaml`)

### Giai đoạn 1 — Khung dự án & tài liệu ✅
- ✅ CLAUDE.md, PROJECT.md
- ✅ Cập nhật README

### Giai đoạn 2 — Cài đặt AI ✅
- ✅ `ai.js`: nhà cung cấp, chat completion, trích JSON, test kết nối
- ✅ Trang Cài đặt AI (`/ai-settings.html`): thêm/sửa/xoá nhà cung cấp, chọn model, Test, lấy danh sách model, model riêng cho soạn bài / chat
- ✅ Mặc định 9Router + `ag/gemini-3.8-flash-high`; ghi đè bằng biến môi trường

### Giai đoạn 3 — Soạn bài giảng (Lesson Studio) ✅
- ✅ Upload PDF/txt/md → trích văn bản (`pdf.js`, thư viện `unpdf`)
- ✅ Outline do AI đề xuất, giáo viên sửa
- ✅ Sinh scene chạy nền + tiến độ; sinh lại từng scene với yêu cầu riêng / đổi loại
- ✅ Editor slide/quiz/poll/ghép cặp/xếp câu, tự lưu, gắn vào lớp (`/lessons.html`)

### Giai đoạn 4 — Trình chiếu & tương tác trực tiếp ✅
- ✅ Giáo viên chọn bài giảng trong phòng live (tab *Bài giảng*), điều khiển slide (←/→), đồng bộ cho học sinh (`present.js`, `lesson-live.js`)
- ✅ Hoạt động: bắt đầu → học sinh trả lời → chốt kết quả → điểm + bảng xếp hạng (lưu vào lịch sử buổi học)
- ✅ Người vào muộn / giáo viên vào lại nhận đúng trạng thái; học sinh không nhận đáp án trước khi chốt

### Giai đoạn 5 — Chat AI cho học sinh ✅
- ✅ Chat trong phòng live (tab *AI*: biết slide hiện tại, không lộ đáp án hoạt động chưa chốt)
- ✅ Trang hỏi đáp sau buổi học (`/tutor.html`) theo bài giảng đã dạy; lưu lịch sử theo (học sinh, lớp, bài)

### Kiểm thử
- ✅ `npm test`: 18 kiểm tra end-to-end (mock LLM + server thật + socket.io-client): quyền truy cập, sinh bài, hoạt động, chấm điểm, không lộ đáp án, chat AI
- ✅ Duyệt thủ công trên trình duyệt (`npm run dev:mock`): cài đặt AI, tạo bài, editor, livestream 2 tab, quiz/xếp câu/ghép cặp, chat AI, hỏi đáp sau buổi học
- ⬜ Chưa thử với 9Router thật (xem *Giới hạn đã biết*) và camera/micro thật cùng slide

### Giai đoạn 6 — Ý tưởng sau
- ⬜ Dữ liệu bền (Postgres/volume), TURN/SFU cho lớp đông
- ⬜ DOCX/PPTX đầu vào, OCR PDF scan, ảnh minh hoạ do AI sinh, export `.pptx`
- ⬜ Luyện nói (Web Speech API), tích hợp OpenMAIC chạy riêng, streaming câu trả lời AI

## Hiệu năng sinh bài (đo với 9Router thật, 2026-10-25, `node tests/bench.js [model] [số slide] [số game]`)
| Model | 10 slide | Ghi chú |
|---|---|---|
| `ag/gemini-3.8-flash-high` (mặc định) | ~55 giây (outline 24s + slide 31s); 15 slide ~70 giây | chất lượng cao nhất trong 3 model đã đo |
| `ag/gemini-3.8-flash-medium` | ~43 giây | |
| `ag/gemini-3.8-flash-low` | ~15 giây | chưa so sánh chất lượng |
Sinh song song 6 slide (`AI_CONCURRENCY`), mỗi slide tối đa 70 giây (quá hạn → slide tạm + nút Sinh lại). Không thể cam kết tuyệt đối vì phụ thuộc tải của 9Router/Google.

## Giới hạn đã biết
- Máy phát triển của Claude không kết nối được tới `localhost:20128` (kết nối bị treo), nên luồng AI thật qua 9Router **chưa được kiểm thử trực tiếp**; đã kiểm thử bằng mock OpenAI-compatible.
- Cài đặt AI là cài đặt chung của hệ thống; mọi tài khoản giáo viên đều sửa được (khoá API được che khi hiển thị).
- Dữ liệu JSON file: không phù hợp nhiều server / tải lớn.

## Nhật ký
- **2026-10-25** — Khảo sát OpenMAIC (Next.js + Postgres), chọn tích hợp mềm; viết CLAUDE.md, PROJECT.md.
- **2026-10-25** — Làm xong giai đoạn 2–5: `ai.js`, `lessons.js`, `present.js`, `aiRoutes.js`, `pdf.js`; giao diện `ai-settings`, `lessons`, `tutor`, phòng live có slide/trò chơi/tab AI; `tests/` (mock LLM, smoke, `dev:mock`). Chưa commit.
- **Việc tiếp theo gợi ý**: (1) chạy thử với 9Router thật trên máy bạn rồi chỉnh prompt/timeout nếu model trả JSON lạ; (2) thử livestream thật với camera + slide giữa hai máy; (3) chọn hạng mục ở Giai đoạn 6.
