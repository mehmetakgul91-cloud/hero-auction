import test from 'node:test';
import assert from 'node:assert/strict';
import {battleRoster} from '../battle-roster.js';
import {createCommanderProfile} from '../arena-commanders.js';
import {chooseBotFormation,chooseBotCast,createBotCommanderProfile} from '../bot-strategy.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat} from '../commander-live-combat.js';
import {createLiveArenaLifecycle} from '../commander-live-arena-lifecycle.js';
const flags={parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true,damageSpecial:true};
const selected=[...battleRoster.filter(h=>h.active?.effect==='splash'),...battleRoster.filter(h=>h.role==='tank').slice(0,3)];
for(const difficulty of ['easy','medium','hard'])test(`${difficulty}: actual bot decisions, paced live combat and rematch preserve splash basis`,()=>{
 let now=0,callback,casts=0,splashes=0,shielded=0;
 const lifecycle=createLiveArenaLifecycle({readablePacing:true,clock:()=>now,scheduler:fn=>{callback=fn;return 1},canceller(){}});
 for(let match=1;match<=2;match++){
  const matchKey=`742:${match}:splash-bot`,botId=match===1?'defense':'magic';
  const commanders=[createCommanderProfile('defense'),createBotCommanderProfile(botId,difficulty)];
  const cards=[0,1].map(side=>selected.filter((_,i)=>i%2===side).map(h=>({id:h.id,power:h.proposedPower,lane:h.role==='tank'?'front':'back'})));
  const formation=chooseBotFormation(cards[1],difficulty,()=>.5);
  cards[1]=formation.positions.map((position,i)=>({...cards[1][position],lane:formation.lanes[i]}));
  const teams=prepareLiveArenaTeams(cards[0],cards[1],{commanders,cardAdapter:'auction'});
  const combat=createLiveCommanderCombat({teams,commanders,abilities:createLiveCommanderAbilities({matchKey,now})});
  lifecycle.begin({matchKey,tokens:['human','bot'],combat,options:flags});
  let lastCastAt=0,finished=false;
  for(let i=0;i<2500&&!finished;i++){
   now+=100;
   // Same snapshot and choice function as server.js tickBotBattle. Only the
   // wall clock is advanced manually; engine and bot decision rules are real.
   const bot=lifecycle.snapshot({matchKey,token:'bot',now}),combatNow=bot.combatTime;
   const action=chooseBotCast(bot,botId,difficulty,{now:combatNow,lastCastAt,startedAt:0,side:1});
   if(action){lifecycle.cast({matchKey,token:'bot',...action,requestId:`splash_bot_${match}_${++casts}`,now});lastCastAt=combatNow;}
   const human=lifecycle.snapshot({matchKey,token:'human',now});
   if(human.abilities[0].canUseNormal)lifecycle.cast({matchKey,token:'human',ability:'normal',requestId:`human_${match}_${i}`,now});
   const before=lifecycle.snapshot({matchKey,token:'human',now});
   callback();assert.equal(lifecycle.status(matchKey).lastError,null);
   const after=lifecycle.snapshot({matchKey,token:'human',now});
   for(const splash of after.events.filter(e=>e.version>before.version&&e.damageType==='splash')){
    const primary=after.events.find(e=>e.version===splash.version&&e.actor===splash.actor&&e.damageType==='special');
    const actor=before.teams[splash.side].find(h=>h.id===splash.actor);
    const target=before.teams[1-splash.side].find(h=>h.id===splash.target);
    assert.equal(splash.rawDamage,Math.max(1,Math.floor(primary.rawDamage*(actor.active?.splashRate??.15))));
    assert.equal(splash.absorbed,Math.min(target.shield,Math.floor(splash.rawDamage*7/10)));
    splashes++;if(primary.absorbed>0)shielded++;
   }
   finished=after.finished;
  }
  assert.equal(finished,true,'the real paced combat must reach completion');
  assert.equal(lifecycle.endRoom('742'),1);
  assert.throws(()=>lifecycle.snapshot({matchKey,token:'human',now}),/Unknown active/);
 }
 assert.ok(casts>0,'bot must actually issue commander commands');assert.ok(splashes>0);assert.ok(shielded>0);
 console.log(JSON.stringify({difficulty,matches:2,casts,splashes,shieldedPrimarySplashes:shielded}));
});
