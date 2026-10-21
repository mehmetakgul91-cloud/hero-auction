import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createLiveCommanderAbilities,castLiveCommanderAbility,viewLiveCommanderAbilities} from '../commander-live-abilities.js';
test('shared commander effect lock is atomic and expires after 1.2 seconds',()=>{

const session=createLiveCommanderAbilities({matchKey:'test',energy:[100,100],now:0});
castLiveCommanderAbility(session,{side:0,ability:'normal',matchKey:'test',requestId:'first_cast',now:0});
if(viewLiveCommanderAbilities(session,1,1199).canUseNormal)throw Error('opponent enabled early');
for(const now of [0,1000,1199]){
 let rejected=false;try{castLiveCommanderAbility(session,{side:1,ability:'normal',matchKey:'test',requestId:'opponent_'+now,now});}catch(e){rejected=/efekti/.test(e.message)}
 if(!rejected||session.energy[1]!==100||session.casts.length!==1)throw Error('shared lock not atomic');
}
const duplicate=castLiveCommanderAbility(session,{side:0,ability:'normal',matchKey:'test',requestId:'first_cast',now:100});
if(!duplicate.duplicate||session.energy[0]!==60)throw Error('duplicate changed energy');
castLiveCommanderAbility(session,{side:1,ability:'normal',matchKey:'test',requestId:'second_cast',now:1200});
if(session.energy[1]!==60||session.effectUntil!==2400)throw Error('unlock boundary');
if(viewLiveCommanderAbilities(session,0,2400).canUseNormal)throw Error('personal cooldown lost');
if(!viewLiveCommanderAbilities(session,0,5000).canUseNormal)throw Error('personal cooldown not ended');

});
test('victory waits for the last soul and active commander effect exactly once',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 const wrapper=source.slice(source.indexOf('function finishCommanderControls(){'),source.indexOf('const multiplayerCode='))+source.slice(source.indexOf('function showVictoryReveal(){'),source.indexOf('function revealVictoryNow(){'));
 new Function("\nlet now=0,victoryRevealDone=false,finalResult={},victoryPendingTimer=null,arenaFinaleActive=false,revealed=0,paused=0,id=0;\nconst buttons=[{disabled:false},{disabled:false}],finished=[];const CustomEvent=class{constructor(type){this.type=type}};const window={heroCommanderEffectUntil:0,dispatchEvent:event=>finished.push(event.type)},Date={now:()=>now},nodes={'arena-commander-dock':{hidden:false},'arena-commander-matchup':{hidden:false},'experimental-commander-controls':{hidden:false,querySelectorAll:()=>buttons},message:{},play:{disabled:false,textContent:'⚡ CANLI SAVAŞ SÜRÜYOR'}};\nconst $=key=>nodes[key],pauseArenaClock=()=>paused++,revealVictoryNow=()=>{revealed++;victoryRevealDone=true};\nconst tasks=new Map(),setTimeout=(fn,delay)=>{tasks.set(++id,{fn,at:now+delay});return id};\nconst advance=t=>{now=t;for(const [key,task] of [...tasks])if(task.at<=now){tasks.delete(key);task.fn();}};\n"+wrapper+"\nshowVictoryReveal();showVictoryReveal();if(tasks.size!==1)throw Error('duplicate finale');if(!nodes.play.disabled||nodes.play.textContent!=='✓ SAVAŞ TAMAMLANDI')throw Error('live status remains after finish');if(!nodes['arena-commander-dock'].hidden||!nodes['arena-commander-matchup'].hidden||!nodes['experimental-commander-controls'].hidden||buttons.some(button=>!button.disabled))throw Error('commander panel remains during finale');if(finished.join()!=='heroarena:battle-finished')throw Error('missing or duplicate battle finish');\nadvance(2399);if(revealed)throw Error('soul cut short');\nwindow.heroCommanderEffectUntil=3200;advance(2400);if(revealed)throw Error('commander effect cut short');\nadvance(3199);if(revealed)throw Error('revealed early');\nwindow.heroCommanderImpactUntil=4400;advance(3200);if(revealed)throw Error('hero impact cut short');advance(4400);if(revealed!==1||paused!==1)throw Error('missing finale');\nreturn 'Final soul delay, commander effect wait and single victory reveal passed';\n")();
});
