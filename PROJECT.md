# PROJECT.md — kế hoạch & tiến độ EngLive

## Cập nhật 2026-10-27 — LiveKit + admin (ưu tiên mục này)
- **LiveKit Cloud đã cấu hình và chạy thử** (project "EnglishLearning", gói **Build** miễn phí: 5.000 phút WebRTC + 50 GB băng thông tải xuống mỗi tháng, 100 người cùng lúc cho cả project; tháng 10 chi phí $0.00, đã dùng ~14 phút/1 GB; hết hạn mức thì chặn hay tính tiền **chưa xác nhận**, người dùng chưa gắn thẻ nên không bị trừ). Ước lượng: 1 giờ video của một học sinh ≈ 0,2–0,7 GB tuỳ mức chất lượng (chưa đo thực tế nhiều người).
- **Khoá LiveKit chỉ ở biến môi trường** (`LIVEKIT_URL/API_KEY/API_SECRET`), mất khi đóng cửa sổ PowerShell. Cách đặt không lộ khoá: lệnh `Read-Host` chờ người dùng copy khối *Environment variables* rồi `Get-Clipboard` (xem README). Một số khoá từng bị dán/chụp vào chat → **phải revoke các key cũ trên trang LiveKit**. Chưa có tệp cấu hình riêng ngoài git (đã đề nghị, người dùng chưa chọn).
- **Admin**: thanh bên tách từng mục (Tổng quan, Tài khoản, Lớp học, Thời khóa biểu, Tài liệu & bản ghi, Hệ thống, Nhật ký, Cài đặt AI; điều hướng bằng `#hash`); admin không còn thấy menu giáo viên/học sinh. Lớp học: **tạo/sửa/xóa lớp**, phân công giáo viên/trợ giảng, học sinh. Thời khóa biểu: thêm lịch (lặp hằng tuần tối đa 26 buổi, trùng lịch lớp/giáo viên thì từ chối cả loạt), xóa lịch. Tổng quan: số phòng/người online thật từ LiveKit (`lk.stats()`), hộp Chờ duyệt có nút Duyệt, tổng lượt dùng AI hôm nay.
- **Chất lượng camera giáo viên**: nút "Chất lượng" trong phòng live (Tiết kiệm 360p/400 kbps, Cân bằng 480p/800 kbps, Cao 720p/1,5 Mbps; lưu `localStorage`, đổi được lúc đang dạy; LiveKit phát lại camera với bitrate mới). Simulcast đã bật sẵn cho camera (giảm băng thông tải xuống chỉ khi học sinh nhận bản nhỏ). Chia sẻ màn hình không simulcast.
- Sửa: `scripts/livekit-dev.ps1` (BOM UTF-8; đọc `checksums.txt` dạng byte); chat AI không còn hiện LaTeX/`*nghiêng*` (`aichat.js` làm sạch + prompt FORMAT ở `aiRoutes.js`).
- Kiểm thử: `npm test` = **56 ca đạt**. LiveKit đã thử với `livekit-server --dev` + micro/camera giả và với Cloud thật qua trình duyệt của người dùng (hình/tiếng tới học sinh). **Chưa thử**: camera/micro thật, chia sẻ màn hình + âm thanh hệ thống qua LiveKit, ghi hình khi dùng LiveKit, lớp đông thật, chế độ chất lượng ở P2P.
- Đã mở Cloudflare quick tunnel một lần cho bạn bè test (link tạm; tiến trình `cloudflared` có thể còn chạy trên máy người dùng, tắt khi xong).
- Lớp tối đa **30 học sinh** (người dùng đã chốt); dùng **LiveKit Cloud** để test, VPS tự chạy là lựa chọn sau (chỉ đổi 3 biến môi trường). Zoom: chưa làm, không có gói; muốn thêm phải tách lớp trung gian truyền hình trước.
- Lưu ý an toàn khi công khai: có admin demo `admin@englive.local` mật khẩu **123456** kèm nút đăng nhập nhanh ở trang chủ (do phiên trước thêm để thử nghiệm) và tài khoản mẫu `123456`; **phải gỡ/đổi trước khi mở cho người lạ**.

## Cập nhật 2026-10-26: triển khai 4 đợt

- Danh sách lớp giáo viên/học sinh đã thu gọn và dùng chung `class-directory.js` + `classes.css`: tìm không dấu theo tên/mã/giáo viên/mô tả, lọc trạng thái/trình độ, sắp xếp live/tên/sĩ số, đổi danh sách/thẻ, phân trang 12 lớp. Giáo viên mở Quản lý lớp thành phần chi tiết riêng; quay lại giữ bộ lọc/trang/vị trí cuộn. Không tự mở chi tiết lớp đầu tiên; danh sách học sinh/yêu cầu có vùng cuộn giới hạn. Học sinh dùng toàn bộ chiều rộng cho lớp, từ vựng/mẹo chuyển xuống dưới; banner live chỉ hiện tối đa 2 lớp + nút lọc tất cả, sửa banner mobile tránh ép chữ. Đây là phân trang phía trình duyệt; API vẫn tải toàn bộ lớp được phép xem, chưa tối ưu truy vấn server cho hàng nghìn lớp.
- Kiểm chứng lần chỉnh lớp: `QA_CLASS_COUNT=38 npm run dev:qa` chỉ seed DATA_DIR tạm; kiểm tra tìm không dấu, kết hợp lọc, tìm giáo viên, 4 trang (trang cuối 2 mục), đổi chế độ, chi tiết/quay lại, trạng thái trống, pending không có nút vào live, socket cập nhật live + đường dẫn kiểm tra thiết bị. Kiểm tra 390/820/1100/1400 px, không tràn ngang; console học sinh không có error/warn; JS syntax và git diff --check đạt. Đối chiếu thêm 2 lớp thật trên cổng 3000 chỉ đọc. Không sửa API/server thật; Ctrl+F5 là đủ.

