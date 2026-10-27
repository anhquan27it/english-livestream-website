# EngLive — Web học tiếng Anh livestream

## Bản nâng cấp quản trị & học tập (2026-10-26)

Vẫn dùng JSON, chưa cần PostgreSQL. Để bật admin trên dữ liệu hiện tại:

1. **Dừng server bằng Ctrl+C** trong terminal đang chạy.
2. Chạy `npm run admin:create -- admin@englive.local` (hoặc một email **mới**, chưa có trong hệ thống).
3. Lưu mật khẩu ngẫu nhiên được hiển thị một lần, rồi chạy lại `npm start` trong **cùng terminal đang có biến môi trường LiveKit**.
4. Đăng nhập bằng tài khoản admin vừa tạo, mở `/admin.html`; đổi mật khẩu ở Học tập → Tài khoản. Tài khoản teacher tiếp tục dùng riêng để dạy học.

Lệnh tạo admin chỉ chạy trực tiếp trên máy chủ, không nâng quyền tài khoản teacher/student hiện có và từ chối email trùng; không có API công khai tạo admin đầu tiên, không có mật khẩu admin mặc định. Với `DATA_DIR` riêng, phải dùng cùng biến này khi chạy lệnh. Server mới có khóa chống nhiều tiến trình cùng ghi một thư mục dữ liệu. Kiểm thử có thể cấp mật khẩu qua biến `ADMIN_PASSWORD` (không in ra log); khi dùng thật nên để lệnh tự sinh.

- **Admin**: duyệt giáo viên, khóa tài khoản, đổi vai trò, thu hồi phiên, đặt lại mật khẩu, phân công giáo viên/trợ giảng, quản lý thành viên lớp (khi không live), kết thúc phòng, quản lý tệp, cấu hình AI, hạn mức và nhật ký. Không khóa/hạ quyền admin cuối cùng. Giáo viên đăng ký mới phải chờ duyệt; các tài khoản giáo viên cũ được giữ nguyên.
- **Trợ giảng**: chỉ quản lý lịch/bài tập và xem báo cáo các lớp được phân công. Bản này chưa cho trợ giảng điều khiển camera/mic trong phòng live.
- **Học tập** (`/learning.html`): lịch chống trùng lớp/giáo viên; mở phòng thủ công từ lịch; nhắc trước 15 phút khi ứng dụng đang mở; giao–nộp–chấm bài viết (0–10), hạn nộp; kho từ riêng và flashcard; kết quả hoạt động và thời gian tham gia. Chưa gửi email/Web Push khi trình duyệt đóng.
- **Thiết bị** (`/devices.html`): xem trước camera, chọn mic/camera, đo mức mic và nghe âm thử. Nút vào học từ trang lớp đi qua bước này, có thể bỏ qua kiểm tra nếu chỉ xem.
- **Phòng live**: chặn vào lại trong cùng buổi khi bị kick; loại khỏi LiveKit; dọn quyền khi chuyển phòng; chỉ gửi đáp án đã chốt vào AI; luyện lại không cộng điểm trùng; chặn nộp trễ; kết nối lại phòng nhóm; hiển thị Cloud/LiveKit riêng/P2P.
- **Bảo mật**: phiên đăng nhập tối đa 7 ngày, thu hồi socket khi đăng xuất/khóa/đổi mật khẩu; giới hạn 30 yêu cầu đăng nhập/đăng ký mỗi phút/IP. Đổi mật khẩu cá nhân ở Học tập → Tài khoản; quên mật khẩu nhờ admin đặt lại, chưa có email tự phục hồi.
- **Hạn mức EngLive**: mặc định 100 lượt hỏi AI/ngày UTC/tài khoản, 20 tác vụ soạn bài/ngày UTC/tài khoản, 100 người/lớp gồm giáo viên, 2048 MB PDF/bản ghi. Admin chỉnh trong Giới hạn & sao lưu. Đây **không phải** hạn mức/billing LiveKit Cloud; tăng ở EngLive không nâng gói nhà cung cấp.

### Dữ liệu, sao lưu và khôi phục

