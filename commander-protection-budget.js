// Integer effects conserve the complete budget, including level-up remainders.
// Callers supply living allies only; fallen heroes never receive protection.
export function commanderShieldAmounts(allies,rate){
 const total=Math.max(1,Math.round(allies.reduce((sum,u)=>sum+u.maxHp,0)*rate));
 const each=Math.floor(total/allies.length),remainder=total%allies.length;
 return allies.map((_,index)=>each+(index<remainder?1:0));
}
export function commanderHealingBudget(allies,rate){
 const missing=allies.reduce((sum,u)=>sum+Math.max(0,u.maxHp-u.hp),0);
 if(missing<=0)throw Error('İyileştirilebilecek yaralı kahraman yok.');
 return Math.min(missing,Math.max(1,Math.round(missing*rate)));
}
