// Isolated HTTP regression only: select real heroes without changing stats,
// damage functions, authentication tokens, or the live combat scheduler.
import crypto from 'node:crypto';
import {battleRoster} from '../../battle-roster.js';
const ids=battleRoster.map(h=>h.id);
const chosen=[...battleRoster.filter(h=>h.active?.effect==='splash'),...battleRoster.filter(h=>h.role==='tank').slice(0,3)].map(h=>h.id);
const desired=[...chosen,...ids.filter(id=>!chosen.includes(id))];
const shuffled=[...ids],swaps=new Map();
for(let i=ids.length-1;i>0;i--){const j=shuffled.indexOf(desired[i]);swaps.set(i+1,j);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
const original=crypto.randomInt;let next=0;
crypto.randomInt=(min,max,...args)=>{
 if(max===undefined&&min===ids.length)next=ids.length;
 if(max===undefined&&min===next&&swaps.has(min)){next--;return swaps.get(min);}
 return original(min,max,...args);
};
