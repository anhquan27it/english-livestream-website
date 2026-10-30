const express = require('express');
const { createTranslator } = require('./translation');
const { analyze } = require('./public/js/text-selection');

function createRouter({ auth, translate = createTranslator(), pronounce = require('./pronunciation').createPronunciation(), now = Date.now }) {
  const router = express.Router(), rate = new Map();
  let active = 0;
  function limit(req, res, next) {
    const time = now(), key = req.path + ':' + req.user.id;
    for (const [id, entry] of rate) if (time - entry.start >= 60000) rate.delete(id);
    const entry = rate.get(key) || { start: time, count: 0 };
    if (entry.count >= 30 || active >= 4) {
      res.set('Retry-After', '60');
      return res.status(429).json({ error: 'Bạn tra cứu hơi nhanh. Hãy đợi một chút rồi thử lại.' });
    }
    entry.count++; rate.set(key, entry); active++;
    let released = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once('finish', release); res.once('close', release);
    next();
  }
  function validText(req, res, next) {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!analyze(text).valid) return res.status(400).json({ error: 'Hãy chọn trọn từ hoặc câu tiếng Anh (tối đa 2.000 ký tự).' });
    req.translationText = text;
    next();
  }
  router.post('/api/pronunciation', auth(), validText, limit, async (req, res) => {
    const text = req.translationText;
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', onClose);
    try { res.json(await pronounce(text, { signal: controller.signal })); }
    catch { if (!res.destroyed) res.status(502).json({ error: 'Chưa tải được dữ liệu phiên âm. Hãy thử lại.' }); }
    finally { res.off('close', onClose); }
  });
  router.post('/api/translate', auth(), validText, limit, async (req, res) => {
    const text = req.translationText;
    try {
      let pronunciation = await pronounce(text, { lookupUnknown: false });
      if (pronunciation.recognized === false) pronunciation = await pronounce(text);
      if (pronunciation.recognized === false) return res.status(422).json({ error: 'Chưa nhận diện được từ tiếng Anh trong vùng chọn. Hãy chọn trọn từ hoặc thêm ngữ cảnh.' });
      res.json({ translation: await translate(text), provider: 'linguist-google' });
    }
    catch { res.status(502).json({ error: 'Dịch vụ dịch đang bận hoặc mất kết nối. Hãy thử lại sau.' }); }
  });
  return router;
}
module.exports = { createRouter };
