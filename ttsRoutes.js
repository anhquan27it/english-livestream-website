const express = require('express');
function createRouter({ auth, engine = require('./chatterbox').createChatterbox(), preload = process.env.CHATTERBOX_PRELOAD === '1' }) {
  const router = express.Router();
  if (preload) engine.warmup().catch(() => console.warn('[chatterbox] Chưa nạp được giọng đọc; có thể thử lại khi bấm nghe.'));
  router.get('/api/tts/status', auth(), (req, res) => res.json({ provider: 'chatterbox', model: engine.model?.() || 'nano', state: engine.status(), ...engine.details?.() }));
  router.post('/api/tts', auth(), async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 2000 || !/[a-z]/i.test(text)) return res.status(400).json({ error: 'Hãy chọn văn bản tiếng Anh, tối đa 2.000 ký tự.' });
    try {
      const wav = await engine.synthesize(text);
      if (res.destroyed) return;
      res.set({ 'Content-Type': 'audio/wav', 'Cache-Control': 'private, no-store', 'X-TTS-Provider': 'chatterbox', 'X-TTS-Model': engine.model?.() || 'nano' }).send(wav);
    } catch (error) {
      if (!res.destroyed) res.status(503).json({ error: error.message || 'Giọng Chatterbox chưa sẵn sàng. Hãy thử lại.' });
    }
  });
  return router;
}
module.exports = { createRouter };
