const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {Runtime}=require('../database/runtime'),{Client,configuration}=require('../database/postgres');
async function main(){
  const schema='englive_runtime_'+crypto.randomBytes(8).toString('hex'),key=crypto.randomBytes(32),admin=new Client(configuration());
  await admin.connect();
  let runtime;
  const folder=fs.mkdtempSync(path.resolve('.test-tmp','pg-runtime-'));
  try {
    runtime=new Runtime(configuration(),key,schema);await runtime.open({migrate:true});
    const source={users:[{id:'t',name:'Teacher',email:'t@qa.test',role:'teacher',password:'hash'},{id:'s',name:'Student',email:'s@qa.test',role:'student',password:'hash'}],classes:[{id:'c',name:'QA',code:'PGTEST',teacherId:'t',studentIds:['s'],history:[]}],settings:{ai:{apiKey:'never-plaintext'}},tokens:{'raw-bearer-token':{userId:'t',expiresAt:9999999999999}},zoomAccounts:{t:{accessToken:'never-plaintext'}},custom:{},customArray:[1,'value']};
    await runtime.write(source,{initialize:true});
    const encrypted=await runtime.query('SELECT value FROM englive.settings');
    assert.ok(!JSON.stringify(encrypted.rows).includes('never-plaintext'));
    const entries=await runtime.query("SELECT entry_key,document FROM englive.runtime_entries WHERE category='tokens'");
    assert.match(entries.rows[0].entry_key,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(entries.rows).includes('raw-bearer-token'));
    const rival=new Runtime(configuration(),key,schema);
    try { await assert.rejects(rival.open(),/another EngLive writer/); } finally { await rival.close(); }
    const before=(await runtime.query("SELECT xmin::text AS version FROM englive.users WHERE id='s'")).rows[0].version;
    source.users[0].name='Changed';await runtime.write(source);
    assert.equal((await runtime.query("SELECT xmin::text AS version FROM englive.users WHERE id='s'")).rows[0].version,before,'unchanged row must not be rewritten');
    await runtime.close();runtime=null;
    runtime=new Runtime(configuration(),key,schema);await runtime.open();
    const loaded=await runtime.load();assert.equal(loaded.users[0].name,'Changed');assert.equal(loaded.tokens['raw-bearer-token'].userId,'t');assert.deepEqual(loaded.custom,{});assert.deepEqual(loaded.customArray,[1,'value']);
    await runtime.close();runtime=null;
    fs.writeFileSync(path.join(folder,'postgres.key'),key);fs.writeFileSync(path.join(folder,'storage.json'),'{"driver":"postgres"}');
    const env={...process.env,DATA_DIR:folder,ENGLIVE_PG_SCHEMA:schema};
    const child=(args)=>{const r=spawnSync(process.execPath,args,{env,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
    // A real PostgreSQL backup and restore through the same CLI used by operators.
    const backup=child(['-e',"const s=require('./db');s.lock();console.log(s.backup());"]);
    child(['-e',"const s=require('./db');s.lock();s.data.users[0].name='After backup';s.flush();"]);
    child(['scripts/restore-backup.js',backup]);
    const restored=child(['-e',"const s=require('./db');s.lock();console.log(s.data.users[0].name+':'+Object.keys(s.data.tokens).length);"]);
    assert.equal(restored,'Changed:0','restoration resets sessions and restores data');
    child(['scripts/activate-postgres.js','rollback']);
    const json=JSON.parse(fs.readFileSync(path.join(folder,'db.json'),'utf8'));assert.equal(json.users[0].name,'Changed');
    assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'storage.json'),'utf8')).driver,'json');
    console.log('PostgreSQL runtime OK: encryption, one-writer lock, changed-row writes, restart, backup/restore, session revocation, rollback to latest JSON.');
  }finally{
    if(runtime)await runtime.close();
    assert.match(schema,/^englive_runtime_[a-f0-9]{16}$/);
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
    if(path.dirname(folder)!==path.resolve('.test-tmp'))throw new Error('Invalid QA folder');
    fs.rmSync(folder,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
