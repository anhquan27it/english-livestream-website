// Compatibility persistence for the current single-writer application.
// Domain code still uses a cache; changed rows are committed in one PostgreSQL transaction.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { Client, configuration } = require('./postgres');
const collections = { users:'users',classes:'classes',lessons:'lessons',schedules:'schedules',assignments:'assignments',submissions:'submissions',vocabulary:'vocabulary',chats:'chats',recordings:'recordings',pdfs:'pdfs',listening:'listening',activityResults:'activity_results',audit:'audit' };
class Runtime {
  constructor(config, key, schema = 'englive') {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid PostgreSQL schema');
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Missing 32-byte database encryption key');
    this.client = new Client({...config,application_name:'englive-single-writer',statement_timeout:10000,connectionTimeoutMillis:5000});
    this.key=key; this.schema=schema; this.previous=new Map(); this.alive=true;
    this.client.on('error',()=>{this.alive=false;});
  }
  query(sql,values) { return this.client.query(sql.replace(/\benglive\b/g,this.schema),values); }
  seal(value) {
    const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv);
    const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
    return {v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:ciphertext.toString('base64')};
  }
  unseal(value) {
    const cipher=crypto.createDecipheriv('aes-256-gcm',this.key,Buffer.from(value.iv,'base64'));
    cipher.setAuthTag(Buffer.from(value.tag,'base64'));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(value.data,'base64')),cipher.final()]).toString('utf8'));
  }
  async open({migrate=false}={}) {
    await this.client.connect();
    const lockKey=crypto.createHash('sha256').update(this.schema).digest().readInt32BE();
    const lock=await this.query('SELECT pg_try_advisory_lock(178246,$1) AS acquired',[lockKey]);
    if (!lock.rows[0].acquired) throw new Error('Database is already used by another EngLive writer');
    if (migrate) for (const name of ['001-schema.sql','002-runtime.sql']) await this.query(fs.readFileSync(path.join(__dirname,name),'utf8'));
  }
  flatten(data) {
    const out=new Map();
    const add=(table,id,fields,secret=false)=>{
      const key=table+'\0'+id;
      if (out.has(key)) throw new Error('Duplicate entity ID in '+table);
      out.set(key,{table,id,fields,secret,hash:JSON.stringify(fields)});
    };
    for (const [collection,table] of Object.entries(collections)) (data[collection]||[]).forEach((record,position)=>{
      const id=record.id || (collection==='activityResults'?'legacy-result-'+position:null);
      if (!id) throw new Error('Missing ID in '+collection);
      const document={...record};
      if (collection==='classes') {
        for (const [field,status] of [['studentIds','member'],['pendingIds','pending'],['assistantIds','assistant']]) {
          (record[field]||[]).forEach(userId=>add('class_memberships',JSON.stringify([id,userId,status]),{class_id:id,user_id:userId,status}));
          delete document[field];
        }
        (record.history||[]).forEach((session,index)=>add('class_sessions',id+':'+index,{id:id+':'+index,class_id:id,position:index,document:session}));
        delete document.history;
      }
      add(table,id,{id,document,position});
    });
    for (const [key,value] of Object.entries(data.settings||{})) add('settings',key,{key,value},true);
    const other=Object.fromEntries(Object.entries(data).filter(([key])=>!collections[key] && key!=='settings'));
    for (const [category,value] of Object.entries(other)) {
      if (value && typeof value==='object' && !Array.isArray(value)) {
        if (!Object.keys(value).length) add('runtime_entries',category+':root',{category,entry_key:'root',document:{root:true,value},position:0},true);
        for (const [key,item] of Object.entries(value)) {
          const digest=crypto.createHash('sha256').update(key).digest('hex');
          add('runtime_entries',category+':'+digest,{category,entry_key:digest,document:{key,value:item},position:0},true);
        }
      } else add('runtime_entries',category+':root',{category,entry_key:'root',document:{root:true,value},position:0},true);
    }
    return out;
  }
  async load() {
    const ready=await this.query("SELECT value FROM englive.storage_meta WHERE key='initialized'");
    if (!ready.rows.length) throw new Error('PostgreSQL has not been activated. Run npm run db:activate with the JSON server stopped.');
    const data={settings:{},tokens:{},zoomAccounts:{},liveSnapshots:{},aiUsage:{}};
    for (const [key,table] of Object.entries(collections)) data[key]=(await this.query(`SELECT document FROM englive.${table} ORDER BY position,id`)).rows.map(r=>r.document);
    const classes=new Map(data.classes.map(c=>{c.studentIds=[];c.pendingIds=[];c.assistantIds=[];c.history=[];return[c.id,c];}));
    for (const r of (await this.query('SELECT * FROM englive.class_memberships ORDER BY class_id,user_id')).rows) classes.get(r.class_id)[{member:'studentIds',pending:'pendingIds',assistant:'assistantIds'}[r.status]].push(r.user_id);
    for (const r of (await this.query('SELECT class_id,document FROM englive.class_sessions ORDER BY class_id,position')).rows) classes.get(r.class_id).history.push(r.document);
    for (const r of (await this.query('SELECT key,value FROM englive.settings')).rows) data.settings[r.key]=this.unseal(r.value);
    for (const r of (await this.query('SELECT category,document FROM englive.runtime_entries')).rows) {
      const entry=this.unseal(r.document);
      if (entry.root) data[r.category]=entry.value;
      else { data[r.category] ||= {}; data[r.category][entry.key]=entry.value; }
    }
    this.previous=this.flatten(data); return data;
  }
  async write(data,{initialize=false}={}) {
    if (!this.alive) throw new Error('PostgreSQL connection lost; restart after checking the database');
    const next=this.flatten(data);
    if (!initialize && next.size===this.previous.size && [...next].every(([id,row])=>this.previous.get(id)?.hash===row.hash)) return;
    await this.query('BEGIN');
    try {
      if (initialize) {
        const count=await this.query('SELECT (SELECT count(*) FROM englive.users)+(SELECT count(*) FROM englive.imports) AS n');
        if (Number(count.rows[0].n)) throw new Error('Target PostgreSQL database is not empty');
      }
      for (const row of this.previous.values()) if (!next.has(row.table+'\0'+row.id)) {
        const keys=row.table==='class_memberships'?['class_id','user_id','status']:row.table==='runtime_entries'?['category','entry_key']:row.table==='settings'?['key']:['id'];
        await this.query(`DELETE FROM englive.${row.table} WHERE ${keys.map((k,i)=>k+'=$'+(i+1)).join(' AND ')}`,keys.map(k=>row.fields[k]));
      }
      for (const [id,row] of next) if (this.previous.get(id)?.hash!==row.hash) {
        const fields={...row.fields};
        if (row.secret) { const key=row.table==='settings'?'value':'document'; fields[key]=this.seal(fields[key]); }
        const cols=Object.keys(fields), keys=row.table==='class_memberships'?['class_id','user_id','status']:row.table==='runtime_entries'?['category','entry_key']:row.table==='settings'?['key']:['id'];
        const updates=cols.filter(c=>!keys.includes(c));
        await this.query(`INSERT INTO englive.${row.table}(${cols.join(',')}) VALUES(${cols.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(${keys.join(',')}) ${updates.length?'DO UPDATE SET '+updates.map(c=>c+'=EXCLUDED.'+c).join(','):'DO NOTHING'}`,cols.map(c=>['document','value'].includes(c)?JSON.stringify(fields[c]):fields[c]));
      }
      if (initialize) await this.query("INSERT INTO englive.storage_meta(key,value) VALUES('initialized','true'::jsonb)");
      await this.query('COMMIT'); this.previous=next;
    } catch(e) { await this.query('ROLLBACK'); throw e; }
  }
  async close() { await this.client.end(); }
}
module.exports={Runtime,collections};
