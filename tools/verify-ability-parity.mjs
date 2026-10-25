// Reproducible server-only verification. Copies current source to a temporary
// directory and injects identical critical RNG ONLY into that disposable copy.
// No production test hooks, globals or client-controlled critical flags added.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {pathToFileURL,fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hero-parity-'));fs.mkdirSync(path.join(temp,'public'));
try{
 for(const name of fs.readdirSync(root))if(/\.(js|json)$/.test(name))fs.copyFileSync(path.join(root,name),path.join(temp,name));
 for(const name of fs.readdirSync(path.join(root,'public')))if(name.endsWith('.js'))fs.copyFileSync(path.join(root,'public',name),path.join(temp,'public',name));
 const sessionFile=path.join(temp,'commander-basic-turn-session.js');const text=fs.readFileSync(sessionFile,'utf8');assert.ok(text.includes('randomInt(100)<8'));fs.writeFileSync(sessionFile,text.replaceAll('randomInt(100)<8','globalThis.__heroParityCritical()'));
 const load=p=>import(pathToFileURL(path.join(temp,p)).href);
 const {simulateBattle}=await load('battle-engine.js');const{prepareLiveArenaTeams}=await load('commander-live-team-preparation.js');const{createLiveCommanderCombat}=await load('commander-live-combat.js');const{createLiveCommanderAbilities}=await load('commander-live-abilities.js');const{createBasicTurnSession,peekBasicTurn,stepBasicTurn,advanceBasicTurnSession}=await load('commander-basic-turn-session.js');const{battleOutcome}=await load('battle-result.js');
 const heroes=JSON.parse(fs.readFileSync(path.join(temp,'battle-roster.json'))).characters;const map=new Map(heroes.map(h=>[h.name,h]));
 const random=seed=>{let n=crypto.createHash('sha256').update(String(seed)).digest().readUInt32BE(0);return()=>{n=(Math.imul(1664525,n)+1013904223)>>>0;return n/4294967296<.08}};
 const profile=(id='defense',level=0)=>({commanderId:id,levels:{attack:0,defense:0,magic:0,support:0,[id]:level}});
 const contexts=[['neutral',0,profile()],['credit-20',-20,profile()],['credit+20',20,profile()],['defense40',0,profile('defense',40)],['support40',0,profile('support',40)],['magic40',0,profile('magic',40)],['attack40',0,profile('attack',40)]];
 const normalize=teams=>teams.map(team=>team.map(u=>Object.fromEntries(['id','hp','maxHp','shield','attack','defense','speed','damage','healing','kills','rageActivated','delayDueRound','delayProtectedThroughRound'].map(k=>[k,u[k]??0]))));
 let cases=0,damageChecks=0,delays=0;const errors=[];
 for(const hero of heroes)for(const lane of ['front','back'])for(const mode of ['actual','equal80'])for(const[context,credit,commander]of contexts)for(let seed=0;seed<2;seed++)for(let side=0;side<2;side++){
  const names=['Demir Sur','Kael','Alev Zırhı','Seraphine','Morvan','Fener Şifacısı'].filter(n=>n!==hero.name).slice(0,4);names.splice(lane==='front'?0:2,0,hero.name);
  const enemyNames=['Drogar','Gök Çekici','Sancak Bekçisi','Yıldız Kraliçesi','Gece Orağı'];
  const cards=names=>names.map((n,i)=>{const h=structuredClone(map.get(n));return{...h,power:mode==='actual'?h.proposedPower:80,lane:i<2?'front':'back'}});
  const a=cards(names),b=cards(enemyNames),teams=side===0?[a,b]:[b,a],credits=side===0?[credit,0]:[0,credit];const key=`ability-parity:${seed}`;const options={seed:key,maxRounds:15,remainingCredits:credits,commanders:[commander,commander]};
  const legacy=simulateBattle(...teams,options);
  globalThis.__heroParityCritical=random(key);
  const combat=createLiveCommanderCombat({teams:prepareLiveArenaTeams(...teams,options),abilities:createLiveCommanderAbilities({matchKey:'parity:local',energy:[30,30]}),commanders:options.commanders});
  const session=createBasicTurnSession(combat,{parity:true,specialHealing:true,energySplash:true,shieldDrain:true,statSpecial:true,executeSpecial:true,thornsPassive:true,roundPassives:true,damageSpecial:true});
  const actionCounts=new Map();let guard=0;
  while(!combat.finished&&guard++<200){const next=peekBasicTurn(session);if(next){const actionKey=`${next.round}:${next.side}:${next.actorId}`;assert.ok(!actionCounts.has(actionKey),'double action '+actionKey);actionCounts.set(actionKey,1);stepBasicTurn(session);}else if(combat.round>=15)break;else advanceBasicTurnSession(session);}
  assert.ok(guard<200,'scheduler did not terminate');
  for(const e of combat.events){if(Number.isFinite(e.rawDamage)){damageChecks++;assert.ok((e.absorbed||0)<=Math.floor(e.rawDamage*7/10),'shield70 violation');}if(e.action==='delay')delays++;}
  const label={hero:hero.name,lane,mode,context,seed,side};cases++;
  try{assert.deepEqual(normalize(combat.teams),normalize(legacy.teams));assert.equal(battleOutcome(combat.teams).winner,legacy.winner);}catch(error){errors.push({...label,legacy:normalize(legacy.teams),live:normalize(combat.teams)});if(errors.length>=10)break;}
 }
 const result={cases,passed:cases-errors.length,damageChecks,delays,errors,method:'All50, both lanes, actual/equal80,7 credit/commander contexts,2seed, mirroredseats; exact common critical stream; no manual commander casts. Temporary source injection only.'};fs.writeFileSync(path.join(root,'docs/ability-balance/parity-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,errors:errors.map(e=>({...e,legacy:undefined,live:undefined}))},null,2));assert.equal(errors.length,0,'legacy/live battle parity failed');
}finally{delete globalThis.__heroParityCritical;fs.rmSync(temp,{recursive:true,force:true});}
