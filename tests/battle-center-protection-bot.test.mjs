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
const roster=[...battleRoster.filter(h=>h.role==='tank').slice(0,4),...battleRoster.filter(h=>h.role==='energy').slice(0,6)];
for(const difficulty of ['easy','medium','hard'])test(`${difficulty}: real bot formation and casts preserve permanent center defense through paced matches and rematches`,()=>{
 let now=0,callback,casts=0,deaths=0,protectedSnapshots=0;
 const lifecycle=createLiveArenaLifecycle({readablePacing:true,clock:()=>now,scheduler:fn=>{callback=fn;return 1},canceller(){}});
 for(let match=1;match<=2;match++){
  const matchKey=`center-bot:${match}`,botId=match===1?'magic':'defense';
  const commanders=[createCommanderProfile('defense'),createBotCommanderProfile(botId,difficulty)];
  const cards=[0,1].map(side=>roster.filter((_,i)=>i%2===side).map(h=>({id:h.id,power:h.proposedPower})));
  const formations=cards.map((team,side)=>chooseBotFormation(team,side?difficulty:'medium',()=>match===1?.5:.2));
  const ordered=cards.map((team,side)=>formations[side].positions.map((position,i)=>({...team[position],lane:formations[side].lanes[i]})));
  const teams=prepareLiveArenaTeams(...ordered,{commanders,cardAdapter:'auction'});
  const centers=teams.map(team=>team.filter(h=>h.lane==='back')[1].id);
  for(const [side,team] of teams.entries()){
   assert.equal(team.filter(h=>h.lane==='front').length,2,'actual bot chooses eligible 2/3 formation');
   assert.deepEqual(team.find(h=>h.id===centers[side]).centerDefenseBonus,{version:1,multiplier:1.15},'each fresh rematch initializes a new mark');
  }
  const combat=createLiveCommanderCombat({teams,commanders,abilities:createLiveCommanderAbilities({matchKey,now})});
  lifecycle.begin({matchKey,tokens:['human','bot'],combat,options:flags});
  const broken=[false,false];
  const audit=state=>{
   for(const [side,team] of state.teams.entries()){
    const center=team.find(h=>h.id===centers[side]),mark=center.centerDefenseBonus;
    assert.equal(mark.multiplier,1.15);
    const dead=team.some(h=>h.id!==center.id&&h.hp===0);
    if(dead&&!broken[side])deaths++;
    broken[side] ||= dead;
    assert.deepEqual(mark,{version:1,multiplier:1.15},'bonus persists after casualties');
    if(!broken[side])protectedSnapshots++;
   }
  };
  let lastCastAt=0,finished=false;
  for(let i=0;i<2500&&!finished;i++){
   now+=100;
   const bot=lifecycle.snapshot({matchKey,token:'bot',now}),combatNow=bot.combatTime;
   const action=chooseBotCast(bot,botId,difficulty,{now:combatNow,lastCastAt,startedAt:0,side:1});
   if(action){lifecycle.cast({matchKey,token:'bot',...action,requestId:`center_bot_${match}_${++casts}`,now});lastCastAt=combatNow;}
   const before=lifecycle.snapshot({matchKey,token:'human',now});audit(before);
   callback();assert.equal(lifecycle.status(matchKey).lastError,null);
   const after=lifecycle.snapshot({matchKey,token:'human',now});audit(after);
   // A server tick is a real automatic hero action, unlike explicit commander casts.
   for(const event of after.events.filter(e=>e.version>before.version&&e.damageType==='normal')){
    assert.ok(before.teams[1-event.side].some(h=>h.id===event.target&&h.hp>0),'automatic target is a living enemy');
   }
   finished=after.finished;
  }
  assert.equal(finished,true,'real paced combat finishes');
  assert.ok(broken.some(Boolean),'match must exercise an actual protector death');
  assert.equal(lifecycle.endRoom('center-bot'),1);
  assert.throws(()=>lifecycle.snapshot({matchKey,token:'human',now}),/Unknown active/);
 }
 assert.ok(casts>0,'real bot commander decisions execute');assert.ok(deaths>0);assert.ok(protectedSnapshots>0);
});
