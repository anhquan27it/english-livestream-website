const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
module.exports = async function(c) {
  const { api,test,connect,emit,nextEvent,sleep,restart,A,T,S1,S2,S3,classes,ielts,lessonId,scenes,quizIdx,quiz,mockUrl,dataDir,login,mediaCalls } = c;
  console.log('Quản trị, bảo mật và học tập');
  const otherToken = await login('other@t.com');
  await test('chỉ admin quản trị/cấu hình AI, không khóa admin cuối cùng', async()=>{
    for (const token of [T,S1,otherToken]) { assert.equal((await api(token,'GET','/api/admin/overview')).status,403); assert.equal((await api(token,'GET','/api/ai/settings')).status,403); }
    assert.equal((await api(T,'GET','/api/me')).body.user.role,'teacher');
    assert.equal((await api(A,'GET','/api/me')).body.user.role,'admin');
    const o=(await api(A,'GET','/api/admin/overview')).body;
    assert.ok(!JSON.stringify(o).includes('password'));
    const admin=o.users.find(u=>u.role==='admin');
    assert.equal((await api(A,'PATCH','/api/admin/users/'+admin.id,{status:'blocked'})).status,409);
  });
  let other;
  await test('admin thu hồi cả phiên HTTP và socket',async()=>{
    const o=(await api(A,'GET','/api/admin/overview')).body;other=o.users.find(u=>u.email==='other@t.com');
    const s=await connect(otherToken),gone=new Promise(resolve=>s.once('disconnect',resolve));
    assert.equal((await api(A,'PATCH','/api/admin/users/'+other.id,{revokeSessions:true})).status,200);await gone;s.close();
    assert.equal((await api(otherToken,'GET','/api/me')).status,401);
  });
  let assistantToken,assignment,submission,sch;
  await test('trợ giảng chỉ thấy và quản lý lớp được phân công',async()=>{
    await api(A,'PATCH','/api/admin/users/'+other.id,{role:'assistant'});assistantToken=await login('other@t.com');
    assert.equal((await api(A,'PATCH','/api/admin/classes/'+ielts.id,{assistantIds:[other.id]})).status,200);
    const d=(await api(assistantToken,'GET','/api/learning')).body;
    assert.equal(d.classes.length,1);assert.equal(d.classes[0].canManage,true);
    assert.equal((await api(assistantToken,'POST','/api/learning/assignments',{classId:classes.find(x=>x.id!==ielts.id).id,title:'No',prompt:'No',dueAt:Date.now()+60000})).status,403);
  });
  await test('lịch học phát hiện trùng lớp và trùng giáo viên',async()=>{
    const startsAt=Date.now()+3600000,endsAt=startsAt+3600000;
    const body={classId:ielts.id,title:'Speaking',startsAt,endsAt};
    const created=await api(T,'POST','/api/learning/schedules',body);assert.equal(created.status,200);sch=created.body.schedule;
    assert.equal((await api(T,'POST','/api/learning/schedules',body)).status,409);
    assert.equal((await api(T,'POST','/api/learning/schedules',{...body,classId:classes.find(x=>x.id!==ielts.id).id})).status,409);
    assert.equal((await api(S1,'POST','/api/learning/schedules',body)).status,403);
    assert.equal((await api(T,'POST','/api/learning/schedules',{...body,startsAt:0})).status,400);
  });
  await test('nhắc lịch chỉ trả buổi sắp học của đúng thành viên lớp',async()=>{
    const near=(await api(T,'POST','/api/learning/schedules',{classId:ielts.id,title:'Soon',startsAt:Date.now()+5*60000,endsAt:Date.now()+10*60000})).body.schedule;
    assert.ok(near.id);
    assert.ok((await api(S1,'GET','/api/learning/reminders')).body.schedules.some(s=>s.id===near.id));
    assert.ok(!(await api(S3,'GET','/api/learning/reminders')).body.schedules.some(s=>s.id===near.id));
    await api(T,'DELETE','/api/learning/schedules/'+near.id);
  });
  await test('admin tạo/sửa/xóa lớp và đặt lịch lặp hằng tuần',async()=>{
    const teacherId=ielts.teacherId;
    assert.equal((await api(T,'POST','/api/admin/classes',{name:'No',teacherId})).status,403);
    assert.equal((await api(A,'POST','/api/admin/classes',{teacherId})).status,400);
    const student=(await api(A,'GET','/api/admin/overview')).body.users.find(u=>u.role==='student');
    assert.equal((await api(A,'POST','/api/admin/classes',{name:'X',teacherId:student.id})).status,400);
    const made=await api(A,'POST','/api/admin/classes',{name:'Lớp admin tạo',level:'B2',teacherId,description:'mô tả'});assert.equal(made.status,200);
    const nc=made.body.class;assert.equal(nc.teacherId,teacherId);assert.equal(nc.level,'B2');assert.ok(nc.code);
    assert.equal((await api(A,'PATCH','/api/admin/classes/'+nc.id,{level:'C1',description:'đổi'})).body.class.level,'C1');
    const t0=Date.now()+30*86400000,body={classId:nc.id,title:'Hằng tuần',startsAt:t0,endsAt:t0+3600000};
    assert.equal((await api(A,'POST','/api/learning/schedules',{...body,repeatWeeks:0})).status,400);
    const rep=await api(A,'POST','/api/learning/schedules',{...body,repeatWeeks:3});assert.equal(rep.status,200);assert.equal(rep.body.schedules.length,3);
    assert.equal(rep.body.schedules[1].startsAt-rep.body.schedules[0].startsAt,7*86400000);
    const count=async()=>(await api(A,'GET','/api/admin/overview')).body.schedules.length;
    const before=await count();
    assert.equal((await api(A,'POST','/api/learning/schedules',{...body,title:'Trùng',startsAt:t0+7*86400000,endsAt:t0+7*86400000+1800000})).status,409);
    assert.equal((await api(A,'POST','/api/learning/schedules',{...body,title:'Lặp trùng',startsAt:t0-7*86400000,endsAt:t0-7*86400000+3600000,repeatWeeks:3})).status,409);
    assert.equal(await count(),before,'lặp bị trùng không được tạo dở');
    assert.equal((await api(T,'DELETE','/api/admin/classes/'+nc.id)).status,403);
    assert.equal((await api(A,'DELETE','/api/admin/classes/'+nc.id)).status,200);
    const after=(await api(A,'GET','/api/admin/overview')).body;
    assert.ok(!after.classes.some(x=>x.id===nc.id));assert.ok(!after.schedules.some(s=>s.classId===nc.id));
    assert.equal((await api(A,'DELETE','/api/admin/classes/'+nc.id)).status,404);
  });
  await test('giao/nộp/chấm bài, bảo vệ bài làm và điểm',async()=>{
    const created=await api(assistantToken,'POST','/api/learning/assignments',{classId:ielts.id,title:'My day',prompt:'Write about your day.',dueAt:Date.now()+3600000});assert.equal(created.status,200);assignment=created.body.assignment;
    const sent=await api(S1,'POST','/api/learning/assignments/'+assignment.id+'/submit',{content:'I went to school.'});assert.equal(sent.status,200);submission=sent.body.submission;
    assert.equal((await api(S3,'POST','/api/learning/assignments/'+assignment.id+'/submit',{content:'No access'})).status,403);
    assert.equal((await api(S1,'POST','/api/learning/submissions/'+submission.id+'/grade',{score:10})).status,403);
    assert.equal((await api(T,'POST','/api/learning/submissions/'+submission.id+'/grade',{score:11})).status,400);
    assert.equal((await api(assistantToken,'POST','/api/learning/submissions/'+submission.id+'/grade',{score:8.5,feedback:'Good work'})).status,200);
    assert.equal((await api(S1,'POST','/api/learning/assignments/'+assignment.id+'/submit',{content:'Changed'})).status,409);
    assert.equal((await api(S2,'GET','/api/learning')).body.submissions.length,0);
  });
  await test('từ vựng riêng từng người và trạng thái ôn tập',async()=>{
    const v=(await api(S1,'POST','/api/learning/vocabulary',{word:'airport',meaning:'sân bay',example:'At the airport.'})).body.word;
    assert.ok(v.id);assert.equal((await api(S1,'POST','/api/learning/vocabulary',{word:'Airport',meaning:'trùng'})).status,409);
    assert.equal((await api(S2,'PATCH','/api/learning/vocabulary/'+v.id,{learned:true})).status,404);
    assert.equal((await api(S1,'PATCH','/api/learning/vocabulary/'+v.id,{learned:true})).body.word.learned,true);
    assert.equal((await api(S2,'GET','/api/learning')).body.vocabulary.length,0);
  });
  await test('bài tập quá hạn bị từ chối ở server',async()=>{
    const a=(await api(T,'POST','/api/learning/assignments',{classId:ielts.id,title:'Deadline',prompt:'Write.',dueAt:Date.now()+200})).body.assignment;
    assert.ok(a.id);await sleep(250);
    assert.equal((await api(S1,'POST','/api/learning/assignments/'+a.id+'/submit',{content:'Late'})).status,409);
  });
  await test('hạn mức AI do admin đặt được chặn trước gọi nhà cung cấp',async()=>{
    assert.equal((await api(A,'PUT','/api/admin/limits',{chatPerDay:1,generationsPerDay:1})).status,200);
    assert.equal((await api(S1,'POST','/api/ai/chat',{classId:ielts.id,message:'hello'})).status,429);
    assert.equal((await api(T,'POST','/api/lessons/'+lessonId+'/outline',{})).status,429);
    assert.equal((await api(A,'PUT','/api/admin/limits',{maxParticipants:0})).status,400);
    await api(A,'PUT','/api/admin/limits',{chatPerDay:100,generationsPerDay:100});
    await api(A,'PUT','/api/ai/settings',{providers:[{id:'9router',name:'Mock',baseUrl:mockUrl+'/v1',models:['ag/gemini-3.8-flash-high']}],active:{providerId:'9router',model:'ag/gemini-3.8-flash-high'}});
  });
  await test('quota tệp chặn bản ghi quá lớn mà server vẫn hoạt động',async()=>{
    await api(A,'PUT','/api/admin/limits',{storageMB:1});
    const r=await api(T,'POST','/api/classes/'+ielts.id+'/recordings',null,{name:'quota.webm',buffer:Buffer.alloc(2*1048576,7)});
    assert.equal(r.status,413);assert.equal((await api(T,'GET','/api/me')).status,200);
    await api(A,'PUT','/api/admin/limits',{storageMB:2048});
    assert.equal((await api(T,'POST','/api/classes/'+ielts.id+'/pdfs',null,{name:'%',buffer:Buffer.from('%PDF-invalid-name')})).status,400);
  });
  let ts=await connect(T),ss=await connect(S1);
  await api(T,'POST','/api/classes/'+ielts.id+'/live',{title:'Regression'});
  await emit(ts,'room:join',{classId:ielts.id});await emit(ss,'room:join',{classId:ielts.id});
  await emit(ts,'lesson:present',{lessonId});
  await test('nhảy qua quiz chưa mở và dừng chiếu sớm không gửi đáp án cho AI',async()=>{
    ts.emit('slide:goto',{index:scenes.length-1});await sleep(80);
    const a=await api(S1,'POST','/api/ai/chat',{classId:ielts.id,message:'Audit skip'});assert.equal(a.status,200);assert.match(a.body.reply,/ctx:correct=0/);
    ts.emit('lesson:stop');await sleep(80);
    const b=await api(S1,'POST','/api/ai/chat',{classId:ielts.id,lessonId,message:'Audit stop'});assert.equal(b.status,200);assert.match(b.body.reply,/ctx:correct=0/);
  });
  await emit(ts,'lesson:present',{lessonId});
  await test('quiz luyện lại không cộng điểm trùng',async()=>{
    ts.emit('slide:goto',{index:quizIdx});await sleep(60);
    const play=async()=>{ts.emit('activity:start');await sleep(60);assert.ok((await emit(ss,'activity:answer',{answer:quiz.answer})).ok);const got=nextEvent(ss,'lesson:state',s=>s?.activity?.phase==='ended');ts.emit('activity:end');return got;};
    const first=await play(),second=await play();assert.ok(first.activity.result.me.total>0);assert.equal(second.activity.result.me.total,first.activity.result.me.total);assert.equal(second.activity.result.me.points,0);
  });
  await test('hết thời gian không nhận đáp án đến muộn',async()=>{
    ts.emit('activity:start',{seconds:1});await sleep(1050);
    assert.ok((await emit(ss,'activity:answer',{answer:quiz.answer})).error);
  });
  await test('chuyển lớp không còn nhận sự kiện phòng cũ',async()=>{
    const other=classes.find(c=>c.id!==ielts.id);await api(T,'POST','/api/classes/'+other.id+'/live',{title:'Second'});
    await emit(ss,'room:join',{classId:other.id});let seen=false;const h=m=>{if(m.text==='private-caption')seen=true;};ss.on('caption',h);ts.emit('caption',{text:'private-caption',final:true});await sleep(150);assert.equal(seen,false);ss.off('caption',h);
    await emit(ss,'room:join',{classId:ielts.id});await api(T,'DELETE','/api/classes/'+other.id+'/live');
  });
  await test('kick chặn token mới/vào lại và socket không thể chat',async()=>{
    const got=nextEvent(ss,'kicked');ts.emit('kick',{socketId:ss.id});await got;
    let chatted=false;const h=m=>{if(m.text==='kicked-message')chatted=true;};ts.on('chat',h);ss.emit('chat',{text:'kicked-message'});await sleep(150);assert.equal(chatted,false);ts.off('chat',h);
    assert.equal((await api(S1,'POST','/api/livekit/token',{classId:ielts.id})).status,403);assert.ok((await emit(ss,'room:join',{classId:ielts.id})).error);
    assert.ok(mediaCalls.some(x=>x.path.endsWith('/RemoveParticipant') && x.body.room==='cls_'+ielts.id));
  });
  await test('snapshot và bản sao JSON tồn tại, backup chỉ dành admin',async()=>{
    const backup=await api(A,'POST','/api/admin/backups');assert.equal(backup.status,200);
    const disk=JSON.parse(fs.readFileSync(path.join(dataDir,'db.json'),'utf8'));assert.ok(disk.liveSnapshots[ielts.id]);assert.ok(fs.existsSync(path.join(dataDir,'backups',backup.body.name)));
    assert.equal((await api(S1,'POST','/api/admin/backups')).status,403);
  });
  ts.close();ss.close();
  await test('restart khôi phục slide, điểm, bài tập, từ vựng và lệnh cấm',async()=>{
    await restart();
    ts=await connect(T);const st=await emit(ts,'room:join',{classId:ielts.id});assert.equal(st.lesson.index,quizIdx);assert.ok(st.lesson.leaderboard[0].points>0);
    ss=await connect(S1);assert.ok((await emit(ss,'room:join',{classId:ielts.id})).error);
    const d=(await api(S1,'GET','/api/learning')).body;assert.ok(d.assignments.some(a=>a.id===assignment.id));assert.equal(d.submissions[0].score,8.5);assert.equal(d.vocabulary[0].word,'airport');
    ts.close();ss.close();await api(T,'DELETE','/api/classes/'+ielts.id+'/live');
  });
  await test('đổi mật khẩu thu hồi phiên cũ',async()=>{
    const reg=await api(null,'POST','/api/register',{name:'Password Test',email:'password@test.com',password:'old-password',role:'student'});assert.equal(reg.status,200);
    assert.equal((await api(reg.body.token,'POST','/api/me/password',{currentPassword:'wrong',password:'new-password'})).status,400);
    assert.equal((await api(reg.body.token,'POST','/api/me/password',{currentPassword:'old-password',password:'new-password'})).status,200);
    assert.equal((await api(reg.body.token,'GET','/api/me')).status,401);
    assert.equal((await api(null,'POST','/api/login',{email:'password@test.com',password:'new-password'})).status,200);
  });
  await test('nhật ký ghi các thao tác quản trị và chấm bài',async()=>{
    const d=(await api(A,'GET','/api/admin/overview')).body;assert.ok(d.audit.some(a=>a.action==='submission.grade'));assert.ok(d.audit.some(a=>a.action==='backup.create'));
    assert.equal((await api(T,'DELETE','/api/learning/schedules/'+sch.id)).status,200);
  });
  await test('khôi phục từ backup khi db hỏng và chặn CLI ghi đè server đang chạy',async()=>require('./storage-check')());
};
