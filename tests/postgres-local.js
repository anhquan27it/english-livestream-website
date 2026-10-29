// Verify the installed PostgreSQL using a fresh schema; never modify englive tables.
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { Client, configuration, migrate, importData } = require('../database/postgres');
async function run() {
  const db = new Client(configuration());
  const schema = 'englive_qa_' + crypto.randomBytes(8).toString('hex');
  assert.match(schema,/^englive_qa_[a-f0-9]{16}$/);
  let created = false;
  try {
    await db.connect();
    const identity = (await db.query('SELECT current_database() AS db,current_user AS role')).rows[0];
    assert.equal(identity.db,'englive'); assert.equal(identity.role,'englive_app');
    const privileges = (await db.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
    assert.deepEqual(privileges,{rolsuper:false,rolcreatedb:false,rolcreaterole:false});
    const testClient = { query(sql,values) { return db.query(sql.replace(/\benglive\b/g,schema),values); } };
    await db.query(`CREATE SCHEMA ${schema}`); created = true;
    await migrate(testClient); await migrate(testClient);
    const source = { users:[{id:'teacher',name:'Teacher',email:'t@qa.test',role:'teacher'},{id:'student',name:'Student',email:'s@qa.test',role:'student'}], classes:[{id:'class',name:'Test',code:'QA1234',teacherId:'teacher',studentIds:['student'],history:[{id:'session',title:'QA'}]}], submissions:[{id:'bad',assignmentId:'missing',userId:'student'}] };
    await assert.rejects(importData(testClient,source,'qa'),e=>e.code==='23503');
    assert.equal(Number((await db.query(`SELECT count(*) AS n FROM ${schema}.users`)).rows[0].n),0);
    source.submissions=[];
    const counts = await importData(testClient,source,'qa');
    assert.equal(counts.users,2); assert.equal(counts.class_memberships,1); assert.equal(counts.class_sessions,1);
    await assert.rejects(importData(testClient,source,'qa'),/đã có dữ liệu/);
    console.log('PostgreSQL thật OK: role không có quyền quản trị, migration idempotent, FK/rollback, import/count và chống ghi đè.');
  } finally {
    if (created) { await db.query('ROLLBACK'); await db.query(`DROP SCHEMA ${schema} CASCADE`); }
    await db.end();
  }
}
run().catch(e=>{console.error('PostgreSQL verification failed: ' + (e.code || e.message));process.exitCode=1;});
