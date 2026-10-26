# PROJECT.md — kế hoạch & tiến độ EngLive

Cập nhật lần cuối: 2026-10-26

## Trạng thái hiện tại (đọc mục này trước)
- **Tính năng giai đoạn 1–5 đã xong, đã push lên GitHub** (commit `4002dd9`, nhánh `main`). Repo: https://github.com/anhquan27it/english-livestream-website (đã đổi tên từ `...webesite`; remote `origin` vẫn trỏ tên cũ, GitHub tự chuyển hướng).
- **Sau commit `4002dd9` còn thay đổi chưa commit**: file tài liệu này và `CLAUDE.md` đã sửa; các chỉnh trước đó (slide trên sân khấu giáo viên, nút chọn tệp, luật phạm vi AI, tăng tốc sinh bài, `tests/bench.js`) **đã nằm trong commit** — hãy `git status` để xác nhận.
- **Máy người dùng đang chạy**: `node server.js` ẩn nền ở cổng 3000 (tôi khởi động lại 2026-10-25 để lấy code mới) + `cloudflared tunnel` (link tạm dạng `https://xxxx.trycloudflare.com`, đổi mỗi lần bật, chết khi tắt tunnel/máy) để bạn bè test vai học sinh. 9Router phải đang mở trên máy người dùng cho phần AI. Tắt: `taskkill /IM cloudflared.exe /F` và `taskkill /IM node.exe /F`.
- **Render** (https://english-livestream.onrender.com, `render.yaml` gói `free`): đang chạy **bản cũ** (chỉ livestream/chat/giơ tay/thẻ từ vựng) cho tới khi Render deploy lại từ `main`. Trên Render AI **không** dùng được (9Router ở máy người dùng) và dữ liệu mất khi restart/ngủ. Người dùng đã được nhắc tự kiểm tra gói trong dashboard Render (Instance Type = Free).
- **Chưa kiểm thử**: camera/micro thật cùng slide giữa hai máy khác mạng (có thể cần TURN); nút "Chọn tệp từ máy" và slide trên sân khấu giáo viên (vừa sửa, đã kiểm tra cú pháp, chưa duyệt lại trên trình duyệt); chất lượng nội dung của `flash-low`; luật phạm vi AI với Gemini thật (chỉ test bằng mock).

## Mục tiêu
1. **Trước buổi học**: giáo viên tải PDF/văn bản (hoặc chỉ nhập chủ đề) → AI sinh *bài giảng* gồm slide, trò chơi/câu hỏi tương tác → giáo viên xem, sửa, lưu.
2. **Trong buổi livestream**: giáo viên chọn bài giảng đã lưu, trình chiếu cho cả lớp; học sinh bấm trả lời trên slide (quiz, ghép từ, xếp câu, bình chọn), có bảng xếp hạng trực tiếp.
3. **Chat box AI** cho học sinh: hỏi đáp lúc đang học (AI biết slide hiện tại) và sau buổi học (về bài giảng giáo viên đã dạy). AI chỉ trả lời về tiếng Anh / bài đó.
4. **Cài đặt AI** linh hoạt: nhiều nhà cung cấp OpenAI-compatible, tạm dùng 9Router (`http://localhost:20128`, model `ag/gemini-3.8-flash-high`).
5. **Sau này**: công khai web cho lớp thật (xem *Lộ trình công khai*).

## Quyết định kiến trúc
**OpenMAIC** ([THU-MAIC/OpenMAIC](https://github.com/THU-MAIC/OpenMAIC), MIT) là ứng dụng Next.js 16 + PostgreSQL + pnpm, cần Docker/Postgres
(máy này chưa có `docker`, `pnpm`, `psql`). Nhúng nguyên app sẽ kéo theo cả stack đó và hai hệ tài khoản. Vì vậy:
- **Chọn: tích hợp mềm — tái hiện quy trình OpenMAIC trong EngLive** (không dùng chung code, chỉ mượn ý tưởng):
  *tài liệu → outline (giáo viên duyệt) → sinh từng scene → chỉnh sửa → trình chiếu*. Sinh chạy nền trên server (đóng tab không mất).
  Tham khảo mã OpenMAIC ở `lib/generation-run-client`, `lib/prompts`, `lib/quiz`, `lib/document` (bản clone nằm trong thư mục scratchpad của phiên cũ, có thể clone lại).
- **Phương án sau (tuỳ chọn)**: chạy OpenMAIC riêng (Docker) và nhập bài qua export `.html`/ZIP làm scene "nhúng iframe". Chưa làm.

Các lựa chọn khác:
- AI: `ai.js` gọi `POST {baseUrl}/chat/completions`. Thêm nhà cung cấp = thêm một mục trong Cài đặt AI. Có model riêng cho tác vụ `lesson` và `chat`.
- Scene: `slide` (emoji, ý chính, từ vựng + IPA + nghe phát âm bằng Web Speech), `quiz`, `poll`, `match`, `order`.
- Điểm: 100 × tỉ lệ đúng + thưởng tốc độ tối đa 50 (giảm đều trong 45 giây); poll không có điểm. Bảng xếp hạng theo buổi, top 10 lưu vào lịch sử lớp.
- Chat AI: hội thoại lưu theo (học sinh, lớp, bài giảng) nên câu hỏi lúc live và sau buổi học cùng một luồng. Đáp án chỉ vào ngữ cảnh AI cho các slide đã chốt (live) hoặc cả bài khi đã dạy xong (review).
- Bài giảng gắn lớp khi giáo viên chọn gắn hoặc khi chiếu trong lớp đó (`lesson.classIds`, `lesson.taught[classId]`).
- Dữ liệu: JSON file (`data/db.json`) gồm `users, classes, tokens, settings.ai, lessons, chats`. Slide render bằng HTML/CSS thuần (`public/js/slides.js`, co giãn bằng `cqw`).

## Giao diện & luồng
- Giáo viên: `/teacher.html` (lớp), `/lessons.html` (tạo/sửa bài; hash route `#/new`, `#/l/<id>`, `#/l/<id>/outline`), `/ai-settings.html`, phòng live `/live.html?class=<id>[&lesson=<id>]` (tab Chat | Bài giảng | Học sinh).
- Học sinh: `/student.html` (lớp, banner "đang live"), `/live.html?class=<id>` (slide giữa, video giáo viên ở góc, nút "Đổi khung"; tab Chat | AI | Từ vựng), `/tutor.html` (hỏi đáp sau buổi học).
- API chính: `/api/lessons[...]`, `/api/lessons/upload` (body nhị phân, header `X-Filename`), `/api/ai/*`, `/api/classes/:id/lessons`. Socket: `lesson:present|stop`, `slide:goto`, `activity:start|end|answer`, `lesson:state`, `activity:stats`.

## Tiến độ
Ký hiệu: ✅ xong · 🟡 đang làm · ⬜ chưa làm

### Giai đoạn 0 — Nền tảng livestream ✅
Auth 2 vai trò, lớp học + mã lớp + duyệt, WebRTC (camera/micro/chia sẻ màn hình), chat lớp, giơ tay, thẻ từ vựng, lịch sử, triển khai Render.

### Giai đoạn 1 — Tài liệu ✅  (CLAUDE.md, PROJECT.md, README)
### Giai đoạn 2 — Cài đặt AI ✅  (`ai.js`, `/ai-settings.html`, test kết nối, lấy danh sách model, model riêng theo tác vụ)
### Giai đoạn 3 — Soạn bài giảng ✅
Upload PDF/TXT/MD (nút "Chọn tệp từ máy" + kéo thả) → outline AI → duyệt → sinh nền → editor (tự lưu, sinh lại từng slide/đổi loại, gắn lớp, "Livestream bài này").
#### Cải tiến độ bám tài liệu & đa dạng (2026-10-26, theo phản hồi "slide theo một khuôn, không chính xác với file")
- ✅ Bỏ khuôn cố định (mở đầu → từ vựng → luyện tập → tổng kết). Outline đi theo cấu trúc/thứ tự của tài liệu; mỗi phần (từ vựng, quy tắc/bảng, hội thoại, bài đọc, bài tập) thành scene phù hợp; bài tập có sẵn trong tài liệu được chuyển thành quiz/match/order dùng đúng câu của tài liệu.
- ✅ Tài liệu chia thành phần có nhãn (`[Page n]` từ PDF, `[Section n]` cho văn bản thường, `sourceChunks`); outline gán `source` cho từng scene, **mỗi slide chỉ nhận đúng phần tài liệu đó** (`sourceBlock(..., refs)`), kèm luật "FIDELITY" (dùng đúng từ, ví dụ, bảng, lời thoại, câu bài tập của tài liệu; không bịa).
- ✅ Slide có 6 bố cục: `bullets, rule (công thức + ví dụ), table, dialogue, passage (tô sáng **từ khoá**), vocab`; editor có form cho từng khối, chọn bố cục, hiện chip "📎 Nguồn: Page n" để giáo viên đối chiếu; outline sửa được bố cục và nguồn.
- ✅ Cổng phạm vi trong lần gọi outline (`scope_ok`; không tốn thêm lần gọi AI): từ chối yêu cầu dạy môn khác tiếng Anh (HTTP 422).
- ✅ Kiểm chứng với AI thật (`node tests/fidelity.js`, tài liệu mẫu `tests/fixtures/airport-unit.txt` gồm 4 trang): cả `flash-low` (~15s) và `flash-high` (~60s) đều dùng đủ 5 bố cục, đi đúng 4 trang, 14/14 thuật ngữ chủ chốt của tài liệu có mặt trong slide. Chưa kiểm với PDF dài/nhiều cột phức tạp thật của người dùng.

### Giai đoạn 4 — Trình chiếu & tương tác trực tiếp ✅
Giáo viên thấy slide trên sân khấu chính (video mình thu nhỏ) + bảng điều khiển; học sinh thấy slide; hoạt động → chốt → điểm/xếp hạng; người vào muộn/giáo viên vào lại nhận đúng trạng thái.
### Giai đoạn 5 — Chat AI cho học sinh ✅
Tab AI trong live + `/tutor.html`; luật phạm vi (chỉ tiếng Anh/bài học, chống lệnh nhúng); giới hạn 20 tin/phút/người; lỗi AI không lộ chi tiết cho học sinh.

### Kiểm thử
- ✅ `npm test`: 20 kiểm tra (quyền, sinh bài, từ chối chủ đề lạc đề, đa dạng bố cục + nguồn + đoạn trích theo slide, hoạt động, chấm điểm, không lộ đáp án, chat AI, luật phạm vi).
- ✅ Với AI thật: `tests/bench.js` (tốc độ), `tests/scope-check.js` (cổng phạm vi, 5/6 đúng; ca tài liệu tiếng Việt về lịch sử không bị từ chối mà biến thành bài tiếng Anh), `tests/fidelity.js` (độ bám tài liệu + đa dạng).
- ✅ Duyệt trình duyệt (`npm run dev:mock`): cài đặt AI, tạo bài, editor, live 2 tab, quiz/xếp câu/ghép cặp, chat AI, hỏi đáp sau buổi học.
- ✅ 9Router thật: kết nối + tạo bài hoàn chỉnh qua `tests/bench.js` (người dùng đã nhập đúng API key).
- ⬜ Camera/micro thật + slide giữa hai máy; lớp đông; trình duyệt di động thật.

### Giai đoạn 6 — Ý tưởng sau
- ⬜ Dữ liệu bền (Postgres/volume), TURN/SFU cho lớp đông
- ⬜ DOCX/PPTX đầu vào, OCR PDF scan, ảnh minh hoạ do AI sinh, export `.pptx`
- ⬜ Luyện nói (Web Speech API), tích hợp OpenMAIC chạy riêng, streaming câu trả lời AI
- ⬜ Bộ lọc phạm vi chat cứng (bước phân loại riêng) nếu prompt không đủ

## Yêu cầu mở rộng của người dùng (2026-10-26) — đối chiếu & lộ trình
Người dùng gửi danh sách 4 phân hệ (quản lý lớp/lịch, phòng livestream cốt lõi, công cụ tương tác cho tiếng Anh, điều phối lớp) và yêu cầu "đảm bảo hệ thống có các chức năng này". Đối chiếu với hệ thống ngày 2026-10-26:

| # | Chức năng | Trước đợt này | Kế hoạch |
|---|---|---|---|
| 1 | Phân quyền Admin / Giảng viên / Trợ giảng / Sinh viên | chỉ Giảng viên + Học sinh | Đợt 3 |
| 1 | Lớp theo trình độ, gán giảng viên | ✅ có (1 giảng viên/lớp), chưa có trợ giảng | Đợt 3 |
| 1 | Thời khoá biểu, phòng ảo theo lịch, tránh trùng lịch | ❌ (phòng live mở thủ công, chỉ thành viên lớp mới vào được ✅) | Đợt 3 |
| 1 | Nhắc lịch Email/Push 15 phút – 1 giờ | ❌ (chỉ thông báo trong app khi lớp lên sóng) | Đợt 3 (cần SMTP/Web Push) |
| 2 | WebRTC thời gian thực, bật/tắt cam & mic, chống ồn | ✅ (P2P STUN; chống ồn bật) | — |
| 2 | Âm thanh/video **hai chiều** (học sinh nói được) | ✅ **Đợt 1**: học sinh nói khi được cho phép (âm thanh); chưa có video học sinh (sẽ có trong breakout, Đợt 2) | — |
| 2 | Chia sẻ màn hình + **âm thanh hệ thống** | ✅ **Đợt 1** | — |
| 2 | Trình chiếu slide PDF/PPT trực tiếp | ✅ **Đợt 2**: PDF chiếu trực tiếp (pdf.js, đồng bộ trang); PPT cần xuất sang PDF; slide AI soạn trong app vẫn có | — |
| 2 | Quay lại buổi học | ✅ **Đợt 1** (video+âm thanh giáo viên; chưa kèm slide) | Slide đi kèm: Đợt 3 |
| 3 | Chia phòng nhỏ (Breakout) + giáo viên "đi tuần" | ✅ **Đợt 2** | — |
| 3 | Trình phát nghe đồng bộ, âm thanh gốc rõ | ✅ **Đợt 1** (trộn file audio vào luồng phát) | — |
| 3 | Live quiz/mini-game, flashcard, **đếm ngược**, điền từ | ✅ quiz/ghép/xếp/bình chọn/**điền từ gõ**/**đọc to** + đếm ngược (flashcard = thẻ từ vựng ghim, chưa có bộ flashcard riêng) | — |
| 3 | Bảng viết cộng tác + sửa lỗi trực tiếp (Live Correction) | ✅ **Đợt 2** (mỗi học sinh viết riêng, giáo viên chiếu một bài và tô màu; chưa phải soạn thảo chung đồng thời) | — |
| 3 | Phụ đề trực tiếp / chấm phát âm bằng nhận diện giọng nói | ✅ **Đợt 2** (Web Speech API: chỉ Chrome/Edge, âm thanh gửi tới dịch vụ của trình duyệt) | — |
| 4 | Giơ tay | ✅ | — |
| 4 | Biểu tượng cảm xúc (Reactions), tặng sao/điểm thưởng | ✅ **Đợt 1** (huy hiệu riêng chưa có, chỉ sao + điểm) | — |
| 4 | Mute All, chỉ định 1 học sinh mở mic, mời ra khỏi phòng | ✅ **Đợt 1** | — |
| 4 | Kênh AI hỗ trợ không làm gián đoạn giảng viên | ✅ tab AI riêng cho từng học sinh | — |

Trạng thái từng đợt được cập nhật ở mục *Tiến độ → Giai đoạn 7*.

### Giai đoạn 7 — Yêu cầu mở rộng (theo từng đợt)
**Đợt 1 ✅ (2026-10-26, chưa commit)** — âm thanh hai chiều & công cụ điều phối:
- ✅ Học sinh phát biểu: giáo viên bấm 🎤 cạnh tên (tab *Học sinh*) → học sinh bật mic, giọng được giáo viên **trộn** vào luồng phát cho cả lớp (`public/js/mixer.js`, Web Audio); người đang nói nhận luồng riêng *không có giọng mình* (tránh vọng). Mỗi lúc một học sinh; "Tắt mic lớp" thu lại; học sinh rời phòng/giáo viên rời thì tự thu mic. Server giữ quyền (`interact.js`, sự kiện `speak:grant|revoke`, `speaker`).
- ✅ Phát file nghe (mp3/wav/mp4…) trộn vào luồng → cả lớp nghe đồng thời, âm thanh gốc; thanh phát có tạm dừng/tua/âm lượng.
- ✅ Chia sẻ màn hình kèm âm thanh hệ thống/tab (khi người dùng tick "Chia sẻ âm thanh" trong hộp thoại của trình duyệt) trộn vào luồng.
- ✅ Ghi hình buổi học (video camera/màn hình + âm thanh trộn, 720p ~800kbps) → xem trước, tải về hoặc **lưu lên lớp**; thành viên lớp xem lại ở nút 🎞 trên thẻ lớp (`recordings.js`, lưu ở `data/recordings/`, tối đa 500 MB/bản ghi, thư viện MIT `fix-webm-duration` để tua được). **Chưa** kèm slide trong bản ghi.
- ✅ Reactions (👍❤️😂👏😮🎉🙋) bay trên sân khấu, giới hạn tần suất; tặng sao (+10 điểm, hiện trên bảng xếp hạng); đếm ngược 15–120 giây cho hoạt động (máy chủ tự chốt khi hết giờ, thanh đếm ngược trên máy học sinh dùng thời gian còn lại do máy chủ gửi để không lệch đồng hồ).
- Kiểm thử: `npm test` 26 kiểm tra (thêm quyền phát biểu, reaction, sao, đếm ngược, bản ghi). Trình duyệt thật với **micro giả** (`?fakemic=1`: giáo viên 220Hz, học sinh 660Hz): học sinh khác nghe cả 220+660Hz; người đang nói chỉ nghe 220Hz; thu mic → 660Hz biến mất; file nghe 1000Hz tới học sinh; bản ghi phát được, có thời lượng. **Chưa thử**: micro/camera thật, hộp thoại xin quyền, âm thanh hệ thống thật, Safari/Firefox, nhiều học sinh cùng lúc, hai mạng khác nhau.
**Đợt 2 ✅ (2026-10-26, chưa commit)** — Điền từ, đọc to, phụ đề, bảng viết, PDF, phòng nhỏ:
- ✅ Hai loại scene mới (AI sinh được, editor có form): **`fill`** (điền từ gõ: câu có `___`, nhiều đáp án chấp nhận, không phân biệt hoa/thường/dấu câu) và **`speak`** (đọc to: nhận dạng giọng nói của trình duyệt → máy chủ chấm theo dãy con chung dài nhất giữa các từ, ≥80% là đúng, trả chi tiết từng từ đúng/sai). Đáp án không lộ trước khi chốt. Hạn chế: máy chủ không kiểm chứng được âm thanh, chỉ thấy văn bản nhận dạng (học sinh có thể gian lận bằng client sửa).
- ✅ **Phụ đề trực tiếp**: giáo viên bật (chọn English US/UK hoặc Tiếng Việt) → chữ hiện dưới sân khấu cả lớp; học sinh bật/tắt. Chỉ nghe micro của giáo viên (không thu file nghe/âm thanh hệ thống).
- ✅ **Bảng viết cộng tác** (`writing.js`, `public/js/pad.js`): giáo viên mở đề → học sinh viết (tự gửi khi gõ) → giáo viên xem trực tiếp, "Chiếu & sửa" một bài cho cả lớp → bôi đen đoạn văn, chọn màu (Lỗi/Gợi ý/Hay/Ghi chú), nhập "sửa thành…" và ghi chú; cả lớp thấy ngay.
- ✅ **Chiếu PDF** (`pdfshare.js`, `public/js/pdf-live.js`): giáo viên tải PDF lên lớp (≤25 MB, lưu `data/pdfs/`) hoặc chọn lại tệp đã tải; học sinh tải cùng tệp bằng token và vẽ đúng trang giáo viên đang mở (pdf.js 3.11.174 từ cdnjs); chiếu PDF và bài giảng AI loại trừ nhau.
- ✅ **Phòng thảo luận nhỏ** (`breakout.js`, `public/js/breakout.js`): chia ngẫu nhiên 2–5 người/nhóm (người lẻ gộp vào nhóm trước), hẹn giờ 3–20 phút; mỗi nhóm nối WebRTC mesh trực tiếp giữa các học sinh (camera+micro, người có socketId nhỏ hơn gọi trước); phòng chính tự tắt tiếng khi vào nhóm; học sinh có nút "Gọi giáo viên" (giơ tay); giáo viên "Vào nghe/Rời nhóm" từng nhóm (mỗi lúc một nhóm); "Gọi cả lớp về phòng chính". Tín hiệu chỉ chuyển giữa thành viên cùng nhóm (+ giáo viên đang ghé thăm).
- Sửa lỗi phát hiện khi kiểm thử: thanh đếm ngược của Đợt 1 dùng thuộc tính `data-end` trùng với nút "Chốt" khiến nút này không bấm được khi có đếm ngược (đổi thành `data-deadline`); `window.PdfLive` không tồn tại với `const` toàn cục (dùng `typeof PdfLive`).
- Kiểm thử: `npm test` **32** kiểm tra (thêm điền từ, đọc to, phụ đề, bảng viết, PDF, phòng nhỏ). Trình duyệt thật với micro/camera giả (3 tab: giáo viên + 2 học sinh, `?fakemic=1`): điền từ & đọc to (kết quả tô màu từng từ), đếm ngược tự chốt, bảng viết + tô màu hiển thị đúng ở cả hai phía, PDF đồng bộ trang, phòng nhỏ (mỗi học sinh nghe đúng giọng/tần số của bạn mình, giáo viên ghé thăm thấy cả hai, học sinh thấy ô "Giáo viên", kết thúc trả về phòng chính và bật lại tiếng). AI thật (`tests/fidelity.js`) sinh được `fill` từ "Exercise A" của tài liệu mẫu và `speak` từ hội thoại.
- **Chưa thử**: nhận dạng giọng nói thật (phụ đề, đọc to — môi trường thử không có micro/dịch vụ nhận dạng; chỉ thử đường truyền văn bản), camera/micro thật trong phòng nhỏ, nhóm ≥3 người, hai mạng khác nhau (mesh cần TURN nếu mạng chặt), lớp đông, Firefox/Safari (Web Speech API không có), PDF lớn/nhiều trang, kết hợp bản ghi với phòng nhỏ (bản ghi chỉ ghi video+âm thanh giáo viên). Khi tab ở nền, pdf.js tạm dừng vẽ cho tới khi tab hiện lại (hành vi của trình duyệt).
**Đợt 3 ⬜** — Admin / trợ giảng, thời khoá biểu + phòng ảo theo lịch + chống trùng lịch, nhắc lịch Email (SMTP) / Web Push, slide đi kèm bản ghi.

## Hiệu năng sinh bài (đo với 9Router thật, 2026-10-25)
| Model | 10 slide | Ghi chú |
|---|---|---|
| `ag/gemini-3.8-flash-high` (mặc định) | ~55 giây (outline 24s + slide 31s); 15 slide ~70 giây; trước khi tăng song song là 88 giây | chất lượng cao nhất trong 3 model đã đo |
| `ag/gemini-3.8-flash-medium` | ~43 giây | |
| `ag/gemini-3.8-flash-low` | ~15 giây | chưa so sánh chất lượng |
Sinh song song 6 slide (`AI_CONCURRENCY`), mỗi slide tối đa 70 giây (quá hạn → slide tạm + nút Sinh lại). Không cam kết tuyệt đối vì phụ thuộc tải 9Router/Google.

## Lộ trình công khai (người dùng đã hỏi; chưa làm, chờ chỉ thị)
1. **Hosting**: Render trả phí (ổ đĩa bền) hoặc VPS + Caddy/Nginx (HTTPS bắt buộc cho camera/micro) + tên miền.
2. **Dữ liệu bền**: chuyển JSON → PostgreSQL (hoặc ổ đĩa bền) + sao lưu.
3. **AI từ xa**: dùng API công khai (Gemini/OpenAI/OpenRouter) với key trong biến môi trường server, hoặc cài 9Router lên cùng VPS. Cần giới hạn chi phí theo người dùng.
4. **An toàn (bắt buộc trước khi mở cho người lạ)**: xoá tài khoản mẫu `123456`; đăng ký giáo viên phải được duyệt/mã mời; **Cài đặt AI chỉ cho quản trị viên** (hiện mọi giáo viên sửa được và dùng AI bằng key chung); giới hạn thử đăng nhập, hạn phiên đăng nhập; không lưu khoá API trong file dữ liệu.
5. **Livestream thật**: TURN server hoặc SFU (LiveKit/Cloudflare Calls); P2P hiện chỉ hợp ~10–20 học sinh.
6. **Vận hành**: giám sát lỗi, quyền riêng tư dữ liệu học sinh (có thể là trẻ em), theo dõi chi phí AI.
Thứ tự đề xuất: test với bạn bè → làm mục 4 và 2 → deploy → chọn nhà cung cấp AI công khai → mở thử một lớp nhỏ → thêm TURN khi cần. Tôi đã đề nghị làm giúp mục 2 và 4; người dùng chưa trả lời.

## Giới hạn đã biết
- Cài đặt AI là cài đặt chung; mọi tài khoản giáo viên đều sửa được và tiêu key chung (khoá được che khi hiển thị). Ai có link tunnel đều đăng nhập được bằng tài khoản mẫu.
- Dữ liệu JSON file: không hợp nhiều server / tải lớn; mất trên Render Free khi restart.
- P2P WebRTC chỉ có STUN: hai máy ở mạng khác nhau có thể chat được nhưng không thấy hình.
- PDF dạng ảnh scan và `.docx` chưa hỗ trợ (báo lỗi, gợi ý dán văn bản/xuất PDF).
- Luật phạm vi AI dựa vào prompt, không tuyệt đối.

## Nhật ký
- **2026-10-25** — Khảo sát OpenMAIC, chọn tích hợp mềm. Làm xong giai đoạn 1–5 (module `ai/lessons/present/aiRoutes/pdf`, trang `ai-settings/lessons/tutor`, live có slide/trò chơi/tab AI, `tests/`).
- **2026-10-25** — Gỡ lỗi 9Router: lúc đầu 401 do người dùng dán nhầm key vào ô model/khoá; sau đó chạy ổn. Sửa: sân khấu giáo viên hiển thị slide; luật phạm vi AI (chat + soạn bài); đo hiệu năng và tăng song song lên 6, timeout 70s/slide; thêm nút chọn tệp.
- **2026-10-25** — Commit `4002dd9` push lên `main` (chưa có khoá nào trong repo). Cài `cloudflared` (winget), khởi động lại server, bật tunnel cho bạn bè test. Giải thích chi phí Render (Free) và lộ trình công khai.
- **2026-10-26** — Viết lại CLAUDE.md và PROJECT.md để phiên sau nắm đủ bối cảnh.
- **2026-10-26** — Người dùng báo slide theo khuôn cố định và chưa bám file. Sửa như mục "Cải tiến độ bám tài liệu & đa dạng" (chưa commit). Cổng phạm vi khi tạo outline. Người dùng tự chạy `cloudflared` (link tạm mới).
- **2026-10-26** — Người dùng gửi danh sách chức năng 4 phân hệ và yêu cầu đảm bảo có đủ. Đối chiếu → bảng ở mục "Yêu cầu mở rộng", làm xong Đợt 1 (xem Giai đoạn 7). Đợt 2–3 chưa làm; cần người dùng xác nhận thứ tự nếu muốn đổi.
- **Việc tiếp theo gợi ý**: (1) duyệt lại trên trình duyệt slide ở sân khấu giáo viên + nút chọn tệp; (2) thử live thật hai máy với camera; (3) hỏi người dùng có muốn push bản Render mới/ làm mục 2 & 4 của lộ trình công khai không; (4) commit file tài liệu nếu người dùng đồng ý.
