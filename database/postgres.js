// Database tools only: importing this module never reads or writes the live JSON store.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const configFile = path.join(root, 'data', 'postgres.local.json');
const tables = { users:'users', classes:'classes', lessons:'lessons', schedules:'schedules', assignments:'assignments', submissions:'submissions', vocabulary:'vocabulary', chats:'chats', recordings:'recordings', pdfs:'pdfs', listening:'listening', activityResults:'activity_results', audit:'audit' };
function configuration() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 };
  if (!fs.existsSync(configFile)) throw new Error('Chưa có cấu hình. Chạy scripts/setup-postgres.ps1 trước.');
  return { ...JSON.parse(fs.readFileSync(configFile, 'utf8')), connectionTimeoutMillis: 5000 };
}
function plan(data) {
  if (!Array.isArray(data.users) || !Array.isArray(data.classes)) throw new Error('Nguồn không đúng định dạng EngLive.');
  const rows = {}, memberships = [], sessions = [];
  for (const [key, table] of Object.entries(tables)) {
    rows[table] = (data[key] || []).map((record, i) => {
      const id = record.id || (key === 'activityResults' ? 'legacy-result-' + i : null);
      if (!id) throw new Error('Thiếu ID ở ' + key + ' vị trí ' + i);
      const document = { ...record };
      if (key === 'classes') {
        delete document.history; delete document.studentIds; delete document.pendingIds; delete document.assistantIds;
        for (const [field, status] of [['studentIds','member'],['pendingIds','pending'],['assistantIds','assistant']]) {
          for (const userId of record[field] || []) memberships.push([id, userId, status]);
        }
        (record.history || []).forEach((h, position) => sessions.push([id + ':' + (h.id || position), id, position, h]));
      }
      return [id, document];
    });
  }
  return { rows, memberships, sessions, settings: data.settings || {}, counts: { ...Object.fromEntries(Object.entries(rows).map(([k,v]) => [k,v.length])), class_memberships: memberships.length, class_sessions: sessions.length } };
}
async function migrate(client) { for(const name of ['001-schema.sql','002-runtime.sql']) await client.query(fs.readFileSync(path.join(__dirname,name),'utf8')); }
async function importData(client, data, sourceHash) {
  const p = plan(data);
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(178246, 1)");
    const existing = await client.query('SELECT (SELECT count(*) FROM englive.users) + (SELECT count(*) FROM englive.imports) AS n');
    if (Number(existing.rows[0].n)) throw new Error('Database đích đã có dữ liệu; từ chối ghi đè hoặc import lần hai.');
    for (const [table, records] of Object.entries(p.rows)) {
      for (const [id, document] of records) await client.query(`INSERT INTO englive.${table}(id,document) VALUES($1,$2)`, [id, document]);
    }
    for (const row of p.memberships) await client.query('INSERT INTO englive.class_memberships(class_id,user_id,status) VALUES($1,$2,$3)', row);
    for (const row of p.sessions) await client.query('INSERT INTO englive.class_sessions(id,class_id,position,document) VALUES($1,$2,$3,$4)', row);
    // API/provider secrets and OAuth/session tokens are deliberately not copied by this preparation import.
    const publicSettings = Object.fromEntries(Object.entries(p.settings).filter(([key]) => !['ai','video'].includes(key)));
    for (const [key, value] of Object.entries(publicSettings)) await client.query('INSERT INTO englive.settings(key,value) VALUES($1,$2)', [key, JSON.stringify(value)]);
    await client.query('INSERT INTO englive.imports(id,source_sha256,counts) VALUES($1,$2,$3)', [crypto.randomUUID(),sourceHash,p.counts]);
    for (const [table, expected] of Object.entries(p.counts)) {
      const actual = await client.query(`SELECT count(*) AS n FROM englive.${table}`);
      if (Number(actual.rows[0].n) !== expected) throw new Error('Sai số lượng ' + table);
    }
    await client.query('COMMIT');
    return p.counts;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
module.exports = { Client, configuration, configFile, plan, migrate, importData };
