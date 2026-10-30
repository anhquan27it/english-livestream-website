// Load private credentials with Node's native --env-file support (Node 24).
const required = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length || !/^wss:\/\/[^/]+\.livekit\.cloud\/?$/.test(process.env.LIVEKIT_URL || '')) {
  console.error('Dien LIVEKIT_URL (wss://<project>.livekit.cloud), LIVEKIT_API_KEY va LIVEKIT_API_SECRET trong data/cloud.env.');
  process.exit(1);
}
process.env.LIVEKIT_DEV = '0';
process.env.CHATTERBOX_PRELOAD ??= '1';
require('../server');
