// Lớp bảo vệ chung: header bảo mật cho mọi trang/API và giới hạn tốc độ sự kiện Socket.IO.
// Không dùng thư viện ngoài để dễ đọc; chỉnh nguồn được phép ở CSP khi thêm CDN/dịch vụ mới.

// Gốc (origin) của máy chủ LiveKit đã cấu hình, ở cả dạng ws(s) và http(s) (SDK gọi cả hai)
function livekitOrigins(url) {
  if (!url) return [];
  try {
    const u = new URL(url);
    const secure = u.protocol === 'wss:' || u.protocol === 'https:';
    return [(secure ? 'wss://' : 'ws://') + u.host, (secure ? 'https://' : 'http://') + u.host];
  } catch { return []; }
}

function csp({ livekitUrl } = {}) {
  const connect = ["'self'", 'wss://*.livekit.cloud', 'https://*.livekit.cloud', ...livekitOrigins(livekitUrl), 'https://cdnjs.cloudflare.com'];
  return [
    "default-src 'self'",
    "script-src 'self' https://unpkg.com https://cdnjs.cloudflare.com", // lucide (icon), pdf.js
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // nhiều thuộc tính style="" trong HTML sinh từ JS
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob: mediastream:",
    'connect-src ' + [...new Set(connect)].join(' '),
    "worker-src 'self' blob: https://cdnjs.cloudflare.com",
    "frame-src 'self'", // iframe Zoom cùng nguồn (zoom-embed.html)
    "frame-ancestors 'self'", // chống nhúng trang vào web khác (clickjacking)
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

// Middleware header. Trang nhúng Zoom tải SDK/WASM từ Zoom nên chỉ giữ chống nhúng, không áp CSP chặt.
function headers({ getLivekitUrl } = {}) {
  let cachedFor = null, cachedPolicy = '';
  return (req, res, next) => {
    const lkUrl = getLivekitUrl ? getLivekitUrl() : '';
    if (lkUrl !== cachedFor) { cachedFor = lkUrl; cachedPolicy = csp({ livekitUrl: lkUrl }); }
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self), fullscreen=(self), autoplay=(self), geolocation=(), payment=(), usb=()',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (req.path === '/zoom-embed.html') res.set('Content-Security-Policy', "frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
    else res.set('Content-Security-Policy', cachedPolicy);
    // Chỉ bật HSTS khi người dùng thật sự vào bằng HTTPS (Cloudflare/proxy báo qua X-Forwarded-Proto)
    if (req.secure || req.get('x-forwarded-proto') === 'https') res.set('Strict-Transport-Security', 'max-age=15552000');
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store'); // dữ liệu cá nhân không lưu cache
    next();
  };
}

// ----- Giới hạn tốc độ Socket.IO -----
// Mỗi kết nối có một "xô" sự kiện: tối đa BURST sự kiện liền một lúc, nạp lại RATE sự kiện/giây.
// Quá giới hạn: sự kiện bị bỏ (ack nhận lỗi), người gửi được báo; spam dồn dập quá mức thì ngắt kết nối.
const LIMITS = { rate: 30, burst: 300, kickDropped: 1500, kickWindowMs: 10000, notifyEveryMs: 3000 };
// Chat riêng chặt hơn: cách nhau ≥ 350 ms và tối đa 6 tin / 8 giây cho mỗi người
const CHAT = { minGapMs: 350, max: 6, windowMs: 8000 };

function limitSocket(socket, opts = LIMITS) {
  const b = { tokens: opts.burst, at: Date.now(), dropped: 0, since: Date.now(), notified: 0 };
  socket.use((packet, next) => {
    const now = Date.now();
    b.tokens = Math.min(opts.burst, b.tokens + ((now - b.at) / 1000) * opts.rate);
    b.at = now;
    if (b.tokens >= 1) { b.tokens -= 1; return next(); }
    if (now - b.since > opts.kickWindowMs) { b.since = now; b.dropped = 0; }
    b.dropped++;
    const ack = packet[packet.length - 1];
    if (typeof ack === 'function') ack({ error: 'Bạn thao tác quá nhanh, hãy chậm lại một chút.' });
    if (now - b.notified > opts.notifyEveryMs) { b.notified = now; socket.emit('rate:limited', { event: String(packet[0]).slice(0, 40) }); }
    if (b.dropped > opts.kickDropped) { console.warn('[socket] ngắt kết nối vì spam sự kiện', socket.data && socket.data.user && socket.data.user.id); socket.disconnect(true); }
    // không gọi next(): sự kiện bị bỏ
  });
}

// Trả về true nếu tin chat được phép gửi
function allowChat(socket, now = Date.now()) {
  const d = socket.data;
  d.chatTimes = (d.chatTimes || []).filter((t) => now - t < CHAT.windowMs);
  if ((d.chatTimes.length && now - d.chatTimes[d.chatTimes.length - 1] < CHAT.minGapMs) || d.chatTimes.length >= CHAT.max) return false;
  d.chatTimes.push(now);
  return true;
}

module.exports = { headers, csp, limitSocket, allowChat, LIMITS, CHAT };
