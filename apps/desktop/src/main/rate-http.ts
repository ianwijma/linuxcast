import {request,Agent} from 'node:https';
import {lookup} from 'node:dns';
import {BlockList,isIP} from 'node:net';
import {ratePairSchema} from '@linuxcast/contracts';
const blocked=new BlockList(),global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(address,prefix,'ipv4');
for(const [address,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]] as const)blocked.addSubnet(address,prefix,'ipv6');
/** Conservative native egress policy: public unicast only, no mapped/tunnel/local IP. */
export function publicRateAddress(value:string):boolean{
 const family=isIP(value);if(family===4)return !blocked.check(value,'ipv4');
 return family===6&&global6.check(value,'ipv6')&&!blocked.check(value,'ipv6');
}
/** One fixed public HTTPS source. No caller URL/headers/amount, redirects or insecure TLS. */
export async function fetchFrankfurterRate(pair:{base:string;quote:string},signal:AbortSignal):Promise<unknown>{
 ratePairSchema.parse(pair);if(signal.aborted)throw new Error('Rate request cancelled.');
 const agent=new Agent({keepAlive:false,maxSockets:1,lookup(hostname,options,callback){
  if(hostname!=='api.frankfurter.dev'){callback(new Error('Rate destination refused.'),'',0);return;}
  lookup(hostname,{all:true,verbatim:true},(error,addresses)=>{
   if(signal.aborted||error||!addresses.length||addresses.length>32||addresses.some(value=>!publicRateAddress(value.address))){callback(new Error('Rate destination unavailable.'),'',0);return;}
   // Supply validated addresses directly to the connection, without a second lookup.
   if(options.all)callback(null,addresses);else{const selected=addresses.find(value=>!options.family||value.family===options.family);if(!selected){callback(new Error('Rate destination unavailable.'),'',0);return;}callback(null,selected.address,selected.family);}
  });
 }});
 try{return await new Promise<unknown>((resolve,reject)=>{
  let settled=false;const timer:{id:ReturnType<typeof setTimeout>|undefined}={id:undefined};
  const finish=(error:Error|null,value?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer.id);if(error)reject(new Error('Rate source unavailable.'));else resolve(value);};
  const req=request({protocol:'https:',hostname:'api.frankfurter.dev',port:443,path:`/v2/rate/${pair.base.toLowerCase()}/${pair.quote.toLowerCase()}`,method:'GET',agent,signal,headers:{Accept:'application/json','User-Agent':'Linuxcast/0.1'}},response=>{
   const type=response.headers['content-type'],encoding=response.headers['content-encoding'],length=Number(response.headers['content-length']??0);
   if(response.statusCode!==200||typeof type!=='string'||!/^application\/json(?:;|$)/iu.test(type)||(encoding!==undefined&&encoding!=='identity')||!Number.isFinite(length)||length<0||length>16384){response.destroy();req.destroy();finish(new Error('Invalid rate response.'));return;}
   let bytes=0;const chunks:Buffer[]=[];
   response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>16384){response.destroy();req.destroy();finish(new Error('Rate response too large.'));return;}chunks.push(Buffer.from(chunk));});
   response.once('error',()=>finish(new Error('Rate response failed.')));
   response.once('aborted',()=>finish(new Error('Rate response interrupted.')));
   response.once('end',()=>{try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{finish(new Error('Invalid rate response.'));}});
  });
  timer.id=setTimeout(()=>{req.destroy();finish(new Error('Rate deadline.'));},7000);
  req.once('error',()=>finish(new Error('Rate source unavailable.')));req.end();
 });}finally{agent.destroy();}
}
