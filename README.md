# EngLive — Web học tiếng Anh livestream

Lớp học trực tiếp 1 giáo viên → nhiều học sinh (tối đa 30 học sinh/lớp theo mặc định), có admin/trợ giảng. Giáo viên soạn slide + trò chơi bằng AI từ PDF, trình chiếu trong buổi live; học sinh tương tác và hỏi AI. Video qua **LiveKit** (chính), **Zoom Meeting SDK** (tùy chọn) hoặc WebRTC P2P (dự phòng).

## Bắt đầu nhanh (cho người mới pull về)

Cần: [Node.js](https://nodejs.org/) **18 trở lên** (đã chạy với Node 24), Git, trình duyệt Chrome/Edge/Brave. Không cần database; dữ liệu lưu ở `data/db.json`.

```bash
git clone https://github.com/anhquan27it/english-livestream-website.git
cd english-livestream-website
npm install
npm start          # http://localhost:3000
```

Lần đầu chạy tự tạo dữ liệu mẫu. Đăng nhập bằng tài khoản mẫu (mật khẩu `123456`): `teacher@demo.com`, `student1@demo.com`, `student2@demo.com`. Muốn thử hai vai trên cùng máy: giáo viên ở `http://localhost:3000`, học sinh ở `http://127.0.0.1:3000` (hoặc cửa sổ ẩn danh).

**Thử nhanh không cần cấu hình gì** (AI giả lập, dữ liệu tách riêng ở `data-mock/`): `npm run dev:mock` → http://localhost:3001.

Các thành phần tùy chọn (không bắt buộc để chạy):

| Muốn có | Làm gì |
| --- | --- |
| **Tạo bài bằng AI thật** | Chạy một dịch vụ tương thích OpenAI (nhóm đang dùng 9Router (`http://localhost:20128/v1`) với model `ag/gemini-3.8-flash-high`) hoặc nhà cung cấp khác. Đăng nhập **admin** → *Cài đặt AI* → nhập Base URL, API key, model → *Kiểm tra kết nối*. Không có AI thì phần soạn bài/chat AI báo lỗi, phần còn lại vẫn chạy. Hoặc đặt biến `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`. |
| **Tài khoản admin** | Dừng server (Ctrl+C) → `npm run admin:create -- admin@englive.local` → lưu mật khẩu ngẫu nhiên in ra → `npm start` → vào `/admin.html`. Bản mới clone **chưa có** admin; nút "Admin" demo ở trang chủ chỉ hoạt động sau khi bạn tạo tài khoản này. |
| **Video ổn định (LiveKit)** | Không cấu hình gì thì tự dùng WebRTC P2P (đủ để thử 2–3 máy cùng mạng). Cách dễ nhất trên Windows: `npm run livekit:dev` (tải `livekit-server --dev` vào `tools/`) rồi ở cửa sổ khác `npm run start:lk`. Dùng LiveKit Cloud: đặt `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` trong cửa sổ chạy `npm start` (xem mục *LiveKit Cloud* bên dưới). `localhost:7880` chỉ dùng được cho máy chạy server. |
| **Zoom Meeting SDK** | Tùy chọn, cần tài khoản/app Zoom riêng: xem mục *Zoom Meeting SDK + LiveKit* bên dưới. Admin chọn dịch vụ mỗi ngày ở `/video-settings.html`. |
| **Cho bạn bè ở máy khác vào thử** | `cloudflared tunnel --url http://localhost:3000` (xem mục *Cho bạn bè test qua link tạm*). Camera/micro cần **HTTPS hoặc localhost** — mở bằng `http://IP-LAN` trình duyệt sẽ chặn. |

Lệnh thường dùng: `npm test` (81 kiểm tra, tự dựng server/mock tạm, không gọi dịch vụ thật), `npm run dev` (tự reload khi sửa server), `npm run dev:qa` (cổng 3101, dữ liệu tạm), `npm run test:load` (Socket.IO). Xóa `data/db.json` để reset dữ liệu. Mỗi lần sửa code server phải dừng và chạy lại `npm start`.

**Lưu ý bảo mật:** `data/` (chứa API key AI, token Zoom, mật khẩu băm, bản ghi) và `data-mock/` **không** được commit — giữ nguyên như vậy. Không dán khóa LiveKit/Zoom/AI vào chat hoặc commit. Trước khi mở cho người lạ: đổi/xóa tài khoản mẫu `123456`, đổi mật khẩu admin, tạo lại mọi khóa từng bị lộ. Biến môi trường khác: `PORT`, `DATA_DIR`, `AI_CONCURRENCY`, `LIVEKIT_PUBLIC_URL`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_PUBLIC_CLIENT_ID`, `ZOOM_REDIRECT_URI`.

Tài liệu khác: [PROJECT.md](PROJECT.md) (kiến trúc, tiến độ, nhật ký, việc đang chờ) và [CLAUDE.md](CLAUDE.md) (quy ước cho Claude Code khi làm việc trong repo).

## Zoom Meeting SDK + LiveKit (2026-10-28)

**Callback HTTP local cần PKCE:** Zoom không cho luồng confidential OAuth thông thường quay về `http://127.0.0.1`. Trong General App → Basic information → App credentials, bật **Use Public Client OAuth**, lấy **Public Client ID** và nhập vào ô riêng trong admin EngLive. Giữ nguyên Client ID/Secret Meeting SDK. EngLive dùng Public Client ID + PKCE S256 để xin quyền, đổi code và refresh token; SDK vẫn ký bằng Client ID/Secret gốc. Phải restart server sau cập nhật. Khi chưa nhập Public Client ID, EngLive chặn bắt đầu OAuth HTTP thay vì đưa sang trang Zoom báo Invalid redirect. Với callback HTTPS, có thể giữ luồng confidential Client ID/Secret. Xem [tài liệu loopback/PKCE của Zoom](https://developers.zoom.us/docs/integrations/oauth/#using-a-loopback-redirect-uri).

**Luồng chính: giáo viên chủ trì ngay trong EngLive.** Admin nhập OAuth Redirect URL giống nhau trong General App và EngLive (khi chạy cổng 3000: `http://127.0.0.1:3000/api/zoom/oauth/callback`), thêm Scopes `user:read:user`, `user:read:zak`, rồi bấm **Chủ trì trong web cho tất cả lớp Zoom**. Giáo viên **Liên kết Zoom một lần** bằng đúng email chủ trì. Từ đó bấm Livestream trong EngLive để mở cuộc họp bằng SDK role 1 + ZAK, không mở Zoom trước. Tài khoản Zoom vẫn cần tồn tại và lần đầu cần đăng nhập/cấp quyền OAuth; bản thân liên kết không nâng gói. Khi deploy HTTPS, phải cập nhật URL callback đúng tên miền ở cả hai nơi.

Gán phòng mới mặc định chủ trì trong web. Trước khi tạo buổi, máy chủ kiểm tra cấu hình OAuth và đúng tài khoản liên kết; chưa đủ điều kiện thì hướng dẫn thiết lập trước, không tạo buổi chờ. Các cấu hình desktop cũ chỉ đổi khi admin chọn lại hoặc bấm nút áp dụng hàng loạt; buổi đang chạy cần kết thúc và mở lại để nhận cách chủ trì mới. Luồng desktop bên dưới chỉ là lựa chọn thử/dự phòng.

Admin vào **Phòng học trực tuyến** (`/video-settings.html`) để chọn dịch vụ mặc định, đặt riêng dịch vụ cho tất cả buổi mở trong một ngày (múi giờ Việt Nam), gán meeting theo lớp/ngày và chuyển dịch vụ của một buổi đang chạy. Buổi đã mở giữ cấu hình riêng; thay đổi cấu hình ngày không tự đổi các buổi đang học. Chuyển dịch vụ giữ slide/điểm/chuyên cần nhưng tải lại trang của mọi người; cần dừng và lưu bản ghi trước. Không tự chuyển sang LiveKit khi Zoom lỗi.

Thử miễn phí bằng **Zoom Workplace Basic**: tối đa 100 người gồm chủ trì, khoảng 40 phút/buổi, mỗi chủ trì một buổi đồng thời. Đây là **Meeting SDK**, không phải Video SDK tính theo phút. Ứng dụng không mua gói, bật ghi Cloud, gọi điện hay tạo tài nguyên trả phí; gói/tài khoản Zoom và sử dụng LiveKit Cloud vẫn do nhà cung cấp quản lý. Không thể cam kết mọi tính năng của LiveKit đều có trên Zoom Basic.

1. Trong [Zoom App Marketplace](https://marketplace.zoom.us/), tạo **General App**, bật **Embed → Meeting SDK**. Dùng Development Client ID/Client Secret cho thử nội bộ.
2. Nhập khóa trong trang admin (hoặc biến `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`). Secret chỉ ở máy chủ, không dán vào chat hoặc commit. Không đưa `data/` và các bản backup lên Git.
3. Tạo meeting trong **cùng tài khoản Zoom sở hữu SDK app**. Gán Meeting ID, passcode và email chủ trì cho lớp ở trang admin. Meeting ngoài tài khoản có thể yêu cầu app xét duyệt và ZAK/OBF; bản này chưa triển khai OBF.
4. Cách thử đơn giản: chọn **Mở bằng ứng dụng Zoom**. Giáo viên mở meeting trong ứng dụng Zoom trước, rồi giáo viên và học sinh vào EngLive; SDK tham gia với role 0. Tắt âm thanh ở một nơi để tránh vọng. Quyền host quản lý ở ứng dụng Zoom.
5. Muốn chủ trì trực tiếp trong web: khai báo OAuth Redirect URL `https://<tên-miền>/api/zoom/oauth/callback` trong cả General App và admin EngLive (`ZOOM_REDIRECT_URI` cũng được hỗ trợ; khi thử local dùng 127.0.0.1 hoặc [::1], không dùng hostname localhost cho callback Zoom). Thêm quyền xem user và ZAK token, theo Zoom hiện là `user:read:user` và `user:read:zak`. Giáo viên bấm **Kết nối Zoom**, đăng nhập đúng email chủ trì; admin chọn **Chủ trì trong web**. Chữ ký role 1 và ZAK chỉ cấp cho giáo viên phụ trách có socket cùng phiên đã tham gia. OAuth access/refresh token lưu riêng ở máy chủ; state một lần và có hạn dùng.
6. Chọn Zoom cho ngày thử, mở buổi bằng giáo viên, vào bằng học sinh ở trình duyệt khác. Từ khóa giả chỉ kiểm tra được tải SDK và xử lý lỗi, không có hình/tiếng thật. Admin có thể chuyển buổi sang LiveKit đã được cấu hình để dự phòng.

SDK client view 6.2.0 được tải từ CDN chính thức của Zoom trong iframe cùng origin để tách CSS. Cần Internet và HTTPS khi deploy (localhost dùng thử được). JWT bật WebRTC video trên trình duyệt hỗ trợ. Không dùng `?p2p=1` để vượt lựa chọn dịch vụ của admin.

| Khi dùng Zoom | Cách hoạt động |
| --- | --- |
| Slide, game, điểm, chat EngLive, AI, bảng viết, PDF, xem lại slide | Giữ qua Socket.IO và API EngLive |
| Mic, camera, share màn hình/âm thanh, phụ đề, breakout | Dùng UI Zoom, tùy quyền/gói/trình duyệt; không đồng bộ quyền mic/phòng nhóm với LiveKit |
| Giơ tay, mời phát biểu, phụ đề, cảm xúc, tặng sao | Dùng trong EngLive như LiveKit. "Mời phát biểu" chỉ điều phối (học sinh nhận thông báo và tự bật mic trong Zoom; giáo viên thấy ai đang được mời) — micro/camera/chia sẻ của học sinh vẫn do Zoom quản lý. Phụ đề trực tiếp dùng nhận dạng giọng nói của trình duyệt giáo viên (Chrome/Edge) |
| Ai đã vào Zoom | Bảng người xem của giáo viên hiện trạng thái từng học sinh: đang trong Zoom / đang chờ chủ trì / lỗi (bấm Kết nối Zoom) / đã rời |
| File nghe | Nút 🎧 của giáo viên: tải file âm thanh lên, **mỗi học sinh tự phát trên máy mình, đồng bộ theo giáo viên** (phát/tạm dừng/tua), có thanh âm lượng. Giáo viên nên tắt mic Zoom khi phát để không vọng |
| Chuyên cần | Thời gian có mặt trong EngLive; chưa xác minh thời gian kết nối video Zoom |
| Ghi hình | Ghi tab trên Chrome/Edge, cần chọn âm thanh tab và cho phép micro, lưu bằng upload của EngLive; chưa đồng bộ Zoom Cloud, chưa kiểm thử thiết bị thật |
| Kick/kết thúc | Xóa quyền EngLive và rời iframe; chủ trì cần dùng Remove/End trong Zoom để chắc chắn xóa người/kết thúc cuộc họp. Đặc biệt khi host đang mở ứng dụng Zoom riêng |

Kiểm thử: `npm test` bao gồm mạng Zoom giả lập cho OAuth, chữ ký/phân quyền, chọn theo ngày, chặn trùng chủ trì/phòng và chuyển sang LiveKit; không tự gọi Zoom thật. Thông tin chính thức: [xác thực SDK](https://developers.zoom.us/docs/meeting-sdk/auth/), [khởi tạo SDK](https://developers.zoom.us/docs/meeting-sdk/web/get-started/), [Zoom Basic](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0061206).

## Bản nâng cấp quản trị & học tập (2026-10-26)

Vẫn dùng JSON, chưa cần PostgreSQL. Để bật admin trên dữ liệu hiện tại:

1. **Dừng server bằng Ctrl+C** trong terminal đang chạy.
2. Chạy `npm run admin:create -- admin@englive.local` (hoặc một email **mới**, chưa có trong hệ thống).
3. Lưu mật khẩu ngẫu nhiên được hiển thị một lần, rồi chạy lại `npm start` trong **cùng terminal đang có biến môi trường LiveKit**.
4. Đăng nhập bằng tài khoản admin vừa tạo, mở `/admin.html`; đổi mật khẩu ở Học tập → Tài khoản. Tài khoản teacher tiếp tục dùng riêng để dạy học.

Lệnh tạo admin chỉ chạy trực tiếp trên máy chủ, không nâng quyền tài khoản teacher/student hiện có và từ chối email trùng; không có API công khai tạo admin đầu tiên, không có mật khẩu admin mặc định. Với `DATA_DIR` riêng, phải dùng cùng biến này khi chạy lệnh. Server mới có khóa chống nhiều tiến trình cùng ghi một thư mục dữ liệu. Kiểm thử có thể cấp mật khẩu qua biến `ADMIN_PASSWORD` (không in ra log); khi dùng thật nên để lệnh tự sinh.

- **Admin**: duyệt giáo viên, khóa tài khoản, đổi vai trò, thu hồi phiên, đặt lại mật khẩu, phân công giáo viên/trợ giảng, quản lý thành viên lớp (khi không live), kết thúc phòng, quản lý tệp, cấu hình AI, hạn mức và nhật ký. Không khóa/hạ quyền admin cuối cùng. Giáo viên đăng ký mới phải chờ duyệt; các tài khoản giáo viên cũ được giữ nguyên.
- **Trợ giảng**: chỉ quản lý lịch/bài tập và xem báo cáo các lớp được phân công. Bản này chưa cho trợ giảng điều khiển camera/mic trong phòng live.
- **Bài tập đa dạng** (Học tập → Bài tập): giáo viên soạn bằng tay hoặc **nhờ AI tạo** (chủ đề, trình độ, số câu, dạng câu, văn bản nguồn). 8 dạng: trắc nghiệm (có thể kèm câu nghe), đúng/sai, điền chỗ trống, sắp xếp câu, nối cặp, trả lời ngắn, viết đoạn, luyện nói (nhận dạng giọng nói của Chrome/Edge). Câu khách quan **tự chấm** (có điểm từng phần), câu viết/trả lời ngắn không đáp án chờ giáo viên chấm. Cài đặt: số lần làm (điểm cao nhất), khi nào cho xem đáp án, thang điểm quy về 10. Giáo viên có thống kê tỉ lệ đúng từng câu, xem bài làm, sửa tên/hạn, xóa. Đáp án chỉ ở máy chủ, học sinh không thấy trước khi nộp.
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

- `npm test`: 75 kiểm tra với dữ liệu tạm, mock AI và mock API LiveKit, gồm các ca phân quyền, điểm, ẩn đáp án, restart và phục hồi JSON hỏng.
- `npm run test:load`: thử Socket.IO ở 5/20/50/99 học sinh + giáo viên; không đo khả năng truyền video LiveKit hay chi phí Cloud.
- `npm run dev:qa`: server cổng 3101, dữ liệu tạm, admin riêng `admin@test.com` / `admin-test-password` và AI giả, không kết nối LiveKit Cloud. Teacher mẫu vẫn là giáo viên. Không dùng thay server thật.
- Đã duyệt admin/học tập bằng trình duyệt, tạo–nộp bài ở hai phiên, kiểm tra 820/1100/1400 px và 390 px. Camera/mic thật, LiveKit Cloud hai mạng, ghi hình tab và tải video đông người vẫn cần thử thực tế.

Phân quyền **Giáo viên** / **Học sinh** / Trợ giảng / Admin. Chỉ học sinh đã ở trong lớp của giáo viên mới xem được livestream của lớp đó.

## Chạy (tóm tắt)

Xem *Bắt đầu nhanh* ở đầu tệp. `npm install` → `npm start` → http://localhost:3000.

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

## Cho bạn bè test qua link tạm

### Tự chạy khi đăng nhập Windows

Chạy PowerShell trong thư mục dự án (cần Node.js và `cloudflared` trong PATH):

```powershell
# Cài tự chạy sau khi đăng nhập Windows
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tunnel.ps1 -Action Install
# Bật ngay ở nền
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tunnel.ps1 -Action Start -Background
# Xem link HTTPS hiện tại
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tunnel.ps1 -Action Status
# Dừng tunnel và server do launcher tự mở; giữ server có sẵn
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tunnel.ps1 -Action Stop
# Gỡ tự khởi động; không dừng phiên đang chạy
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tunnel.ps1 -Action Uninstall
```

Launcher dùng lại server khỏe ở cổng 3000, chỉ mở `node server.js` nếu cổng trống; không đụng server có sẵn. Mutex tránh chạy trùng; tunnel tự thử lại khi tiến trình thoát. Link/log ở `data/tunnel/` (ngoài Git): `link.txt`, `Open EngLive.url`, `launcher.log`, `web-error.log`, `cloudflared-error.log`. Đợi khoảng 15–60 giây sau sign-in rồi xem link. Di chuyển thư mục dự án phải cài lại shortcut Startup.

Link miễn phí là hostname ngẫu nhiên, đổi khi tạo tunnel mới. Máy phải bật, không sleep và có mạng. Không tự chạy 9Router hoặc LiveKit self-host, không lưu khóa trong terminal cũ. Quick Tunnel không hỗ trợ SSE; AI streaming dùng SSE cần kiểm tra riêng. Không tự đổi OAuth callback Zoom: liên kết từ máy khác cần callback công khai trùng trong Zoom/EngLive, và cập nhật lại khi hostname đổi. Chỉ chia sẻ cho nhóm thử tin cậy nếu còn demo/admin 123456. Xem [giới hạn Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

### Bật thủ công

GitHub chỉ lưu mã nguồn (GitHub Pages không chạy được máy chủ Node.js và Socket.IO). Để bạn bè ở máy khác vào thử, chạy server trên máy bạn rồi mở tunnel Cloudflare:

1. Chạy `npm start` (nên bật LiveKit Cloud để hình/tiếng ổn định, xem mục bên dưới).
2. Ở cửa sổ khác: `cloudflared tunnel --url http://localhost:3000` (cài bằng `winget install Cloudflare.cloudflared`).
3. Gửi bạn link `https://....trycloudflare.com` mà lệnh in ra. Link đổi mỗi lần chạy và chết khi bạn tắt tunnel hoặc máy; là HTTPS nên camera/micro dùng được.

Muốn chạy lâu dài, công khai: thuê VPS + HTTPS (Caddy/Nginx) + tên miền, xem *Lộ trình công khai* trong [PROJECT.md](PROJECT.md).

### Thử vai giáo viên và học sinh

1. Đăng nhập `teacher@demo.com`, mật khẩu `123456`, chọn lớp **IELTS Speaking 6.5+** và bắt đầu livestream. Cho phép camera/micro khi trình duyệt hỏi.
2. Bạn đăng nhập `student1@demo.com`, mật khẩu `123456`, mở cùng lớp và chọn **Vào học**.
3. Thử xem/nghe livestream, gửi chat, giơ tay, ghim từ vựng, chia sẻ màn hình và kết thúc buổi học.
4. Nếu thử cả hai vai trên một máy, dùng hai hồ sơ trình duyệt hoặc một cửa sổ ẩn danh.

### Giới hạn

- Không bật LiveKit thì video dùng WebRTC P2P với STUN: hai mạng khác nhau có thể cần TURN nếu chat chạy nhưng không có hình/tiếng.
- `data/db.json` được tạo tự động trên máy bạn, không đưa lên GitHub.
- Tài khoản và mật khẩu mẫu chỉ phục vụ test; đừng dùng để lưu dữ liệu học viên thật.

## LiveKit Cloud, chất lượng camera và quản trị

- **Dùng LiveKit Cloud** (gói Build miễn phí: 5.000 phút WebRTC và 50 GB băng thông mỗi tháng, 100 người cùng lúc): tạo project tại livekit.io, tạo API key, rồi trong PowerShell (không dán khoá vào chat hay tệp trong git):

  ```powershell
  Read-Host "Copy khoi Environment variables tren LiveKit roi nhan Enter" | Out-Null; Get-Clipboard | ForEach-Object { if ($_ -match '^(LIVEKIT_\w+)=(.+)$') { Set-Item "env:$($Matches[1])" $Matches[2].Trim() } }
  npm start
  ```

  Biến chỉ có hiệu lực trong cửa sổ PowerShell đó. Server in `Video: LiveKit (...)` khi đã nhận khoá; nếu in `WebRTC P2P` thì chưa có khoá.
- **Chất lượng camera**: giáo viên bấm nút "Chất lượng" trong phòng live (Tiết kiệm / Cân bằng / Cao) để giảm băng thông.
- **Quản trị** (`/admin.html`): thanh bên gồm Tổng quan (kèm số người online trên LiveKit), Tài khoản, Lớp học (tạo/sửa/xóa, phân công), Thời khóa biểu (lặp hằng tuần), Tài liệu & bản ghi, Hệ thống (hạn mức, sao lưu), Nhật ký, Cài đặt AI.
- **Trước khi mở cho người lạ**: gỡ/đổi tài khoản mẫu (mật khẩu `123456`) và admin demo, và revoke mọi khoá LiveKit đã lộ.

## Kế hoạch tiếp theo

- **Lớp đông (trên ~20 học sinh)**: đã có chế độ **LiveKit** cho video/âm thanh (quiz, slide, bảng viết, chat AI vẫn chạy qua Socket.IO; không cấu hình LiveKit thì dùng P2P cũ). Thử trên máy mình: `npm run livekit:dev` rồi `npm run start:lk` (hoặc đặt `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`). Để người ở máy khác vào, LiveKit phải truy cập được từ internet (LiveKit Cloud hoặc máy chủ riêng). Chi tiết: [PROJECT.md](PROJECT.md) mục *Chế độ LiveKit*.
- **Quản lý nhiều lớp**: Admin, trợ giảng, thời khoá biểu, nhắc lịch qua email/push.
- **Công khai**: dữ liệu bền (PostgreSQL), đăng ký giáo viên cần duyệt, Cài đặt AI chỉ dành cho quản trị viên.

## Kỹ thuật

- Node.js + Express + Socket.IO (kênh điều khiển, chấm điểm, quyền), video qua LiveKit (SFU) / Zoom Meeting SDK / WebRTC P2P dự phòng.
- Dữ liệu lưu ở `data/db.json` (xoá file này để tạo lại dữ liệu mẫu), gồm cả bài giảng, cài đặt AI (có API key) và lịch sử chat AI.
- Camera/micro cần `localhost` hoặc **HTTPS** khi triển khai thật.
- Mô hình P2P phù hợp lớp nhỏ (~10–20 học sinh). Lớp đông hoặc học sinh ở mạng khác nhau sau NAT chặt
  nên thêm TURN server hoặc chuyển sang SFU (LiveKit, mediasoup).
