// Mock máy chủ OpenAI-compatible để kiểm thử khi không có 9Router/khoá API thật.
// Chạy riêng: node tests/mock-llm.js [port]   (mặc định 20199)
const http = require('http');

const LAYOUTS = ['bullets', 'rule', 'table', 'dialogue', 'passage'];
const TITLES = ['Warm-up', 'Key vocabulary', 'Grammar focus', 'Practice', 'Dialogue', 'Recap'];

function sceneJson(type, title, layout, excerpt) {
  if (type === 'quiz') return { title, question: `Which word means "đi du lịch"? (${title})`, options: ['travel', 'cook', 'sleep', 'paint'], answer: 0, explanation: '"travel" nghĩa là đi du lịch.', note: 'Hỏi cả lớp trước khi chốt.' };
  if (type === 'poll') return { title, question: 'Where do you want to travel next?', options: ['Japan', 'France', 'Vietnam'], note: 'Mở đầu thân thiện.' };
  if (type === 'match') return { title, instruction: 'Match the words with their meanings.', pairs: [{ left: 'airport', right: 'sân bay' }, { left: 'ticket', right: 'vé' }, { left: 'luggage', right: 'hành lý' }, { left: 'passport', right: 'hộ chiếu' }], note: 'Cho 1 phút.' };
  if (type === 'fill') return { title, sentence: 'I ___ to Japan last year.', answers: [['went']], hint: 'go', note: 'Điền từ.' };
  if (type === 'speak') return { title, sentence: 'Where is the departure gate?', translation: 'Cổng khởi hành ở đâu?', note: 'Đọc to.' };
  if (type === 'order') return { title, sentence: 'I am going to travel to Japan.', translation: 'Tôi sắp đi du lịch Nhật Bản.', note: 'Gợi ý cấu trúc be going to.' };
  if (layout === 'rule') return { title, emoji: '📐', layout, rule: { name: 'Past Simple', formula: 'Subject + V2', explanation: 'Dùng cho hành động đã xong.', examples: ['I travelled to Japan.'] }, bullets: ['Use V2 for regular and irregular verbs.'], note: `Giải thích công thức. [excerpt:${excerpt}]` };
  if (layout === 'table') return { title, emoji: '📊', layout, table: { headers: ['Verb', 'Past'], rows: [['go', 'went'], ['buy', 'bought']] }, note: `Đọc bảng. [excerpt:${excerpt}]` };
  if (layout === 'dialogue') return { title, emoji: '💬', layout, dialogue: [{ speaker: 'A', text: 'Where is your luggage?' }, { speaker: 'B', text: 'It is at the gate.' }], note: `Đóng vai. [excerpt:${excerpt}]` };
  if (layout === 'passage') return { title, emoji: '📖', layout, passage: 'I booked a **ticket** to Japan. The **airport** was busy.', vocab: [{ word: 'ticket', ipa: '/ˈtɪk.ɪt/', meaning: 'vé', example: 'I have a ticket.' }], note: `Đọc cả lớp. [excerpt:${excerpt}]` };
  return { title, emoji: '✈️', layout: layout || 'bullets', bullets: ['Travel makes us curious.', 'We book tickets online.', 'Pack light for short trips.'], vocab: [{ word: 'luggage', ipa: '/ˈlʌɡ.ɪdʒ/', meaning: 'hành lý', example: 'My luggage is heavy.' }], note: `Giới thiệu chủ đề trong 2 phút. [excerpt:${excerpt}]` };
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
      scenes.push({ type: isInter ? kinds[scenes.length % kinds.length] : 'slide', layout: LAYOUTS[i % LAYOUTS.length], title: `${TITLES[i % TITLES.length]} ${i + 1}`, goal: 'Teach or test the topic.', source: ['Section 1'] });
    }
    if (/OFFTOPIC/.test(last)) return JSON.stringify({ scope_ok: false, scope_reason: 'Chủ đề là toán học, không phải tiếng Anh.', scenes: [] });
    return '```json\n' + JSON.stringify({ scope_ok: true, scope_reason: '', scenes }) + '\n```';
  }
  if (/Write ONE scene/.test(last)) {
    const type = (/type "(\w+)"/.exec(last) || [])[1];
    const title = (/title "([^"]+)"/.exec(last) || [])[1];
    if (process.env.MOCK_FAIL_TITLE && title === process.env.MOCK_FAIL_TITLE) return 'Sorry, I cannot do that.';
    const layout = (/layout: "(\w+)"/.exec(last) || [])[1];
    return JSON.stringify(sceneJson(type, title, layout, /Source excerpt for this scene/.test(last)));
  }
  // chat: phản hồi cho biết ngữ cảnh có đáp án hay không để test không lộ đáp án
  const correct = (system.match(/^Correct: /gm) || []).length;
  const bold = /bold/i.test(last) ? ' Try: **luggage** - hành lý. Please say: I lost my luggage.' : '';
  return `Mock tutor: ${last.slice(0, 60)} [ctx:correct=${correct}] [slide:${/CURRENT SLIDE/.test(system)}] [scope:${/SCOPE RULES/.test(system)}] [kind:${(system.match(/PRACTICE MODE.*?(ROLE-PLAY|CORRECTION|QUIZ) MODE/) || [])[1] || 'none'}]${bold}`;
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