- Đồng bộ giao diện Admin/Học tập/Thiết bị với Bài giảng: các trang mới trước đây thiếu Google Font Plus Jakarta Sans và Lucide nên logo/menu không có icon, chữ khác nét. Đã bổ sung cùng font + phiên bản Lucide, gọi `icons()` ngay trong `buildSidebar`, thống nhất header và nút menu mobile. Đối chiếu trình duyệt Bài giảng/Học tập: font đã tải, 4 icon menu, 1 icon logo, sidebar 260 px và chiều cao menu 46.8 px giống nhau. Chỉ sửa frontend, không cần restart server.

- Trang chủ chỉ dành cho khách: `home-entry.js` chạy ngay ở head, chuyển phiên đã đăng nhập bằng `location.replace(Auth.home(user))` theo admin/teacher/assistant/student; xử lý quay lại bằng BFCache và đăng nhập ở tab khác. Login thành công cũng dùng replace. Logout vẫn xóa phiên và về trang giới thiệu. Không thay API/backend cho thay đổi này.

- Người dùng báo trang Học tập lỗi: xác minh server thật cổng 3000 trả HTML 404 cho `/api/learning` và `/api/learning/reminders`, còn healthz 200 → server cũ chưa restart. Sửa `common.api` báo rõ cần Ctrl+C → npm start khi API trả HTML 404; sửa nút Làm mới của learning không truyền MouseEvent vào tham số quiet (trước đây bấm sẽ bỏ qua render). Không tự dừng/mở server 3000 để giữ cấu hình LiveKit trong terminal của người dùng.

- Theo yêu cầu mới nhất, tài khoản admin thử nghiệm `admin@englive.local` dùng mật khẩu **123456**, có nút đăng nhập nhanh ngay dưới teacher/student trong hộp đăng nhập. Nút điền email/mật khẩu và gửi form. Chỉ dùng cấu hình này để thử nghiệm; lệnh tạo admin mới vẫn sinh mật khẩu ngẫu nhiên, không thay mật khẩu teacher.
- **Cần restart để áp dụng admin demo**: phát hiện `data/db.json` đã bị server cũ ghi đè, không còn admin được tạo ở phiên trước. Đã đặt `data/admin-setup.json` (chỉ hash mật khẩu) để server mới nạp sau khi giữ writer lock, tạo/cập nhật đúng admin riêng, thu hồi token rồi xóa file thiết lập. Người dùng cần Ctrl+C → npm start, không bootstrap lặp trong lúc server cũ chạy. Cơ chế đã được kiểm thử, tổng 55 ca đạt.

- **Điều chỉnh admin riêng theo yêu cầu người dùng**: `admin:create` chỉ tạo tài khoản mới, từ chối email trùng, sinh mật khẩu ngẫu nhiên; không nâng teacher thành admin. Đã tạo `admin@englive.local` trong dữ liệu thật `data/db.json` khi cổng 3000 không chạy, teacher@demo.com vẫn là teacher. Mật khẩu đã cung cấp riêng trong chat, **không chép vào tài liệu/repo**. Muốn dùng cần khởi động server và đăng nhập admin riêng. Fixture/tests/QA cũng đã tách admin và teacher; 55 kiểm tra đạt.

