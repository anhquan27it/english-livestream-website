// Chạy EngLive với mock LLM (không cần 9Router/khoá API) để thử giao diện: npm run dev:mock  -> http://localhost:3001
const path = require('path');
const { createServer } = require('./mock-llm');

process.env.PORT = process.env.PORT || '3001';
process.env.DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data-mock'); // tách khỏi dữ liệu thật
createServer().listen(20199, () => {
  process.env.AI_BASE_URL = 'http://localhost:20199/v1';
  process.env.AI_MODEL = 'ag/gemini-3.8-flash-high';
  console.log('Mock LLM: http://localhost:20199/v1 (trả nội dung mẫu, không phải AI thật)');
  require('../server.js');
});
