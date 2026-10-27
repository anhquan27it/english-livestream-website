// Đo kênh điều khiển Socket.IO, không đo video, LiveKit Cloud hay băng thông.
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process'),{io}=require('socket.io-client'),assert=require('assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'englive-load-'));
process.env.DATA_DIR=dir;
const store=require('../db'), cls=store.data.classes[0],teacher=store.data.users[0];
const tokens=[];
for(let i=0;i<100;i++){const u={id:'load_'+i,name:'Load '+i,email:'load'+i+'@test.invalid',role:'student',password:teacher.password};store.data.users.push(u);cls.studentIds.push(u.id);const token=crypto.randomBytes(24).toString('hex');store.data.tokens[token]={userId:u.id,createdAt:Date.now()};tokens.push(token);}
store.flush();
const port=4100+Math.floor(Math.random()*200),base='http://127.0.0.1:'+port,clients=[];
const env={...process.env,PORT:String(port),LIVEKIT_URL:'',LIVEKIT_API_KEY:'',LIVEKIT_API_SECRET:'',LIVEKIT_DEV:'0'};
const server=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env,stdio:['ignore','ignore','inherit']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const request=async(token,url,body)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json();};
const connect=token=>new Promise((resolve,reject)=>{const s=io(base,{auth:{token},transports:['websocket']});clients.push(s);s.once('connect',()=>resolve(s));s.once('connect_error',reject);});
const emit=(s,e,d)=>new Promise((resolve,reject)=>{s.timeout(5000).emit(e,d,(err,r)=>err?reject(err):resolve(r));});
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await sleep(100);}
 const {token}=await request(null,'/api/login',{email:'teacher@demo.com',password:'123456'});
 await request(token,'/api/classes/'+cls.id+'/live',{title:'Synthetic control load'});
 const t=await connect(token);assert.ok((await emit(t,'room:join',{classId:cls.id})).ok);
 const lat=[];
 for(const target of [5,20,50,99]){
   while(lat.length<target){const started=performance.now(),s=await connect(tokens[lat.length]);assert.ok((await emit(s,'room:join',{classId:cls.id})).ok);lat.push(performance.now()-started);}
   const sorted=[...lat].sort((a,b)=>a-b);console.log('Control load '+target+' students + teacher; join p95 '+sorted[Math.floor(sorted.length*.95)].toFixed(1)+' ms');
 }
 const extra=await connect(tokens[99]);assert.ok((await emit(extra,'room:join',{classId:cls.id})).error,'participant cap must reject 101st');
 let received=0;for(const s of clients.slice(1,100))s.once('caption',()=>received++);
 const start=performance.now();t.emit('caption',{text:'Load delivery',final:true});for(let i=0;i<100&&received<99;i++)await sleep(20);
 assert.equal(received,99);console.log('Caption delivered to 99/99 students in '+(performance.now()-start).toFixed(1)+' ms');
 console.log('PASS: control only; no claim about video capacity');
})().then(()=>cleanup(0),e=>{console.error(e);cleanup(1);});
function cleanup(code){for(const s of clients)s.disconnect();server.once('exit',()=>{fs.rmSync(dir,{recursive:true,force:true});process.exit(code);});server.kill();}
