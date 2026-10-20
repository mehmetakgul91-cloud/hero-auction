// Shared legacy Thorns calculation, applied once after an attack resolves.
export function applyAttackThorns(actor,{enabled=false}={}){
 if(!enabled||actor?.passive?.effect!=='thorns'||actor.hp<=0)return 0;
 const amount=Math.floor(actor.defense*actor.passive.value);
 if(!Number.isSafeInteger(amount)||amount<0)throw Error('Invalid thorns shield');
 actor.shield=(actor.shield||0)+amount;
 return amount;
}
