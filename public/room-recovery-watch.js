// Authenticated presence on formation/arena pages. Presence is not gameplay.
export function watchRecoveredRoom({code,token,readAuth,onRoom,fetch:fetcher=globalThis.fetch,EventSource:Source=globalThis.EventSource,setInterval:schedule=globalThis.setInterval,clearInterval:cancel=globalThis.clearInterval}) {
 const original=readAuth();if(!original?.authToken)return()=>{};
 let stopped=false,source=null,busy=false;
 const current=()=>!stopped&&readAuth()?.authToken===original.authToken;
 const deliver=room=>{if(current()&&room?.code===code)onRoom(room);};
 async function refresh(){
  if(!current()){stop();return;}if(busy)return;busy=true;
  try{const response=await fetcher('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,token,authToken:original.authToken})});if(response.ok)deliver((await response.json()).room);}catch{}finally{busy=false;}
 }
 function stop(){if(stopped)return;stopped=true;cancel(timer);source?.close();}
 const timer=schedule(refresh,5000);
 if(Source)try{const q=new URLSearchParams({code,token,authToken:original.authToken});source=new Source('/api/events?'+q);source.onmessage=event=>{if(!current()){stop();return;}try{deliver(JSON.parse(event.data))}catch{}};}catch{/* Authenticated polling remains available if SSE cannot open. */}
 void refresh();return stop;
}
