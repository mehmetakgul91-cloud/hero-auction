import {selectCommanderFocusTarget} from './battle-commander-focus.js';
import {isCenterProtected} from './battle-center-protection.js';
// Shared by live and simulated battles: assassins exhaust the rear line first.
export function selectBattleTarget(enemies,attacker,round){
 const focused=selectCommanderFocusTarget(attacker,enemies,round);
 if(focused)return focused;
 // Hunt Order has already overridden cover. Only automatic primary targeting
 // filters version-1 saved battles only. New center-defense bonuses never
 // exclude a target; splash and explicit commander targets never use this filter.
 const alive=enemies.filter(x=>x.hp>0&&!isCenterProtected(x,enemies));
 if(!alive.length)return null;
 const frontline=alive.filter(x=>x.lane==='front');
 const rear=alive.filter(x=>x.lane==='back');
 const pool=attacker.role==='assassin'&&rear.length?rear:(frontline.length?frontline:alive);
 return [...pool].sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id))[(round+attacker.position)%pool.length];
}
