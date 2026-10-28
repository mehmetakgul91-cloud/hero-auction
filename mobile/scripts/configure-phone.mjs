// Phone-only package: fixed existing guest test service, system TLS roots only.
import {rm, writeFile} from 'node:fs/promises';
const origin='https://hero-auction-commander-test.onrender.com';
await rm(new URL('../android/app/src/debug/',import.meta.url),{recursive:true,force:true});
await writeFile(new URL('../config.local.json',import.meta.url),JSON.stringify({apiOrigin:origin,publicOrigin:origin})+'\n');

// Wake the free test service and reject missing Android CORS before packaging.
let ready=false;
for(let attempt=0;attempt<12;attempt++){
  try{
    const response=await fetch(origin+'/api/info',{headers:{Origin:'https://localhost'},signal:AbortSignal.timeout(30000)});
    if(response.ok && response.headers.get('access-control-allow-origin')==='https://localhost'){
      const info=await response.json();
      if(info.catalogueCount>=50){ready=true;break;}
    }
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!ready)throw Error('Guest test backend is unavailable or Android CORS is not enabled.');
const preflight=await fetch(origin+'/api/auth/guest',{method:'OPTIONS',headers:{
  Origin:'https://localhost','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'
},signal:AbortSignal.timeout(30000)});
if(preflight.status!==204 || preflight.headers.get('access-control-allow-origin')!=='https://localhost'){
  throw Error('Guest test backend rejects native sign-in preflight.');
}
console.log('Phone test service is reachable and accepts the native origin.');
