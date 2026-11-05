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
 // Sword-only cosmetic closing step keeps the attacker near the moving grip.
 const sword=role==='fighter'&&['original:02','original:06','original:07','original:expansion-04','original:expansion-10','original:expansion-22'].includes(hero.id);
 if(sword){
  if(arrival<=0)return null;
  const cut=Math.min(220,arrival),loadEnd=arrival-cut;
  const recovery=Math.round(290*arrival/(special?840:600)),duration=arrival+recovery;
  const closeX=dx-Math.sign(dx)*Math.min(60,Math.abs(dx)*.42),closeY=dy*.96;
  const bounded=Math.min(1,90/Math.max(1,Math.hypot(closeX,closeY)));
  const x=closeX*bounded,y=closeY*bounded;
  const frame=(at,transform,easing='linear')=>({offset:at/duration,transform,easing});
  const forward=`translate(${x}px,${y}px) scale(1.04)`;
  return {frames:[frame(0,'translate(0,0) scale(1)'),frame(Math.min(Math.max(90,arrival-270),loadEnd*.75),`translate(${-Math.sign(dx)*4}px,-2px) scale(.98)`,'cubic-bezier(.5,0,.8,.35)'),frame(loadEnd,`translate(${x*.2}px,${y*.2}px) scale(1.01)`,'cubic-bezier(.15,.5,.3,1)'),frame(arrival-Math.min(22,cut*.15),forward),frame(arrival+Math.min(116,recovery*.4),forward,'ease-out'),frame(duration,'translate(0,0) scale(1)')],options:{duration,easing:'linear'}};
 }
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