- Người dùng đã yêu cầu thực hiện cả 4 đợt; **chưa có PostgreSQL**, chốt tiếp tục JSON, chưa làm Zoom. Những phần mô tả "chưa có admin" phía dưới là lịch sử trước bản này.
- Đã sửa kick/quyền mic/token LiveKit, cách rời phòng, ẩn đáp án AI theo tập scene đã chốt, không tính điểm trùng, deadline phía server, tự lưu editor và phục hồi nhóm khi socket nối lại. API LiveKit mock phản hồi đúng để kiểm tra outgoing permissions/removeParticipant, không bỏ qua fetch failed.
- Thêm `operations.js`, `sessions.js`, `storage.js`; trang `admin.html`, `learning.html`, `devices.html` cùng JS/CSS. Admin quản lý tài khoản/lớp/phòng/tệp/hạn mức/backup/audit; giáo viên mới chờ duyệt; AI settings chỉ admin. Trợ giảng quản lý lịch/bài tập/báo cáo lớp được giao, chưa điều khiển live.
- Lịch chống trùng lớp/giáo viên, nhắc trong app 15 phút; bài tập viết có hạn nộp và chấm 0–10; kho từ cá nhân/flashcard; kết quả và thời gian chuyên cần; kiểm tra mic/cam/loa trước vào học.
- JSON nguyên tử + fsync; chống hai tiến trình ghi chung DATA_DIR; backup khởi động/hằng ngày giữ 14 bản; snapshot phòng theo sự kiện/5 giây; phục hồi slide/điểm/bảng viết, chốt hoạt động bị gián đoạn, nhóm phải chia lại. Phiên 7 ngày, giới hạn auth, thu hồi phiên/socket, hạn mức AI và dung lượng tệp (có giữ ngân sách upload đồng thời).
- **Tạo thêm admin**: dừng server → `npm run admin:create -- <email mới>` → lưu mật khẩu sinh ngẫu nhiên → chạy lại `npm start` trong terminal có biến LiveKit → đăng nhập admin → `/admin.html`. Không chạy bootstrap khi server đang hoạt động; tài khoản đã tồn tại không bị sửa. Admin `admin@englive.local` đã tạo riêng, không cần chạy lại lệnh cho email này.
- Kiểm thử: bộ mở rộng **55 ca đạt**; tải Socket.IO 5/20/50/99 học sinh + giáo viên, 99/99 nhận phụ đề (~29 ms trong lần đo), **không phải kiểm thử video 100 người**. Duyệt UI admin/học tập 820/1100/1400/390 px, giao bài và nộp bài qua hai origin riêng. Đã sửa thêm mic phòng chính khi vào nhóm (thu quyền học sinh; mic giáo viên dùng track clone khi đi tuần).
- Chưa có: PostgreSQL/multi-server, SMTP/Web Push khi đóng app, email khôi phục mật khẩu, Zoom, trợ giảng đồng điều khiển live, tự động chuyển LiveKit→P2P; chưa đo video Cloud lớp đông/hardware thật. JSON backup không chứa PDF/video, cần sao lưu cả DATA_DIR riêng.
- (Đã commit/push ở bản 2026-10-27.) Giữ nguyên các thay đổi LiveKit và định dạng chat AI đã có từ trước; không dừng server thật cổng 3000. README có hướng dẫn đầy đủ và giới hạn.

Cập nhật lần cuối: 2026-10-27 (LiveKit Cloud, admin lớp/thời khóa biểu, chất lượng camera)

## Trạng thái hiện tại (đọc mục này trước)
- Giao diện danh sách lớp mới đã hoàn tất, xem cập nhật đầu file; các mục lịch sử dưới đây không mô tả giao diện mới. Không cần khởi động lại server cho lần chỉnh này.
- **Đã push lên GitHub**: toàn bộ công việc tới bản cập nhật tài liệu 2026-10-27 (`git log origin/main`). Repo: https://github.com/anhquan27it/english-livestream-website (remote `origin` vẫn trỏ tên cũ `...webesite`, GitHub tự chuyển hướng).
- **Chưa commit**: không có (cây làm việc sạch sau lần push). LiveKit đã làm xong phần lõi, xem mục *Chế độ LiveKit*; `npm test` = **56** kiểm tra, đạt.
- **Máy người dùng (Windows)**: không chắc server đang chạy. Tôi đã tắt tiến trình `node server.js` cũ ở cổng 3000 hai lần; **mỗi lần đổi code server người dùng phải tự chạy lại `npm start`** (từng gặp: bản ghi không lưu được vì server cũ trả 404; `EADDRINUSE` khi vừa tôi vừa người dùng mở server). Quy ước: tắt tiến trình cũ rồi nhờ người dùng tự `npm start` trong terminal của họ, đừng mở thêm server ẩn ở cổng 3000. Người dùng tự chạy `cloudflared tunnel --url http://localhost:3000` khi cần cho bạn bè test (link `trycloudflare.com` đổi mỗi lần, chết khi tắt tunnel/máy; `winget install Cloudflare.cloudflared` đã cài). 9Router phải đang mở cho phần AI; API key 9Router đã được nhập đúng trong Cài đặt AI (lưu ở `data/db.json`).
- **Render: người dùng đã bỏ dự án trên Render (2026-10-27)**; đã xoá `render.yaml` và mục hướng dẫn Render trong README. Để bạn bè test hiện dùng `cloudflared` tunnel từ máy người dùng; để công khai lâu dài xem *Lộ trình công khai* (VPS + HTTPS).
- **Hạ tầng video**: đã cài **LiveKit** làm chế độ chính khi có cấu hình (thay WebRTC P2P cho video/âm thanh); không cấu hình thì tự dùng P2P cũ (hoặc thêm `?p2p=1` vào URL phòng live). Socket.IO vẫn là kênh điều khiển (chấm điểm, ẩn đáp án, quyền, thông báo). Google Meet SDK loại; Zoom không chọn (không có gói; nếu có sau này thì thêm Zoom Video SDK như một bộ truyền hình khác).
- **Câu hỏi đang chờ người dùng**: không còn câu hỏi treo (lớp ≤30 học sinh, dùng LiveKit Cloud để test). Việc gợi ý tiếp: người dùng thử bằng thiết bị/bạn bè thật và báo lỗi; revoke các khoá LiveKit đã lộ; chọn cách lưu khoá ngoài git; Đợt 3 còn lại (SMTP/Web Push nhắc lịch, báo cáo vi phạm/khoá học sinh); lộ trình công khai (xem bên dưới) trước khi mở cho người lạ.
- **Chưa kiểm thử (cần người dùng thử bằng thiết bị thật)**: LiveKit với `getDisplayMedia` + âm thanh hệ thống thật, ghi hình khi dùng LiveKit (vẫn dựa vào `Mixer`), LiveKit từ máy ở mạng khác / lớp đông, micro/camera thật (mọi thứ mới chỉ thử bằng micro/camera giả `?fakemic=1`), nhận dạng giọng nói thật (phụ đề, đọc to), ghi hình tab-capture, phòng nhỏ ≥3 người, hai máy ở hai mạng khác nhau (có thể cần TURN), lớp đông, Firefox/Safari, PDF lớn, trình duyệt di động thật, luật phạm vi AI với Gemini thật ở các ca mập mờ, chất lượng nội dung `flash-low`.

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
- Giáo viên: `/teacher.html` (lớp), `/lessons.html` (tạo/sửa bài; hash route `#/new`, `#/l/<id>`, `#/l/<id>/outline`), `/ai-settings.html`, phòng live `/live.html?class=<id>[&lesson=<id>]` (tab Chat | Bài giảng | Nhóm | Viết | Học sinh; tab Bài giảng có khung "Slide tiếp theo" ở trên, bấm để chuyển slide). Thanh điều khiển: Micro, Camera, Chia sẻ màn hình, Phát file nghe, Ghi hình, Tắt mic lớp, Phụ đề, Thẻ từ vựng, Kết thúc.
- Học sinh: `/student.html` (lớp, banner "đang live"), `/live.html?class=<id>` (slide giữa, video giáo viên ở góc, nút "Đổi khung"; tab Chat | AI | Từ vựng; lớp phủ trên sân khấu khi có bảng viết `#padLayer` hoặc phòng nhỏ `#boLayer`), `/tutor.html` (hỏi đáp sau buổi học). Thẻ lớp có nút 🎞 xem bản ghi.
- API chính: `/api/lessons[...]`, `/api/lessons/upload` (body nhị phân, header `X-Filename`), `/api/ai/*`, `/api/classes/:id/lessons`. Socket: `lesson:present|stop`, `slide:goto`, `activity:start|end|answer`, `lesson:state` (giáo viên có thêm `fullScene`, `nextScene`, `outline`), `activity:stats`, `speak:*`, `speaker`, `reaction`, `star:give`, `caption`, `pad:*`, `pdf:*`, `breakout:*`, `bo:signal`.

