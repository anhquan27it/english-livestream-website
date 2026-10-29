// Synchronous compatibility boundary only: no domain query rewrite or multi-server claim.
const {Worker,MessageChannel,receiveMessageOnPort}=require('node:worker_threads');
const path=require('node:path');
function bridge(config,key,schema) {
  const worker=new Worker(path.join(__dirname,'worker.js'),{workerData:{config,key:key.toString('base64'),schema}});
  worker.unref();
  let failed=false;
  worker.on('error',()=>{failed=true;});
  function call(command,data) {
    if(failed) throw new Error('PostgreSQL storage unavailable. Restart the application after checking DB.');
    const {port1,port2}=new MessageChannel(), signal=new SharedArrayBuffer(4), view=new Int32Array(signal);
    try {
      worker.postMessage({command,data,signal,port:port2},[port2]);
      if(Atomics.wait(view,0,0,30000)==='timed-out') { failed=true; worker.terminate(); throw new Error('PostgreSQL operation timed out. Application storage stopped.'); }
      const response=receiveMessageOnPort(port1)?.message;
      if(!response?.ok) { failed=true; throw new Error(response?.message||'PostgreSQL storage worker failed'); }
      return response.result;
    } finally { port1.close(); }
  }
  return {call, close(){try{if(!failed)call('close');}finally{worker.terminate();}}};
}
module.exports={bridge};
