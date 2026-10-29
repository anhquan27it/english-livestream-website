// Hỏi đáp AI sau buổi học: chọn lớp + bài giảng đã được giáo viên gắn vào lớp
const me = Auth.require('student');
const params = new URLSearchParams(location.search);
let classes = [];
let classId = null;
let lessons = [];
let lessonId = null;
const $ = (id) => document.getElementById(id);

if (me) {
  buildSidebar('student', 'tutor');
  setupShell(me);
  init();
}

async function init() {
  try {
    classes = (await api('/api/classes')).classes.filter((c) => c.status === 'member');
  } catch (e) { return toast(e.message, 'error'); }
  if (!classes.length) {
    $('classSel').hidden = true;
    $('side').innerHTML = '';
    $('chat').innerHTML = '<div class="empty" style="margin:auto"><div class="emoji">🎒</div><b>Bạn chưa tham gia lớp nào</b>Hãy vào lớp của giáo viên để hỏi đáp về bài giảng.<br /><br /><a class="btn btn-primary" href="/student.html">Về trang chủ</a></div>';
    return icons();
  }
  classId = (classes.find((c) => c.id === params.get('class')) || classes[0]).id;
  $('classSel').innerHTML = classes.map((c) => `<option value="${c.id}" ${c.id === classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  $('classSel').onchange = () => { classId = $('classSel').value; lessonId = null; loadLessons(); };
  loadLessons(params.get('lesson'));
}

async function loadLessons(preferred) {
  try {
    const d = await api(`/api/classes/${classId}/lessons`);
    lessons = d.lessons;
    // Ưu tiên: bài được chọn qua link, bài đang live, rồi bài vừa dạy gần nhất
    lessonId = (lessons.find((l) => l.id === preferred) || lessons.find((l) => l.id === d.liveLessonId) || lessons[0] || {}).id || null;
  } catch (e) { toast(e.message, 'error'); lessons = []; }
  paint();
}

let pinned = [];
async function loadPinned() {
  try { pinned = (await api('/api/ai/chats?classId=' + encodeURIComponent(classId))).chats.filter((c) => c.pinned); } catch { pinned = []; }
  paintSide();
}

function paintSide() {
  $('side').innerHTML = `
    ${pinned.length ? `<div class="panel-heading" style="color:var(--muted);margin:0">📌 Hội thoại đã ghim</div><div class="t-pinned">${pinned.map((c) => `<button class="t-lesson" data-chat="${c.id}" data-lesson="${c.lessonId || ''}"><span class="ic tone-orange">📌</span><span><b>${esc(c.title)}</b><small>${esc(c.lessonTitle || 'Hỏi đáp chung')}</small></span></button>`).join('')}</div>` : ''}
    <div class="panel-heading" style="color:var(--muted);margin:0">Chọn chủ đề</div>
    ${lessons.map((l) => `<button class="t-lesson ${l.id === lessonId ? 'active' : ''}" data-id="${l.id}"><span class="ic tone-violet">📘</span><span><b>${esc(l.title)}</b><small>${l.taught ? 'Đã học ' + fmtDate(l.taught) : 'Chưa dạy'} · ${l.sceneCount} slide</small></span></button>`).join('')}
    <button class="t-lesson ${lessonId ? '' : 'active'}" data-id=""><span class="ic tone-orange">💬</span><span><b>Hỏi đáp chung</b><small>Luyện tiếng Anh, ngữ pháp, từ vựng</small></span></button>`;
  $('side').querySelectorAll('.t-lesson[data-id]').forEach((b) => (b.onclick = () => { lessonId = b.dataset.id || null; openChatId = null; mountChat(); paintSide(); }));
  $('side').querySelectorAll('.t-lesson[data-chat]').forEach((b) => (b.onclick = () => { lessonId = b.dataset.lesson || null; openChatId = b.dataset.chat; mountChat(); paintSide(); }));
  icons();
}

let openChatId = null;
function mountChat() {
  AiChat.mount($('chat'), { classId, lessonId, initialChatId: openChatId, onChatsChanged: loadPinned });
  openChatId = null;
}

function paint() { paintSide(); mountChat(); loadPinned(); }
