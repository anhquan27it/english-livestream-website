const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process'),assert=require('assert/strict');
module.exports=function(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'englive-storage-')),env={...process.env,DATA_DIR:dir,ADMIN_PASSWORD:'admin-test-password'},cwd=path.join(__dirname,'..');
 try {
   const setup=spawnSync(process.execPath,['scripts/create-admin.js','admin@test.com'],{cwd,env,encoding:'utf8'});assert.equal(setup.status,0,setup.stderr);
   const original=JSON.parse(fs.readFileSync(path.join(dir,'db.json'),'utf8'));assert.equal(original.users[0].role,'teacher');
   assert.equal(original.users.find(u=>u.email==='admin@test.com').role,'admin');
   const rejected=spawnSync(process.execPath,['scripts/create-admin.js','teacher@demo.com'],{cwd,env,encoding:'utf8'});assert.notEqual(rejected.status,0);
   assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'db.json'),'utf8')).users,original.users);
   fs.writeFileSync(path.join(dir,'admin-setup.json'),JSON.stringify({email:'admin@test.com',passwordHash:original.users.find(u=>u.email==='admin@test.com').password}));
   const applied=spawnSync(process.execPath,['-e','const s=require("./db");s.lock();s.applyAdminSetup();'],{cwd,env,encoding:'utf8'});assert.equal(applied.status,0,applied.stderr);
   assert.equal(fs.existsSync(path.join(dir,'admin-setup.json')),false);
   assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'db.json'),'utf8')).users[0].role,'teacher');
   const name=fs.readdirSync(path.join(dir,'backups')).find(n=>n.startsWith('db-'));
   fs.writeFileSync(path.join(dir,'db.json'),'{corrupted');
   const restored=spawnSync(process.execPath,['scripts/restore-backup.js',name],{cwd,env,encoding:'utf8'});assert.equal(restored.status,0,restored.stderr);
   const data=JSON.parse(fs.readFileSync(path.join(dir,'db.json'),'utf8'));assert.equal(data.classes.length,2);assert.deepEqual(data.tokens,{});
   fs.writeFileSync(path.join(dir,'.writer.lock'),String(process.pid));
   const blocked=spawnSync(process.execPath,['scripts/create-admin.js','second-admin@test.com'],{cwd,env,encoding:'utf8'});assert.notEqual(blocked.status,0);
   assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'db.json'),'utf8')).classes.length,2);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
};