## Tiến độ
Ký hiệu: ✅ xong · 🟡 đang làm · ⬜ chưa làm

- ✅ Tối ưu giao diện nhiều lớp (26/10): danh sách/thẻ, tìm/lọc/sắp xếp, phân trang và chi tiết lớp riêng; kiểm thử với 38 lớp tạm và 4 khổ màn hình.

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
- ✅ `npm test`: **33** kiểm tra (đã thêm sau mốc này: tương tác lớp học, bản ghi, điền từ/đọc to, phụ đề, bảng viết, PDF, phòng nhỏ, slide tiếp theo; ban đầu 20: quyền, sinh bài, từ chối chủ đề lạc đề, đa dạng bố cục + nguồn + đoạn trích theo slide, hoạt động, chấm điểm, không lộ đáp án, chat AI, luật phạm vi).
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
**Đợt 1 ✅ (2026-10-26, đã commit `22336d4`)** — âm thanh hai chiều & công cụ điều phối:
- ✅ Học sinh phát biểu: giáo viên bấm 🎤 cạnh tên (tab *Học sinh*) → học sinh bật mic, giọng được giáo viên **trộn** vào luồng phát cho cả lớp (`public/js/mixer.js`, Web Audio); người đang nói nhận luồng riêng *không có giọng mình* (tránh vọng). Mỗi lúc một học sinh; "Tắt mic lớp" thu lại; học sinh rời phòng/giáo viên rời thì tự thu mic. Server giữ quyền (`interact.js`, sự kiện `speak:grant|revoke`, `speaker`).
- ✅ Phát file nghe (mp3/wav/mp4…) trộn vào luồng → cả lớp nghe đồng thời, âm thanh gốc; thanh phát có tạm dừng/tua/âm lượng.
- ✅ Chia sẻ màn hình kèm âm thanh hệ thống/tab (khi người dùng tick "Chia sẻ âm thanh" trong hộp thoại của trình duyệt) trộn vào luồng.
- ✅ Ghi hình buổi học (video camera/màn hình + âm thanh trộn, 720p ~800kbps) → xem trước, tải về hoặc **lưu lên lớp**; thành viên lớp xem lại ở nút 🎞 trên thẻ lớp (`recordings.js`, lưu ở `data/recordings/`, tối đa 500 MB/bản ghi, thư viện MIT `fix-webm-duration` để tua được). Ban đầu chỉ ghi video giáo viên; từ 2026-10-26 (sau phản hồi) ưu tiên **chia sẻ chính tab này rồi cắt theo khung sân khấu** (`getDisplayMedia` + `CropTarget`) để bản ghi có cả slide/PDF/bảng viết/phụ đề; nếu không quay được thì tự quay lại chế độ chỉ camera/màn hình. Chế độ tab-capture mới được viết, **chưa thử được** trong môi trường kiểm thử (chỉ thử chế độ dự phòng). Lỗi người dùng gặp: bản ghi không lưu được vì server chạy bản cũ (404) — giờ báo lỗi rõ ràng.
- ✅ Reactions (👍❤️😂👏😮🎉🙋) bay trên sân khấu, giới hạn tần suất; tặng sao (+10 điểm, hiện trên bảng xếp hạng); đếm ngược 15–120 giây cho hoạt động (máy chủ tự chốt khi hết giờ, thanh đếm ngược trên máy học sinh dùng thời gian còn lại do máy chủ gửi để không lệch đồng hồ).
- Kiểm thử: `npm test` 26 kiểm tra (thêm quyền phát biểu, reaction, sao, đếm ngược, bản ghi). Trình duyệt thật với **micro giả** (`?fakemic=1`: giáo viên 220Hz, học sinh 660Hz): học sinh khác nghe cả 220+660Hz; người đang nói chỉ nghe 220Hz; thu mic → 660Hz biến mất; file nghe 1000Hz tới học sinh; bản ghi phát được, có thời lượng. **Chưa thử**: micro/camera thật, hộp thoại xin quyền, âm thanh hệ thống thật, Safari/Firefox, nhiều học sinh cùng lúc, hai mạng khác nhau.
**Đợt 2 ✅ (2026-10-26, đã commit `22336d4`)** — Điền từ, đọc to, phụ đề, bảng viết, PDF, phòng nhỏ:
- ✅ Hai loại scene mới (AI sinh được, editor có form): **`fill`** (điền từ gõ: câu có `___`, nhiều đáp án chấp nhận, không phân biệt hoa/thường/dấu câu) và **`speak`** (đọc to: nhận dạng giọng nói của trình duyệt → máy chủ chấm theo dãy con chung dài nhất giữa các từ, ≥80% là đúng, trả chi tiết từng từ đúng/sai). Đáp án không lộ trước khi chốt. Hạn chế: máy chủ không kiểm chứng được âm thanh, chỉ thấy văn bản nhận dạng (học sinh có thể gian lận bằng client sửa).
- ✅ **Phụ đề trực tiếp**: giáo viên bật (chọn English US/UK hoặc Tiếng Việt) → chữ hiện dưới sân khấu cả lớp; học sinh bật/tắt. Chỉ nghe micro của giáo viên (không thu file nghe/âm thanh hệ thống).
- ✅ **Bảng viết cộng tác** (`writing.js`, `public/js/pad.js`): giáo viên mở đề → học sinh viết (tự gửi khi gõ) → giáo viên xem trực tiếp, "Chiếu & sửa" một bài cho cả lớp → bôi đen đoạn văn, chọn màu (Lỗi/Gợi ý/Hay/Ghi chú), nhập "sửa thành…" và ghi chú; cả lớp thấy ngay.
- ✅ **Chiếu PDF** (`pdfshare.js`, `public/js/pdf-live.js`): giáo viên tải PDF lên lớp (≤25 MB, lưu `data/pdfs/`) hoặc chọn lại tệp đã tải; học sinh tải cùng tệp bằng token và vẽ đúng trang giáo viên đang mở (pdf.js 3.11.174 từ cdnjs); chiếu PDF và bài giảng AI loại trừ nhau.
- ✅ **Phòng thảo luận nhỏ** (`breakout.js`, `public/js/breakout.js`): chia ngẫu nhiên 2–5 người/nhóm (người lẻ gộp vào nhóm trước), hẹn giờ 3–20 phút; mỗi nhóm nối WebRTC mesh trực tiếp giữa các học sinh (camera+micro, người có socketId nhỏ hơn gọi trước); phòng chính tự tắt tiếng khi vào nhóm; học sinh có nút "Gọi giáo viên" (giơ tay); giáo viên "Vào nghe/Rời nhóm" từng nhóm (mỗi lúc một nhóm); "Gọi cả lớp về phòng chính". Tín hiệu chỉ chuyển giữa thành viên cùng nhóm (+ giáo viên đang ghé thăm).
- Sửa lỗi phát hiện khi kiểm thử: thanh đếm ngược của Đợt 1 dùng thuộc tính `data-end` trùng với nút "Chốt" khiến nút này không bấm được khi có đếm ngược (đổi thành `data-deadline`); `window.PdfLive` không tồn tại với `const` toàn cục (dùng `typeof PdfLive`).
- Kiểm thử: `npm test` **32** kiểm tra (thêm điền từ, đọc to, phụ đề, bảng viết, PDF, phòng nhỏ). Trình duyệt thật với micro/camera giả (3 tab: giáo viên + 2 học sinh, `?fakemic=1`): điền từ & đọc to (kết quả tô màu từng từ), đếm ngược tự chốt, bảng viết + tô màu hiển thị đúng ở cả hai phía, PDF đồng bộ trang, phòng nhỏ (mỗi học sinh nghe đúng giọng/tần số của bạn mình, giáo viên ghé thăm thấy cả hai, học sinh thấy ô "Giáo viên", kết thúc trả về phòng chính và bật lại tiếng). AI thật (`tests/fidelity.js`) sinh được `fill` từ "Exercise A" của tài liệu mẫu và `speak` từ hội thoại.
- **Chưa thử**: nhận dạng giọng nói thật (phụ đề, đọc to — môi trường thử không có micro/dịch vụ nhận dạng; chỉ thử đường truyền văn bản), camera/micro thật trong phòng nhỏ, nhóm ≥3 người, hai mạng khác nhau (mesh cần TURN nếu mạng chặt), lớp đông, Firefox/Safari (Web Speech API không có), PDF lớn/nhiều trang, kết hợp bản ghi với phòng nhỏ (bản ghi chỉ ghi video+âm thanh giáo viên). Khi tab ở nền, pdf.js tạm dừng vẽ cho tới khi tab hiện lại (hành vi của trình duyệt).
**Đợt 3 ⬜** — Admin / trợ giảng, thời khoá biểu + phòng ảo theo lịch + chống trùng lịch, nhắc lịch Email (SMTP) / Web Push, slide đi kèm bản ghi.

