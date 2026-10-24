import {battleRoster} from './battle-roster.js';
import {prepareLiveArenaTeams} from './commander-live-team-preparation.js';
import {createLiveCommanderAbilities} from './commander-live-abilities.js';
import {createLiveCommanderCombat} from './commander-live-combat.js';
import {createCommanderProfile} from './arena-commanders.js';
import {createLiveArenaSession,viewLiveArenaSession,stepLiveArenaHero,advanceLiveArenaRound,castDuringLiveArena} from './commander-live-arena-session.js';

// A self-contained demonstration using the production combat scheduler. No rooms,
// accounts, timers, entry charges or match settlement are created here.
export function createArena3dDemo(){
 const ids=[['original:01','original:07','original:05','original:09','original:expansion-05'],
  ['original:06','original:expansion-16','original:12','original:expansion-01','original:expansion-07']];
 const cards=ids.map(team=>team.map((id,position)=>{
  const hero=battleRoster.find(h=>h.id===id);
  if(!hero)throw Error('Missing 3D demo hero: '+id);
  return {id,power:hero.proposedPower,role:hero.role,lane:position<2?'front':'back'};
 }));
 const commanders=['support','defense'].map(createCommanderProfile);
 const abilities=createLiveCommanderAbilities({matchKey:'arena-3d-demo',energy:[30,30],now:0});
 const teams=prepareLiveArenaTeams(...cards,{cardAdapter:'auction',commanders});
 const combat=createLiveCommanderCombat({abilities,teams,commanders});
 const session=createLiveArenaSession(combat,{parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true,damageSpecial:true});
 const initial=viewLiveArenaSession(session),frames=[];
 let lastVersion=initial.version;
 const capture=()=>{
  const snapshot=viewLiveArenaSession(session,{sinceVersion:lastVersion});
  frames.push({round:snapshot.round,events:snapshot.events,teams:snapshot.teams});
  lastVersion=snapshot.version;
 };
 for(let step=0;step<180&&!combat.finished;step++){
  if(viewLiveArenaSession(session).nextHero){stepLiveArenaHero(session);capture();}
  else{
   advanceLiveArenaRound(session);capture();
   const side=combat.round===2?1:combat.round===3?0:null;
   if(side!==null&&!combat.finished){
    castDuringLiveArena(session,{side,ability:'normal',requestId:'demo-cast-'+side,matchKey:'arena-3d-demo',now:combat.round*10000});capture();
   }
  }
 }
 const final=viewLiveArenaSession(session);
 if(!final.finished)throw Error('3D demo did not finish');
 return {demo:true,initial:initial.teams,frames,winner:final.winner,rounds:final.round,summary:final.summary,
  heroes:ids.flat().map(id=>{const h=battleRoster.find(h=>h.id===id);return {id,name:h.name,role:h.role,portrait:h.portrait};})};
}
