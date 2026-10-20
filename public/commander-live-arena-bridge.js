// Opt-in bridge for a future authenticated live arena transport.
// Never falls back to legacy replay, demo state or a client-side battle simulator.
import {createLiveArenaCommanderControls} from './commander-live-arena-controls.js';
export function mountLiveArenaCommanderBridge({normalButton,ultimateButton,energyLabel,statusLabel,transport,side,commanderId}){
 if(!transport||typeof transport.snapshot!=='function'||typeof transport.cast!=='function'||![0,1].includes(side))throw Error('Authoritative live transport required');
 let snapshot=null,disposed=false;
 const readState=()=>{
  const state=snapshot?.abilities?.[side];
  return state||{energy:0,cooldownMs:0,finished:true};
 };
 const controls=createLiveArenaCommanderControls({
  normalButton,ultimateButton,energyLabel,statusLabel,readState,
  onMagicTarget:commanderId==='magic'?async ability=>{
   if(typeof transport.selectMagicTargets!=='function')throw Error('Magic target selector unavailable');
   return transport.selectMagicTargets(ability,snapshot?.teams?.[1-side]||[]);
  }:undefined,
  onCast:async cast=>{
   if(!snapshot||snapshot.finished)throw Error('Live battle unavailable');
   await transport.cast({...cast,side});
   snapshot=await transport.snapshot();
  }
 });
 async function refresh(){
  if(disposed)return;
  const next=await transport.snapshot();
  if(!next||!Array.isArray(next.abilities)||!Array.isArray(next.teams)||next.teams.length!==2)throw Error('Invalid authoritative battle snapshot');
  snapshot=next;controls.refresh();
 }
 return {refresh,destroy(){disposed=true;controls.destroy()}};
}
