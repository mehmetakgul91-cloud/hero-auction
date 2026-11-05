// Isolated HTTP-test preload only. Production has no clock-control endpoint.
// Freeze wall time and advance real arena callbacks deterministically over IPC.
const epoch=Date.now(),nativeInterval=globalThis.setInterval,nativeClear=globalThis.clearInterval;
let elapsed=0;
const arenaCallbacks=new Map();
Date.now=()=>epoch+elapsed;
globalThis.setInterval=(fn,ms,...args)=>{
 if(ms!==50)return nativeInterval(fn,ms,...args);
 const handle={arenaClock:true};arenaCallbacks.set(handle,()=>fn(...args));return handle;
};
globalThis.clearInterval=handle=>{if(!arenaCallbacks.delete(handle))nativeClear(handle)};
process.on('message',message=>{
 if(message?.type!=='arena-emotes-clock')return;
 for(let i=0;i<message.steps;i++){elapsed+=message.ms;for(const callback of [...arenaCallbacks.values()])callback()}
 process.send?.({type:'arena-emotes-clock',id:message.id});
});
