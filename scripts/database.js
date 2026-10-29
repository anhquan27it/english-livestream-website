const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const pg = require('../database/postgres');
const action = process.argv[2] || 'status';
async function main() {
  if (action === 'setup') {
    if (process.env.DATABASE_URL) throw new Error('Bỏ DATABASE_URL khi setup local để tránh tạo schema nhầm máy chủ.');
    if (fs.existsSync(pg.configFile)) {
      const app = new pg.Client(pg.configuration());
      try { await app.connect(); await pg.migrate(app); console.log('Cấu hình cũ hợp lệ, schema sẵn sàng.'); } finally { await app.end(); }
      return;
    }
    const host = process.env.PGHOST || '127.0.0.1', port = Number(process.env.PGPORT || 5432);
    const admin = new pg.Client({ host, port, database:'postgres', user: process.env.PGUSER || 'postgres', password:process.env.PGPASSWORD, connectionTimeoutMillis:5000 });
    const password = crypto.randomBytes(32).toString('base64url');
    try {
      await admin.connect();
      const existing = await admin.query("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname='englive') OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='englive_app') AS used");
      if (existing.rows[0].used) throw new Error('Database englive hoặc role englive_app đã tồn tại. Không tự ghi đè; cần kiểm tra cấu hình trước.');
      await admin.query(`CREATE ROLE englive_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
      await admin.query("CREATE DATABASE englive OWNER englive_app ENCODING 'UTF8' TEMPLATE template0");
      await admin.query('REVOKE ALL ON DATABASE englive FROM PUBLIC');
      fs.mkdirSync(path.dirname(pg.configFile),{recursive:true});
      fs.writeFileSync(pg.configFile,JSON.stringify({host,port,database:'englive',user:'englive_app',password},null,2),{flag:'wx',mode:0o600});
    } finally { await admin.end(); }
    const app = new pg.Client(pg.configuration());
    try { await app.connect(); await pg.migrate(app); console.log('Đã tạo database englive và role riêng englive_app. Mật khẩu lưu riêng ngoài Git; không in ra màn hình.'); }
    finally { await app.end(); }
    console.log('Chưa nhập dữ liệu/chuyển backend. Chạy db:status để kiểm tra.'); return;
  }
  if (action === 'plan') {
    const source = path.resolve(process.argv[3] || path.join(__dirname, '..', 'data', 'db.json'));
    console.table(pg.plan(JSON.parse(fs.readFileSync(source, 'utf8'))).counts);
    console.log('Chỉ kiểm tra nguồn; chưa ghi vào PostgreSQL.'); return;
  }
  if (!['status','migrate','import'].includes(action)) throw new Error('Dùng status | migrate | plan [file] | import [file]');
  const client = new pg.Client(pg.configuration());
  try {
    await client.connect();
    if (action === 'migrate') { await pg.migrate(client); console.log('Schema englive đã sẵn sàng. Web hiện vẫn dùng JSON.'); return; }
    if (action === 'import') {
      const source = path.resolve(process.argv[3] || path.join(__dirname, '..', 'data', 'db.json'));
      const lock = path.join(path.dirname(source), '.writer.lock');
      if (fs.existsSync(lock)) {
        try { process.kill(Number(fs.readFileSync(lock, 'utf8')), 0); throw new Error('Dừng server ghi JSON trước khi import để tránh bản sao bị lỗi thời.'); }
        catch (e) { if (e.code !== 'ESRCH') throw e; }
      }
      const raw = fs.readFileSync(source);
      await pg.migrate(client);
      console.table(await pg.importData(client, JSON.parse(raw), crypto.createHash('sha256').update(raw).digest('hex')));
      console.log('Đã nhập và đối chiếu số lượng trong transaction. Chưa chuyển backend; không xóa JSON.'); return;
    }
    const status = await client.query('SELECT current_database() AS database, current_user AS role, version() AS version');
    console.table(status.rows);
    const schema = await client.query("SELECT to_regclass('englive.schema_migrations') AS ready");
    if (!schema.rows[0].ready) { console.log('Kết nối được, chưa tạo schema. Chạy npm run db:migrate.'); return; }
    const counts=[];
    for(const name of ['users','classes','class_memberships','class_sessions','lessons','assignments','submissions','chats','pdfs','recordings']) {
      const count=await client.query(`SELECT count(*) AS n FROM englive.${name}`);
      counts.push({table:name,rows:Number(count.rows[0].n)});
    }
    console.table(counts);
    const profile=path.join(process.env.DATA_DIR||path.join(__dirname,'..','data'),'storage.json');
    const selected=process.env.STORAGE_DRIVER||(fs.existsSync(profile)?JSON.parse(fs.readFileSync(profile,'utf8')).driver:'json');
    console.log('Nguồn lưu trữ đã chọn: '+selected+'. Khi khởi động web kiểm tra dòng Database: '+selected+'.');
  } finally { await client.end(); }
}
main().catch(e => { console.error('Database: ' + (e.code || e.message)); process.exitCode = 1; });
