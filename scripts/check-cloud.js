const { RoomServiceClient } = require('livekit-server-sdk');
async function main() {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
  if (!url || !key || !secret) throw new Error('Chua dien du 3 gia tri LiveKit trong data/cloud.env.');
  if (!/^wss:\/\/[^/]+\.livekit\.cloud\/?$/.test(url)) throw new Error('LIVEKIT_URL phai la wss://<project>.livekit.cloud.');
  const client = new RoomServiceClient(url.replace(/^wss:/, 'https:'), key, secret);
  await client.listRooms();
  console.log('LiveKit Cloud: xac thuc va ket noi API thanh cong. Khong tao phong.');
  console.log('Zoom SDK: ' + (process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET ? 'Da nhap khoa; can kiem tra OAuth va meeting that.' : 'Chua nhap khoa.'));
}
main().catch(() => {
  console.error('Chua xac minh duoc LiveKit Cloud. Kiem tra du 3 gia tri, URL, quyen API key va ket noi Internet.');
  process.exitCode = 1;
});
