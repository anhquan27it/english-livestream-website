# EngLive — Web học tiếng Anh livestream

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
   Giáo viên chuyển slide (phím ←/→), *Bắt đầu hoạt động* → học sinh bấm trả lời → *Chốt* để công bố đáp án, điểm, bảng xếp hạng.
4. **Chat AI**: học sinh có tab *AI* ngay trong phòng live (AI biết slide đang chiếu, không lộ đáp án hoạt động chưa chốt)
   và trang *Hỏi đáp AI* để hỏi về bài giảng đã học sau buổi học. Lịch sử được lưu theo từng bài.

5. **Công cụ dạy nói/nghe/viết trong buổi live**: học sinh phát biểu bằng mic khi giáo viên cho phép (giọng được trộn phát lại cho cả lớp), phát file nghe và âm thanh hệ thống,
   ghi hình buổi học để xem lại, chia **phòng thảo luận nhỏ** (nhóm 2–5 người, giáo viên đi tuần), **bảng viết** cộng tác với tô màu sửa lỗi trực tiếp, chiếu **PDF**, **phụ đề trực tiếp**,
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

## Kỹ thuật

- Node.js + Express + Socket.IO (signaling), WebRTC peer-to-peer (giáo viên gửi tới từng học sinh).
- Dữ liệu lưu ở `data/db.json` (xoá file này để tạo lại dữ liệu mẫu), gồm cả bài giảng, cài đặt AI (có API key) và lịch sử chat AI.
- Camera/micro cần `localhost` hoặc **HTTPS** khi triển khai thật.
- Mô hình P2P phù hợp lớp nhỏ (~10–20 học sinh). Lớp đông hoặc học sinh ở mạng khác nhau sau NAT chặt
  nên thêm TURN server hoặc chuyển sang SFU (LiveKit, mediasoup).