## Chế độ LiveKit (làm 2026-10-26)
**Cách bật** (trống = tắt, dùng P2P cũ): biến môi trường `LIVEKIT_URL` (địa chỉ máy chủ EngLive gọi được, vd `ws://localhost:7880`, `wss://xxx.livekit.cloud`), `LIVEKIT_PUBLIC_URL` (nếu trình duyệt dùng địa chỉ khác), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`; hoặc `LIVEKIT_DEV=1` dùng khoá `devkey/secret` của `livekit-server --dev`. Khoá chỉ ở server; không dán vào chat.
**Chạy thử trên máy mình**: terminal 1 `npm run livekit:dev` (tải LiveKit v1.13.11 vào `tools/`, kiểm SHA-256 theo `checksums.txt` của bản phát hành, chạy `--dev` chỉ ở 127.0.0.1); terminal 2 `npm run start:lk`. Khi khởi động server in "Video: LiveKit (...)" hoặc "Video: WebRTC P2P". Kiểm thử của tôi: `npm run dev:mock:lk` (cổng 3001, AI giả) cần LiveKit dev đang chạy.
**Giới hạn quan trọng**: `ws://localhost:7880` chỉ dùng được trên chính máy này. Để bạn bè ở máy khác vào, LiveKit phải truy cập được từ internet (LiveKit Cloud hoặc VPS riêng, HTTPS/WSS).
**Thiết kế**: `livekit.js` — cấu hình, `makeToken` (identity = user id; giáo viên được phát; học sinh chỉ xem/nghe), `allowSpeaker` (cấp/thu quyền phát *chỉ micro* qua `updateParticipant` khi giáo viên cho phép nói), `endRooms`; router `GET /api/config`, `POST /api/livekit/token {classId, groupId?}` (400 chưa cấu hình, 403 không thuộc lớp/nhóm, 409 chưa lên sóng, 404 nhóm không có). Phòng chính = `cls_<classId>`, phòng nhóm = `cls_<classId>__<groupId>` (xoá khi kết thúc chia nhóm/buổi học). Client `public/js/lk-live.js` (`LiveKitLive`): giáo viên phát cam/mic/màn hình + file nghe/âm thanh hệ thống thành track riêng; học sinh nhận video (ưu tiên màn hình chia sẻ) và âm thanh; `joinGroup` cho phòng nhỏ; giáo viên "ghé thăm" nhóm bằng cách vào phòng nhóm. Màn hình chờ dùng `MediaStreamTrackGenerator` để vẫn có hình khi tab bị ẩn.
**Đã kiểm thử**: 35 kiểm tra `npm test` (token/quyền phát/quyền nhóm); trên trình duyệt với `livekit-server --dev` thật + micro/camera giả: giáo viên phát, học sinh xem+nghe, cấp/thu quyền nói, file nghe, phòng nhỏ + giáo viên ghé thăm, chuyển camera ↔ chia sẻ màn hình (mô phỏng); đường P2P (tắt LiveKit) vẫn nhận được hình + tiếng. **Chưa**: xem mục *Chưa kiểm thử* ở đầu file.

