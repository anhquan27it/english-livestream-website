# ĐẶC TẢ YÊU CẦU PHẦN MỀM — ENGLIVE

## Kiểm soát tài liệu

| Thuộc tính | Giá trị |
|---|---|
| Tên tài liệu | Software Requirements Specification — EngLive |
| Mã tài liệu | ENGLIVE-SRS-001 |
| Phiên bản | 1.0 — bản nháp để chủ dự án rà soát |
| Ngày lập | 29/10/2026 |
| Ngôn ngữ giao diện | Tiếng Việt; nội dung dạy và luyện tập chủ yếu bằng tiếng Anh |
| Cơ sở đặc tả | Yêu cầu của chủ dự án, mã nguồn và ghi nhận kiểm thử tại thời điểm lập |
| Mục đích | Thống nhất phạm vi phát triển, thiết kế dữ liệu và nghiệm thu hệ thống |

**Cách đọc trạng thái:**

- **Có:** đã tìm thấy chức năng tương ứng trong mã nguồn; không đồng nghĩa đã nghiệm thu mọi tình huống hoặc thiết bị thật.
- **Một phần:** đã có luồng chính nhưng còn thiếu điều kiện, còn lỗi đã biết hoặc phụ thuộc dịch vụ bên ngoài.
- **Đề xuất:** yêu cầu cho giai đoạn vận hành công khai, chưa được coi là chức năng đã hoàn thành hoặc cam kết đã được chủ dự án phê duyệt.

**Mức ưu tiên:** P0 — ảnh hưởng bảo mật, quyền truy cập hoặc tính toàn vẹn dữ liệu; P1 — cần cho hoạt động dạy/học chính; P2 — cải thiện trải nghiệm hoặc vận hành. P0 không có nghĩa mọi yêu cầu đó đã được triển khai đầy đủ.

Tài liệu mô tả yêu cầu sản phẩm và mức đáp ứng hiện tại, không phải chứng nhận an toàn hay báo cáo thử tải production. Các thông số đề xuất phải được xác nhận trước khi đưa vào hợp đồng hoặc cam kết dịch vụ.

### Mục lục

