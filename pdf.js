// Trích văn bản từ tài liệu giáo viên tải lên (PDF, txt, md)
const MAX_CHARS = 60000;

async function extractPdf(buffer) {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = text.map((t) => t.replace(/[ \t]+\n/g, '\n').trim());
  return { pages: totalPages, text: pages.map((t, i) => (t ? `[Page ${i + 1}]\n${t}` : '')).filter(Boolean).join('\n\n') };
}

async function extractDocument(buffer, filename = '') {
  const name = String(filename).toLowerCase();
  let out;
  if (name.endsWith('.pdf') || buffer.slice(0, 5).toString() === '%PDF-') {
    out = await extractPdf(buffer);
  } else if (/\.(txt|md|markdown|text)$/.test(name)) {
    out = { pages: 1, text: buffer.toString('utf8') };
  } else {
    throw new Error('Chỉ hỗ trợ tệp PDF, TXT hoặc MD. Với Word, hãy lưu thành PDF hoặc dán nội dung vào ô văn bản.');
  }
  const text = out.text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('Không đọc được chữ trong tệp (có thể là PDF dạng ảnh scan). Hãy dán nội dung vào ô văn bản.');
  return { pages: out.pages, chars: text.length, truncated: text.length > MAX_CHARS, text: text.slice(0, MAX_CHARS) };
}

module.exports = { extractDocument, MAX_CHARS };
