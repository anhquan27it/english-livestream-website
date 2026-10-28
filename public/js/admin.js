const me = Auth.require('admin');
const TABS = { overview:'Tổng quan',users:'Tài khoản',classes:'Lớp học',schedule:'Thời khóa biểu',media:'Tài liệu & bản ghi',settings:'Hệ thống',audit:'Nhật ký' };
const tabFromHash = () => { const h = location.hash.slice(1); return TABS[h] ? h : 'overview'; };
let data = null, tab = tabFromHash();
const $ = id => document.getElementById(id);
const roleName = { admin: 'Admin', teacher: 'Giáo viên', assistant: 'Trợ giảng', student: 'Học sinh' };
const statusName = { active: 'Hoạt động', pending: 'Chờ duyệt', blocked: 'Đã khóa' };
const table = (headers, rows) => `<div class="op-scroll"><table class="op-table"><thead><tr>${headers.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${headers.length}">Chưa có dữ liệu.</td></tr>`}</tbody></table></div>`;
const button = (action, id, label) => `<button class="btn btn-outline btn-sm" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
const lkOnline = () => { const s = data.livekit.stats; return !data.livekit.enabled ? '—' : s && s.participants != null ? s.participants : '?'; };
const card = (title, body) => `<section class="card op-card"><h2>${title}</h2>${body}</section>`;
if (me) { buildSidebar('admin', tab); setupShell(me); addEventListener('hashchange', () => { tab = tabFromHash(); if (data) render(); }); $('refresh').onclick = load; load(); }
async function load() {
  try { data = await api('/api/admin/overview'); $('error').textContent = ''; render(); }
  catch (e) { $('error').textContent = e.message; }
}
function render() {
  $('stats').innerHTML = [['Tài khoản',data.users.length],['Chờ duyệt',data.users.filter(u=>u.status==='pending').length],['Lớp học',data.classes.length],['Đang live',data.lives.length],['Người online (LiveKit)',lkOnline()]].map(([title,n])=>`<div class="stat"><div><b>${n}</b><small>${title}</small></div></div>`).join('');
  // Mục đang chọn ở thanh bên trái (mỗi tab là một mục riêng, đổi qua #hash)
  document.querySelectorAll('#sidebar .side-nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '/admin.html#' + tab));
  $('pageTitle').textContent = TABS[tab];
  $('stats').style.display = tab === 'overview' ? '' : 'none';
  let html = '';
  if (tab === 'overview') html = pendingCard() + card('Buổi học đang hoạt động', table(['Lớp','Buổi học','Học sinh','Bắt đầu',''],data.lives.map(l=>`<tr><td>${esc(data.classes.find(c=>c.id===l.classId)?.name)}</td><td>${esc(l.title)} · ${esc(l.provider || '—')}${l.recovered?' · đã khôi phục':''}</td><td>${l.viewers}</td><td>${esc(new Date(l.startedAt).toLocaleString('vi-VN'))}</td><td>${button('end',l.classId,'Kết thúc')}</td></tr>`))) + card('Video & hạ tầng', `<p>Dịch vụ các buổi mở hôm nay: <b>${esc(data.video?.provider || (data.livekit.enabled?'LiveKit':'WebRTC P2P'))}</b></p><a class="btn btn-outline" href="/video-settings.html">Cấu hình Zoom / LiveKit</a><p>LiveKit: ${esc(data.livekit.url || 'Chưa cấu hình')}</p>${lkStatsHtml()}<p>Tệp đã lưu: ${(data.storageBytes/1048576).toFixed(1)} / ${data.limits.storageMB} MB</p><p class="op-note">Đây là dung lượng tệp trên máy chủ. Hạn mức Cloud thật cần xem tại nhà cung cấp.</p><a class="btn btn-primary" href="/ai-settings.html">Cấu hình AI</a>`);
  if (tab === 'users') html = card('Tài khoản', table(['Tên / Email','Vai trò','Trạng thái','Thao tác'],data.users.map(u=>`<tr><td><b>${esc(u.name)}</b><br>${esc(u.email)}</td><td>${roleName[u.role]}</td><td>${statusName[u.status]}</td><td><div class="op-actions">${button('user',u.id,'Quản lý')}${button('revoke',u.id,'Thu hồi phiên')}${button('password',u.id,'Đặt mật khẩu')}</div></td></tr>`)));
  if (tab === 'classes') html = card('Lớp học (' + data.classes.length + ')', '<div class="op-toolbar"><button class="btn btn-primary" data-action="newclass" data-id="">+ Tạo lớp mới</button></div>' + table(['Lớp','Giáo viên','Học sinh','Trợ giảng','Trạng thái',''],data.classes.map(c=>{const live=data.lives.find(l=>l.classId===c.id);return `<tr><td><b>${esc(c.name)}</b><br><small>${esc(c.level)} · mã ${esc(c.code)}</small></td><td>${esc(data.users.find(u=>u.id===c.teacherId)?.name||'—')}</td><td>${c.studentIds.length}/${c.maxStudents || Math.max(30,c.studentIds.length)}${c.pendingIds.length?' <small>(+'+c.pendingIds.length+' chờ)</small>':''}</td><td>${(c.assistantIds||[]).map(id=>esc(data.users.find(u=>u.id===id)?.name)).join(', ')||'—'}</td><td>${live?'<span class="badge-live">LIVE · '+live.viewers+'</span>':'—'}</td><td><div class="op-actions">${button('editclass',c.id,'Sửa')}${button('class',c.id,'Phân công')}${button('students',c.id,'Học sinh')}${button('newsched',c.id,'Thêm lịch')}${button('delclass',c.id,'Xóa')}</div></td></tr>`;})));
  if (tab === 'schedule') html = scheduleHtml();
  if (tab === 'media') html = card('Tài liệu và bản ghi',table(['Loại','Tên','Dung lượng',''],[...data.recordings.map(r=>({...r,kind:'recordings',name:r.title})),...data.pdfs.map(r=>({...r,kind:'pdfs'}))].map(f=>`<tr><td>${f.kind==='pdfs'?'PDF':'Bản ghi'}</td><td>${esc(f.name)}</td><td>${(f.size/1048576).toFixed(1)} MB</td><td>${button('media',f.kind+'/'+f.id,'Xóa')}</td></tr>`)));
  if (tab === 'settings') html = card('Hạn mức ứng dụng', `<form id="limits" class="op-form">${Object.entries({chatPerDay:'Lượt hỏi AI / tài khoản / ngày UTC',generationsPerDay:'Tác vụ soạn AI / tài khoản / ngày UTC',maxParticipants:'Tổng người / lớp (gồm giáo viên)',storageMB:'Tổng dung lượng PDF và bản ghi (MB)'}).map(([k,label])=>`<label>${label}<input class="input" name="${k}" type="number" min="1" value="${data.limits[k]}" required></label>`).join('')}<button class="btn btn-primary">Lưu giới hạn</button></form><p class="op-note">Giới hạn này do EngLive áp dụng; tăng ở đây không nâng gói LiveKit Cloud.</p>`) + card('Sao lưu dữ liệu', `<p>Tự động mỗi 24 giờ khi server chạy; giữ 14 bản gần nhất. JSON chứa dữ liệu và cấu hình nhạy cảm: chỉ admin tải được.</p><p class="op-note">PDF và video phải sao lưu riêng. Khôi phục bằng lệnh khi server đã dừng; xem README.</p>${button('backup','','Tạo bản sao ngay')}${data.backups.map(n=>`<p>${esc(n)} ${button('download',n,'Tải xuống')}</p>`).join('')}`) + card('Sử dụng AI hôm nay (UTC)', aiTotals() + table(['Tài khoản','Hỏi đáp','Soạn bài'],data.users.map(u=>{const v=data.usage[new Date().toISOString().slice(0,10)+':'+u.id]||{};return `<tr><td>${esc(u.name)}</td><td>${v.chat||0}</td><td>${v.generation||0}</td></tr>`;})));
  if (tab === 'audit') html = card('100 thao tác gần đây',table(['Thời gian','Người thực hiện','Thao tác','Đối tượng'],data.audit.map(a=>`<tr><td>${esc(new Date(a.at).toLocaleString('vi-VN'))}</td><td>${esc(a.actorName||'Hệ thống')}</td><td>${esc(a.action)}</td><td>${esc(a.target)} ${esc(a.detail||'')}</td></tr>`)));
  $('content').innerHTML = html;
  $('content').querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>act(b.dataset.action,b.dataset.id).catch(e=>toast(e.message,'error')));
  if ($('limits')) $('limits').onsubmit = async e => { e.preventDefault(); try { await api('/api/admin/limits',{method:'PUT',body:Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,Number(v)]))}); toast('Đã lưu','success'); await load(); } catch(e){toast(e.message,'error');} };
}
const fmtDay = ms => new Date(ms).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtTime = ms => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
function scheduleHtml() {
  const className = id => data.classes.find(c => c.id === id)?.name || '—';
  const teacherOf = id => { const c = data.classes.find(c => c.id === id); return data.users.find(u => u.id === (c && c.teacherId))?.name || '—'; };
  const row = s => `<tr><td><b>${esc(fmtDay(s.startsAt))}</b><br>${esc(fmtTime(s.startsAt))} – ${esc(fmtTime(s.endsAt))}</td><td>${esc(className(s.classId))}</td><td>${esc(teacherOf(s.classId))}</td><td>${esc(s.title)}</td><td>${button('delsched', s.id, 'Xóa')}</td></tr>`;
  const now = Date.now(), head = ['Thời gian','Lớp','Giáo viên','Nội dung',''];
  const upcoming = data.schedules.filter(s => s.endsAt > now), past = data.schedules.filter(s => s.endsAt <= now).slice(-10).reverse();
  return card('Lịch sắp tới (' + upcoming.length + ')', '<div class="op-toolbar"><button class="btn btn-primary" data-action="newsched" data-id="">+ Thêm lịch học</button></div>' + table(head, upcoming.map(row)))
    + card('Đã qua (10 gần nhất)', table(head, past.map(row)));
}
function lkStatsHtml() {
  const k = data.livekit;
  if (!k.enabled) return '<p class="op-note">Đang dùng P2P: máy giáo viên gửi hình tới từng học sinh, hợp lớp nhỏ.</p>';
  const s = k.stats;
  if (!s || s.error) return '<p class="op-note">Không đọc được số liệu từ LiveKit' + (s && s.error ? ' (' + esc(s.error) + ')' : '') + '. Kiểm tra URL/khoá hoặc mạng.</p>';
  return '<p>Đang có <b>' + s.rooms + '</b> phòng, <b>' + s.participants + '</b> người online.</p><p class="op-note">Gói LiveKit có giới hạn số người cùng lúc cho cả project (xem trang Usage của LiveKit). Số này gồm cả giáo viên.</p>';
}
function pendingCard() {
  const p = data.users.filter(u => u.status === 'pending');
  if (!p.length) return '';
  return card('Chờ duyệt (' + p.length + ')', table(['Tên / Email','Vai trò','Thao tác'], p.map(u => '<tr><td><b>' + esc(u.name) + '</b><br>' + esc(u.email) + '</td><td>' + roleName[u.role] + '</td><td><div class="op-actions">' + button('approve', u.id, 'Duyệt') + button('user', u.id, 'Quản lý') + '</div></td></tr>')));
}
function aiTotals() {
  const day = new Date().toISOString().slice(0, 10) + ':';
  let chat = 0, gen = 0;
  Object.entries(data.usage || {}).forEach(([k, v]) => { if (k.startsWith(day)) { chat += v.chat || 0; gen += v.generation || 0; } });
  return '<p>Tổng hôm nay: <b>' + chat + '</b> lượt hỏi đáp, <b>' + gen + '</b> tác vụ soạn bài.</p>';
}
function formModal(title, body, save) {
  const m=openModal(`<h3>${title}</h3><form class="op-form">${body}<div class="form-error" role="alert"></div><button class="btn btn-primary">Lưu</button></form>`);
  m.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit],button');b.disabled=true;try{await save(new FormData(e.target));m.close();await load();}catch(err){m.querySelector('.form-error').textContent=err.message;b.disabled=false;}};
}
async function act(action,id) {
  if(action==='newclass'||action==='editclass') {
    const c = action==='editclass' ? data.classes.find(c=>c.id===id) : null, teachers = data.users.filter(u=>['teacher','admin'].includes(u.role)&&u.status==='active');
    if (!teachers.length) throw new Error('Chưa có giáo viên đang hoạt động. Duyệt hoặc tạo giáo viên ở mục Tài khoản trước.');
    const levels = ['A1','A2','B1','B2','C1','C2','IELTS','TOEIC','Kids'];
    formModal(c ? 'Sửa lớp ' + esc(c.name) : 'Tạo lớp mới', `<label>Tên lớp<input class="input" name="name" maxlength="120" required value="${c ? esc(c.name) : ''}"></label>
      <label>Trình độ<select class="input" name="level">${levels.map(l=>`<option ${(c?c.level:'B1')===l?'selected':''}>${l}</option>`).join('')}</select></label>
      ${c ? '' : `<label>Giáo viên phụ trách<select class="input" name="teacherId">${teachers.map(u=>`<option value="${u.id}">${esc(u.name)} (${roleName[u.role]})</option>`).join('')}</select></label>`}
      <label>Sĩ số tối đa<input class="input" name="maxStudents" type="number" min="1" max="1000" required value="${c ? (c.maxStudents || Math.max(30,c.studentIds.length)) : 30}"></label>
      <label>Mô tả<textarea class="input" name="description" maxlength="500" rows="3">${c ? esc(c.description||'') : ''}</textarea></label>`,
      fd => c ? api('/api/admin/classes/'+id,{method:'PATCH',body:Object.fromEntries(fd)}) : api('/api/admin/classes',{method:'POST',body:Object.fromEntries(fd)}));
    return;
  }
  if(action==='newsched') {
    if (!data.classes.length) throw new Error('Hãy tạo lớp trước.');
    const d = new Date(Date.now() + 86400000), day = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    formModal('Thêm lịch học', `<label>Lớp<select class="input" name="classId">${data.classes.map(c=>`<option value="${c.id}" ${c.id===id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>Nội dung buổi học<input class="input" name="title" maxlength="120" required placeholder="VD: Unit 5 — Hobbies"></label>
      <label>Ngày<input class="input" name="day" type="date" required value="${day}"></label>
      <label>Bắt đầu<input class="input" name="from" type="time" required value="19:00"></label>
      <label>Kết thúc<input class="input" name="to" type="time" required value="20:30"></label>
      <label>Lặp lại hằng tuần (số buổi, 1 = không lặp)<input class="input" name="repeatWeeks" type="number" min="1" max="26" value="1"></label>
      <p class="op-note">Hệ thống từ chối nếu trùng lịch của lớp hoặc của giáo viên phụ trách.</p>`,
      fd => { const startsAt = new Date(fd.get('day') + 'T' + fd.get('from')).getTime(), endsAt = new Date(fd.get('day') + 'T' + fd.get('to')).getTime();
        return api('/api/learning/schedules',{method:'POST',body:{classId:fd.get('classId'),title:fd.get('title'),startsAt,endsAt,repeatWeeks:Number(fd.get('repeatWeeks'))||1}}); });
    return;
  }
  if(action==='delclass') {
    const c = data.classes.find(c=>c.id===id);
    if(!(await confirmModal('Xóa lớp "'+c.name+'"?','Lịch học, bài tập, bài nộp và kết quả của lớp sẽ bị xóa; buổi live đang chạy bị kết thúc. Bản ghi và PDF vẫn còn ở mục Tài liệu & bản ghi. Không hoàn tác được.','Xóa lớp')))return;
    await api('/api/admin/classes/'+id,{method:'DELETE'}); toast('Đã xóa lớp','success'); await load(); return;
  }
  if(action==='delsched') {
    if(!(await confirmModal('Xóa buổi học này khỏi lịch?','','Xóa')))return;
    await api('/api/learning/schedules/'+id,{method:'DELETE'}); toast('Đã xóa lịch','success'); await load(); return;
  }
  if(action==='students') { const c=data.classes.find(c=>c.id===id); formModal('Học sinh lớp '+esc(c.name),`<div class="op-checks">${data.users.filter(u=>u.role==='student'&&u.status==='active').map(u=>`<label><input type="checkbox" name="studentIds" value="${u.id}" ${c.studentIds.includes(u.id)?'checked':''}>${esc(u.name)}${c.pendingIds.includes(u.id)?' (chờ duyệt)':''}</label>`).join('')}</div><p class="op-note">Không đổi thành viên khi lớp đang live. Tích chọn học sinh chờ duyệt để thêm vào lớp.</p>`,fd=>api('/api/admin/classes/'+id,{method:'PATCH',body:{studentIds:fd.getAll('studentIds')}}));return; }
  if(action==='user') { const u=data.users.find(u=>u.id===id); formModal('Quản lý '+esc(u.name),`<label>Vai trò<select class="input" name="role">${Object.entries(roleName).map(([v,n])=>`<option value="${v}" ${u.role===v?'selected':''}>${n}</option>`).join('')}</select></label><label>Trạng thái<select class="input" name="status">${Object.entries(statusName).map(([v,n])=>`<option value="${v}" ${u.status===v?'selected':''}>${n}</option>`).join('')}</select></label>`,fd=>api('/api/admin/users/'+id,{method:'PATCH',body:Object.fromEntries(fd)}));return; }
  if(action==='class') { const c=data.classes.find(c=>c.id===id); formModal('Phân công '+esc(c.name),`<label>Giáo viên<select class="input" name="teacherId">${data.users.filter(u=>['teacher','admin'].includes(u.role)&&u.status==='active').map(u=>`<option value="${u.id}" ${c.teacherId===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label><div class="op-checks">${data.users.filter(u=>u.role==='assistant'&&u.status==='active').map(u=>`<label><input type="checkbox" name="assistantIds" value="${u.id}" ${(c.assistantIds||[]).includes(u.id)?'checked':''}>${esc(u.name)}</label>`).join('')||'Chưa có trợ giảng. Đổi vai trò ở tab Tài khoản để thêm.'}</div>`,fd=>api('/api/admin/classes/'+id,{method:'PATCH',body:{teacherId:fd.get('teacherId'),assistantIds:fd.getAll('assistantIds')}}));return; }
  if(action==='password') { formModal('Đặt mật khẩu mới','<label>Mật khẩu (8–128 ký tự)<input class="input" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><p class="op-note">Các phiên hiện tại sẽ bị thu hồi. Chuyển mật khẩu cho chủ tài khoản qua kênh riêng.</p>',fd=>api('/api/admin/users/'+id+'/password',{method:'POST',body:Object.fromEntries(fd)}));return; }
  if(action==='approve') {await api('/api/admin/users/'+id,{method:'PATCH',body:{status:'active'}});toast('Đã duyệt','success');await load();return;}
  if(action==='download') {const res=await fetch('/api/admin/backups/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+Auth.token}});if(!res.ok)throw new Error('Không tải được bản sao.');const url=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=url;a.download=id;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
  if(action==='backup') {await api('/api/admin/backups',{method:'POST'});toast('Đã sao lưu','success');await load();return;}
  if(!(await confirmModal('Xác nhận thao tác?',action==='end'?'Tất cả người tham gia sẽ rời buổi học.':action==='media'?'Tệp sẽ bị xóa khỏi máy chủ.':'Người dùng phải đăng nhập lại.','Xác nhận')))return;
  if(action==='end')await api('/api/admin/classes/'+id+'/live',{method:'DELETE'});
  if(action==='media')await api('/api/admin/media/'+id,{method:'DELETE'});
  if(action==='revoke')await api('/api/admin/users/'+id,{method:'PATCH',body:{revokeSessions:true}});
  await load();
}
