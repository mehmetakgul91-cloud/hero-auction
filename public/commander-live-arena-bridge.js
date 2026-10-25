// Opt-in bridge for a future authenticated live arena transport.
// Never falls back to legacy replay, demo state or a client-side battle simulator.
import {commanderTargetMode} from './commander-magic-target-picker.js';
import {createLiveArenaCommanderControls} from './commander-live-arena-controls.js';
export function mountLiveArenaCommanderBridge({normalButton,ultimateButton,energyLabel,statusLabel,transport,side,commanderId}){
 if(!transport||typeof transport.snapshot!=='function'||typeof transport.cast!=='function'||![0,1].includes(side))throw Error('Authoritative live transport required');
 let snapshot=null,disposed=false,requestVersion=0;
 const readState=()=>{
  const state=snapshot?.abilities?.[side];
  const selectorAvailable=typeof transport.selectCommanderTargets==='function'||commanderId==='magic'&&typeof transport.selectMagicTargets==='function';
  const ultimateTargetAvailable=commanderId==='attack'?selectorAvailable&&(snapshot?.teams?.[1-side]||[]).some(hero=>hero.hp>0):commanderId==='support'?selectorAvailable&&(snapshot?.teams?.[side]||[]).some(hero=>hero.hp<=0):commanderId==='magic'?selectorAvailable&&(snapshot?.teams?.[side]||[]).some(hero=>hero.hp>0&&!(Number.isInteger(hero.arcaneSurgeUntilRound)&&hero.arcaneSurgeUntilRound>=snapshot.round)):true;
  return state?{...state,commanderId,side,ultimateTargetAvailable,ultimateUsed:snapshot.ultimateUsed??state.ultimateUsed,revivalUsed:snapshot.revivalUsed??state.revivalUsed}:{energy:0,ultimateEnergy:0,cooldownMs:0,finished:true};
 };
 const controls=createLiveArenaCommanderControls({
  normalButton,ultimateButton,energyLabel,statusLabel,readState,
  onMagicTarget:['attack','magic','support'].includes(commanderId)?async ability=>{
   const mode=commanderTargetMode(commanderId,ability);if(!mode)return false;
   const selector=transport.selectCommanderTargets??(commanderId==='magic'?transport.selectMagicTargets:null);
   if(typeof selector!=='function')throw Error('Commander target selector unavailable');
   const heroes=(snapshot?.teams?.[mode==='enemy-alive'?1-side:side]||[]).filter(hero=>mode==='ally-dead'?hero.hp<=0:hero.hp>0&&!(commanderId==='magic'&&ability==='ultimate'&&Number.isInteger(hero.arcaneSurgeUntilRound)&&hero.arcaneSurgeUntilRound>=snapshot.round));
   return selector.call(transport,ability,heroes,{commanderId,mode,side});
  }:undefined,
  onCast:async cast=>{
   if(!snapshot||snapshot.finished)throw Error('Live battle unavailable');
   await transport.cast({...cast,side});
   if(!disposed)await refresh();
  }
 });
 async function refresh(){
  if(disposed)return;
  const version=++requestVersion;
  const next=await transport.snapshot();
  if(disposed||version!==requestVersion)return;
  if(!next||!Array.isArray(next.abilities)||!Array.isArray(next.teams)||next.teams.length!==2)throw Error('Invalid authoritative battle snapshot');
  snapshot=next;controls.refresh();
 }
 return {refresh,destroy(){disposed=true;controls.destroy()}};
}
