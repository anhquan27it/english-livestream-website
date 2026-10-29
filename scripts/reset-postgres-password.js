// Invoked only by the local elevated recovery script; never put the password in argv.
const { Client } = require('pg');
async function main() {
  const password = process.env.ENGLIVE_RESET_PASSWORD;
  if (typeof password !== 'string' || password.length < 12) throw new Error('A new password of at least 12 characters is required.');
  const mode = process.argv[2];
  if (!['reset','verify'].includes(mode)) throw new Error('Invalid recovery mode.');
  const client = new Client({ host:'127.0.0.1',port:5432,user:'postgres',database:'postgres',password:mode === 'verify' ? password : '',connectionTimeoutMillis:5000 });
  try {
    await client.connect();
    if (mode === 'reset') {
      await client.query("SET password_encryption = 'scram-sha-256'");
      // Format on the server safely quotes even passwords containing quotes/backslashes.
      const result = await client.query("SELECT format('ALTER ROLE postgres PASSWORD %L', $1::text) AS statement",[password]);
      await client.query(result.rows[0].statement);
    } else { await client.query('SELECT 1'); }
  } finally { await client.end(); }
}
main().catch(e=>{ console.error('PostgreSQL recovery failed (' + (e.code || 'connection/query error') + ').');process.exitCode=1; });
