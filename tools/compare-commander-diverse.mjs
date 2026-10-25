// Expanded LOCAL audit. Default only builds a reviewable manifest; --run is explicit.
import {gzipSync} from 'node:zlib';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'docs/ability-balance');
const random=seed=>{let n=crypto.createHash('sha256').update(seed).digest().readUInt32BE(0);return()=>{n=(Math.imul(1664525,n)+1013904223)>>>0;return n/4294967296;};};
const templates={balanced:['tank','fighter','energy','assassin','support'],fortress:['tank','tank','fighter','energy','support'],mages:['tank','energy','energy','assassin','support'],healers:['tank','fighter','energy','support','support'],assassins:['tank','fighter','assassin','assassin','support'],burst:['tank','fighter','fighter','energy','assassin']};
const bands=[[2,2,1],[1,3,1],[1,2,2],[0,2,3]],rarities=['advanced','rare','legendary'];
const key=team=>team.map(h=>h.id).sort().join('|');
export function buildDiverseManifest(roster){
 const rng=random('diverse-compositions-v1'),usage=new Map(roster.map(h=>[h.id,0])),used=new Set(),pairs=[];
 for(const [template,roles]of Object.entries(templates))for(let band=0;band<bands.length;band++){
  const candidates=new Map();
  for(let tries=0;tries<50000&&candidates.size<700;tries++){
   const team=[];for(const role of roles){const choices=roster.filter(h=>h.role===role&&!team.some(x=>x.id===h.id));team.push(choices[Math.floor(rng()*choices.length)]);}
   if(!rarities.every((r,i)=>team.filter(h=>h.rarity===r).length===bands[band][i]))continue;
   candidates.set(key(team),team);
  }
  let best=null,bestScore=-Infinity;
  const eligible=[...candidates.values()].filter(t=>!used.has(key(t)));
  for(let i=0;i<eligible.length;i++)for(let j=i+1;j<eligible.length;j++){
   const a=eligible[i],b=eligible[j],pa=a.reduce((n,h)=>n+h.proposedPower,0),pb=b.reduce((n,h)=>n+h.proposedPower,0);
   if(Math.abs(pa-pb)>4||a.some(h=>b.some(x=>x.id===h.id)))continue;
   const ids=[...new Set([...a,...b].map(h=>h.id))];
   const score=ids.reduce((n,id)=>n+(usage.get(id)===0?100:1/(1+usage.get(id))),0)-Math.abs(pa-pb)*.01;
   if(score>bestScore){best={a,b,pa,pb};bestScore=score;}
  }
  assert.ok(best,`matched candidates ${template}/${band}`);
  for(const team of [best.a,best.b]){used.add(key(team));for(const h of team)usage.set(h.id,usage.get(h.id)+1);}
  pairs.push({index:pairs.length,template,rarityBand:Object.fromEntries(rarities.map((r,i)=>[r,bands[band][i]])),summedPower:[best.pa,best.pb],teams:[best.a,best.b].map(t=>t.map((h,index)=>({...h,lane:index<2?'front':'back'})))});
 }
 const covered=[...usage].filter(([,n])=>n>0).length;
 assert.equal(used.size,48);assert.equal(covered,50,'all roster heroes must appear');
 const counterPairs=[];
 for(const [left,right] of [['fortress','mages'],['healers','burst']]){
  const aTeams=pairs.filter(p=>p.template===left).flatMap(p=>p.teams),bTeams=pairs.filter(p=>p.template===right).flatMap(p=>p.teams),matches=[];
  for(const a of aTeams)for(const b of bTeams){const pa=a.reduce((n,h)=>n+h.proposedPower,0),pb=b.reduce((n,h)=>n+h.proposedPower,0);if(Math.abs(pa-pb)<=4&&!a.some(h=>b.some(x=>x.id===h.id)))matches.push({a,b,pa,pb});}
  matches.sort((a,b)=>Math.abs(a.pa-a.pb)-Math.abs(b.pa-b.pb)||key(a.a).localeCompare(key(b.a))||key(a.b).localeCompare(key(b.b)));
  const usedMatchTeams=new Set();
  for(const match of matches){if(usedMatchTeams.has(key(match.a))||usedMatchTeams.has(key(match.b)))continue;counterPairs.push({index:pairs.length+counterPairs.length,template:left+'-versus-'+right,rarityBand:'unmatched-cross-role-counter-template',summedPower:[match.pa,match.pb],teams:[match.a,match.b]});usedMatchTeams.add(key(match.a));usedMatchTeams.add(key(match.b));if(usedMatchTeams.size===4)break;}
  assert.equal(usedMatchTeams.size,4,'two feasible disjoint counter-template matches '+left+'/'+right);
 }
 return {manifestVersion:'diverse-v1-role-rarity-power-10distinct',label:'Synthetic role/rarity and summed proposedPower matching; NOT auction-price or budget equivalence.',uniqueCompositions:used.size,heroesCovered:covered,pairs,counterPairs,usage:Object.fromEntries(usage)};
}
// Transparent heuristic, not an optimizer: approximate three-round attack output.
// Immediate unacted damage gets a small timing weight; special AoE is included;
// expected healer/hybrid utility turns contribute zero rather than fake damage.
export function mageAuditScore(unit,allies,enemies,round){
 const first=unit.lastActionRound===round?round+1:round;let score=0;
 for(let turn=first;turn<first+3;turn++){
  const special=turn%3===0,skill=unit.active;
  const heals=special&&((unit.role==='support'&&skill?.effect==='shield'&&skill.supportHybrid)||(skill?.effect==='heal'&&(unit.role==='support'?allies.some(a=>a.hp<a.maxHp):unit.hp<unit.maxHp)));
  if(heals)continue;
  let rate=special?(skill?.power??(skill?1.12:1.15)):1;
  if(special&&(unit.role==='energy'||skill?.effect==='splash'))rate*=1+Math.max(0,enemies.length-1)*(skill?.effect==='splash'?(skill.splashRate??.22):.15);
  score+=unit.attack*rate*(turn===round?1.15:1);
 }
 return score;
}
export function chooseAuditAction(combat,side,availability,policy,ultimatesEnabled,auditState={}){
 const allies=combat.teams[side].filter(u=>u.hp>0),enemies=combat.teams[1-side].filter(u=>u.hp>0),id=combat.commanders[side].commanderId,round=combat.round;
 if(!allies.length||!enemies.length)return null;
 const strongest=units=>[...units].sort((a,b)=>b.attack-a.attack||a.id.localeCompare(b.id))[0];
 const allowNormal=policy==='mixed-normal-first'||(policy==='early-normal-then-reserve'&&(!ultimatesEnabled||combat.ultimateUsed?.[side]||(!auditState.earlyNormalUsed&&round<=2)))||(policy==='reserve-ultimate'&&(!ultimatesEnabled||combat.ultimateUsed?.[side]));
 if(allowNormal&&availability.canUseNormal){
  if(id==='attack')return {ability:'normal'};
  if(id==='defense'&&allies.reduce((n,u)=>n+(u.shield||0),0)<allies.reduce((n,u)=>n+u.maxHp,0)*.10)return {ability:'normal'};
  if(id==='support'&&allies.reduce((n,u)=>n+u.maxHp-u.hp,0)>=allies.reduce((n,u)=>n+u.maxHp,0)*.10)return {ability:'normal'};
  if(id==='magic'){const target=strongest(enemies.filter(u=>!(u.commanderWeakenUntilRound>=round)));if(target)return {ability:'normal',targetIds:[target.id]};}
 }
 if(!ultimatesEnabled||!availability.canUseUltimate||combat.ultimateUsed?.[side])return null;
 if(id==='attack'&&allies.some(u=>u.commanderFocusTargetId&&u.commanderFocusUntilRound>=round&&enemies.some(e=>e.id===u.commanderFocusTargetId)))return null;
 if(id==='magic'){const target=allies.filter(u=>!(u.arcaneSurgeUntilRound>=round)).sort((a,b)=>mageAuditScore(b,allies,enemies,round)-mageAuditScore(a,allies,enemies,round)||a.id.localeCompare(b.id))[0];return target?{ability:'ultimate',targetIds:[target.id]}:null;}
 if(id==='support'){if(combat.revivalUsed?.[side])return null;const target=combat.teams[side].filter(u=>u.hp===0).sort((a,b)=>b.maxHp-a.maxHp||a.id.localeCompare(b.id))[0];return target?{ability:'ultimate',targetIds:[target.id]}:null;}
 return {ability:'ultimate'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
const roster=JSON.parse(fs.readFileSync(path.join(root,'battle-roster.json'))).characters;
const manifest=buildDiverseManifest(roster);
fs.writeFileSync(path.join(out,'commander-diverse-manifest.json'),JSON.stringify(manifest,null,2));
if(!process.argv.includes('--run')&&!process.argv.includes('--pilot')){console.log(JSON.stringify({manifestOnly:true,uniqueCompositions:manifest.uniqueCompositions,heroesCovered:manifest.heroesCovered,pairs:manifest.pairs.length}));}
else{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hero-diverse-'));
 try{
  fs.mkdirSync(path.join(temp,'public'));for(const name of fs.readdirSync(root))if(/\.(js|json)$/.test(name))fs.copyFileSync(path.join(root,name),path.join(temp,name));for(const name of fs.readdirSync(path.join(root,'public')))if(name.endsWith('.js'))fs.copyFileSync(path.join(root,'public',name),path.join(temp,'public',name));
  const cursor=path.join(temp,'commander-basic-turn-session.js'),text=fs.readFileSync(cursor,'utf8');assert.ok(text.includes('randomInt(100)<8'));fs.writeFileSync(cursor,text.replaceAll('randomInt(100)<8','globalThis.__diverseCritical()'));
  const load=name=>import(pathToFileURL(path.join(temp,name)).href);
  const {prepareLiveArenaTeams}=await load('commander-live-team-preparation.js'),{createLiveCommanderCombat}=await load('commander-live-combat.js'),{createLiveCommanderAbilities,viewLiveCommanderAbilities}=await load('commander-live-abilities.js'),{createLiveArenaRegistry}=await load('commander-live-arena-registry.js'),{createLiveArenaPacer}=await load('commander-live-arena-pacer.js'),{battleOutcome}=await load('battle-result.js'),{COMMANDER_ULTIMATE_COSTS}=await load('public/commander-ability-rules.js');
  const {chooseBotFormation}=await load('bot-strategy.js');
  const full={parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true,damageSpecial:true};
  const profile=(id,level)=>({commanderId:id,levels:{attack:0,defense:0,magic:0,support:0,[id]:level}});
  function run(cards,options,policy,enabled){
   const rng=random(options.seed);globalThis.__diverseCritical=()=>rng()<.08;
   const matchKey='diverse:local',tokens=['seat0','seat1'],combat=createLiveCommanderCombat({teams:prepareLiveArenaTeams(...cards,options),abilities:createLiveCommanderAbilities({matchKey,energy:[30,30],now:0}),commanders:options.commanders});
   const registry=createLiveArenaRegistry();registry.register({matchKey,tokens,combat,options:full});let now=0,heroActions=0,iterations=0,castId=0;const trace=[];
   const pacer=createLiveArenaPacer({registry,matchKey,token:tokens[0],intervalMs:900,clock:()=>now});pacer.start(now);
   while(!combat.finished&&iterations++<2000){
    // Re-evaluate after every actual hero event, round transition and ability
    // lock/cooldown boundary. No synthetic round-start-only energy restriction.
    for(const side of [0,1]){
     const availability=viewLiveCommanderAbilities(combat.abilities,side,now),decision=chooseAuditAction(combat,side,availability,policy,Array.isArray(enabled)?enabled[side]:enabled,{earlyNormalUsed:trace.some(e=>e.side===side&&e.ability==='normal')});if(!decision)continue;
     const energyBefore=combat.abilities.energy[side];registry.cast({matchKey,token:tokens[side],...decision,requestId:'diverse_'+(++castId),now});
     const focusGuardTargetsBySide=[0,1].map(attacking=>combat.teams[1-attacking].filter(enemy=>enemy.lastStandReady&&enemy.lastStandUntilRound>=combat.round&&combat.teams[attacking].some(ally=>ally.hp>0&&ally.commanderFocusTargetId===enemy.id&&ally.commanderFocusUntilRound>=combat.round)).map(enemy=>enemy.id));
     const focusGuardTargets=focusGuardTargetsBySide[side];
     trace.push({side,round:combat.round,heroActions,at:now,energyBefore,energyAfter:combat.abilities.energy[side],focusGuardTargets,focusGuardTargetsBySide,...decision});
     if(combat.finished)break;
    }
    if(combat.finished)break;
    const times=[pacer.status().nextAt,...combat.abilities.cooldownUntil,combat.abilities.effectUntil].filter(t=>Number.isFinite(t)&&t>now);
    assert.ok(times.length);now=Math.min(...times);
    const tick=pacer.tick(now);if(tick.advanced&&tick.kind==='hero')heroActions++;
    if(tick.finished)break;
   }
   assert.ok(iterations<2000,'bounded real scheduler');assert.ok(combat.round<=15);assert.ok(combat.abilities.energy.every(n=>Number.isInteger(n)&&n>=0&&n<=100));
   for(const side of [0,1]){assert.ok(trace.filter(e=>e.side===side&&e.ability==='ultimate').length<=1,'one ultimate per side');assert.ok(combat.events.filter(e=>e.side===1-side&&e.guardTriggered).length<=1,'one guard charge per side');}
   const metrics=[0,1].map(side=>{const events=combat.events.filter(e=>e.side===side),casts=trace.filter(e=>e.side===side);return {normalCasts:casts.filter(e=>e.ability==='normal').length,ultimateCasts:casts.filter(e=>e.ability==='ultimate').length,firstNormal:casts.find(e=>e.ability==='normal')||null,firstUltimate:casts.find(e=>e.ability==='ultimate')||null,commanderShieldGenerated:events.filter(e=>e.action?.startsWith('commander-')).reduce((n,e)=>n+(e.impacts||[]).filter(i=>i.kind==='shield').reduce((sum,i)=>sum+i.value,0),0),commanderShieldGeneratedNormal:events.filter(e=>e.action?.endsWith('-normal')).reduce((n,e)=>n+(e.impacts||[]).filter(i=>i.kind==='shield').reduce((sum,i)=>sum+i.value,0),0),commanderShieldGeneratedUltimate:events.filter(e=>e.action?.endsWith('-ultimate')).reduce((n,e)=>n+(e.impacts||[]).filter(i=>i.kind==='shield').reduce((sum,i)=>sum+i.value,0),0),totalTeamShieldAbsorbed:combat.events.filter(e=>e.side===1-side).reduce((n,e)=>n+(e.absorbed||0),0),focusGuardCastOverlapObservations:trace.filter(e=>e.focusGuardTargetsBySide[side].length>0).length,shieldLeftLiving:combat.teams[side].filter(u=>u.hp>0).reduce((n,u)=>n+(u.shield||0),0),guardImmediateHpPreserved:combat.events.filter(e=>e.side===1-side&&e.guardTriggered).length,shieldLeft:combat.teams[side].reduce((n,u)=>n+(u.shield||0),0),guardTriggers:combat.events.filter(e=>e.side===1-side&&e.guardTriggered).length,transfers:combat.events.filter(e=>e.side===1-side&&e.arcaneTransfer).length};});
   return {winner:battleOutcome(combat.teams).winner,rounds:combat.round,heroActions,elapsedMs:now,ultimateUsed:combat.ultimateUsed,metrics,trace};
  }
  const ids=['attack','defense','magic','support'],pairs=ids.flatMap((id,i)=>ids.slice(i+1).map(other=>[id,other])),policies=['reserve-ultimate','early-normal-then-reserve'],matrix=[];
  for(const pair of pairs)for(const composition of manifest.pairs)for(const level of [0,20,40])for(const policy of policies)for(const seed of [0,1])for(const assignment of [0,1])for(const mirror of [0,1])matrix.push({pair,composition:composition.index,level,policy,seed,assignment,mirror,mode:'actual',credits:0,cohort:'primary'});
  const allCompositions=[...manifest.pairs,...manifest.counterPairs];
  const representatives=manifest.pairs.filter(p=>p.index%4===0);
  for(const pair of pairs)for(const composition of representatives)for(const level of [0,20,40])for(const policy of policies)for(const assignment of [0,1])for(const mirror of [0,1])matrix.push({pair,composition:composition.index,level,policy,seed:0,assignment,mirror,mode:'equal80',credits:0,cohort:'equal80'});
  for(const pair of pairs)for(const composition of representatives)for(const policy of policies)for(const credits of [-5,5])for(const assignment of [0,1])for(const mirror of [0,1])matrix.push({pair,composition:composition.index,level:20,policy,seed:0,assignment,mirror,mode:'actual',credits,cohort:'credits'});
  for(const pair of pairs)for(const composition of manifest.counterPairs)for(const level of [0,20,40])for(const policy of policies)for(const assignment of [0,1])for(const mirror of [0,1])matrix.push({pair,composition:composition.index,level,policy,seed:0,assignment,mirror,mode:'actual',credits:0,cohort:'counter-template'});
  assert.equal(matrix.length,8928);
  const formationMode=process.env.AUDIT_FORMATION||'fixed';assert.ok(['fixed','hard'].includes(formationMode));
  if(formationMode==='hard'){
   const transform=p=>({...p,teams:p.teams.map(team=>{const f=chooseBotFormation(team,'hard');return f.positions.map((index,position)=>({...team[index],lane:f.lanes[position]}));})});
   fs.writeFileSync(path.join(out,'commander-diverse-manifest-formation-hard-primary.json'),JSON.stringify({...manifest,designation:'PRIMARY canonical hardbot order+lanes',pairs:manifest.pairs.map(transform),counterPairs:manifest.counterPairs.map(transform)},null,2));
  }
  const manifestFile=formationMode==='hard'?'commander-diverse-manifest-formation-hard-primary.json':'commander-diverse-manifest.json';
  const manifestSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(out,manifestFile))).digest('hex');
  const runtimeSourceHashes=Object.fromEntries(['bot-strategy.js','public/commander-ability-rules.js','commander-live-effects.js','commander-ultimate-status.js','battle-hp-damage.js'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(temp,name))).digest('hex')]));
  const baseMatrix=matrix;
  const pilotIndex=process.argv.indexOf('--pilot'),pilotCount=pilotIndex>=0?Number(process.argv[pilotIndex+1]):null;
  const limit=pilotCount??(process.env.AUDIT_LIMIT?Number(process.env.AUDIT_LIMIT):baseMatrix.length);
  assert.ok(Number.isSafeInteger(limit)&&limit>0&&limit<=baseMatrix.length);
  const suffix=process.env.AUDIT_SUFFIX||(pilotCount?'pilot'+pilotCount:formationMode==='hard'?'formation-hard-primary':'');assert.match(suffix,/^[a-zA-Z0-9-]*$/);assert.ok((limit===matrix.length&&formationMode==='fixed')||suffix,'pilot requires separate artifact suffix');
  const selected=limit===baseMatrix.length?baseMatrix:Array.from({length:limit},(_,i)=>baseMatrix[Math.floor(i*baseMatrix.length/limit)]);
  const formationTransforms={};
  const factorialCompositions=new Set([0,3,4,7,8,12,16,20]);
  const results=[],errors=[];let factorialCases=0;
  for(const descriptor of selected){try{
   let cards=allCompositions[descriptor.composition].teams.map(team=>team.map(h=>({...h,power:descriptor.mode==='equal80'?80:h.proposedPower}))),commanders=(descriptor.assignment?[...descriptor.pair].reverse():descriptor.pair).map(id=>profile(id,descriptor.level));if(formationMode==='hard')cards=cards.map((team,teamIndex)=>{const formation=chooseBotFormation(team,'hard'),next=formation.positions.map((index,position)=>({...team[index],lane:formation.lanes[position]}));formationTransforms[descriptor.composition+'/'+teamIndex]={positions:formation.positions,before:team.map(h=>({id:h.id,name:h.name,lane:h.lane})),after:next.map(h=>({id:h.id,name:h.name,lane:h.lane}))};return next;});
   if(descriptor.mirror){cards.reverse();commanders.reverse();}
   const options={seed:'diverse-critical:'+descriptor.seed,remainingCredits:[descriptor.credits,descriptor.credits],commanders},enabled=run(cards,options,descriptor.policy,true),disabled=run(cards,options,descriptor.policy,false);
   let factorial;
   if(descriptor.cohort==='primary'&&descriptor.seed===0&&descriptor.pair.includes('defense')&&factorialCompositions.has(descriptor.composition)){
    const aSide=commanders.findIndex(c=>c.commanderId===descriptor.pair[0]);
    factorial={onlyA:run(cards,options,descriptor.policy,[aSide===0,aSide===1]),onlyB:run(cards,options,descriptor.policy,[aSide!==0,aSide!==1])};factorialCases++;
   }
   results.push({...descriptor,sideCommanders:commanders.map(c=>c.commanderId),enabled,disabled,...(factorial?{factorial}:{})});
   if(results.length%1000===0)console.log(JSON.stringify({progress:results.length,expected:selected.length,factorialCases,errors:errors.length}));
  }catch(error){errors.push({...descriptor,error:error.stack});if(errors.length>=10)break;}}
  const report={manifestVersion:manifest.manifestVersion,manifestSha256,runtimeSourceHashes,formationMode,designation:formationMode==='hard'?'PRIMARY canonical hardbot order+lanes':'BAD-FORMATION SENSITIVITY fixed first2front',formationTransforms,costs:COMMANDER_ULTIMATE_COSTS,expectedCases:selected.length,fullMatrixCases:matrix.length,factorialCases,cases:results.length,errors,manifest:{uniqueCompositions:manifest.uniqueCompositions,heroesCovered:manifest.heroesCovered},method:'Canonical live registry+pacer only;900ms hero ticks; commander decisions interleaved at actual action and lock/cooldown boundaries. No legacy parity claim for midround. Identical policy ON/OFF counterfactuals; sequential common critical streams can diverge after differing action counts. Role/rarity/power-matched synthetic teams, not auction budgets. Both commander/team assignments and full seat mirrors. Primary and supplemental cohorts remain distinct. ReserveULT waits for its ultimate, then uses conditional normals; OFF arm uses conditional normals immediately (no phantom reserve). Early-normal-then-reserve permits at most one conditional normal by endround2, then reserves untilULT, then repeats conditional normals; OFF repeats normals without phantom reserve. Mage target is an explicit approximate3round action/AoE-output heuristic, not optimal. Policy definitions in source.',results};
  const outputBase=path.join(out,'commander-diverse-results'+(suffix?'-'+suffix:'')),serialized=JSON.stringify(report,null,2);
  if(!pilotCount&&limit===baseMatrix.length)fs.writeFileSync(outputBase+'.json.gz',gzipSync(serialized,{level:9}));else fs.writeFileSync(outputBase+'.json',serialized);console.log(JSON.stringify({cases:report.cases,errors,expectedCases:selected.length,factorialCases}));assert.equal(errors.length,0);assert.equal(results.length,selected.length);if(limit===matrix.length)assert.equal(factorialCases,576);
 }finally{delete globalThis.__diverseCritical;fs.rmSync(temp,{recursive:true,force:true});}
}

}
