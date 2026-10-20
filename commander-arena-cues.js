// Read-only event adapter. Battle simulation and server results remain authoritative.
const types=new Set(['attack','defense','magic','support']);
const abilities=new Set(['normal','ultimate']);
export function commanderArenaCue(entry){
 if(!entry||typeof entry!=='object'||typeof entry.action!=='string')return null;
 const match=/^commander-(attack|defense|magic|support)-(normal|ultimate)$/.exec(entry.action);
 if(!match||!Number.isInteger(entry.round)||entry.round<1||entry.round>15||![0,1].includes(entry.side))return null;
 const [,commanderId,ability]=match;
 if(!types.has(commanderId)||!abilities.has(ability))return null;
 return Object.freeze({round:entry.round,side:entry.side,commanderId,ability,actor:'commander:'+entry.side,impact:Math.max(0,Number(entry.value)||0)});
}
export function commanderArenaCues(log){
 if(!Array.isArray(log))return [];
 return log.map(commanderArenaCue).filter(Boolean);
}
