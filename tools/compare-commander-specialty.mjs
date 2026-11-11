// Controlled commander-only comparison. No manual casts or population win-rate claim.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';import {battleRoster} from '../battle-roster.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'commander-balance-'));
try{
 fs.mkdirSync(path.join(temp,'public'));
 for(const name of fs.readdirSync(root))if(/\.(js|json)$/.test(name))fs.copyFileSync(path.join(root,name),path.join(temp,name));
 for(const name of fs.readdirSync(path.join(root,'public')))if(name.endsWith('.js'))fs.copyFileSync(path.join(root,'public',name),path.join(temp,'public',name));
 fs.writeFileSync(path.join(temp,'arena-commanders.js'),execFileSync('git',['show','df3798d:arena-commanders.js'],{cwd:root}));
 const {simulateBattle:oldBattle}=await import(pathToFileURL(path.join(temp,'battle-engine.js')));
 const compositions={mixed:['tank','fighter','energy','support','assassin'],fighters:['tank','fighter','fighter','assassin','support'],tanks:['tank','tank','tank','energy','support'],mages:['tank','fighter','energy','energy','energy'],healers2:['tank','fighter','energy','support','support'],healers3:['tank','fighter','support','support','support']};
 const cards=roles=>{const counts={};return roles.map((role,i)=>{const index=counts[role]||0;counts[role]=index+1;const hero=battleRoster.filter(h=>h.role===role)[index];return {...structuredClone(hero),power:80,lane:i<2?'front':'back'};});};
 const commanders=['attack','defense','magic','support'],profile=(id,level)=>({commanderId:id,levels:Object.fromEntries(commanders.map(id=>[id,level]))});
 const summary={};let simulations=0;
 for(const [name,roles] of Object.entries(compositions))for(const enemyRoles of Object.values(compositions))for(const level of [0,10,30,40])for(const id of commanders)for(let seed=0;seed<3;seed++)for(const side of [0,1]){
  const own=cards(roles),enemy=cards(enemyRoles),teams=side===0?[own,enemy]:[enemy,own],selected=[null,null];selected[side]=profile(id,level);
  const results=[oldBattle(...teams,{seed:'commander-specialty:'+seed,commanders:selected}),simulateBattle(...teams,{seed:'commander-specialty:'+seed,commanders:selected}),simulateBattle(...teams,{seed:'commander-specialty:'+seed})];
  const row=summary[name+':'+id+':'+level]??={n:0,old:{wins:0,draws:0,healing:0,damage:0,rounds:0},revised:{wins:0,draws:0,healing:0,damage:0,rounds:0},none:{wins:0,draws:0,healing:0,damage:0,rounds:0}};row.n++;
  for(let i=0;i<results.length;i++){const r=results[i],m=row[['old','revised','none'][i]];simulations++;m.wins+=r.winner===side?1:0;m.draws+=r.winner===null?1:0;m.rounds+=r.rounds;m.healing+=r.teams[side].reduce((s,h)=>s+h.healing,0);m.damage+=r.teams[side].reduce((s,h)=>s+h.damage,0);for(const team of r.teams)for(const h of team)assert.ok(Number.isFinite(h.attack)&&h.hp>=0&&h.hp<=h.maxHp&&h.shield>=0);}
  if(level===0)assert.deepEqual(results[1].teams,results[2].teams,'level zero preserves no-commander combat');
 }
 const output={baselineCommanderRules:'df3798d',simulations,method:'6 role compositions versus each other, equal power80, levels0/10/30/40,4 commanders,3seeds,mirrored seats. Opponent has no commander upgrades. No manual casts. Only commander rules differ in old comparison. Seed is reproducible, not action-keyed after order changes. Not population balance proof.',summary};
 fs.mkdirSync(path.join(root,'docs/commander-specialty'),{recursive:true});fs.writeFileSync(path.join(root,'docs/commander-specialty/balance.json'),JSON.stringify(output,null,2));console.log(JSON.stringify({simulations,level30:Object.fromEntries(Object.entries(summary).filter(([k])=>k.endsWith(':30')))},null,2));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
