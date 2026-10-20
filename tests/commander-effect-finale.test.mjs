import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createLiveCommanderAbilities,castLiveCommanderAbility,viewLiveCommanderAbilities} from '../commander-live-abilities.js';
test('shared commander effect lock is atomic and expires after two seconds',()=>{

const session=createLiveCommanderAbilities({matchKey:'test',energy:[100,100],now:0});
castLiveCommanderAbility(session,{side:0,ability:'normal',matchKey:'test',requestId:'first_cast',now:0});
if(viewLiveCommanderAbilities(session,1,1999).canUseNormal)throw Error('opponent enabled early');
for(const now of [0,1000,1999]){
 let rejected=false;try{castLiveCommanderAbility(session,{side:1,ability:'normal',matchKey:'test',requestId:'opponent_'+now,now});}catch(e){rejected=/efekti/.test(e.message)}
 if(!rejected||session.energy[1]!==100||session.casts.length!==1)throw Error('shared lock not atomic');
}
const duplicate=castLiveCommanderAbility(session,{side:0,ability:'normal',matchKey:'test',requestId:'first_cast',now:100});
if(!duplicate.duplicate||session.energy[0]!==60)throw Error('duplicate changed energy');
castLiveCommanderAbility(session,{side:1,ability:'normal',matchKey:'test',requestId:'second_cast',now:2000});
if(session.energy[1]!==60||session.effectUntil!==4000)throw Error('unlock boundary');
if(viewLiveCommanderAbilities(session,0,4000).canUseNormal)throw Error('personal cooldown lost');
if(!viewLiveCommanderAbilities(session,0,5000).canUseNormal)throw Error('personal cooldown not ended');

});
test('victory waits for the last soul and active commander effect exactly once',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 const wrapper=source.slice(source.indexOf('function showVictoryReveal(){'),source.indexOf('function revealVictoryNow(){'));
 new Function("\nlet now=0,victoryRevealDone=false,finalResult={},victoryPendingTimer=null,arenaFinaleActive=false,revealed=0,paused=0,id=0;\nconst window={heroCommanderEffectUntil:0},Date={now:()=>now},nodes={'experimental-commander-controls':{querySelectorAll:()=>[]},message:{}};\nconst $=key=>nodes[key],pauseArenaClock=()=>paused++,revealVictoryNow=()=>{revealed++;victoryRevealDone=true};\nconst tasks=new Map(),setTimeout=(fn,delay)=>{tasks.set(++id,{fn,at:now+delay});return id};\nconst advance=t=>{now=t;for(const [key,task] of [...tasks])if(task.at<=now){tasks.delete(key);task.fn();}};\n"+wrapper+"\nshowVictoryReveal();showVictoryReveal();if(tasks.size!==1)throw Error('duplicate finale');\nadvance(2399);if(revealed)throw Error('soul cut short');\nwindow.heroCommanderEffectUntil=3200;advance(2400);if(revealed)throw Error('commander effect cut short');\nadvance(3199);if(revealed)throw Error('revealed early');\nadvance(3200);if(revealed!==1||paused!==1)throw Error('missing finale');\nreturn 'Final soul delay, commander effect wait and single victory reveal passed';\n")();
});
