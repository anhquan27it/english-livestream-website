const ZoomUrls = (() => {
  const loopback = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  function callback(origin) {
    const url = new URL(origin);
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
    return url.origin + '/api/zoom/oauth/callback';
  }
  // Chỉ quay lại origin đã bắt đầu OAuth; cho phép hai tên loopback cùng cổng.
  function returnOrigin(origin, redirectUri) {
    if (typeof origin !== 'string') return '';
    try {
      const start = new URL(origin), target = new URL(redirectUri);
      if (start.origin !== origin || start.origin === target.origin) return '';
      if (loopback(start.hostname) && loopback(target.hostname) && start.protocol === target.protocol && start.port === target.port) return start.origin;
    } catch {}
    return '';
  }
  return { callback, returnOrigin };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ZoomUrls;
