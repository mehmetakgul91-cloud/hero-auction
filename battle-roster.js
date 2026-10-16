// Hero Auction 2.0 roster adapter. Does not modify the classic auction.
import fs from 'node:fs';
const roster=JSON.parse(fs.readFileSync(new URL('./battle-roster.json',import.meta.url),'utf8'));
import {simulateBattle} from './battle-engine.js';
const byId=new Map(roster.characters.map(hero=>[hero.id,hero]));
export const battleRoster=Object.freeze(roster.characters.map(hero=>Object.freeze({...hero})));
export function battleCard(card){
  const id=String(card?.id||'').toLowerCase();
  const hero=byId.get(id);
  if(!hero)throw new Error('Character is not in the Hero Auction 2.0 roster: '+id);
  if(!Number.isInteger(card.power)||card.power<1||card.power>100)throw new Error('Invalid character power: '+id);
  return {...card,id:hero.id,name:hero.name,universe:hero.universe,role:hero.role};
}
export function battlePool(catalogue,universe='mixed'){
  if(!['mixed','marvel','dc'].includes(universe))throw new Error('Unsupported battle universe');
  return battleRoster.filter(hero=>universe==='mixed'||hero.universe===universe)
    .map(hero=>catalogue.get(hero.id)).filter(Boolean);
}
export function simulateRosterBattle(teamA,teamB,options){
  return simulateBattle(teamA.map(battleCard),teamB.map(battleCard),options);
}
