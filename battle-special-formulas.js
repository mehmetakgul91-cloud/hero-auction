import {abilityValue,isHybridSupport} from './public/hero-ability-rules.js';
// Pure special calculations shared by legacy and live combat.
export function calculateSplashRawDamage(raw,{skill=null,role='',special=false}={}){
 if(!Number.isSafeInteger(raw)||raw<0)throw Error('Invalid primary damage');
 if(skill?.effect!=='splash'&&!(role==='energy'&&special))return 0;
 const percent=skill?.effect==='splash'?abilityValue(skill,'splashRate'):.15;
 return Math.max(1,Math.floor(raw*percent));
}
export function calculateSpecialHeal({attack,missingHp,skill=null}){
 if(!Number.isFinite(attack)||attack<0||!Number.isFinite(missingHp)||missingHp<0)throw Error('Invalid heal stats');
 return Math.min(missingHp,Math.max(1,Math.round(attack*abilityValue(skill,'healRate'))));
}
// Select once, so a hybrid's heal and shield always protect the same ally.
// This is pure: caller commits the result atomically and records both events.
export function resolveSpecialHealing(actor,allies){
 if(!actor||actor.hp<=0||!Array.isArray(allies))return null;
 const hybrid=isHybridSupport(actor);
 if(hybrid&&(!Number.isFinite(actor.defense)||actor.defense<0))throw Error('Invalid hybrid defense');
 const living=allies.filter(u=>u.hp>0);
 const eligible=hybrid?living:living.filter(u=>u.hp<u.maxHp);
 let target=actor.role==='support'?[...eligible].sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0]??null:null;
 if(!target&&actor.active?.effect==='heal'&&actor.hp<actor.maxHp)target=actor;
 if(!target)return null;
 const heal=calculateSpecialHeal({attack:actor.attack,missingHp:Math.max(0,target.maxHp-target.hp),skill:actor.active});
 const shield=hybrid?Math.round(actor.defense*abilityValue(actor.active,'allyShieldRate')):0;
 return {target,heal,shield};
}