## Hạ tầng video cho lớp đông (phân tích 2026-10-26; phần LiveKit đã làm, xem mục trên)
Bối cảnh: video/âm thanh hiện là WebRTC P2P (giáo viên gửi tới từng học sinh, chỉ STUN). Quiz, slide, bảng viết, PDF, chat AI, điểm số chạy qua Socket.IO nên **không phụ thuộc** cách truyền hình.

| Phương án | Kết luận |
|---|---|
| Giữ P2P | Đủ cho lớp ≲10–20 người; mạng chặt cần thêm TURN |
| **LiveKit** (SFU mã nguồn mở, Cloud hoặc tự chạy) | **Đề xuất.** Giữ mọi tính năng; thay phần phát/nhận hình |
| Zoom Video SDK | Chỉ khi người dùng có gói Zoom; có "Subsessions" cho phòng nhỏ; giá chưa xác nhận |
| Zoom Meeting/Apps SDK, Google Meet Add-ons/Media API | **Không phù hợp**: giao diện của họ thay giao diện EngLive; Media API chỉ ở bản xem trước, nhận 3 luồng âm thanh, không có breakout |
| YouTube Live + quiz EngLive riêng | Chỉ khi lớp rất đông và chỉ xem/làm quiz (trễ vài giây, không phát biểu) |

