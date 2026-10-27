// Chạy EngLive với LiveKit bật sẵn khoá dev (cần `npm run livekit:dev` đang chạy): npm run start:lk
process.env.LIVEKIT_DEV = process.env.LIVEKIT_DEV || '1';
require('../server.js');
