const {spawn}=require('node:child_process'),crypto=require('node:crypto');
const {Client,configuration}=require('../database/postgres');
async function main() {
  const schema='englive_test_'+crypto.randomBytes(8).toString('hex');
  const client=new Client(configuration()); await client.connect();
  let code=1;
  try {
    const child=spawn(process.execPath,['tests/smoke.js'],{cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,TEST_POSTGRES:'1',ENGLIVE_PG_SCHEMA:schema},stdio:'inherit'});
    code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',c=>resolve(c??1));});
  } finally {
    if(!/^englive_test_[a-f0-9]{16}$/.test(schema))throw new Error('Invalid test schema');
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await client.end();
  }
  process.exitCode=code;
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