JSON được ghi qua file tạm, fsync rồi đổi tên. Snapshot phòng được chụp theo sự kiện (gộp 200 ms) và mỗi 5 giây. Sau restart, giáo viên/học sinh vào lại; slide, điểm, đáp án đã chốt, bài viết và lệnh cấm được phục hồi. Hoạt động đang mở được chốt; camera/mic phải bật lại và phòng nhóm phải chia lại. Không cam kết phục hồi thay đổi chưa tới snapshot khi máy mất điện. Một tiến trình EngLive cho mỗi `DATA_DIR`; chưa hỗ trợ nhiều server dùng chung JSON.

Tự tạo backup JSON lúc khởi động nếu hôm đó chưa có, và mỗi 24 giờ server chạy; giữ 14 bản `data/backups/db-*.json`. Admin có thể tạo/tải ngay. **Backup JSON chứa cấu hình và thông tin xác thực nhạy cảm; lưu ở nơi riêng. PDF/video không nằm trong backup JSON**, cần sao chép cả thư mục `DATA_DIR` khi server đã dừng để có bản sao đầy đủ.

Khôi phục: dừng server, chạy `npm run backup:restore -- db-<tên-bản-sao>.json`, rồi `npm start`. Lệnh chỉ đọc từ `DATA_DIR/backups`, giữ file trước khôi phục, xóa token cũ để mọi người đăng nhập lại; dùng được cả khi `db.json` bị hỏng. File tạm, backup và khóa nằm trong `DATA_DIR` (đã bị Git bỏ qua).

### Kiểm tra bản nâng cấp

- `npm test`: 55 kiểm tra với dữ liệu tạm, mock AI và mock API LiveKit, gồm các ca phân quyền, điểm, ẩn đáp án, restart và phục hồi JSON hỏng.
- `npm run test:load`: thử Socket.IO ở 5/20/50/99 học sinh + giáo viên; không đo khả năng truyền video LiveKit hay chi phí Cloud.
- `npm run dev:qa`: server cổng 3101, dữ liệu tạm, admin riêng `admin@test.com` / `admin-test-password` và AI giả, không kết nối LiveKit Cloud. Teacher mẫu vẫn là giáo viên. Không dùng thay server thật.
- Đã duyệt admin/học tập bằng trình duyệt, tạo–nộp bài ở hai phiên, kiểm tra 820/1100/1400 px và 390 px. Camera/mic thật, LiveKit Cloud hai mạng, ghi hình tab và tải video đông người vẫn cần thử thực tế.

Lớp học trực tiếp 1 giáo viên → nhiều học sinh, có phân quyền **Giáo viên** / **Học sinh**.
Chỉ học sinh đã ở trong lớp của giáo viên mới xem được livestream của lớp đó.

## Chạy

```bash
npm install
npm start
```

Mở http://localhost:3000

Tài khoản mẫu (mật khẩu `123456`):

| Email | Vai trò |
|---|---|
| teacher@demo.com | Giáo viên (có 2 lớp) |
| student1@demo.com | Học sinh, ở cả 2 lớp |
| student2@demo.com | Học sinh, lớp IELTS |
| student3@demo.com | Học sinh, đang chờ duyệt vào lớp A2 |

> Để thử giáo viên và học sinh trên **cùng một máy/trình duyệt**, mở giáo viên ở `http://localhost:3000`
> và học sinh ở `http://127.0.0.1:3000` (hai địa chỉ khác nhau nên đăng nhập không đè lên nhau),
> hoặc dùng một cửa sổ ẩn danh.

## Tính năng

- **Giáo viên**: tạo lớp (trình độ A1–C2, IELTS…), mã lớp 6 ký tự, thêm học sinh bằng email, duyệt/từ chối yêu cầu,
  mở livestream (camera + micro, chia sẻ màn hình), ghim thẻ từ vựng (IPA, nghĩa, ví dụ), xem ai đang xem/giơ tay,
  mời học sinh rời buổi, kết thúc buổi học, lịch sử buổi học & chuyên cần.
