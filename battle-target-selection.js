// Shared battle target selection: preserves the legacy frontline and assassin rules.
export function selectBattleTarget(enemies,attacker,round){
 const alive=enemies.filter(x=>x.hp>0);
 if(!alive.length)return null;
 const frontline=alive.filter(x=>x.lane==='front');
 const pool=attacker.role==='assassin'&&round%3===0?alive:(frontline.length?frontline:alive);
 return [...pool].sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id))[(round+attacker.position)%pool.length];
}