Kế hoạch nếu người dùng đồng ý (theo thứ tự):
1. **Lớp trung gian truyền hình** (client): các thao tác chung — vào phòng, phát cam/mic/màn hình, nhận luồng, cấp/thu quyền phát biểu, chia phòng nhỏ, ghi hình. Bản P2P hiện tại (trong `live.js`, `mixer.js`, `breakout.js`) thành bộ thứ nhất; thêm bộ LiveKit; (sau này, nếu có Zoom) bộ Zoom Video SDK. Chọn chế độ trong cài đặt; quiz/slide/bảng viết gọi qua lớp này.
2. **Máy chủ**: `livekit-server-sdk` tạo token vào phòng (`/api/livekit/token`, kiểm tra quyền thành viên lớp), cập nhật quyền phát của học sinh khi giáo viên cho phép nói; phòng nhỏ = phòng LiveKit riêng cho từng nhóm. Khoá (URL, API key, secret) **chỉ nằm ở server** (biến môi trường hoặc Cài đặt, che khi hiển thị).
3. Với LiveKit: bỏ nhu cầu `mixer.js` (mỗi người nghe riêng từng track); file nghe/âm thanh hệ thống phát thành track riêng; ghi hình phía máy chủ bằng Egress (muốn có slide thì ghi trang sân khấu bằng web egress hoặc giữ cách tab-capture).
4. Chi phí chính là **băng thông** (ví dụ 200 học sinh xem video 720p ≈ vài trăm Mbps); giảm bằng chất lượng thấp hơn hoặc chỉ nghe tiếng + xem slide. Camera/micro bắt buộc HTTPS khi lên mạng thật.
Ước lượng công sức: vài ngày làm việc + kiểm thử với nhiều người thật (chưa đo).

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
5. **Livestream thật**: TURN server hoặc SFU; P2P hiện chỉ hợp ~10–20 học sinh. Hướng đã đề xuất: LiveKit (xem mục *Hạ tầng video cho lớp đông*).
6. **Vận hành**: giám sát lỗi, quyền riêng tư dữ liệu học sinh (có thể là trẻ em), theo dõi chi phí AI.
Thứ tự đề xuất: test với bạn bè → làm mục 4 và 2 → deploy → chọn nhà cung cấp AI công khai → mở thử một lớp nhỏ → thêm TURN khi cần. Tôi đã đề nghị làm giúp mục 2 và 4; người dùng chưa trả lời.

## Giới hạn đã biết
- Cài đặt AI là cài đặt chung; mọi tài khoản giáo viên đều sửa được và tiêu key chung (khoá được che khi hiển thị). Ai có link tunnel đều đăng nhập được bằng tài khoản mẫu.
- Dữ liệu JSON file: không hợp nhiều server / tải lớn; mất trên Render Free khi restart.
- P2P WebRTC chỉ có STUN: hai máy ở mạng khác nhau có thể chat được nhưng không thấy hình.
- PDF dạng ảnh scan và `.docx` chưa hỗ trợ (báo lỗi, gợi ý dán văn bản/xuất PDF).
- Luật phạm vi AI dựa vào prompt, không tuyệt đối.