- **Học sinh**: nhập mã để xin vào lớp, thông báo realtime khi lớp lên sóng, xem livestream, chat (kèm câu mẫu tiếng Anh),
  giơ tay, nghe phát âm từ vựng, Word of the day, thống kê chuyên cần.
- Server kiểm tra quyền ở cả API và Socket.IO: không phải thành viên lớp thì không vào được phòng và không nhận được tín hiệu WebRTC.

## Bài giảng AI, trò chơi tương tác và chat AI

Quy trình mượn ý tưởng từ [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) (MIT): *tài liệu → outline → sinh từng slide → chỉnh sửa → trình chiếu*.

1. **Cài đặt AI** (giáo viên → menu *Cài đặt AI*): mặc định 9Router `http://localhost:20128` với model `ag/gemini-3.8-flash-high`.
   Dán API key lấy ở trang *Endpoint & Key* của 9Router rồi bấm **Lưu & kiểm tra kết nối**. Có thể thêm OpenAI, Gemini, OpenRouter, Ollama…
   (mọi nhà cung cấp chuẩn OpenAI-compatible), chọn model riêng cho việc soạn bài và cho chat học sinh.
   Hoặc đặt biến môi trường `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` trước khi chạy.
2. **Bài giảng** (giáo viên → menu *Bài giảng*): tải PDF/TXT/MD hoặc nhập chủ đề → AI đề xuất outline → bạn sửa → AI sinh slide
   (chạy nền trên máy chủ). Mỗi slide sửa được bằng form, hoặc bấm *Sinh lại* kèm yêu cầu riêng. Loại slide: nội dung (kèm từ vựng + phát âm),
   trắc nghiệm, bình chọn, ghép cặp, xếp từ thành câu. Tự lưu.
3. **Livestream**: bấm *Livestream bài này* (hoặc vào phòng live → tab *Bài giảng*). Học sinh thấy slide, video giáo viên thu nhỏ ở góc.
   Giáo viên chuyển slide (phím ←/→; khung bên phải luôn hiện **slide tiếp theo**, bấm vào để chuyển), *Bắt đầu hoạt động* → học sinh bấm trả lời → *Chốt* để công bố đáp án, điểm, bảng xếp hạng.
4. **Chat AI**: học sinh có tab *AI* ngay trong phòng live (AI biết slide đang chiếu, không lộ đáp án hoạt động chưa chốt)
   và trang *Hỏi đáp AI* để hỏi về bài giảng đã học sau buổi học. Lịch sử được lưu theo từng bài.

5. **Công cụ dạy nói/nghe/viết trong buổi live**: học sinh phát biểu bằng mic khi giáo viên cho phép (giọng được trộn phát lại cho cả lớp), phát file nghe và âm thanh hệ thống,
   ghi hình buổi học để xem lại (Chrome/Edge: chọn tab EngLive khi trình duyệt hỏi để bản ghi có cả slide; nếu không, chỉ ghi camera), chia **phòng thảo luận nhỏ** (nhóm 2–5 người, giáo viên đi tuần), **bảng viết** cộng tác với tô màu sửa lỗi trực tiếp, chiếu **PDF**, **phụ đề trực tiếp**,
   trò chơi **điền từ** và **đọc to** (chấm phát âm), reactions, tặng sao, đếm ngược. Nhận dạng giọng nói (phụ đề, đọc to) cần Chrome hoặc Edge.

Thử giao diện không cần 9Router: `npm run dev:mock` (http://localhost:3001, AI giả lập). Kiểm thử tự động: `npm test`.
Kế hoạch và tiến độ chi tiết: [PROJECT.md](PROJECT.md).

## Đưa lên mạng để hai người test

GitHub lưu mã nguồn của dự án. GitHub Pages (`github.io`) chỉ chạy web tĩnh, không chạy được
máy chủ Node.js và Socket.IO cần cho đăng nhập, lớp học, chat và livestream.
Triển khai toàn bộ ứng dụng thành **Web Service** trên Render để hai người dùng chung một link HTTPS.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/anhquan27it/english-livestream-webesite)

