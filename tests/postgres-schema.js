// Real PostgreSQL engine in WASM; isolated from the installed Windows server and data/.
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { migrate, importData } = require('../database/postgres');
async function run() {
  const engine = new PGlite();
  // pg.Client accepts multiple statements; PGlite separates exec/query.
  const client = { query(sql, params) { return !params && /CREATE|ALTER/.test(sql) ? engine.exec(sql) : engine.query(sql,params); } };
  try {
    await migrate(client); await migrate(client);
    const data = { users:[{id:'t',name:'Teacher',email:'t@example.test',role:'teacher'},{id:'s',name:'Student',email:'s@example.test',role:'student'}], classes:[{id:'c',name:'Class',code:'ABC123',teacherId:'t',studentIds:['s'],pendingIds:[],history:[{id:'h',title:'lesson'}]}], submissions:[{id:'sub',assignmentId:'missing',userId:'s'}] };
    await assert.rejects(importData(client,data,'test'), /foreign key/i);
    assert.equal((await engine.query('SELECT count(*) AS n FROM englive.users')).rows[0].n,0,'failure rolls back every table');
    data.submissions = []; data.activityResults = [{classId:'c',answers:[]}];
    const counts = await importData(client,data,'test');
    assert.equal(counts.users,2); assert.equal(counts.class_memberships,1); assert.equal(counts.class_sessions,1);
    const relation = await engine.query('SELECT u.name FROM englive.class_memberships m JOIN englive.users u ON u.id=m.user_id');
    assert.equal(relation.rows[0].name,'Student');
    await assert.rejects(importData(client,data,'test'), /đã có dữ liệu/);
    assert.equal((await engine.query('SELECT count(*) AS n FROM englive.users')).rows[0].n,2);
    console.log('PostgreSQL schema OK: idempotent migration, foreign keys, atomic rollback, per-table counts, memberships/history, duplicate-import protection.');
  } finally { await engine.close(); }
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
