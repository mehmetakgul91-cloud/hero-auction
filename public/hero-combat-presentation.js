// Visual range is independent of combat role: an archer can use fighter stats.
// These IDs correspond to the bow-wielding heroes in the current roster art.
const archers=new Set(['original:08','original:13']);
const rangedRoles=new Set(['energy','support','mage','healer','archer','ranged']);
export function heroCombatPresentation(hero={}){
 const role=String(hero.role||'').toLowerCase();
 const archer=archers.has(hero.id)||role==='archer';
 return {stationary:archer||rangedRoles.has(role),projectile:archer?'arrow':role==='support'||role==='healer'?'light':'magic'};
}
export function stationaryArenaAction(hero,action={}){
 return heroCombatPresentation(hero).stationary||/heal|regen|shield|guard|resist/i.test(String(action.action||''));
}
