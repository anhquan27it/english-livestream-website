// Như dev-mock.js nhưng bật LiveKit (cần `livekit-server --dev` đang chạy ở ws://localhost:7880): npm run dev:mock:lk  -> http://localhost:3001
process.env.LIVEKIT_DEV = '1';
require('./dev-mock.js');
