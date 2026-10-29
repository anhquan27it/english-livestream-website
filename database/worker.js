const {parentPort,workerData}=require('node:worker_threads');
const {Runtime}=require('./runtime');
let runtime;
parentPort.on('message',async({command,data,signal,port})=>{
  let result;
  try {
    if(command==='open') { runtime=new Runtime(workerData.config,Buffer.from(workerData.key,'base64'),workerData.schema); await runtime.open(); result=await runtime.load(); }
    else if(command==='write') { await runtime.write(data); result=true; }
    else if(command==='close') { await runtime?.close(); result=true; }
    else throw new Error('Invalid storage command');
    port.postMessage({ok:true,result});
  } catch(e) { port.postMessage({ok:false,message:e.code?'PostgreSQL error '+e.code:e.message}); }
  finally { port.close(); Atomics.store(new Int32Array(signal),0,1); Atomics.notify(new Int32Array(signal),0); }
});