1. [Giới thiệu](#1-giới-thiệu)
2. [Mô tả tổng quan](#2-mô-tả-tổng-quan)
3. [Vai trò và phân quyền](#3-vai-trò-và-phân-quyền)
4. [Yêu cầu chức năng](#4-yêu-cầu-chức-năng)
5. [Đặc tả ca sử dụng](#5-đặc-tả-ca-sử-dụng)
6. [Quy tắc nghiệp vụ](#6-quy-tắc-nghiệp-vụ)
7. [Yêu cầu dữ liệu](#7-yêu-cầu-dữ-liệu)
8. [Giao diện và tích hợp](#8-giao-diện-và-tích-hợp)
9. [Yêu cầu phi chức năng](#9-yêu-cầu-phi-chức-năng)
10. [Tiêu chí nghiệm thu và truy vết](#10-tiêu-chí-nghiệm-thu-và-truy-vết)
11. [Giới hạn, rủi ro và yêu cầu chưa triển khai](#11-giới-hạn-rủi-ro-và-yêu-cầu-chưa-triển-khai)
12. [Thuật ngữ và tài liệu đối chiếu](#12-thuật-ngữ-và-tài-liệu-đối-chiếu)

## 1. Giới thiệu

### 1.1. Mục đích

EngLive là hệ thống học tiếng Anh trực tuyến, hỗ trợ giáo viên chuẩn bị bài giảng có AI, tổ chức lớp học video, trình chiếu slide và hoạt động tương tác; hỗ trợ học sinh tham gia lớp, làm bài, xem kết quả và ôn tập. Quản trị viên quản lý tài khoản, lớp, tài nguyên và cấu hình dịch vụ.

SRS này là đầu vào cho thiết kế, triển khai, kiểm thử và đánh giá thay đổi. Mỗi yêu cầu có mã ổn định để tham chiếu trong công việc phát triển và biên bản nghiệm thu.

### 1.2. Đối tượng sử dụng tài liệu

- Chủ dự án: xác nhận phạm vi, ưu tiên và các quyết định còn mở.
- Nhóm phát triển: thiết kế luồng nghiệp vụ, giao diện, API và lưu trữ.
- Người kiểm thử: xây dựng ca kiểm thử theo yêu cầu và quyền truy cập.
- Người vận hành: cấu hình dịch vụ, sao lưu, khôi phục và triển khai.

### 1.3. Phạm vi phiên bản hiện tại

Phạm vi gồm quản lý người dùng/lớp, lịch học, bài giảng AI, phòng trực tiếp, slide và trò chơi, bài tập, kết quả học tập, chuyên cần, từ vựng, bản ghi, hỏi đáp AI và quản trị. Database chính đã chuyển sang PostgreSQL; tệp tài liệu và media vẫn lưu riêng trên ổ đĩa.

Các vai trò nghiệp vụ chính chỉ gồm **quản trị viên, giáo viên và học sinh**. Vai trò `assistant` còn tồn tại trong mã như phần mở rộng cũ, nhưng **không phải vai trò được đưa vào phạm vi nghiệp vụ hoặc kế hoạch vận hành của bản SRS này**. Không mở rộng quyền hoặc giao diện cho trợ giảng khi chưa có yêu cầu mới của chủ dự án.

### 1.4. Ngoài phạm vi đã cam kết

Thanh toán/học phí, ứng dụng mobile native, chứng chỉ, chương trình quản lý trung tâm đầy đủ, giám sát thi chuyên dụng, tự động chấm phát âm theo chuẩn khảo thí, nhiều vùng dữ liệu và nhiều server ứng dụng đồng thời không được coi là chức năng đã cam kết. Xem mục 11 để phân biệt nâng cấp dự kiến với chức năng đã có.

## 2. Mô tả tổng quan

### 2.1. Vấn đề cần giải quyết

Giáo viên cần giảm thời gian chuẩn bị bài, giữ học sinh tương tác trong lớp và quản lý hoạt động học tập sau buổi học. Học sinh cần một nơi thống nhất để vào lớp, xem tài liệu đã học, làm bài, nhận phản hồi và đặt câu hỏi. Quản trị viên cần kiểm soát người truy cập và dịch vụ mà không phải sửa mã nguồn cho từng buổi.

### 2.2. Chu trình sử dụng chính

1. Admin tạo/phân công lớp và cấu hình dịch vụ video, AI, hạn mức.
2. Giáo viên tiếp nhận học sinh, tạo lịch và soạn bài giảng hoặc bài tập.
3. Giáo viên mở buổi học; học sinh đã được duyệt tham gia.
4. Video/âm thanh hoạt động qua dịch vụ được chọn; nội dung học tập đồng bộ trong EngLive.
5. Giáo viên kết thúc buổi; hệ thống lưu lịch sử, chuyên cần, kết quả và slide nội dung đã chiếu.
6. Học sinh ôn tập, làm bài và hỏi AI; giáo viên theo dõi/chấm bài.

### 2.3. Môi trường và ràng buộc hiện tại

| Thành phần | Công nghệ/ràng buộc |
|---|---|
| Client | HTML, CSS, JavaScript thuần trên trình duyệt |
| Server | Node.js, Express, các module CommonJS |
| Đồng bộ nghiệp vụ | Socket.IO |
| Dữ liệu | PostgreSQL, driver `pg`, bảng quan hệ và JSONB |
| Truyền thông | Zoom Meeting SDK, LiveKit; WebRTC P2P dự phòng theo cấu hình |
| AI | Nhà cung cấp API tương thích OpenAI, có thể sử dụng 9Router |
| PDF | Trích văn bản bằng `unpdf`; không có cam kết OCR tài liệu ảnh |
| Lưu media | Thư mục dữ liệu riêng, database giữ metadata |
| Thử nghiệm Internet | Cloudflare Quick Tunnel bật thủ công; link thay đổi khi tạo tunnel mới |
| Mô hình chạy | Một tiến trình ứng dụng, cache trong RAM, PostgreSQL advisory lock và khóa DATA_DIR |

Thiết bị học cần trình duyệt và mạng hoạt động. Micro/camera cần quyền người dùng và ngữ cảnh trình duyệt cho phép. Chất lượng video phụ thuộc thiết bị, mạng và dịch vụ video; đổi database không tự làm tăng năng lực truyền video.

### 2.4. Phụ thuộc bên ngoài

- Zoom/LiveKit phải có cấu hình hợp lệ và đủ quyền/hạn mức cho buổi học.
- Nhà cung cấp AI phải truy cập được từ server; dịch vụ local cần được bật riêng.
- PostgreSQL phải sẵn sàng và khóa giải mã phải tồn tại để đọc các phần dữ liệu được mã hóa.
- Khi public web, HTTPS, domain/callback và reverse proxy phải được cấu hình phù hợp.

## 3. Vai trò và phân quyền

### 3.1. Định nghĩa vai trò

| Vai trò | Trách nhiệm |
|---|---|
| Khách | Xem trang giới thiệu, đăng ký hoặc đăng nhập; không có quyền vào nội dung riêng |
| Quản trị viên | Quản lý tài khoản, lớp, phân công, hạn mức, dịch vụ AI/video, tài nguyên, nhật ký và backup |
| Giáo viên | Quản lý lớp phụ trách, duyệt học sinh, chuẩn bị và dạy bài, giao/chấm bài, xem kết quả lớp |
| Học sinh | Xin tham gia lớp, vào lớp đã được duyệt, làm bài, xem kết quả của mình và ôn tập |

### 3.2. Ma trận quyền nghiệp vụ

| Thao tác | Admin | Giáo viên | Học sinh |
|---|---|---|---|
| Xem/cập nhật thông tin tài khoản được cho phép | Tài khoản của mình và quản trị người dùng | Của mình | Của mình |
| Duyệt/khóa/đổi vai trò người dùng | Có | Không | Không |
| Tạo và phân công lớp | Có | Tạo lớp do mình phụ trách | Không |
| Duyệt thành viên, đổi mã lớp | Qua chức năng quản trị được cấp | Lớp mình phụ trách | Không |
| Xem nội dung riêng của lớp | Theo quyền quản trị server | Lớp phụ trách | Lớp đã được duyệt |
| Soạn/sửa bài giảng | Theo quyền được kiểm tra trên API | Bài giảng do mình sở hữu | Không |
| Mở/điều khiển buổi dạy | Khi được phân công/chấp nhận là chủ lớp | Lớp phụ trách | Không |
| Vào phòng học | Theo điều kiện của phòng | Lớp phụ trách | Thành viên hợp lệ, chưa bị kick/chặn |
| Xem đáp án chưa công bố | Người có quyền soạn/chấm | Người có quyền soạn/chấm | Không |
| Giao/chấm bài và xem báo cáo lớp | Theo quyền quản trị | Lớp phụ trách | Không |
| Xem bài nộp/kết quả cá nhân | Theo quyền quản trị | Thành viên lớp phụ trách | Của mình |
| Sửa dịch vụ AI/video và hạn mức | Có | Không | Không |
| Tạo/tải backup, xem nhật ký quản trị | Có | Không | Không |

Admin không được mặc nhiên coi là giáo viên phụ trách của mọi phòng video. Quyền quản trị lớp và quyền phát media/chủ trì phải được server kiểm tra riêng. Ma trận trên phải được áp dụng ở API/Socket.IO, không chỉ bằng cách ẩn nút trên giao diện.

## 4. Yêu cầu chức năng

### 4.1. Tài khoản và phiên đăng nhập

| Mã | Yêu cầu kiểm chứng được | Ưu tiên | Trạng thái |
|---|---|---|---|
| FR-IAM-01 | Cho phép đăng ký vai trò giáo viên hoặc học sinh bằng tên, email và mật khẩu; không cho khách tự đăng ký admin. | P0 | Có |
| FR-IAM-02 | Kiểm tra email hợp lệ/không trùng, tên sau chuẩn hóa không rỗng và mật khẩu đáp ứng chính sách. Đầu vào sai không tạo tài khoản. | P0 | Một phần: lỗi tên toàn dấu cách còn được ghi nhận |
| FR-IAM-03 | Giáo viên đăng ký mới ở trạng thái chờ duyệt; chỉ tài khoản được phép mới sử dụng các chức năng bảo vệ. | P0 | Có |
| FR-IAM-04 | Đăng nhập đúng cấp phiên có hạn; sai thông tin, bị khóa hoặc chưa được duyệt phải có phản hồi phù hợp. | P0 | Có |
| FR-IAM-05 | Sau đăng nhập, điều hướng về trang đúng vai trò; truy cập trang chủ khi phiên còn hợp lệ không đưa người dùng ra khỏi không gian làm việc. | P1 | Có |
| FR-IAM-06 | Đăng xuất thu hồi phiên tương ứng; đổi mật khẩu hoặc thao tác thu hồi phiên phải ngăn phiên cũ tiếp tục gọi API/socket. | P0 | Có |
| FR-IAM-07 | Giới hạn thử đăng nhập theo người dùng/mạng hợp lý, không để mọi người đi qua proxy bị tính nhầm thành một người. | P0 | Một phần: cần xử lý nhận diện IP proxy |
| FR-IAM-08 | Cho phép người dùng đổi mật khẩu của mình; admin có chức năng đặt lại mật khẩu theo quyền quản trị. | P0 | Có |

### 4.2. Lớp học và thành viên

| Mã | Yêu cầu kiểm chứng được | Ưu tiên | Trạng thái |
|---|---|---|---|
| FR-CLS-01 | Giáo viên tạo lớp với tên, trình độ, mô tả và sĩ số tối đa; tên sau chuẩn hóa không được rỗng. | P1 | Một phần: tạo lớp có, cần sửa tên chỉ dấu cách |
| FR-CLS-02 | Admin tạo/sửa/xóa lớp, phân công giáo viên và cập nhật danh sách học sinh theo quyền. | P1 | Có |
| FR-CLS-03 | Cấp mã lớp cho người quản lý; học sinh xin tham gia bằng mã lớp hợp lệ và ở trạng thái chờ cho đến khi được duyệt. | P0 | Có |
| FR-CLS-04 | Giáo viên thêm, duyệt, từ chối hoặc loại học sinh ở lớp phụ trách; hiển thị kết quả thực của thao tác. | P0 | Có |
| FR-CLS-05 | Thực thi sĩ số tối đa tại server khi thêm/duyệt/cập nhật thành viên; không chỉ kiểm tra trên client. | P0 | Có |
| FR-CLS-06 | Danh sách lớp hỗ trợ tìm kiếm, lọc, sắp xếp, đổi dạng hiển thị và phân trang giao diện. | P1 | Có; phân trang API quy mô lớn chưa có |
| FR-CLS-07 | Xóa lớp kết thúc buổi liên quan, dọn lịch/bài tập/bài nộp/kết quả gắn lớp; xử lý tài nguyên lưu trữ theo quy tắc lưu giữ. | P0 | Có |
| FR-CLS-08 | Người ngoài lớp, học sinh chờ duyệt và người bị chặn không được lấy nội dung riêng hoặc vào phòng bằng cách gọi API trực tiếp. | P0 | Có |

### 4.3. Lịch học và nhắc lịch

| Mã | Yêu cầu kiểm chứng được | Ưu tiên | Trạng thái |
|---|---|---|---|
| FR-SCH-01 | Người quản lý được tạo và xóa lịch học của lớp được phép quản lý. | P1 | Có |
| FR-SCH-02 | Từ chối lịch trùng khoảng thời gian của cùng lớp hoặc cùng giáo viên theo quy tắc lịch. | P1 | Có |
| FR-SCH-03 | Admin tạo chuỗi lịch lặp hằng tuần; nếu có xung đột trong chuỗi thì không ghi một phần không rõ ràng. | P1 | Có |
| FR-SCH-04 | Chỉ thành viên hợp lệ thấy lịch/nhắc lịch của lớp; nhắc trong ứng dụng trước buổi học theo cấu hình hiện hành. | P1 | Có; thông báo email/push khi đóng web là đề xuất |

### 4.4. Bài giảng và AI soạn bài

| Mã | Yêu cầu kiểm chứng được | Ưu tiên | Trạng thái |
|---|---|---|---|
| FR-LES-01 | Giáo viên tạo bài giảng từ chủ đề, văn bản hoặc nội dung trích từ PDF/tệp được hỗ trợ. | P1 | Có |
| FR-LES-02 | AI lập dàn ý rồi tạo nội dung; giao diện thể hiện tiến trình, kết quả và lỗi, không báo bài đã sẵn sàng khi sinh thất bại. | P1 | Có |
| FR-LES-03 | Nội dung sinh phải hướng tới học tiếng Anh, bám tài liệu nguồn và trình độ đã chọn; yêu cầu ngoài phạm vi được xử lý phù hợp. | P1 | Có ràng buộc prompt/chuẩn hóa; không bảo đảm tuyệt đối chất lượng AI |
| FR-LES-04 | Giáo viên sửa, lưu và tạo lại từng scene; thay đổi của giáo viên không bị thay bằng kết quả cũ không được chọn. | P1 | Có |
| FR-LES-05 | Hỗ trợ scene nội dung và hoạt động: slide, quiz, poll, match, order, fill, speak. | P1 | Có |
| FR-LES-06 | Gắn bài giảng với lớp để trình chiếu/ôn tập; người không sở hữu không được sửa bài giảng. | P0 | Có |
| FR-LES-07 | Giữ thông tin nguồn liên quan khi chuẩn bị slide; kiểm soát hạn mức khi gọi AI soạn/tạo lại nội dung. | P1 | Có |

### 4.5. Phòng học và tương tác trực tiếp

| Mã | Yêu cầu kiểm chứng được | Ưu tiên | Trạng thái |
|---|---|---|---|
| FR-LIV-01 | Giáo viên mở/kết thúc buổi học của lớp phụ trách; kiểm tra cấu hình video và điều kiện truy cập trước khi cho vào. | P0 | Có |
| FR-LIV-02 | Học sinh hợp lệ vào buổi đang mở; người vào muộn nhận trạng thái học tập hiện tại. | P1 | Có |
| FR-LIV-03 | Đồng bộ slide, mở/chốt hoạt động, đáp án đã công bố, điểm và bảng xếp hạng qua Socket.IO. | P1 | Có |
| FR-LIV-04 | Giữ đáp án chưa công bố ở server; không gửi scene tương lai hoặc đáp án chưa chốt cho học sinh qua API/AI. | P0 | Có |
| FR-LIV-05 | Hoạt động có hạn giờ; từ chối câu trả lời sau hạn, chấm trên server và không cộng điểm trùng khi luyện lại. | P0 | Có |
| FR-LIV-06 | Hỗ trợ chat lớp, giơ tay, cảm xúc, tặng sao và phụ đề khi môi trường cho phép; xác minh vai trò và giới hạn sự kiện. | P1 | Có |
| FR-LIV-07 | Giáo viên điều khiển quyền phát biểu/camera/chia sẻ và phòng nhóm theo khả năng của dịch vụ video; giao diện phải thể hiện giới hạn theo dịch vụ. | P0 | Một phần; Zoom có luồng điều khiển riêng |
| FR-LIV-08 | Hỗ trợ bảng viết, chia sẻ PDF và phát tệp nghe đồng bộ; tệp chỉ truy cập được theo quyền lớp. | P1 | Có |
| FR-LIV-09 | Khi giáo viên loại một học sinh khỏi phòng, ngăn người đó tiếp tục tương tác hoặc xin token media mới theo trạng thái bị chặn của buổi. | P0 | Có; không thay thế Remove trực tiếp trong Zoom |

### 4.6. Dịch vụ video

| Mã | Yêu cầu kiểm chứng được | Ưu tiên | Trạng thái |
|---|---|---|---|
| FR-VID-01 | Admin chọn Zoom/LiveKit mặc định hoặc ghi đè theo ngày Việt Nam; quy tắc ngày phải thống nhất. | P1 | Có |
| FR-VID-02 | Cấu hình đang dùng được chốt theo buổi; sửa lịch dịch vụ không âm thầm đổi buổi đã mở. | P0 | Có |
| FR-VID-03 | Admin chủ động chuyển dịch vụ cho buổi đang chạy; giữ nghiệp vụ slide/kết quả, thông báo client kết nối lại. | P1 | Có |
| FR-VID-04 | Giáo viên liên kết đúng tài khoản Zoom chủ trì để mở meeting trong EngLive bằng quyền host; học sinh không nhận ZAK/quyền host. | P0 | Có; cần cấu hình và kiểm thử dịch vụ thật |
| FR-VID-05 | Không cấp token/chữ ký chỉ vì biết classId: phải xác thực, có quyền và có socket cùng phiên đã được nhận vào lớp. | P0 | Có |
| FR-VID-06 | Khi thiếu khóa/phòng/quyền/hạn mức, báo nguyên nhân phù hợp; không tự chuyển provider hoặc cấp quyền cao hơn để vượt lỗi. | P0 | Có |

### 4.7. Bài tập và chấm điểm

| Mã | Yêu cầu kiểm chứng được | Ưu tiên | Trạng thái |
|---|---|---|---|
| FR-HW-01 | Người quản lý lớp tạo, sửa, gia hạn và xóa bài tập theo điều kiện bảo vệ dữ liệu đã có bài nộp. | P1 | Có; điều kiện chi tiết phải theo API hiện hành |
| FR-HW-02 | Hỗ trợ trắc nghiệm, đúng/sai, điền từ, sắp xếp, ghép cặp, trả lời ngắn, tự luận và đọc/nói ở mức trình duyệt hỗ trợ. | P1 | Có |
| FR-HW-03 | Học sinh chỉ thấy bài tập của lớp mình; không nhận đáp án chưa đến thời điểm được phép công bố. | P0 | Có |
| FR-HW-04 | Kiểm tra thời hạn và số lần làm tại server; không nhận bài nộp sai lớp hoặc sau hạn khi không có điều kiện cho phép. | P0 | Có |
| FR-HW-05 | Tự chấm các dạng có đáp án, xử lý phần cần chấm tay, lưu điểm/lượt làm và phản hồi theo chính sách bài tập. | P1 | Có |
| FR-HW-06 | Giáo viên chấm/nhận xét bài được phân quyền; học sinh không tự sửa điểm hoặc ghi đè bài đã khóa/chấm. | P0 | Có |
| FR-HW-07 | Giáo viên xem thống kê đã nộp/chưa nộp và kết quả theo câu; hỗ trợ AI soạn câu hỏi nhưng phải được người có quyền kiểm tra trước khi giao. | P1 | Có |

### 4.8. Kết quả, tài liệu và ôn tập

| Mã | Yêu cầu kiểm chứng được | Ưu tiên | Trạng thái |
|---|---|---|---|
| FR-REV-01 | Lưu lịch sử buổi học, lượt vào, thời gian có mặt, kết quả hoạt động; không xóa lịch sử chỉ vì vượt 50 buổi. | P1 | Có |
| FR-REV-02 | Giáo viên xem kết quả lớp; học sinh chỉ xem chuyên cần, điểm và bài làm được phép của mình. | P0 | Có |
| FR-REV-03 | Học sinh xem lại bản chụp các slide nội dung đã được chiếu trong buổi kết thúc. | P1 | Có; không bao gồm toàn bộ trò chơi/PDF |
| FR-REV-04 | Người có quyền tải lên, xem và quản lý bản ghi/tài liệu; kiểm tra dung lượng và quyền tải tệp tại server. | P0 | Có |
| FR-REV-05 | Học sinh lưu/sửa/xóa từ vựng cá nhân và trạng thái ôn tập; người dùng khác không truy cập kho từ riêng. | P1 | Có |

### 4.9. AI hỏi đáp và luyện tập

| Mã | Yêu cầu kiểm chứng được | Ưu tiên | Trạng thái |
|---|---|---|---|
| FR-AI-01 | Hỏi đáp trong/ngay sau bài học sử dụng ngữ cảnh lớp, bài, slide và trạng thái công bố đáp án. | P0 | Có |
| FR-AI-02 | Có hội thoại chung theo lớp và hội thoại gắn bài; cho phép tạo, đổi tên, ghim, xóa các hội thoại của chính người dùng. | P1 | Có |
| FR-AI-03 | Hỗ trợ chế độ luyện tập đã cấu hình, tra nhanh từ tiếng Anh và đầu vào ảnh/tệp được cho phép; kiểm tra kích thước/loại đầu vào. | P1 | Có |
| FR-AI-04 | Không cho người dùng lấy hội thoại riêng của người khác bằng cách thay ID; tôn trọng quyền lớp ở mỗi lần gọi. | P0 | Có |
| FR-AI-05 | Chặn yêu cầu vượt quota, phản hồi khi AI không kết nối/timeout; lỗi cho học sinh không chứa khóa hoặc chi tiết nội bộ nhạy cảm. | P0 | Có |
| FR-AI-06 | Xem nội dung học sinh/tài liệu đính kèm là dữ liệu không tin cậy; không cho chỉ dẫn nhúng trong tài liệu ghi đè chính sách hệ thống. | P0 | Có ràng buộc prompt; cần đánh giá đối kháng trước public |

### 4.10. Quản trị và vận hành

| Mã | Yêu cầu kiểm chứng được | Ưu tiên | Trạng thái |
|---|---|---|---|
| FR-ADM-01 | Admin xem tổng quan người dùng, lớp, buổi đang chạy, mức dùng AI, dung lượng và nhật ký. | P1 | Có |
| FR-ADM-02 | Admin đổi trạng thái/vai trò tài khoản theo ràng buộc; không khóa hoặc hạ quyền admin hoạt động cuối cùng. | P0 | Có |
| FR-ADM-03 | Chỉ admin cấu hình/test nhà cung cấp AI, model, dịch vụ video và hạn mức chung. | P0 | Có |
| FR-ADM-04 | Admin kiểm tra và xóa tài nguyên lưu trữ theo quyền; có phản hồi khi quota không đủ. | P1 | Có |
| FR-ADM-05 | Admin tạo/tải backup; ghi lại các thao tác quan trọng như quản trị, chấm bài và thay cấu hình. | P0 | Có |
| FR-OPS-01 | PostgreSQL là nguồn lưu chính sau cutover; giữ nguyên ID/hash mật khẩu và đối chiếu nội dung dữ liệu khi chuyển. | P0 | Có |
| FR-OPS-02 | Ghi các thay đổi liên quan trong transaction; không báo HTTP thành công trước khi flush PostgreSQL thành công. | P0 | Có trong lớp lưu hiện tại |
| FR-OPS-03 | Ngăn hai writer cùng sử dụng dữ liệu; lỗi mất kết nối lưu trữ không được bị bỏ qua để tiếp tục báo lưu thành công. | P0 | Có |
| FR-OPS-04 | Có backup, khôi phục khi dừng server và thu hồi phiên sau khôi phục; giữ tệp media và khóa theo quy trình riêng. | P0 | Có công cụ; sao lưu ngoài máy là đề xuất |
| FR-OPS-05 | Có lệnh kiểm tra DB/health, quy trình rollback xuất dữ liệu PostgreSQL mới nhất về JSON. | P1 | Có |
| FR-OPS-06 | Bật link thử nghiệm bằng file thủ công; hiển thị và lưu link mới, không tự khởi động Cloudflare theo Windows khi người dùng đã tắt cơ chế này. | P1 | Có |

## 5. Đặc tả ca sử dụng

### UC-01 — Đăng ký và duyệt giáo viên

- **Tác nhân:** khách, admin.
- **Tiền điều kiện:** email chưa tồn tại; dịch vụ tài khoản và database sẵn sàng.
- **Luồng chính:** (1) khách nhập tên/email/mật khẩu và chọn giáo viên; (2) server kiểm tra đầu vào; (3) lưu tài khoản chờ duyệt, không cấp quyền dạy; (4) admin xem yêu cầu và duyệt; (5) giáo viên đăng nhập bằng thông tin hợp lệ.
- **Ngoại lệ:** email trùng/đầu vào sai bị từ chối; chờ duyệt hoặc bị khóa không nhận phiên sử dụng; lỗi lưu không báo tạo thành công.
- **Hậu điều kiện:** tài khoản active sử dụng trang giáo viên; việc duyệt được ghi nhật ký theo chức năng quản trị.
- **Truy vết:** FR-IAM-01 đến FR-IAM-04, FR-ADM-02.

### UC-02 — Xin tham gia và duyệt vào lớp

- **Tác nhân:** học sinh, giáo viên phụ trách.
- **Tiền điều kiện:** tài khoản hợp lệ, lớp tồn tại và có mã hợp lệ.
- **Luồng chính:** (1) học sinh nhập mã; (2) server lưu yêu cầu chờ; (3) giáo viên xem yêu cầu; (4) server kiểm tra quyền và sĩ số khi duyệt; (5) chuyển thành viên sang được nhận, cập nhật danh sách và thông báo kết quả trong ứng dụng.
- **Ngoại lệ:** sai mã, đã tham gia, trùng yêu cầu, lớp đầy hoặc người duyệt không có quyền; dữ liệu không được cập nhật một phần rồi báo thành công.
- **Hậu điều kiện:** chỉ thành viên được duyệt nhận quyền nội dung và vào phòng.
- **Truy vết:** FR-CLS-03 đến FR-CLS-05, FR-CLS-08.

### UC-03 — Tạo bài giảng có AI

- **Tác nhân:** giáo viên.
- **Tiền điều kiện:** có quyền soạn bài, nhà cung cấp AI sẵn sàng, còn hạn mức.
- **Luồng chính:** (1) nhập chủ đề/tài liệu và trình độ; (2) trích văn bản nếu cần; (3) tạo và xem dàn ý; (4) sinh nội dung; (5) giáo viên kiểm tra, sửa/tạo lại scene; (6) lưu và gắn vào lớp.
- **Ngoại lệ:** tệp quá lớn/không trích được; tài liệu chỉ là ảnh; yêu cầu ngoài phạm vi; quota hết; model lỗi/timeout hoặc nội dung không hợp lệ. Giao diện giữ thông tin cần thiết để người dùng sửa hoặc thử lại.
- **Hậu điều kiện:** bài thuộc quyền sở hữu giáo viên, có trạng thái sẵn sàng khi nội dung đã lưu hợp lệ.
- **Truy vết:** FR-LES-01 đến FR-LES-07, FR-AI-05.

### UC-04 — Mở lớp bằng Zoom trong EngLive

- **Tác nhân:** admin, giáo viên, học sinh.
- **Tiền điều kiện:** admin chọn Zoom và gán meeting; app SDK/callback/quyền hợp lệ; giáo viên liên kết đúng tài khoản chủ trì.
- **Luồng chính:** (1) giáo viên chọn mở buổi; (2) preflight xác minh cấu hình và liên kết; (3) server tạo trạng thái buổi; (4) giáo viên được nhận vào socket; (5) server cấp chữ ký host và ZAK mới cho giáo viên hợp lệ; (6) học sinh hợp lệ vào bằng quyền participant; (7) slide/chat/game hoạt động trong EngLive.
- **Ngoại lệ:** chưa liên kết, sai chủ trì, meeting đang được lớp khác sử dụng, thiếu cấu hình, passcode sai, quyền SDK không phù hợp hoặc vượt hạn mức. Không chữa lỗi bằng cách cấp host cho học sinh.
- **Hậu điều kiện:** giáo viên điều khiển meeting trong web ở chế độ host được hỗ trợ; trạng thái nghiệp vụ gắn đúng lớp/buổi.
- **Truy vết:** FR-LIV-01, FR-LIV-02, FR-VID-01 đến FR-VID-06.

### UC-05 — Trình chiếu và chơi hoạt động

- **Tác nhân:** giáo viên, học sinh.
- **Tiền điều kiện:** đã vào buổi hợp lệ; bài có scene được chọn.
- **Luồng chính:** (1) giáo viên chọn slide; (2) học sinh nhận scene hiện tại; (3) mở hoạt động và hạn giờ; (4) học sinh gửi câu trả lời; (5) server xác minh và chấm; (6) giáo viên chốt hoặc timer kết thúc; (7) công bố kết quả theo quyền và cập nhật bảng điểm.
- **Ngoại lệ:** gửi đáp án trước mở/sau hạn, scene không khớp, gửi trùng, người bị kick, reconnect trong lúc làm. Không gửi đáp án chưa công bố hoặc cộng điểm lại khi luyện tập.
- **Hậu điều kiện:** lưu kết quả và trạng thái đã chốt; người vào muộn nhận trạng thái phù hợp.
- **Truy vết:** FR-LIV-03 đến FR-LIV-05, FR-LIV-09, FR-REV-01.

### UC-06 — Giao, nộp và chấm bài tập

- **Tác nhân:** giáo viên, học sinh.
- **Tiền điều kiện:** lớp hợp lệ; người giao/chấm có quyền; học sinh là thành viên.
- **Luồng chính:** (1) giáo viên tạo câu hỏi và cài hạn/lượt làm/công bố đáp án; (2) giao cho lớp; (3) học sinh làm và nộp; (4) server kiểm tra quyền, hạn và lượt; (5) tự chấm phần có đáp án và lưu phần cần chấm tay; (6) giáo viên chấm/nhận xét; (7) học sinh xem kết quả được công bố.
- **Ngoại lệ:** bài quá hạn, hết lượt, payload không hợp lệ, bài đã bị xóa hoặc bị khóa sau chấm. Không cho sửa điểm bằng client.
- **Hậu điều kiện:** bài nộp liên kết đúng học sinh/bài tập; điểm và thống kê phản ánh chính sách lượt làm.
- **Truy vết:** FR-HW-01 đến FR-HW-07, FR-REV-02.

### UC-07 — Kết thúc buổi và xem lại

- **Tác nhân:** giáo viên, học sinh.
- **Tiền điều kiện:** buổi đang chạy và có người được quyền kết thúc.
- **Luồng chính:** (1) giáo viên kết thúc; (2) hệ thống chốt dữ liệu buổi và dọn trạng thái cần dọn; (3) lưu lịch sử/chuyên cần/kết quả/bản chụp slide nội dung đã chiếu; (4) học sinh mở kết quả lớp; (5) xem dữ liệu cá nhân và slide được phép.
- **Ngoại lệ:** buổi không chiếu slide thì hiển thị không có nội dung xem lại; mất kết nối/restart phải phân biệt trạng thái phục hồi, không coi mọi media đã tự phục hồi.
- **Hậu điều kiện:** có thể truy xuất buổi đã kết thúc; không phụ thuộc bài giảng gốc còn giữ nguyên hay đã được giáo viên sửa.
- **Truy vết:** FR-REV-01 đến FR-REV-04, FR-OPS-01.

### UC-08 — Hỏi AI theo bài học

- **Tác nhân:** học sinh hoặc người dùng có quyền lớp.
- **Tiền điều kiện:** phiên hợp lệ, quyền lớp còn hiệu lực, còn quota.
- **Luồng chính:** (1) mở/tạo hội thoại; (2) gửi câu hỏi/tệp hợp lệ; (3) server chọn ngữ cảnh và các đáp án đã được công bố; (4) gọi nhà cung cấp; (5) trả lời và lưu hội thoại riêng.
- **Ngoại lệ:** người ngoài lớp, hết quota, file sai, AI không sẵn sàng hoặc prompt có chỉ dẫn trái chính sách. Không lộ khóa và không trả hội thoại của người khác.
- **Hậu điều kiện:** trả lời gắn đúng ngữ cảnh, lịch sử được truy xuất theo chủ sở hữu.
- **Truy vết:** FR-AI-01 đến FR-AI-06, FR-LIV-04.

### UC-09 — Sao lưu và khôi phục

- **Tác nhân:** admin/người vận hành được ủy quyền.
- **Tiền điều kiện:** người dùng có quyền; khôi phục/cutover yêu cầu writer ứng dụng đã dừng.
- **Luồng chính:** (1) tạo backup dữ liệu hiện hành; (2) sao lưu media và key riêng; (3) khi cần, chọn bản sao hợp lệ; (4) tạo bản trước khôi phục; (5) khôi phục trong transaction; (6) thu hồi phiên và kiểm tra lại kết nối/số lượng/quyền sau restart.
- **Ngoại lệ:** server còn ghi, backup không đúng định dạng, thiếu khóa giải mã, DB không kết nối hoặc FK lỗi. Không tiếp tục bằng cách bỏ kiểm tra hoặc âm thầm mất dữ liệu.
- **Hậu điều kiện:** dữ liệu được xác minh hoặc rollback; người dùng đăng nhập lại theo chính sách khôi phục.
- **Truy vết:** FR-ADM-05, FR-OPS-01 đến FR-OPS-05.

## 6. Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR-01 | Phạm vi nghiệp vụ dùng ba vai trò admin, teacher và student; khách không có quyền nội dung riêng. |
| BR-02 | Một lớp có một giáo viên phụ trách tại một thời điểm; thay phân công phải tuân thủ quyền, trạng thái buổi và lịch liên quan. |
| BR-03 | Chờ duyệt không tương đương thành viên. Biết mã lớp hoặc URL không tự cấp quyền vào buổi. |
| BR-04 | Sĩ số mặc định là 30; mã hiện tại cho cấu hình số nguyên 1–1000. Đây là giới hạn dữ liệu lớp, không phải cam kết video hỗ trợ 1000 người. Lớp cũ không tự bị xóa thành viên khi đổi mặc định. |
| BR-05 | Số người thực tế được tham gia còn bị giới hạn bởi hạn mức ứng dụng, phòng và provider; gồm cả giáo viên theo cách đếm của từng dịch vụ. |
| BR-06 | Cấu hình provider theo ngày dùng Asia/Ho_Chi_Minh. Ưu tiên bản ghi đúng ngày rồi đến mặc định; cấu hình buổi đã mở không đổi nếu chưa có thao tác chuyển chủ động. |
| BR-07 | Không cho hai lớp Zoom đang chạy dùng trùng meeting/chủ trì theo ràng buộc hiện hành; mã hiện tại có trần 100 người cho chế độ thử Zoom được tích hợp. |
| BR-08 | Giáo viên host Zoom phải liên kết đúng chủ trì gán cho lớp. Liên kết không tự tạo tài khoản Zoom hoặc nâng gói dịch vụ. |
| BR-09 | Đáp án và điểm số được kiểm soát tại server. Kết quả chưa công bố không được tiết lộ qua payload, scene tương lai hoặc ngữ cảnh AI. |
| BR-10 | Kết thúc thời gian hoạt động thì không nhận câu trả lời mới. Luyện lại không làm tăng trùng điểm của cùng hoạt động đã tính. |
| BR-11 | Một buổi có thể có nhiều lượt vào của một học sinh; thời gian chuyên cần phản ánh thời gian trong EngLive theo cách ghi hiện hành. |
| BR-12 | Với Zoom, chuyên cần EngLive không chứng minh học sinh đã kết nối video Zoom trong cùng khoảng thời gian. Kick EngLive cũng không đồng nghĩa đã Remove khỏi meeting Zoom. |
| BR-13 | Xem lại theo buổi chỉ gồm scene nội dung đã được chiếu và lưu trong bản chụp; không đồng nghĩa truy cập mọi slide/đáp án/PDF của bài giảng. |
| BR-14 | Bài tập có hạn và chính sách số lần làm/công bố đáp án. Mã hiện tại giới hạn tối đa 40 câu/bài và 1–5 lượt theo cài đặt; bài tự chấm hoàn toàn giữ điểm cao nhất khi làm lại. Điểm giáo viên nhập nằm trong 0–10; phần chấm tay cần giáo viên xác nhận. |
| BR-15 | Không được khóa/hạ quyền admin hoạt động cuối cùng. Đổi mật khẩu/khóa/thu hồi phiên phải ảnh hưởng cả phiên HTTP và socket theo thao tác tương ứng. |
| BR-16 | PostgreSQL chỉ có một writer EngLive trong kiến trúc hiện tại. Không tự bật nhiều replica/PM2 cluster hoặc sửa DB trực tiếp trong khi web sử dụng cache. |
| BR-17 | Khôi phục hoặc chuyển nguồn dữ liệu phải dừng writer; giữ backup trước thao tác. Quay lại JSON phải xuất dữ liệu PG mới nhất, không lấy JSON cũ làm nguồn mặc định. |
| BR-18 | PDF/bản ghi được giữ lại sau khi lớp bị xóa để admin quản lý kho; thời gian lưu giữ/xóa vĩnh viễn chưa được chốt. |
| BR-19 | Hạn mức AI và dung lượng phải được kiểm tra phía server; lời gọi/ghi tệp bị từ chối phải báo rõ cho người dùng được phép. |
| BR-20 | Cloudflare Quick Tunnel chỉ là cách cấp đường truy cập thử; link đổi không làm đổi ID lớp/tài khoản nhưng có thể yêu cầu cập nhật callback của tích hợp ngoài. |
| BR-21 | Chính sách hiện hành: đăng ký chấp nhận mật khẩu 6–128 ký tự, đổi mật khẩu yêu cầu 8–128 ký tự; tên tối đa 100 ký tự sau trim và phải không rỗng theo yêu cầu. Phiên đăng nhập được cấp hạn 7 ngày. Cần thống nhất chính sách mật khẩu production trước phát hành. |
| BR-22 | Giới hạn auth hiện tại là 30 lượt/phút theo req.ip, dùng chung cho đăng ký/đăng nhập. Mô hình giới hạn sau proxy phải được sửa trước khi xem là đạt FR-IAM-07. |
| BR-23 | Ngày chọn provider dùng giờ Việt Nam; quota AI hiện tính ngày theo UTC. Cần công bố hoặc thống nhất múi giờ reset quota khi vận hành, không suy rằng mọi bộ đếm dùng cùng một múi giờ. |

## 7. Yêu cầu dữ liệu

### 7.1. Nhóm dữ liệu nghiệp vụ

| Nhóm/bảng | Dữ liệu chính | Quan hệ hoặc ràng buộc |
|---|---|---|
| users | ID, tên, email, role, status, hash mật khẩu, thời điểm tạo | Email chuẩn hóa duy nhất; role hợp lệ |
| classes | ID, tên, trình độ, mô tả, mã lớp, giáo viên, maxStudents | Giáo viên tồn tại; mã lớp duy nhất |
| class_memberships | class_id, user_id, trạng thái member/pending/assistant kỹ thuật | Khóa tổ hợp, FK user/lớp; assistant không phải actor phạm vi hiện tại |
| class_sessions | Lớp, vị trí lịch sử, bản ghi từng buổi | Lịch sử theo lớp; chứa dữ liệu chuyên cần/điểm/slide snapshot |
| lessons | Chủ sở hữu, trình độ, cấu trúc scene, lớp được gắn, trạng thái sinh | Nội dung linh hoạt JSONB; kiểm tra quyền ứng dụng |
| schedules | Lớp, thời gian, nội dung lịch | FK lớp, kiểm tra xung đột theo nghiệp vụ |
| assignments | Lớp, đề/câu hỏi, hạn nộp, chính sách làm bài | FK lớp; đáp án chỉ gửi theo quyền |
| submissions | Bài tập, học sinh, lượt làm, điểm và nhận xét | FK bài tập/user; bản ghi gốc duy nhất cho cặp bài tập–học sinh theo mô hình hiện hành |
| activity_results | Kết quả hoạt động trực tiếp và thông tin luyện lại | FK lớp; câu trả lời giới hạn theo quyền |
| vocabulary | User, từ, nghĩa, ví dụ, trạng thái học | Kho cá nhân theo user |
| chats | User, lớp/bài, loại hội thoại, tiêu đề, ghim, tin nhắn | Chủ sở hữu và quyền lớp được kiểm tra mỗi lần |
| pdfs, recordings, listening | Metadata tài nguyên và thông tin tệp | Byte ở file riêng; PDF/recording có thể còn sau xóa lớp |
| settings | Hạn mức và cấu hình hệ thống | Phần lưu hiện hành được mã hóa trước ghi DB |
| runtime_entries | Phiên, Zoom OAuth, snapshots, usage và trường bổ trợ | Theo entry; phần nhạy cảm được mã hóa, key phiên không lưu trực tiếp dưới dạng bearer |
| audit | Tác nhân, thao tác, đối tượng, thời gian | Chỉ admin đọc theo chức năng quản trị |
| schema_migrations, storage_meta, imports | Phiên bản schema, thông tin khởi tạo/cutover/import | Phục vụ vận hành và xác minh dữ liệu |

### 7.2. Toàn vẹn và vòng đời

- Mỗi entity có ID ổn định. Cutover phải giữ ID, hash mật khẩu và liên kết nghiệp vụ.
- FK/unique bảo vệ các quan hệ có trong schema; các điều kiện như đủ sĩ số, quyền và xung đột lịch còn phải được kiểm tra ở server.
- Mỗi lần flush các dòng thay đổi được ghi trong transaction. Nếu transaction lỗi, không báo lưu thành công; ứng dụng phải phản ánh tình trạng lưu trữ lỗi và yêu cầu kiểm tra/restart.
- Không coi JSONB là quyền bỏ qua kiểm tra cấu trúc: scene, câu hỏi, trạng thái và trường có giới hạn vẫn phải được chuẩn hóa phía server.
- Xóa lớp dọn dữ liệu học tập liên quan theo BR-18; tài nguyên lưu trữ còn lại không được tự trở thành công khai.
- Dữ liệu backup và dữ liệu nguồn cũ phải được phân biệt rõ với nguồn đang phục vụ ứng dụng.

### 7.3. Bảo vệ và sao lưu

- Hash mật khẩu dùng cơ chế scrypt hiện hành; không lưu mật khẩu đăng nhập dạng rõ.
- Runtime PostgreSQL mã hóa settings và các entry bổ trợ bằng AES-256-GCM; khóa giải mã tách DB, đặt ngoài Git và giới hạn quyền đọc tệp.
- Không mặc định mọi dữ liệu trong DB đều được mã hóa: tên, email, bài làm, hội thoại và metadata nghiệp vụ cần chính sách bảo vệ/backup riêng.
- Backup JSON xuất dữ liệu có thể chứa cấu hình hoặc token dạng rõ; bảo vệ như dữ liệu bí mật.
- Sao lưu database không thay thế sao lưu PDF/video/audio; sao lưu DB mã hóa không thay thế sao lưu khóa giải mã an toàn.
- Hiện có backup khởi động/hằng ngày, giữ các bản xoay vòng theo mã hiện hành. Chính sách lưu lâu dài, xóa dữ liệu theo yêu cầu và lịch sao lưu ngoài máy cần được chủ dự án chốt.

## 8. Giao diện và tích hợp

### 8.1. Các màn hình chính

| Màn hình | Mục đích |
|---|---|
| index | Trang giới thiệu và đăng ký/đăng nhập |
| admin | Tổng quan, tài khoản, lớp, lịch, tài nguyên, hạn mức, nhật ký/backup |
| teacher | Lớp phụ trách, quản lý học sinh, liên kết Zoom và mở buổi |
| student | Lớp đã tham gia/chờ duyệt, trạng thái buổi và vào học |
| lessons | Danh sách, tạo và chỉnh sửa bài giảng |
| live | Video, trình chiếu, hoạt động, chat và công cụ lớp trực tiếp |
| learning | Lịch, bài tập, bài nộp, kết quả, từ vựng, tài khoản |
| tutor | Hội thoại AI và luyện tập |
| devices | Kiểm tra camera, mic, loa theo trình duyệt |
| ai-settings, video-settings | Cấu hình dịch vụ, chỉ admin có quyền phù hợp |

Yêu cầu giao diện: menu, typography, trạng thái tải/lỗi và điều hướng phải nhất quán; danh sách lớn có tìm/lọc/phân trang; nút thao tác quan trọng có nhãn rõ. Xóa/khôi phục hoặc thay dịch vụ đang dùng phải thể hiện ảnh hưởng phù hợp.

### 8.2. Nhóm API và sự kiện

| Nhóm | Ví dụ điểm tích hợp | Yêu cầu |
|---|---|---|
| Tài khoản | /api/register, /api/login, /api/me, /api/me/password | Kiểm tra input, phiên, trạng thái và vai trò |
| Lớp | /api/classes, /api/join, requests/students/live | Kiểm tra quyền và thành viên trên server |
| Bài giảng | /api/lessons, upload, outline, generate, regenerate | Sở hữu bài, quota và chuẩn hóa scene |
| Học tập | /api/learning, schedules, assignments, submissions, vocabulary | Trả dữ liệu theo quyền người yêu cầu |
| AI | /api/ai/chat, chats, lookup, extract, settings | Quota, ngữ cảnh, không lộ đáp án/bí mật |
| Media | /api/livekit/token, /api/zoom/join, PDFs/recordings/listening | Phiên hợp lệ, quyền lớp, kiểm tra socket khi cấp token video |
| Admin | /api/admin/* | Chỉ admin; kiểm tra lại các điều kiện nghiệp vụ |
| Health | /healthz | Cho biết khả năng đáp ứng/driver, không lộ thông tin kết nối bí mật |
| Socket.IO | room:join, lesson/slide/activity, chat, quyền phát biểu | Xác minh phiên, lớp, trạng thái và payload cho từng nhóm sự kiện |

Đây là bản đồ nhóm tích hợp, không thay thế hợp đồng API đầy đủ. Client phải xử lý bị thu hồi phiên, 4xx/5xx, reconnect và dữ liệu cũ; không suy luận “thành công” chỉ vì request đã gửi.

### 8.3. Yêu cầu riêng theo provider

- **Zoom:** dùng Meeting SDK, OAuth/PKCE theo cấu hình callback và ZAK cho host. Không đưa Client Secret/refresh token ra client. Không coi tài khoản EngLive tự động là tài khoản Zoom; giáo viên cần liên kết tài khoản được phép. Hành vi room, quyền phát biểu, share và recording phải kiểm thử trên SDK thật.
- **LiveKit:** token gắn đúng room và quyền publish/subscribe; quyền điều khiển học sinh cập nhật theo trạng thái lớp. Cloud hoặc self-host phải truy cập được từ thiết bị học sinh.
- **P2P:** chỉ là phương án hỗ trợ theo cấu hình; hoạt động qua mạng khác có thể cần hạ tầng ICE/TURN. Không có yêu cầu tự chuyển mọi lỗi video sang P2P.
- **AI:** giao tiếp với endpoint tương thích hiện có. Quản trị viên chọn nhà cung cấp/model; không đặt model cố định thành yêu cầu nghiệp vụ. Server local như 9Router phải chạy trên máy truy cập được từ backend.
- **Tunnel:** hostname tạm không phải domain vĩnh viễn hoặc cam kết uptime. Callback OAuth public phải khớp hostname hiện hành; không tự sửa tài khoản Zoom khi link đổi.

## 9. Yêu cầu phi chức năng

Các mục có nhãn “đề xuất” là **mục tiêu nghiệm thu cần xác nhận**, chưa phải số đo đã đạt.

| Mã | Thuộc tính | Yêu cầu/tiêu chí | Mức đáp ứng hiện tại |
|---|---|---|---|
| NFR-SEC-01 | Kiểm soát truy cập | Mọi API/socket có dữ liệu riêng phải xác thực và phân quyền; kiểm thử đổi ID, vai trò, token hết hạn và người ngoài lớp. | Có nền tảng/ca kiểm thử; cần rà soát bảo mật mở rộng |
| NFR-SEC-02 | Bí mật | Không đưa secret/refresh token/khóa giải mã lên client, Git, URL hoặc log; token host chỉ đến đúng giáo viên. | Có mã hóa/lọc; dữ liệu mẫu và cấu hình production vẫn cần xử lý |
| NFR-SEC-03 | An toàn trình duyệt | Khi public phải dùng HTTPS, kiểm soát tệp/input/hiển thị nội dung và cấu hình proxy tin cậy đúng topology. | Một phần; proxy và hardening production còn việc |
| NFR-SEC-04 | Không có demo production | Không công khai nút, tài khoản và mật khẩu demo; không seed demo khi khởi tạo môi trường production. | Chưa hoàn tất |
| NFR-DAT-01 | Tính toàn vẹn | Transaction lỗi phải rollback; import/cutover đối chiếu dữ liệu đọc lại; không có hai writer độc lập ghi đè nhau. | Đã có kiểm thử PostgreSQL thật |
| NFR-DAT-02 | Khôi phục | Có bản sao database, media và khóa; thử restore sang môi trường riêng. Mục tiêu đề xuất RPO ≤24 giờ, RTO ≤2 giờ cho beta. | Công cụ có; chưa nghiệm thu RPO/RTO và bản sao ngoài máy |
| NFR-PER-01 | Độ trễ nghiệp vụ | Mục tiêu đề xuất p95 ≤1 giây cho API thông thường, loại trừ AI/upload/media, đo tại tải beta đã chốt. | Chưa đo/duyệt ngưỡng |
| NFR-PER-02 | Đồng bộ tương tác | Mục tiêu đề xuất p95 ≤500 ms cho slide/chat/trạng thái hoạt động trong điều kiện mạng thử được mô tả. | Chưa nghiệm thu video/đường truyền thực tế |
| NFR-PER-03 | Tạo bài bằng AI | Mục tiêu mong muốn khoảng 1–2 phút cho cấu hình bài mẫu đã chốt; phải báo tiến độ và lỗi khi vượt hạn/nhà cung cấp chậm. | Phụ thuộc model/độ dài tài liệu; chưa coi là SLA |
| NFR-CAP-01 | Năng lực tải | Mục tiêu mở rộng cần xác nhận: 10 lớp cùng lúc, mỗi lớp 30 học sinh và 1 giáo viên, tổng khoảng 310 người. | Chưa kiểm chứng; không suy từ kiểm thử Socket.IO hoặc số hàng DB |
| NFR-AVL-01 | Tính sẵn sàng | Mục tiêu đề xuất beta ≥99% trong khung giờ phục vụ đã thỏa thuận; có health/giám sát và quy trình sự cố. | Chạy máy nhà/tunnel không bảo đảm; cần hạ tầng vận hành |
| NFR-USA-01 | Dễ sử dụng | Ba vai trò có điều hướng rõ, thông báo lỗi tiếng Việt và trạng thái chờ/thành công/thất bại; không yêu cầu học sinh cấu hình kỹ thuật. | Có giao diện, cần kiểm thử với người dùng thật |
| NFR-COM-01 | Tương thích | Kiểm thử các phiên bản trình duyệt mục tiêu trên desktop/mobile; công bố giới hạn mic/cam/share/nhận dạng giọng nói. | Có responsive; chưa ma trận nghiệm thu đầy đủ |
| NFR-ACC-01 | Khả năng tiếp cận | Mục tiêu đề xuất: thao tác chính dùng bàn phím, nhãn rõ cho nút biểu tượng, focus thấy được, nội dung không chỉ dựa vào màu. | Chưa audit tiếp cận riêng |
| NFR-MAI-01 | Bảo trì | Mã module hóa, migration có phiên bản, tài liệu vận hành, test tự động và rollback được kiểm tra. | Có nền tảng; lớp lưu còn tương thích đồng bộ |
| NFR-OBS-01 | Giám sát | Ghi nhật ký an toàn, phát hiện DB lỗi/dung lượng thấp/dịch vụ video hoặc AI không sẵn sàng; có người tiếp nhận cảnh báo. | Nhật ký/health có; cảnh báo tập trung là đề xuất |
| NFR-PRI-01 | Quyền riêng tư | Thông báo mục đích lưu dữ liệu, bản ghi và dữ liệu gửi cho provider; chốt người được xem, thời gian giữ và cơ chế xử lý yêu cầu xóa. | Chưa chốt chính sách sản phẩm |

Không dùng các ngưỡng đề xuất để kết luận sản phẩm đã đáp ứng. Biên bản thử tải phải ghi cấu hình server, DB, provider, số lớp/người, bitrate, thời lượng, mạng và tỷ lệ lỗi.

## 10. Tiêu chí nghiệm thu và truy vết

### 10.1. Bộ tình huống tối thiểu

| Mã nghiệm thu | Điều kiện/thao tác | Kết quả mong đợi | Yêu cầu liên quan |
|---|---|---|---|
| AC-01 | Khách đăng ký role admin hoặc gửi tên toàn dấu cách | Từ chối, không tạo bản ghi | FR-IAM-01, FR-IAM-02 |
| AC-02 | Giáo viên chờ duyệt/bị khóa đăng nhập | Không cấp quyền sử dụng; thông báo trạng thái | FR-IAM-03, FR-IAM-04 |
| AC-03 | Hai người qua tunnel đăng nhập đồng thời; có burst từ người khác | Không gộp sai tất cả vào một IP client | FR-IAM-07, NFR-SEC-03 |
| AC-04 | Học sinh biết classId nhưng không phải thành viên/chưa duyệt | Không lấy được nội dung riêng hoặc token video | FR-CLS-08, FR-VID-05 |
| AC-05 | Thêm/duyệt khi lớp đã đủ sĩ số | Server từ chối, sĩ số không tăng | FR-CLS-05 |
| AC-06 | Tạo lịch trùng lớp/giáo viên hoặc chuỗi lặp có xung đột | Không tạo lịch sai/chuỗi ghi dở | FR-SCH-02, FR-SCH-03 |
| AC-07 | Sinh bài từ tài liệu mẫu, sửa và tạo lại một scene | Nội dung lưu đúng, bám nguồn, quyền sửa đúng | FR-LES-01 đến FR-LES-07 |
| AC-08 | Giáo viên mở Zoom khi chưa liên kết/sai email hoặc lớp khác đã dùng chủ trì | Chặn trước bước host theo điều kiện; không cấp nhầm quyền | FR-VID-04, FR-VID-06 |
| AC-09 | Cấp token video bằng phiên không có socket được nhận vào lớp | Từ chối; học sinh không nhận ZAK/host | FR-VID-05 |
| AC-10 | Người vào muộn, reconnect lúc đang có hoạt động | Nhận trạng thái hiện hành, không nhận đáp án chưa chốt | FR-LIV-02 đến FR-LIV-05 |
| AC-11 | Trả lời sau hạn, gửi trùng hoặc luyện lại | Không nhận muộn/không cộng điểm trùng | FR-LIV-05 |
| AC-12 | AI được hỏi về đáp án chưa công bố hoặc hội thoại khác user | Không tiết lộ đáp án/hội thoại riêng | FR-AI-01, FR-AI-04, FR-LIV-04 |
| AC-13 | Học sinh vượt lượt/quá hạn hoặc sửa bài đã khóa/chấm | Từ chối tại server, giữ dữ liệu hợp lệ | FR-HW-03 đến FR-HW-06 |
| AC-14 | Kết thúc buổi có/không có slide nội dung đã chiếu | Lịch sử đúng; chỉ xem lại bản chụp được phép | FR-REV-01 đến FR-REV-03 |
| AC-15 | Đăng xuất/đổi mật khẩu/thu hồi phiên rồi gọi lại API/socket cũ | Phiên không tiếp tục có quyền trái chính sách | FR-IAM-06 |
| AC-16 | Dừng/khởi động lại server; mở lại báo cáo và bài tập | Dữ liệu đã lưu được đọc lại; không coi media/nhóm là đã tự phục hồi toàn bộ | FR-OPS-01, FR-REV-01 |
| AC-17 | Cố chạy writer thứ hai hoặc mô phỏng lỗi transaction | Chặn writer; rollback và không báo lưu thành công | FR-OPS-02, FR-OPS-03 |
| AC-18 | Backup, đổi dữ liệu thử, restore và rollback trên môi trường QA | Dữ liệu đúng bản; phiên cũ bị thu hồi; JSON rollback là bản mới nhất đã xuất | FR-OPS-04, FR-OPS-05 |
| AC-19 | Tải tệp quá quota/không có quyền và gọi URL trực tiếp | Từ chối, không lộ tệp riêng, server vẫn hoạt động | FR-REV-04, FR-ADM-04 |
| AC-20 | Bấm file tunnel, dừng và tạo lại | Không mở trùng web; link/trạng thái trong tệp đúng phiên hiện hành | FR-OPS-06 |
| AC-21 | Tổ chức các buổi video thật trên trình duyệt/mạng mục tiêu | Host/join/mic/cam/share/kết nối lại phù hợp từng provider | FR-LIV-07, FR-VID-01 đến FR-VID-06, NFR-COM-01 |
| AC-22 | Chạy tải mục tiêu đã thống nhất và thử khôi phục ngoài máy | Có số đo p95/tỷ lệ lỗi/chi phí và đạt ngưỡng đã duyệt | NFR-PER-01, NFR-PER-02, NFR-CAP-01, NFR-DAT-02 |

### 10.2. Mức bằng chứng tại thời điểm lập

- Ghi nhận phiên triển khai PostgreSQL gần nhất: **81 ca kiểm tra trong chế độ JSON và cùng 81 ca trong chế độ PostgreSQL thật/schema QA đều đạt**.
- Kiểm thử runtime PostgreSQL đã bao gồm mã hóa, chống writer thứ hai, chỉ ghi dòng thay đổi, đọc sau restart, backup/restore, thu hồi phiên và rollback về JSON mới nhất.
- AI và media trong bộ tích hợp sử dụng dịch vụ giả lập; số ca đạt không thay thế nghiệm thu Zoom/LiveKit thật, an toàn toàn hệ thống hoặc tải 310 người.
- Một số tiêu chí SRS cố ý ghi nhận khoảng trống hiện có: AC-01/AC-03 và các mục hardening/công khai không được đánh dấu đạt chỉ vì bộ smoke test qua.
- Lập SRS không chạy lại toàn bộ kiểm thử hoặc thực hiện pentest; bằng chứng trên được dẫn từ ghi nhận phát triển và cấu trúc test của repository.

### 10.3. Điều kiện phát hành đề xuất

**Beta nhóm giới hạn:** xử lý các lỗ hổng/quyền P0 đã biết, bỏ demo public, có backup/restore đã thử, hoàn thành một chu trình dạy/học bằng video thật và có người hỗ trợ khi sự cố.

**Vận hành công khai:** ngoài điều kiện beta, cần domain/HTTPS ổn định, cấu hình provider production hợp lệ, bảo vệ bí mật, khôi phục ngoài máy, chính sách dữ liệu, giám sát và nghiệm thu tải phù hợp số lớp bán/cho phép sử dụng. Chưa mặc định cam kết khả dụng 24/7 hoặc 10 lớp đồng thời.

## 11. Giới hạn, rủi ro và yêu cầu chưa triển khai

### 11.1. Khoảng trống đã ghi nhận

| Mã | Vấn đề/giới hạn | Ảnh hưởng và hướng xử lý |
|---|---|---|
| GAP-01 | Bản giao diện hiện đọc đã gỡ nút/thông tin đăng nhập demo; mã seed vẫn có tài khoản mẫu và chưa nghiệm thu vô hiệu toàn bộ credential thử | Không coi bỏ nút là đã khóa tài khoản. Phải tách demo/production và đổi hoặc vô hiệu tài khoản mẫu trước chia sẻ rộng |
| GAP-02 | Kiểm tra tên trước trim chưa loại mọi chuỗi trắng | Có thể tạo tài khoản/lớp tên rỗng; cần sửa validation và bổ sung regression test |
| GAP-03 | Rate limit auth dựa req.ip, chưa xử lý proxy đúng topology | Người dùng qua tunnel có thể bị tính chung; cần trust proxy an toàn, không tin header tùy ý |
| GAP-04 | Cache và bridge chờ đồng bộ một writer | Chưa phù hợp bật nhiều server; cần repository async/phối hợp realtime nếu mở rộng |
| GAP-05 | Backup và tệp còn chủ yếu trên máy phục vụ | Mất ổ đĩa/máy có thể ảnh hưởng đồng thời dữ liệu và backup; cần sao lưu độc lập và thử restore |
| GAP-06 | Camera/mic/share/recording và mạng đa thiết bị chưa nghiệm thu đầy đủ | Cần ma trận thử riêng từng provider, không dùng mock làm bằng chứng media thật |
| GAP-07 | Quick Tunnel có link tạm, máy nhà có thể sleep/tắt/mất mạng | Không dùng làm cam kết domain cố định/uptime; callback thay đổi cần xử lý |
| GAP-08 | Zoom và LiveKit không có mức điều khiển giống hệt nhau | Giao diện/hướng dẫn phải phân biệt; không hứa chuyển provider giữ nguyên mọi quyền media |
| GAP-09 | AI dựa vào model, prompt và dịch vụ bên ngoài | Giáo viên cần duyệt nội dung; cần đánh giá sai đáp án, lệch tài liệu và prompt injection |
| GAP-10 | Chính sách dữ liệu và thời gian lưu chưa chốt | Cần xác định bản ghi, bài làm, chat, backup và quyền xóa trước khi vận hành công khai |

### 11.2. Yêu cầu giai đoạn sau — chưa cam kết triển khai

| Mã | Đề xuất | Điều kiện cần xác nhận |
|---|---|---|
| FUT-01 | Quên mật khẩu qua email và xác minh email | SMTP, mẫu thư, token một lần, thời hạn và chống lạm dụng |
| FUT-02 | Nhắc lịch qua email/Web Push khi đóng web | Kênh gửi, sự đồng ý, múi giờ và chính sách nhắc |
| FUT-03 | API phân trang/tìm kiếm server cho dữ liệu lớn | Quy mô lớp/bài/chats và chỉ tiêu truy vấn |
| FUT-04 | Repository bất đồng bộ, nhiều server và phân phối trạng thái | Kiến trúc cache/socket, khóa nghiệp vụ, giới hạn kết nối và vận hành |
| FUT-05 | Object storage và backup ngoài máy được tự động hóa | Nhà cung cấp, ngân sách, retention và kiểm thử restore |
| FUT-06 | Tổng kết bài học, ghi chú cá nhân và báo cáo tiến bộ nâng cao | Đối tượng sử dụng, công thức đánh giá và quyền chia sẻ |
| FUT-07 | Chính sách quyền riêng tư, quy trình hỗ trợ và quản lý bản ghi | Thông tin thu thập, bên nhận dữ liệu và người chịu trách nhiệm |

### 11.3. Quyết định còn mở

1. Quy mô beta, số giờ phục vụ và ngưỡng tải được phép.
2. Trình duyệt/thiết bị chính thức được hỗ trợ.
3. Provider video mặc định cho production, quyền/app và ngân sách sử dụng thật.
4. RPO/RTO, lịch sao lưu ngoài máy và thời gian lưu bản ghi/tài liệu.
5. Ngưỡng hiệu năng và quy trình hỗ trợ khi không vào được lớp.
6. Cách vô hiệu dữ liệu demo và quản lý đăng ký khi mở công khai.

Mọi mở rộng phạm vi hoặc thay ngưỡng nghiệm thu phải cập nhật phiên bản SRS, mã yêu cầu liên quan và ca kiểm thử. Bản nháp này chưa thay thế việc chủ dự án xác nhận các quyết định trên.

## 12. Thuật ngữ và tài liệu đối chiếu

### 12.1. Thuật ngữ

| Thuật ngữ | Ý nghĩa trong tài liệu |
|---|---|
| SRS | Đặc tả yêu cầu phần mềm |
| Scene | Đơn vị nội dung hoặc hoạt động trong bài giảng |
| Buổi học/session | Một lần lớp được mở để dạy/học, có lịch sử và kết quả riêng |
| Membership | Quan hệ người học với lớp, phân biệt chờ duyệt và thành viên |
| Provider | Dịch vụ video hoặc AI được chọn |
| ZAK | Token Zoom dùng cho xác thực quyền người dùng chủ trì theo luồng SDK |
| Publish/subscribe | Quyền phát và nhận luồng media |
| Snapshot | Bản chụp trạng thái phục vụ xem lại hoặc phục hồi nghiệp vụ |
| Cutover | Thời điểm chuyển nguồn ghi chính từ hệ thống lưu cũ sang mới |
| Rollback | Quay lại phương án lưu đã xác định, phải bảo toàn dữ liệu mới nhất |
| RPO | Mức mất dữ liệu tối đa cho phép, tính theo thời gian |
| RTO | Thời gian khôi phục dịch vụ mục tiêu |
| p95 | 95% mẫu đo có giá trị không vượt ngưỡng tương ứng |
| QA | Môi trường/dữ liệu dành cho kiểm thử, tách khỏi người dùng thật |

### 12.2. Nguồn đối chiếu trong repository

Các đường dẫn dưới đây là chứng cứ triển khai tại thời điểm lập, không phải hợp đồng API công khai và không chứa thông tin kết nối bí mật.

| Nội dung | Tệp đối chiếu |
|---|---|
| Bối cảnh, quyết định và trạng thái mới nhất | [PROJECT.md](../PROJECT.md), [README.md](../README.md) |
| Tài khoản, lớp, điều kiện vào buổi, cấp quyền chung | [server.js](../server.js), [class-capacity.js](../class-capacity.js) |
| Admin, lịch, bài tập, kết quả, từ vựng | [operations.js](../operations.js), [exercises.js](../exercises.js) |
| Bài giảng/AI/trình chiếu | [lessons.js](../lessons.js), [present.js](../present.js), [aiRoutes.js](../aiRoutes.js) |
| Media và cấu hình provider | [video.js](../video.js), [zoom.js](../zoom.js), [livekit.js](../livekit.js) |
| Tài nguyên và tương tác | [recordings.js](../recordings.js), [pdfshare.js](../pdfshare.js), [listening.js](../listening.js), [interact.js](../interact.js) |
| Database, mã hóa và vận hành | [db.js](../db.js), [database/runtime.js](../database/runtime.js), [database/USAGE.md](../database/USAGE.md) |
| Kiểm thử | [tests/smoke.js](../tests/smoke.js), [tests/operations-smoke.js](../tests/operations-smoke.js), [tests/postgres-runtime.js](../tests/postgres-runtime.js), [tests/postgres-app.js](../tests/postgres-app.js) |
| Chia sẻ web thử nghiệm | [MO-LINK-WEB.cmd](../MO-LINK-WEB.cmd), [scripts/tunnel.ps1](../scripts/tunnel.ps1) |

Không đưa mật khẩu, secret, bearer token, khóa giải mã hoặc bản sao dữ liệu người học thật vào tài liệu SRS hay phụ lục chia sẻ.
