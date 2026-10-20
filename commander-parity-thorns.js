// Shared legacy Thorns calculation, applied once after an attack resolves.
export function applyAttackThorns(actor,{enabled=false}={}){
 if(!enabled||actor?.passive?.effect!=='thorns'||actor.hp<=0)return 0;
 if(!Number.isFinite(actor.defense)||actor.defense<0||!Number.isFinite(actor.passive.value)||actor.passive.value<0)throw Error('Invalid thorns stats');
 const amount=Math.floor(actor.defense*actor.passive.value);
 if(!Number.isSafeInteger(amount)||amount<0)throw Error('Invalid thorns shield');
 actor.shield=(actor.shield||0)+amount;
 return amount;
}
