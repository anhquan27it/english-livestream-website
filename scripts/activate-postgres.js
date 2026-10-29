const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Runtime,collections}=require('../database/runtime');
const {configuration}=require('../database/postgres');
const dir=process.env.DATA_DIR||path.resolve(__dirname,'..','data');
function canonical(data) {
  const copy=JSON.parse(JSON.stringify(data));
  for(const key of Object.keys(collections)) copy[key] ||= [];
  for(const key of ['settings','tokens','zoomAccounts','liveSnapshots','aiUsage']) copy[key] ||= {};
  for(const c of copy.classes) for(const key of ['studentIds','pendingIds','assistantIds']) c[key]=[...(c[key]||[])].sort();
  const sort=value=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])])):value;
  return JSON.stringify(sort(copy));
}
async function main() {
  const action=process.argv[2]||'activate';
  if(!['activate','rollback'].includes(action)) throw new Error('Use activate | rollback');
  fs.mkdirSync(dir,{recursive:true});
  const lockFile=path.join(dir,'.writer.lock');
  if(fs.existsSync(lockFile)) {
    try { process.kill(Number(fs.readFileSync(lockFile,'utf8')),0); throw new Error('Server đang chạy. Ctrl+C trong cửa sổ npm start trước khi chuyển database.'); }
    catch(e){if(e.code!=='ESRCH')throw e;fs.unlinkSync(lockFile);}
  }
  fs.writeFileSync(lockFile,String(process.pid),{flag:'wx'});
  const keyFile=path.join(dir,'postgres.key'),profile=path.join(dir,'storage.json'),file=path.join(dir,'db.json');
  let runtime;
  try {
    if(action==='rollback'&&!fs.existsSync(keyFile))throw new Error('Thiếu khóa giải mã PostgreSQL.');
    if(!fs.existsSync(keyFile)) fs.writeFileSync(keyFile,crypto.randomBytes(32),{flag:'wx',mode:0o600});
    runtime=new Runtime(configuration(),fs.readFileSync(keyFile),process.env.ENGLIVE_PG_SCHEMA||'englive');
    await runtime.open({migrate:true});
    if(action==='rollback') {
      const data=await runtime.load();
      const backups=path.join(dir,'backups'); fs.mkdirSync(backups,{recursive:true});
      if(fs.existsSync(file)) fs.copyFileSync(file,path.join(backups,'before-pg-rollback-'+Date.now()+'.json'));
      fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2),{mode:0o600}); fs.renameSync(file+'.tmp',file);
      fs.writeFileSync(profile+'.tmp',JSON.stringify({driver:'json',at:new Date().toISOString()})); fs.renameSync(profile+'.tmp',profile);
      console.log('Đã xuất dữ liệu PostgreSQL mới nhất về JSON và chọn json. Khởi động lại npm start.'); return;
    }
    if(fs.existsSync(profile)&&JSON.parse(fs.readFileSync(profile,'utf8')).driver==='postgres') {
      await runtime.load(); console.log('Đã sử dụng PostgreSQL. Không import lại.');return;
    }
    const raw=fs.readFileSync(file),source=JSON.parse(raw);
    if(!Array.isArray(source.users)||!Array.isArray(source.classes)||!source.tokens) throw new Error('Nguồn JSON không đúng định dạng EngLive.');
    const backups=path.join(dir,'backups'); fs.mkdirSync(backups,{recursive:true});
    const backup=path.join(backups,'before-postgres-'+Date.now()+'.json'); fs.writeFileSync(backup,raw,{flag:'wx',mode:0o600});
    await runtime.write(source,{initialize:true});
    const reloaded=await runtime.load();
    if(canonical(source)!==canonical(reloaded)) throw new Error('Dữ liệu đọc lại không khớp; chưa chuyển nguồn web. Giữ JSON và kiểm tra PostgreSQL.');
    await runtime.query("INSERT INTO englive.storage_meta(key,value) VALUES('cutover',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[JSON.stringify({at:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(raw).digest('hex')})]);
    fs.writeFileSync(profile+'.tmp',JSON.stringify({driver:'postgres',at:new Date().toISOString()},null,2)); fs.renameSync(profile+'.tmp',profile);
    console.log('Đã chuyển dữ liệu sang PostgreSQL và xác minh toàn bộ nội dung đọc lại.');
    console.log('Giữ nguyên '+backup+' và postgres.key (sao lưu khóa riêng, không đưa vào Git).');
    console.log('Chạy npm start: phải thấy Database: postgres.');
  } finally {
    if(runtime)await runtime.close();
    if(fs.existsSync(lockFile)&&fs.readFileSync(lockFile,'utf8')===String(process.pid))fs.unlinkSync(lockFile);
  }
}
main().catch(e=>{console.error('Database switch: '+(e.code||e.message));process.exitCode=1;});
