// Repeatable balance audit for Hero Auction 2.0. Run: node tools/battle-balance.mjs
import {simulateBattle} from '../battle-engine.js';
const trials=120;
const patterns=Array.from({length:6},(_,front)=>({front,label:front+' ön / '+(5-front)+' arka'}));
const makeTeam=(prefix,powers,front)=>powers.map((power,i)=>({id:prefix+i,name:prefix+i,power,lane:i<front?'front':'back',role:i<front?(i%2?'fighter':'tank'):'energy'}));
const powerSets=[{label:'Eşit güç',a:[75,75,75,75,75],b:[75,75,75,75,75]},{label:'Açık artırma: güçlü takım',a:[95,90,85,80,75],b:[75,70,65,60,55]},{label:'Açık artırma: küçük fark',a:[85,80,75,70,65],b:[80,75,70,65,60]}];
const results=[];
for(const scenario of powerSets)for(const a of patterns)for(const b of patterns){let wins=0,draws=0;for(let i=0;i<trials;i++){
  const result=simulateBattle(makeTeam('a',scenario.a,a.front),makeTeam('b',scenario.b,b.front),{seed:scenario.label+'-'+a.front+'-'+b.front+'-'+i});
  if(result.winner===0)wins++;else if(result.winner===null)draws++;
}results.push({scenario:scenario.label,teamA:a.label,teamB:b.label,wins,draws,losses:trials-wins-draws,winRate:Number(((wins+draws*.5)/trials*100).toFixed(1))});}
const summaries=powerSets.map(s=>({scenario:s.label,byFormation:patterns.map(p=>{const games=results.filter(r=>r.scenario===s.label&&r.teamA===p.label);return {formation:p.label,winRate:Number((games.reduce((n,g)=>n+g.winRate,0)/games.length).toFixed(1))}})}));
console.log(JSON.stringify({trialsPerMatchup:trials,totalBattles:results.length*trials,summaries,matchups:results},null,2));