1. Bấm **Deploy to Render**, đăng nhập Render và cấp quyền truy cập repository nếu được yêu cầu.
2. Kiểm tra dịch vụ dùng gói **Free**, rồi chọn triển khai. File `render.yaml` đã khai báo cấu hình.
3. Khi dịch vụ báo **Live**, mở URL HTTPS `https://<tên-dịch-vụ>.onrender.com` mà Render cung cấp
   và gửi cùng link đó cho bạn của bạn.

Nếu tạo Web Service thủ công, chọn repository này, runtime **Node**, build command
`npm ci --omit=dev`, start command `npm start`, health check `/healthz`, gói **Free**.

### Thử vai giáo viên và học sinh

1. Bạn của bạn đăng nhập `teacher@demo.com`, mật khẩu `123456`, chọn lớp **IELTS Speaking 6.5+**
   và bắt đầu livestream. Cho phép camera/micro khi trình duyệt hỏi.
2. Bạn đăng nhập `student1@demo.com`, mật khẩu `123456`, mở cùng lớp và chọn **Vào học**.
3. Thử xem/nghe livestream, gửi chat, giơ tay, ghim từ vựng, chia sẻ màn hình và kết thúc buổi học.
4. Nếu thử cả hai vai trên một máy, dùng hai hồ sơ trình duyệt hoặc một cửa sổ ẩn danh.

### Giới hạn của bản demo

- Render Free có thể ngủ sau 15 phút không có lưu lượng; lần truy cập tiếp theo có thể mất khoảng một phút để mở lại.
- `data/db.json` được tạo tự động trên máy chủ, không đưa lên GitHub. Trên Render Free, dữ liệu mới
  (tài khoản, lớp, lịch sử, phiên đăng nhập) bị mất khi máy chủ restart, redeploy hoặc ngủ.
  Khi đó ứng dụng tạo lại tài khoản/lớp mẫu; hãy đăng nhập lại và mở lại buổi học.
- Livestream dùng WebRTC với STUN. Hai mạng khác nhau có thể cần TURN server nếu chat hoạt động
  nhưng không nhận được video/âm thanh. Bản này chưa cấu hình TURN.
- Tài khoản và mật khẩu mẫu chỉ phục vụ test. Chưa dùng bản demo này để lưu dữ liệu học viên thật.

Tham khảo: [Render Node.js](https://render.com/docs/deploy-node-express-app),
[giới hạn gói Free](https://render.com/docs/free).

## Kế hoạch tiếp theo

- **Lớp đông (trên ~20 học sinh)**: đã có chế độ **LiveKit** cho video/âm thanh (quiz, slide, bảng viết, chat AI vẫn chạy qua Socket.IO; không cấu hình LiveKit thì dùng P2P cũ). Thử trên máy mình: `npm run livekit:dev` rồi `npm run start:lk` (hoặc đặt `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`). Để người ở máy khác vào, LiveKit phải truy cập được từ internet (LiveKit Cloud hoặc máy chủ riêng). Chi tiết: [PROJECT.md](PROJECT.md) mục *Chế độ LiveKit*.
- **Quản lý nhiều lớp**: Admin, trợ giảng, thời khoá biểu, nhắc lịch qua email/push.
- **Công khai**: dữ liệu bền (PostgreSQL), đăng ký giáo viên cần duyệt, Cài đặt AI chỉ dành cho quản trị viên.

## Kỹ thuật

- Node.js + Express + Socket.IO (signaling), WebRTC peer-to-peer (giáo viên gửi tới từng học sinh).
- Dữ liệu lưu ở `data/db.json` (xoá file này để tạo lại dữ liệu mẫu), gồm cả bài giảng, cài đặt AI (có API key) và lịch sử chat AI.
- Camera/micro cần `localhost` hoặc **HTTPS** khi triển khai thật.
- Mô hình P2P phù hợp lớp nhỏ (~10–20 học sinh). Lớp đông hoặc học sinh ở mạng khác nhau sau NAT chặt
  nên thêm TURN server hoặc chuyển sang SFU (LiveKit, mediasoup).
