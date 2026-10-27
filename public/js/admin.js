const me = Auth.require('admin');
let data = null, tab = 'overview';
const $ = id => document.getElementById(id);
const roleName = { admin: 'Admin', teacher: 'Giáo viên', assistant: 'Trợ giảng', student: 'Học sinh' };
const statusName = { active: 'Hoạt động', pending: 'Chờ duyệt', blocked: 'Đã khóa' };
const table = (headers, rows) => `<div class="op-scroll"><table class="op-table"><thead><tr>${headers.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${headers.length}">Chưa có dữ liệu.</td></tr>`}</tbody></table></div>`;
const button = (action, id, label) => `<button class="btn btn-outline btn-sm" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
const lkOnline = () => { const s = data.livekit.stats; return !data.livekit.enabled ? '—' : s && s.participants != null ? s.participants : '?'; };
const card = (title, body) => `<section class="card op-card"><h2>${title}</h2>${body}</section>`;
if (me) { buildSidebar('admin', 'admin'); setupShell(me); $('refresh').onclick = load; load(); }
async function load() {
  try { data = await api('/api/admin/overview'); $('error').textContent = ''; render(); }
  catch (e) { $('error').textContent = e.message; }
}
function render() {
  $('stats').innerHTML = [['Tài khoản',data.users.length],['Chờ duyệt',data.users.filter(u=>u.status==='pending').length],['Lớp học',data.classes.length],['Đang live',data.lives.length],['Người online (LiveKit)',lkOnline()]].map(([title,n])=>`<div class="stat"><div><b>${n}</b><small>${title}</small></div></div>`).join('');
  $('tabs').innerHTML = Object.entries({ overview:'Tổng quan',users:'Tài khoản',classes:'Lớp học',media:'Tài liệu & bản ghi',settings:'Hệ thống',audit:'Nhật ký' }).map(([key,title])=>`<button data-tab="${key}" class="${tab===key?'active':''}">${title}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});
  let html = '';
  if (tab === 'overview') html = pendingCard() + card('Buổi học đang hoạt động', table(['Lớp','Buổi học','Học sinh','Bắt đầu',''],data.lives.map(l=>`<tr><td>${esc(data.classes.find(c=>c.id===l.classId)?.name)}</td><td>${esc(l.title)}${l.recovered?' · đã khôi phục':''}</td><td>${l.viewers}</td><td>${esc(new Date(l.startedAt).toLocaleString('vi-VN'))}</td><td>${button('end',l.classId,'Kết thúc')}</td></tr>`))) + card('Video & hạ tầng', `<p>Video: <b>${data.livekit.enabled?'LiveKit':'WebRTC P2P'}</b></p><p>${esc(data.livekit.url || 'Chưa cấu hình LiveKit')}</p>${lkStatsHtml()}<p>Tệp đã lưu: ${(data.storageBytes/1048576).toFixed(1)} / ${data.limits.storageMB} MB</p><p class="op-note">Đây là dung lượng tệp trên máy chủ. Hạn mức Cloud thật cần xem tại nhà cung cấp.</p><a class="btn btn-primary" href="/ai-settings.html">Cấu hình AI</a>`);
  if (tab === 'users') html = card('Tài khoản', table(['Tên / Email','Vai trò','Trạng thái','Thao tác'],data.users.map(u=>`<tr><td><b>${esc(u.name)}</b><br>${esc(u.email)}</td><td>${roleName[u.role]}</td><td>${statusName[u.status]}</td><td><div class="op-actions">${button('user',u.id,'Quản lý')}${button('revoke',u.id,'Thu hồi phiên')}${button('password',u.id,'Đặt mật khẩu')}</div></td></tr>`)));
  if (tab === 'classes') html = card('Phân công lớp học',table(['Lớp','Giáo viên','Học sinh','Trợ giảng',''],data.classes.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(data.users.find(u=>u.id===c.teacherId)?.name)}</td><td>${c.studentIds.length}</td><td>${(c.assistantIds||[]).map(id=>esc(data.users.find(u=>u.id===id)?.name)).join(', ')||'—'}</td><td><div class="op-actions">${button('class',c.id,'Phân công')}${button('students',c.id,'Học sinh')}</div></td></tr>`)));
  if (tab === 'media') html = card('Tài liệu và bản ghi',table(['Loại','Tên','Dung lượng',''],[...data.recordings.map(r=>({...r,kind:'recordings',name:r.title})),...data.pdfs.map(r=>({...r,kind:'pdfs'}))].map(f=>`<tr><td>${f.kind==='pdfs'?'PDF':'Bản ghi'}</td><td>${esc(f.name)}</td><td>${(f.size/1048576).toFixed(1)} MB</td><td>${button('media',f.kind+'/'+f.id,'Xóa')}</td></tr>`)));
  if (tab === 'settings') html = card('Hạn mức ứng dụng', `<form id="limits" class="op-form">${Object.entries({chatPerDay:'Lượt hỏi AI / tài khoản / ngày UTC',generationsPerDay:'Tác vụ soạn AI / tài khoản / ngày UTC',maxParticipants:'Tổng người / lớp (gồm giáo viên)',storageMB:'Tổng dung lượng PDF và bản ghi (MB)'}).map(([k,label])=>`<label>${label}<input class="input" name="${k}" type="number" min="1" value="${data.limits[k]}" required></label>`).join('')}<button class="btn btn-primary">Lưu giới hạn</button></form><p class="op-note">Giới hạn này do EngLive áp dụng; tăng ở đây không nâng gói LiveKit Cloud.</p>`) + card('Sao lưu dữ liệu', `<p>Tự động mỗi 24 giờ khi server chạy; giữ 14 bản gần nhất. JSON chứa dữ liệu và cấu hình nhạy cảm: chỉ admin tải được.</p><p class="op-note">PDF và video phải sao lưu riêng. Khôi phục bằng lệnh khi server đã dừng; xem README.</p>${button('backup','','Tạo bản sao ngay')}${data.backups.map(n=>`<p>${esc(n)} ${button('download',n,'Tải xuống')}</p>`).join('')}`) + card('Sử dụng AI hôm nay (UTC)', aiTotals() + table(['Tài khoản','Hỏi đáp','Soạn bài'],data.users.map(u=>{const v=data.usage[new Date().toISOString().slice(0,10)+':'+u.id]||{};return `<tr><td>${esc(u.name)}</td><td>${v.chat||0}</td><td>${v.generation||0}</td></tr>`;})));
  if (tab === 'audit') html = card('100 thao tác gần đây',table(['Thời gian','Người thực hiện','Thao tác','Đối tượng'],data.audit.map(a=>`<tr><td>${esc(new Date(a.at).toLocaleString('vi-VN'))}</td><td>${esc(a.actorName||'Hệ thống')}</td><td>${esc(a.action)}</td><td>${esc(a.target)} ${esc(a.detail||'')}</td></tr>`)));
  $('content').innerHTML = html;
  $('content').querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>act(b.dataset.action,b.dataset.id).catch(e=>toast(e.message,'error')));
  if ($('limits')) $('limits').onsubmit = async e => { e.preventDefault(); try { await api('/api/admin/limits',{method:'PUT',body:Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,Number(v)]))}); toast('Đã lưu','success'); await load(); } catch(e){toast(e.message,'error');} };
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
