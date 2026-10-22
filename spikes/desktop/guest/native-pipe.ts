/** Internal trusted harness process reader; never a native IPC endpoint. */
import {spawn} from 'node:child_process';

export function readNativePipe(executable:string,args:string[],env:NodeJS.ProcessEnv,maximum:number,signal:AbortSignal,onDiagnostic:(chunk:Buffer)=>void=()=>{}):Promise<Uint8Array> {
  if(!Number.isSafeInteger(maximum)||maximum<1) return Promise.reject(new Error('NATIVE_PIPE_BOUND_REQUIRED'));
  if(signal.aborted) return Promise.reject(new Error('CANCELLED'));
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{env,stdio:['ignore','pipe','pipe'],detached:true});
    let bytes=Buffer.alloc(0),ended=false;
    const finish=(error?:string)=>{
      if(ended)return;
      ended=true;signal.removeEventListener('abort',abort);clearTimeout(deadline);
      try{if(child.pid)process.kill(-child.pid,'SIGKILL');}catch{/* already gone */}
      if(error)reject(new Error(error));else resolve(bytes);
    };
    const abort=()=>finish('CANCELLED');
    const deadline=setTimeout(()=>finish('NATIVE_CLIPBOARD_DEADLINE'),1000);
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}
    child.stdout.on('data',(chunk:Buffer)=>{
      if(ended)return;
      bytes=Buffer.concat([bytes,chunk.subarray(0,maximum-bytes.length)]);
      if(bytes.length===maximum)finish();
    });
    child.stderr.on('data',(chunk:Buffer)=>{if(!ended)onDiagnostic(chunk);});
    child.once('error',()=>finish('NATIVE_CLIPBOARD_UNAVAILABLE'));
    // exit may precede the final stdout bytes or protocol-binding trace. close
    // establishes that both pipes have drained; the independent deadline stays.
    child.once('close',code=>finish(code===0?undefined:'NATIVE_CLIPBOARD_UNAVAILABLE'));
  });
}
