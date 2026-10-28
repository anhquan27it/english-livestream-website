// Zoom có thể dùng mã 3000 cho nhiều lỗi; giữ lý do thay vì đoán theo mã.
const ZoomErrors = (() => {
  function safeReason(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/https?:\/\/\S+/gi, '[đường dẫn đã ẩn]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g, '[token đã ẩn]')
      .replace(/\b(signature|access_token|refresh_token|client_secret|password|passWord|passcode|zak|tk|ztk)\s*[:=]\s*[^\s,;]+/gi, '$1=[đã ẩn]')
      .replace(/[\r\n\t]+/g, ' ').trim().slice(0, 500);
  }
  function message(error) {
    const code = Number(error?.errorCode ?? error?.error ?? 0);
    const reason = safeReason(error?.errorMessage || error?.reason || error?.message || error?.result?.errorMessage || '');
    let hint;
    if (code === 3004 || /wrong.*password|incorrect.*pass(code|word)/i.test(reason)) hint = 'Nhập passcode đúng của cuộc họp trong cấu hình lớp, rồi mở lại buổi học để nhận cấu hình mới.';
    else if ([3001, 3610, 3707].includes(code)) hint = 'Kiểm tra Meeting ID đã gán có đúng với cuộc họp Zoom đang mở không.';
    else if (code === 3008) hint = 'Chủ trì cần bắt đầu đúng cuộc họp Zoom trước.';
    else if ([3005, 3711].includes(code) || /other meetings? in progress|another meeting running/i.test(reason)) hint = 'Tài khoản Zoom có cuộc họp khác đang chạy. Kết thúc cuộc họp khác và giữ lại đúng phòng của lớp.';
    else if (code === 10000 || /version.*(unsupported|not.*supported|no longer supported)/i.test(reason)) hint = 'Zoom yêu cầu nâng phiên bản Meeting SDK. Cần cập nhật thư viện trong EngLive.';
    else if ([3704, 3710, 3712].includes(code)) hint = 'Kiểm tra cặp Client ID/Secret cùng ứng dụng và môi trường Development/Production; Meeting SDK cần được bật.';
    else if ([4011, 4012, 4013, 4014, 4015, 4017, 4018].includes(code)) hint = 'Zoom yêu cầu xác thực hoặc quyền truy cập bổ sung. Kiểm tra tài khoản sở hữu app và cuộc họp; có thể cần ZAK/OBF hoặc xét duyệt app.';
    else hint = 'Chưa đủ thông tin để xác định nguyên nhân. Kiểm tra thông báo Zoom bên dưới; chưa cần tạo lại ứng dụng hay đổi khóa.';
    return 'Chưa vào được Zoom' + (Number.isFinite(code) && code ? ' (mã ' + code + ')' : '') + '. ' + hint + (reason ? '\nZoom: ' + reason : '\nZoom không trả lý do chi tiết.') + '\nBấm Kết nối Zoom để thử lại.';
  }
  return { message, safeReason };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ZoomErrors;
