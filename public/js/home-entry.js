// Trang giới thiệu chỉ dành cho khách; phiên đã đăng nhập đi thẳng vào khu vực của mình.
(() => {
  function redirectSignedIn() {
    // Cho phép mở biểu mẫu admin khi trình duyệt đang có phiên giáo viên/học sinh.
    if (new URLSearchParams(location.search).get('login') === 'admin') return;
    const user = Auth.user;
    if (!Auth.token || !user) return;
    if (!['admin', 'teacher', 'assistant', 'student'].includes(user.role)) { Auth.clear(); return; }
    location.replace(Auth.home(user));
  }

  redirectSignedIn();
  addEventListener('pageshow', e => { if (e.persisted) redirectSignedIn(); });
  addEventListener('storage', e => {
    if (e.key === 'englive_token' || e.key === 'englive_user' || e.key === null) redirectSignedIn();
  });
})();