## Nhật ký
- **2026-10-26** — Theo yêu cầu tối ưu khi có nhiều lớp: thu gọn giao diện teacher/student, thêm thư mục lớp dùng chung, phân trang 12 mục, chi tiết riêng giữ trạng thái danh sách, sửa banner live mobile. Thử 38 lớp ở server QA biệt lập; không đổi dữ liệu thật, không restart server 3000, chưa commit/push.
- **2026-10-25** — Khảo sát OpenMAIC, chọn tích hợp mềm. Làm xong giai đoạn 1–5 (module `ai/lessons/present/aiRoutes/pdf`, trang `ai-settings/lessons/tutor`, live có slide/trò chơi/tab AI, `tests/`).
- **2026-10-25** — Gỡ lỗi 9Router: lúc đầu 401 do người dùng dán nhầm key vào ô model/khoá; sau đó chạy ổn. Sửa: sân khấu giáo viên hiển thị slide; luật phạm vi AI (chat + soạn bài); đo hiệu năng và tăng song song lên 6, timeout 70s/slide; thêm nút chọn tệp.
- **2026-10-25** — Commit `4002dd9` push lên `main` (chưa có khoá nào trong repo). Cài `cloudflared` (winget), khởi động lại server, bật tunnel cho bạn bè test. Giải thích chi phí Render (Free) và lộ trình công khai.
- **2026-10-26** — Viết lại CLAUDE.md và PROJECT.md để phiên sau nắm đủ bối cảnh.
- **2026-10-26** — Người dùng báo slide theo khuôn cố định và chưa bám file. Sửa như mục "Cải tiến độ bám tài liệu & đa dạng" (chưa commit). Cổng phạm vi khi tạo outline. Người dùng tự chạy `cloudflared` (link tạm mới).
- **2026-10-26** — Người dùng gửi danh sách chức năng 4 phân hệ và yêu cầu đảm bảo có đủ. Đối chiếu → bảng ở mục "Yêu cầu mở rộng", làm xong Đợt 1 (xem Giai đoạn 7). Đợt 2–3 chưa làm; cần người dùng xác nhận thứ tự nếu muốn đổi.
- **2026-10-26** — Đợt 2 xong (điền từ, đọc to, phụ đề, bảng viết, PDF, phòng nhỏ); sửa 2 lỗi tìm thấy khi kiểm thử (`data-end` trùng nút Chốt; `window.PdfLive` với `const` toàn cục). Commit `22336d4` rồi push `4002dd9..22336d4` theo yêu cầu người dùng.
- **2026-10-26** — Người dùng báo: bản ghi chỉ có camera và không lưu được vào lớp → nguyên nhân là server cũ (404) + chưa quay slide; sửa như mục thay đổi chưa commit số 2. Người dùng muốn khung bên phải của giáo viên hiện **slide tiếp theo** thay vì slide hiện tại → làm xong. Người dùng báo lỗi giao diện trang soạn bài (danh sách slide đè biểu mẫu) → sửa CSS.
- **2026-10-26** — Người dùng hỏi về Google Meet SDK / LiveKit / Zoom SDK để chịu tải cao: đã tra tài liệu, ghi kết luận ở mục *Hạ tầng video cho lớp đông*; người dùng không có gói Zoom; chưa bắt đầu làm LiveKit.
- **2026-10-26** — Người dùng muốn thay WebRTC cũ bằng LiveKit: làm `livekit.js`, `lk-live.js`, nhánh LiveKit trong `live.js`/`breakout.js`/`mixer.js`/`interact.js`, 2 test nhóm mới (35 kiểm tra), script chạy LiveKit dev. Giữ Socket.IO làm kênh điều khiển (không thay) vì chấm điểm/ẩn đáp án phải do server quyết định; giữ P2P làm dự phòng.
- **Việc tiếp theo gợi ý**: (0) hỏi người dùng 4 câu ở đầu file rồi commit phần LiveKit; (1) nhờ người dùng thử ghi hình tab-capture trên Chrome/Edge thật và thử micro/camera thật; (2) hỏi các câu hỏi đang chờ ở đầu file (số học sinh/lớp, LiveKit Cloud hay tự chạy, thứ tự LiveKit ↔ Đợt 3); (3) nếu làm LiveKit: bắt đầu bằng lớp trung gian truyền hình + chế độ LiveKit cho "giáo viên phát, học sinh xem", rồi quyền phát biểu, phòng nhỏ, ghi hình; (4) commit các thay đổi còn lại khi người dùng đồng ý; (5) lộ trình công khai mục 2 và 4 (dữ liệu bền, đăng ký giáo viên cần duyệt, Cài đặt AI chỉ admin).

- **2026-10-27** — Gọn menu admin: admin chỉ còn "Quản trị" + "Cài đặt AI" (bỏ Bài giảng, Học tập & lịch học, Kiểm tra thiết bị, Tổng quan giáo viên; `buildSidebar` trong `public/js/common.js`). Trang `/admin.html`: thêm ô "Người online (LiveKit)" và số phòng/người thật từ `lk.stats()` (`livekit.js`, `operations.js`), hộp "Chờ duyệt" có nút Duyệt nhanh, tổng lượt dùng AI hôm nay, gộp tab "Giới hạn & sao lưu" thành "Hệ thống". Sửa `scripts/livekit-dev.ps1` (thêm BOM UTF-8; đọc `checksums.txt` dạng byte). Chat AI: bỏ LaTeX/`*nghiêng*` lỗi hiển thị (`aichat.js`, prompt FORMAT ở `aiRoutes.js`). `npm test` = 55 đạt (lần chạy đầu một lần ECONNREFUSED thoáng qua, chạy lại đạt). Các trang `/teacher.html`, `/lessons.html`... vẫn mở được bằng URL với admin (không bị chặn), chỉ không còn link.

- **2026-10-27** — Admin: thanh bên tách thành từng mục (Tổng quan, Tài khoản, Lớp học, Thời khóa biểu, Tài liệu & bản ghi, Hệ thống, Nhật ký, Cài đặt AI; điều hướng bằng `#hash` trong `/admin.html`). Tab Lớp học: **tạo/sửa/xóa lớp**, phân công giáo viên/trợ giảng, học sinh, thêm lịch (API mới `POST/DELETE /api/admin/classes`, PATCH thêm level/description). Tab Thời khóa biểu: xem lịch sắp tới/đã qua, thêm lịch (có **lặp hằng tuần** tối đa 26 buổi, `repeatWeeks` ở `POST /api/learning/schedules`; trùng lịch lớp/giáo viên thì từ chối cả loạt), xóa lịch. Xóa lớp xóa kèm lịch/bài tập/bài nộp/kết quả; bản ghi và PDF giữ lại. `npm test` = 56 đạt.

- **2026-10-27** — Giáo viên chọn **chất lượng camera** (nút "Chất lượng" trong phòng live: Tiết kiệm 360p/400kbps, Cân bằng 480p/800kbps, Cao 720p/1,5Mbps; lưu ở `localStorage englive_cam_quality`, đổi được lúc đang dạy). Camera thật đổi bằng `applyConstraints`; LiveKit phát lại camera với bitrate mới (`LiveKitLive.setCameraQuality`). Đã thử với LiveKit dev + camera giả: bitrate tầng cao 1,5M→400k, học sinh vẫn nhận hình sau khi đổi. Chưa thử camera thật, chưa thử ở P2P. Mặc định vẫn là Cao.
