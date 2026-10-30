# Mở hệ thống trên Windows

1. Nhấp đúp **MO-HE-THONG.cmd** trong thư mục dự án.
2. Giữ cửa sổ terminal mở. Khi hiện `EngLive đang chạy`, vào http://localhost:3000.
3. Đăng nhập admin tại http://localhost:3000/?login=admin bằng thông tin đã cấu hình trên máy. Sau đăng nhập sẽ vào http://localhost:3000/admin.html.

LiveKit Cloud và AI tự nạp cấu hình từ `data/cloud.env`, không cần sao chép khóa mỗi lần chạy. Nếu 9Router chưa chạy, trình mở sẽ thử bật bản đã cài trên máy. Model và khóa AI đang dùng đã lưu trong cài đặt admin.

Nhấn **Ctrl+C** trong cửa sổ chạy để dừng website. Nếu website đang chạy nền từ lần cài đặt trước, chạy **DUNG-HE-THONG.cmd**, rồi mở **MO-HE-THONG.cmd**. Lệnh dừng không tắt 9Router. Dừng khi không có buổi học hoặc tác vụ soạn bài đang chạy.

Hoặc mở PowerShell tại thư mục dự án và chạy:

```powershell
npm run start:cloud
```

Cách chạy bằng npm yêu cầu 9Router đã mở nếu muốn dùng AI. Sau khi khởi động lại máy, dùng lại MO-HE-THONG.cmd. Không cần cài lại thư viện. Không chia sẻ thư mục `data/` vì chứa mật khẩu, khóa và dữ liệu học tập.

Giọng đọc văn bản dùng **Chatterbox Nano** chạy tại máy, ưu tiên tốc độ. Khi mở bằng `MO-HE-THONG.cmd`/`npm run start:cloud`, website tự nạp mô hình ở nền và giữ trong bộ nhớ; việc mở website không phải chờ mô hình nạp xong. Nếu bấm nghe ngay lúc mới mở, bạn có thể vẫn phải chờ phần nạp còn lại. Các lần đọc lại cùng nội dung dùng âm thanh đã lưu. Đóng hộp hoặc chọn nội dung khác sẽ dừng phát. Nếu có lỗi, thông báo hiện ngay trong hộp, không đổi sang giọng trình duyệt.

Thư viện, mô hình và âm thanh được lưu trong `data/chatterbox/`, không đưa vào Git. Trên máy mới, chạy `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-chatterbox.ps1` một lần để cài Nano (cần Internet để tải thư viện và trọng số; cấu hình hiện tại dùng PyTorch CUDA cho NVIDIA). Sau đó mở hệ thống như bình thường. Không xóa `data/chatterbox/` nếu muốn dùng lại mô hình đã tải. Có thể đặt `CHATTERBOX_PRELOAD=0` trong `data/cloud.env` để tắt nạp nền nếu cần dành bộ nhớ cho tác vụ khác.
