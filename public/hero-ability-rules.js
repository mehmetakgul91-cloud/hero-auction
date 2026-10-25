// Browser/server shared ability parameters. Values come from the trusted roster,
// never from a client-supplied combat amount. Defaults preserve legacy fixtures.
const specs=Object.freeze({
 power:[1.12,1,1.3],shieldRate:[.4,0,.6],frontShieldRate:[.16,0,.25],tankShieldRate:[.2,0,.25],
 healRate:[.52,0,.75],allyShieldRate:[0,0,.35],pierceRate:[.4,0,.5],splashRate:[.25,0,.35],
 sunderRate:[.15,0,.2],weakenRate:[.1,0,.2],drainRate:[.15,0,.25],executeThreshold:[.12,0,.15],hasteAmount:[8,1,12]
});
const effects=new Set(['burst','shield','heal','pierce','splash','sunder','weaken','drain','execute','haste','headshot']);
const passives=new Set(['guard','resist','focus','evasion','momentum','rage','regen','thorns']);
const specific={shieldRate:'shield',healRate:['heal','shield'],allyShieldRate:'shield',supportHybrid:'shield',pierceRate:'pierce',splashRate:'splash',sunderRate:'sunder',weakenRate:'weaken',drainRate:'drain',executeThreshold:'execute',hasteAmount:'haste',delay:'burst'};
export function abilityValue(ability,key){
 const spec=Object.hasOwn(specs,key)?specs[key]:null;if(!spec)throw Error('Unknown ability parameter: '+key);
 const value=ability&&Object.hasOwn(ability,key)?ability[key]:spec[0];
 if(typeof value!=='number'||!Number.isFinite(value)||value<spec[1]||value>spec[2]||(key==='hasteAmount'&&!Number.isInteger(value)))throw Error('Invalid ability parameter: '+key);
 return value;
}
export function isHybridSupport(actor){return actor?.role==='support'&&actor.active?.effect==='shield'&&actor.active?.supportHybrid===true;}
export function validateHeroAbility(hero){
 if(!hero||typeof hero!=='object')throw Error('Invalid hero ability owner');
 const active=hero.active;
 if(active){
  if(!effects.has(active.effect)||typeof active.name!=='string'||!active.name)throw Error('Invalid active ability');
  for(const key of Object.keys(active)){
   if(['name','effect'].includes(key))continue;
   if(key==='delay'||key==='supportHybrid'){if(typeof active[key]!=='boolean')throw Error('Invalid ability flag: '+key);}
   else abilityValue(active,key);
   const allowed=specific[key];if(allowed&&!(Array.isArray(allowed)?allowed:[allowed]).includes(active.effect))throw Error('Parameter incompatible with effect: '+key);
  }
  if(active.supportHybrid&&(hero.role!=='support'||active.effect!=='shield'))throw Error('Hybrid requires shield support');
  if(active.allyShieldRate!==undefined&&!active.supportHybrid)throw Error('Ally shield requires hybrid support');
  if(active.healRate!==undefined&&active.effect==='shield'&&!active.supportHybrid)throw Error('Shield heal requires hybrid support');
  if((active.frontShieldRate!==undefined||active.tankShieldRate!==undefined)&&hero.role!=='tank')throw Error('Tank shield parameter requires tank');
 }
 const passive=hero.passive;
 if(passive){
  if(Object.keys(passive).some(key=>!['name','effect','value'].includes(key))||!passives.has(passive.effect)||typeof passive.name!=='string'||!passive.name||!Number.isFinite(passive.value)||passive.value<0||passive.value>.2)throw Error('Invalid passive ability');
 }
 return hero;
}
