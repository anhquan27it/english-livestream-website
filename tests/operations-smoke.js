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
  await test('sĩ số lớp được thực thi khi thêm, duyệt và admin thay đổi', async()=>{
    assert.equal((await api(T,'POST','/api/classes',{name:'Sai',maxStudents:0})).status,400);
    const made=await api(T,'POST','/api/classes',{name:'Lớp giới hạn',maxStudents:1});
    assert.equal(made.status,200);const c=made.body.class;assert.equal(c.maxStudents,1);
    assert.equal((await api(T,'POST',`/api/classes/${c.id}/students`,{email:'student1@demo.com'})).status,200);
    assert.equal((await api(S3,'POST','/api/join',{code:c.code})).status,200);
    const third=(await api(S3,'GET','/api/me')).body.user;
    assert.equal((await api(T,'POST',`/api/classes/${c.id}/requests/${third.id}/approve`)).status,409);
    assert.equal((await api(T,'POST',`/api/classes/${c.id}/students`,{email:'student3@demo.com'})).status,409);
    assert.equal((await api(A,'PATCH',`/api/admin/classes/${c.id}`,{studentIds:[third.id,(await api(S1,'GET','/api/me')).body.user.id]})).status,409);
    assert.equal((await api(A,'PATCH',`/api/admin/classes/${c.id}`,{maxStudents:2})).status,200);
    assert.equal((await api(T,'POST',`/api/classes/${c.id}/requests/${third.id}/approve`)).status,200);
    assert.equal((await api(A,'PATCH',`/api/admin/classes/${c.id}`,{maxStudents:1})).status,409);
    await api(A,'DELETE',`/api/admin/classes/${c.id}`);
  });
  await test('lưu hơn 50 buổi thay vì xóa lịch sử cũ',async()=>{
    const c=(await api(T,'POST','/api/classes',{name:'Lịch sử kiểm thử'})).body.class;
    for(let i=0;i<51;i++){assert.equal((await api(T,'POST',`/api/classes/${c.id}/live`,{title:'Buổi '+i})).status,200);assert.equal((await api(T,'DELETE',`/api/classes/${c.id}/live`)).status,200);}
    const saved=(await api(T,'GET','/api/classes')).body.classes.find(x=>x.id===c.id);
    assert.equal(saved.history.length,51);assert.equal(saved.history[50].title,'Buổi 0');
    await api(A,'DELETE',`/api/admin/classes/${c.id}`);
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
  await test('mã lớp chỉ giáo viên phụ trách/admin thấy trong thông tin lớp',async()=>{
    const t=(await api(T,'GET','/api/classes/'+ielts.id)).body.class;
    assert.ok(/^[A-Z0-9]{4,10}$/.test(t.code||''),'giáo viên phải nhận mã lớp');
    assert.equal((await api(A,'GET','/api/classes/'+ielts.id)).body.class.code,t.code);
    const s=await api(S1,'GET','/api/classes/'+ielts.id);assert.equal(s.status,200);assert.ok(!('code' in s.body.class),'học sinh không được nhận mã lớp');
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
  await test('bài tập đa dạng: tự chấm, ẩn đáp án, thử lại lấy điểm cao nhất, chấm tay, thống kê, AI soạn, sửa/xóa',async()=>{
    const due=Date.now()+3600000;
    const items=[{type:'mcq',q:'Pick',options:['a','b','c'],answer:1,points:2},{type:'tf',q:'The sky is blue',answer:true},{type:'fill',text:'She ___ to ___ every day.',blanks:[['goes','walks'],['school']]},{type:'order',answer:'I like apples'},{type:'match',pairs:[['dog','chó'],['cat','mèo']]},{type:'short',q:'Past of go',answers:['went']},{type:'speak',target:'Good morning teacher'}];
    assert.equal((await api(T,'POST','/api/learning/assignments',{classId:ielts.id,title:'Bad',dueAt:due,items:[{type:'mcq',q:'x',options:['a','b']}]})).status,400);
    assert.equal((await api(T,'POST','/api/learning/assignments',{classId:ielts.id,title:'Bad',dueAt:due,items:[{type:'fill',text:'no blank',blanks:[]}]})).status,400);
    assert.equal((await api(S1,'POST','/api/learning/assignments',{classId:ielts.id,title:'No',dueAt:due,items})).status,403);
    const made=await api(T,'POST','/api/learning/assignments',{classId:ielts.id,title:'Mixed quiz',dueAt:due,items,settings:{maxAttempts:2,reveal:'submit'}});
    assert.equal(made.status,200); const hw=made.body.assignment; const id=hw.items.map(i=>i.id);
    const seen=(await api(S1,'GET','/api/learning')).body.assignments.find(a=>a.id===hw.id);
    assert.ok(seen.items.length===7); assert.ok(!/"answer"|"answers"|"pairs"|"explain"|goes|walks/.test(JSON.stringify(seen)), 'đáp án không được lộ cho học sinh');
    assert.deepEqual([...seen.items[3].tokens].sort(),['I','apples','like'].sort());
    const perfect={[id[0]]:1,[id[1]]:true,[id[2]]:['Goes','school'],[id[3]]:['I','like','apples'],[id[4]]:['chó','mèo'],[id[5]]:'Went.',[id[6]]:'good morning, teacher!'};
    const r1=await api(S1,'POST','/api/learning/assignments/'+hw.id+'/submit',{answers:perfect});
    assert.equal(r1.status,200); assert.equal(r1.body.submission.score,10); assert.equal(r1.body.submission.gradedBy,'auto'); assert.ok(r1.body.submission.detail.every(d=>d.correct===true)); assert.equal(r1.body.submission.detail[0].expected,'b');
    const r2=await api(S1,'POST','/api/learning/assignments/'+hw.id+'/submit',{answers:{[id[0]]:0}});
    assert.equal(r2.status,200); assert.equal(r2.body.submission.attempts,2); assert.equal(r2.body.submission.score,10,'lấy điểm cao nhất');
    assert.equal((await api(S1,'POST','/api/learning/assignments/'+hw.id+'/submit',{answers:perfect})).status,409);
    assert.equal((await api(S1,'POST','/api/learning/assignments/'+hw.id+'/submit',{answers:{}})).status,400);
    const part=await api(S2,'POST','/api/learning/assignments/'+hw.id+'/submit',{answers:{[id[0]]:0,[id[1]]:false,[id[2]]:['goes','x'],[id[3]]:['like','I','apples'],[id[4]]:['mèo','chó'],[id[5]]:'go',[id[6]]:'hello'}});
    assert.equal(part.status,200); assert.ok(part.body.submission.score<2); assert.equal(part.body.submission.detail[2].correct,'partial'); assert.equal(part.body.submission.detail[2].earned,0.5);
    const hidden=await api(T,'POST','/api/learning/assignments',{classId:ielts.id,title:'Never reveal',dueAt:due,items:[items[0]],settings:{reveal:'never'}});
    const hr=await api(S1,'POST','/api/learning/assignments/'+hidden.body.assignment.id+'/submit',{answers:{[hidden.body.assignment.items[0].id]:0}});
    assert.equal(hr.body.submission.detail[0].correct,false); assert.equal(hr.body.submission.detail[0].expected,undefined);
    const manual=await api(T,'POST','/api/learning/assignments',{classId:ielts.id,title:'Essay+quiz',dueAt:due,items:[items[1],{type:'essay',q:'Write about your day',minWords:5},{type:'short',q:'Free answer'}]});
    const mid=manual.body.assignment.items.map(i=>i.id);
    const ms=(await api(S1,'POST','/api/learning/assignments/'+manual.body.assignment.id+'/submit',{answers:{[mid[0]]:true,[mid[1]]:'I woke up and went to school today.',[mid[2]]:'maybe'}})).body.submission;
    assert.equal(ms.needsManual,true); assert.equal(ms.score,undefined); assert.equal(ms.autoPoints,1); assert.equal(ms.autoScore,3.3);
    assert.equal((await api(T,'POST','/api/learning/submissions/'+ms.id+'/grade',{score:8,feedback:'Good'})).status,200);
    assert.equal((await api(S1,'GET','/api/learning')).body.submissions.find(x=>x.id===ms.id).score,8);
    assert.equal((await api(S1,'GET','/api/learning/assignments/'+hw.id+'/stats')).status,403);
    const st=(await api(T,'GET','/api/learning/assignments/'+hw.id+'/stats')).body.stats;
    assert.equal(st.perItem.length,7); assert.equal(st.students.length,2); assert.ok(st.perItem[0].rate>=0&&st.perItem[0].rate<=100);
    assert.equal((await api(S1,'POST','/api/learning/assignments/generate',{classId:ielts.id,topic:'travel'})).status,403);
    await api(A,'PUT','/api/ai/settings',{providers:[{id:'9router',name:'Mock',baseUrl:mockUrl+'/v1',models:['ag/gemini-3.8-flash-high']}],active:{providerId:'9router',model:'ag/gemini-3.8-flash-high'}});
    const gen=await api(T,'POST','/api/learning/assignments/generate',{classId:ielts.id,topic:'travel',level:'A2',count:4,types:['mcq','fill','tf']});
    assert.equal(gen.status,200,JSON.stringify(gen.body)); assert.equal(gen.body.items.length,3,'câu hỏng bị lọc'); assert.deepEqual(gen.body.items.map(i=>i.type),['mcq','fill','mcq']);
    assert.equal((await api(S1,'PATCH','/api/learning/assignments/'+hw.id,{title:'x'})).status,403);
    assert.equal((await api(T,'PATCH','/api/learning/assignments/'+hw.id,{dueAt:Date.now()-1000})).status,400);
    assert.equal((await api(T,'PATCH','/api/learning/assignments/'+hw.id,{title:'Mixed quiz v2',dueAt:due+86400000})).body.assignment.title,'Mixed quiz v2');
    assert.equal((await api(S1,'DELETE','/api/learning/assignments/'+hw.id)).status,403);
    assert.equal((await api(T,'DELETE','/api/learning/assignments/'+hw.id)).status,200);
    assert.ok(!(await api(S1,'GET','/api/learning')).body.submissions.some(x=>x.assignmentId===hw.id));
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
