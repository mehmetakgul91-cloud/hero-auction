import {validateHeroAbility} from './public/hero-ability-rules.js';
// Experimental-only original hero catalogue. No Marvel/DC and no production roster mutation.
import fs from 'node:fs';
import {fighterFromCard} from './battle-engine.js';
const source=JSON.parse(fs.readFileSync(new URL('./commander-original-roster.json',import.meta.url),'utf8'));
for(const hero of source.characters){validateHeroAbility(hero);Object.freeze(hero.active);Object.freeze(hero.passive);Object.freeze(hero.laneModifiers);}
export const commanderOriginalRoster=Object.freeze(source.characters.map(hero=>Object.freeze({...hero})));
const byId=new Map(commanderOriginalRoster.map(hero=>[hero.id,hero]));
export function commanderOriginalBattleCard(card){
 const hero=byId.get(String(card?.id||'').toLowerCase());
 if(!hero)throw Error('Hero is not in the original-only experimental roster');
 if(!Number.isInteger(card.power)||card.power<1||card.power>100)throw Error('Invalid character power');
 return {...card,id:hero.id,name:hero.name,universe:'original',role:hero.role,active:hero.active,passive:hero.passive,specialty:hero.specialty,laneModifiers:hero.laneModifiers};
}
export function commanderOriginalFighter(card,position=0){return fighterFromCard(commanderOriginalBattleCard(card),position)}
