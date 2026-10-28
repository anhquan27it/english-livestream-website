// Chọn dịch vụ theo ngày Việt Nam; buổi đang chạy giữ nguyên lựa chọn đã chốt.
const store = require('./db');
const PROVIDERS = ['zoom', 'livekit'];
const day = (at = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function settings() {
  const s = store.data.settings;
  return s.video || (s.video = { dailyProviders: {}, meetings: [] });
}
const zoomConfig = () => {
  const z = settings().zoom || {};
  return { clientId: z.clientId || process.env.ZOOM_CLIENT_ID || '', clientSecret: z.clientSecret || process.env.ZOOM_CLIENT_SECRET || '', publicClientId: z.publicClientId || process.env.ZOOM_PUBLIC_CLIENT_ID || '', redirectUri: z.redirectUri || process.env.ZOOM_REDIRECT_URI || '' };
};
const provider = (lk, date = day()) => settings().dailyProviders?.[date] || settings().defaultProvider || (lk.enabled ? 'livekit' : 'p2p');
function select(lk, c, lives, selected = provider(lk)) {
  const date = day();
  if (selected === 'livekit' && !lk.enabled) throw new Error('Chưa cấu hình LiveKit. Admin cần cấu hình trước khi mở buổi học.');
  if (selected !== 'zoom') return { provider: selected, date };
  const z = zoomConfig();
  if (!z.clientId || !z.clientSecret) throw new Error('Admin cần nhập Client ID và Client Secret của ứng dụng Zoom Meeting SDK.');
  const rows = settings().meetings || [];
  const room = rows.find(r => r.classId === c.id && r.date === date) || rows.find(r => r.classId === c.id && !r.date);
  if (!room) throw new Error('Admin chưa gán phòng Zoom cho lớp này. Vào Quản trị → Phòng học trực tuyến.');
  if (c.studentIds.length + 1 > 100) throw new Error('Chế độ thử Zoom Basic chỉ hỗ trợ tối đa 100 người, gồm giáo viên.');
  for (const [id, live] of lives) {
    if (id === c.id || live.video?.provider !== 'zoom') continue;
    if (live.video.meetingNumber === room.meetingNumber || live.video.hostEmail === room.hostEmail) throw new Error('Phòng hoặc chủ trì Zoom này đang được một lớp khác sử dụng. Zoom Basic chỉ dùng một buổi cùng lúc cho mỗi chủ trì.');
  }
  return { ...room, provider: 'zoom', date };
}
function summary(lk) {
  const s = settings(), z = zoomConfig();
  return { today: day(), timeZone: 'Asia/Ho_Chi_Minh', defaultProvider: s.defaultProvider || (lk.enabled ? 'livekit' : 'p2p'), todayProvider: provider(lk), dailyProviders: s.dailyProviders || {}, meetings: (s.meetings || []).map(({ password, ...r }) => ({ ...r, hasPassword: !!password })), zoom: { clientId: z.clientId, publicClientId: z.publicClientId, hasSecret: !!z.clientSecret, redirectUri: z.redirectUri, ready: !!(z.clientId && z.clientSecret), sdkVersion: '6.2.0', freeTest: true }, livekitReady: lk.enabled };
}
module.exports = { PROVIDERS, day, validDay, settings, zoomConfig, provider, select, summary };
