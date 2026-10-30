import {battleRoster} from '../battle-roster.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createCommanderProfile} from '../arena-commanders.js';
import {createLiveArenaSession,viewLiveArenaSession,stepLiveArenaHero,advanceLiveArenaRound,castDuringLiveArena} from '../commander-live-arena-session.js';

export const IDS=[['original:01','original:02','original:09','original:expansion-01','original:expansion-08'],['original:03','original:06','original:expansion-13','original:expansion-14','original:expansion-23']];
// Runs the unchanged engine offline; never opens a room or accesses accounts/wallets.
export function generateMobileReplay(){
 const cards=IDS.map(team=>team.map((id,index)=>{const hero=battleRoster.find(h=>h.id===id);return {id,power:hero.proposedPower,role:hero.role,lane:index<2?'front':'back'};}));
 const commanders=['support','defense'].map(createCommanderProfile);
 const abilities=createLiveCommanderAbilities({matchKey:'mobile3d-offline',energy:[30,30],now:0});
 const teams=prepareLiveArenaTeams(...cards,{cardAdapter:'auction',commanders});
 const combat=createLiveCommanderCombat({abilities,teams,commanders});
 const session=createLiveArenaSession(combat,{parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true,damageSpecial:true});
 const initial=viewLiveArenaSession(session);const frames=[];let version=initial.version;const casted=new Set();
 const capture=()=>{const snapshot=viewLiveArenaSession(session,{sinceVersion:version});frames.push({round:snapshot.round,events:snapshot.events,teams:snapshot.teams});version=snapshot.version;};
 for(let i=0;i<200&&!combat.finished;i++){
  if(viewLiveArenaSession(session).nextHero){stepLiveArenaHero(session);capture();}
  else {advanceLiveArenaRound(session);capture();}
  // Healing/critical hits can leave every survivor at full HP at a round
  // boundary. Observe the engine's current state; never force an invalid cast.
  for(const side of [1,0]){
   if(combat.finished||casted.has(side)||combat.round<(side===1?2:3))continue;
   const snapshot=viewLiveArenaSession(session);
   if(side===0&&!snapshot.teams[0].some(h=>h.hp>0&&h.hp<h.maxHp))continue;
   castDuringLiveArena(session,{side,ability:'normal',requestId:'mobile3d-cast-'+side,matchKey:'mobile3d-offline',now:combat.round*10000});casted.add(side);capture();
  }
 }
 const final=viewLiveArenaSession(session);if(!final.finished)throw Error('Replay must reach a terminal engine snapshot');
 return {schema:1,source:'unchanged-live-engine',initial:initial.teams,frames,winner:final.winner,rounds:final.round,summary:final.summary};
}
// Browser receives only presentation fields; all values are copied, never recalculated.
export function compactReplay(data){
 const teams=value=>value.map(team=>team.map(({id,name,role,lane,hp,maxHp,shield})=>({id,name,role,lane,hp,maxHp,shield})));
 return {...data,initial:teams(data.initial),frames:data.frames.map(frame=>({...frame,teams:teams(frame.teams)}))};
}
