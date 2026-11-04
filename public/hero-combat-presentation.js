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

// Only the four approved non-archer classes receive the new choreography.
// Bow art takes precedence over a fighter stat role, including future archers.
export function heroVisualClass(hero={}){
 if(heroCombatPresentation(hero).projectile==='arrow')return null;
 const role=String(hero.role||'').toLowerCase();
 return ({energy:'mage',mage:'mage',fighter:'fighter',tank:'tank',support:'healer',healer:'healer'})[role]||null;
}
export function heroClassMotion(hero,{dx=0,dy=0,arrival=600,special=false}={}){
 const role=heroVisualClass(hero);
 if(role!=='fighter'&&role!=='tank')return null;
 const tank=role==='tank',scale=arrival/(special?840:600);
 const recovery=Math.round((tank ? 260 : 190)*scale),duration=arrival+recovery;
 const forward=`translate(${dx*(tank ? .18 : .22)}px,${dy*(tank ? .18 : .22)}px) scale(${tank ? 1.07 : 1.1})`;
 const frame=(at,transform,easing='linear')=>({offset:at/duration,transform,easing});
 return {frames:[
  frame(0,'translate(0,0) scale(1)','ease-out'),
  frame(arrival*(tank ? .48 : .28),`translate(${-dx*(tank ? .025 : .012)}px,${-dy*(tank ? .025 : .012)}px) scale(${tank ? .97 : 1.04})`,'cubic-bezier(.3,0,.2,1)'),
  frame(arrival*(tank ? .94 : .84),forward),
  frame(arrival+recovery*.18,forward,'ease-out'),
  frame(duration,'translate(0,0) scale(1)')
 ],options:{duration,easing:'linear'}};
}
