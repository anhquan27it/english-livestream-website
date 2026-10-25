// Mock máy chủ OpenAI-compatible để kiểm thử khi không có 9Router/khoá API thật.
// Chạy riêng: node tests/mock-llm.js [port]   (mặc định 20199)
const http = require('http');

const TITLES = ['Warm-up', 'Key vocabulary', 'Grammar focus', 'Practice', 'Dialogue', 'Recap'];

function sceneJson(type, title) {
  if (type === 'quiz') return { title, question: `Which word means "đi du lịch"? (${title})`, options: ['travel', 'cook', 'sleep', 'paint'], answer: 0, explanation: '"travel" nghĩa là đi du lịch.', note: 'Hỏi cả lớp trước khi chốt.' };
  if (type === 'poll') return { title, question: 'Where do you want to travel next?', options: ['Japan', 'France', 'Vietnam'], note: 'Mở đầu thân thiện.' };
  if (type === 'match') return { title, instruction: 'Match the words with their meanings.', pairs: [{ left: 'airport', right: 'sân bay' }, { left: 'ticket', right: 'vé' }, { left: 'luggage', right: 'hành lý' }, { left: 'passport', right: 'hộ chiếu' }], note: 'Cho 1 phút.' };
  if (type === 'order') return { title, sentence: 'I am going to travel to Japan.', translation: 'Tôi sắp đi du lịch Nhật Bản.', note: 'Gợi ý cấu trúc be going to.' };
  return { title, emoji: '✈️', bullets: ['Travel makes us curious.', 'We book tickets online.', 'Pack light for short trips.'], vocab: [{ word: 'luggage', ipa: '/ˈlʌɡ.ɪdʒ/', meaning: 'hành lý', example: 'My luggage is heavy.' }], note: 'Giới thiệu chủ đề trong 2 phút.' };
}

function reply(messages) {
  const last = messages[messages.length - 1].content;
  const system = (messages[0] && messages[0].role === 'system' && messages[0].content) || '';
  if (/Reply with exactly: OK/.test(last)) return 'OK';
  if (/Design the outline/.test(last)) {
    const total = +(/Total scenes: (\d+)/.exec(last) || [])[1] || 6;
    const inter = +(/Exactly (\d+) of them/.exec(last) || [])[1] || 2;
    const kinds = ['quiz', 'match', 'order', 'poll'];
    const scenes = [];
    for (let i = 0; i < total; i++) {
      const isInter = i > 0 && i < total - 1 && (i % 2 === 0) && scenes.filter((s) => s.type !== 'slide').length < inter;
      scenes.push({ type: isInter ? kinds[scenes.length % kinds.length] : 'slide', title: `${TITLES[i % TITLES.length]} ${i + 1}`, goal: 'Teach or test the topic.' });
    }
    return '```json\n' + JSON.stringify({ scenes }) + '\n```';
  }
  if (/Write ONE scene/.test(last)) {
    const type = (/type "(\w+)"/.exec(last) || [])[1];
    const title = (/title "([^"]+)"/.exec(last) || [])[1];
    if (process.env.MOCK_FAIL_TITLE && title === process.env.MOCK_FAIL_TITLE) return 'Sorry, I cannot do that.';
    return JSON.stringify(sceneJson(type, title));
  }
  // chat: phản hồi cho biết ngữ cảnh có đáp án hay không để test không lộ đáp án
  const correct = (system.match(/^Correct: /gm) || []).length;
  return `Mock tutor: ${last.slice(0, 60)} [ctx:correct=${correct}] [slide:${/CURRENT SLIDE/.test(system)}] [scope:${/SCOPE RULES/.test(system)}]`;
}

function createServer() {
  return http.createServer((req, res) => {
    const key = process.env.MOCK_KEY;
    if (key && req.headers.authorization !== 'Bearer ' + key) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'bad key' } }));
    }
    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'ag/gemini-3.8-flash-high' }, { id: 'ag/gemini-3.8-flash-low' }] }));
    }
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const j = JSON.parse(body);
        const content = reply(j.messages);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], model: j.model }));
      });
      return;
    }
    res.writeHead(404).end();
  });
}

if (require.main === module) {
  const port = +process.argv[2] || 20199;
  createServer().listen(port, () => console.log('Mock LLM tại http://localhost:' + port + '/v1'));
}

module.exports = { createServer };
