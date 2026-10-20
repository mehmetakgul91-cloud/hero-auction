// Pure special-attack calculations shared by legacy and future incremental combat.
// Effects are applied by the owning battle engine, not by this module.
export function calculateSplashRawDamage(raw,{skill=null,role='',special=false}={}){
 if(!Number.isSafeInteger(raw)||raw<0)throw Error('Invalid primary damage');
 if(skill?.effect!=='splash'&&!(role==='energy'&&special))return 0;
 const percent=skill?.effect==='splash'?.25:.15;
 return Math.max(1,Math.floor(raw*percent));
}
export function calculateSpecialHeal({attack,missingHp}){
 if(!Number.isFinite(attack)||attack<0||!Number.isFinite(missingHp)||missingHp<0)throw Error('Invalid heal stats');
 return Math.min(missingHp,Math.max(1,Math.round(attack*.52)));
}
