// Only pending, match-scoped edits are cached. Confirmed formations live on the server.
import {validateFormation} from './preparation-formation.js';
const storageKey='hero-auction-preparation-draft';
const copy=value=>JSON.parse(JSON.stringify(value));
export function createPreparationDraft({matchKey,team,storage,save,onError=()=>{}}){
 const roster=team.map(hero=>hero.id).join('|');
 let sequence=0,queue=Promise.resolve();
 const read=()=>{try{return JSON.parse(storage?.getItem(storageKey)||'null')}catch{return null}};
 const matches=value=>value?.matchKey===matchKey&&value?.roster===roster&&validateFormation(value.formation,team);
 function clear(){const value=read();if(matches(value))try{storage?.removeItem(storageKey)}catch{}}
 return {
  pending(){const value=read();return matches(value)?copy(value.formation):null},
  save(formation){
   if(!validateFormation(formation,team))return Promise.reject(Error('Geçersiz diziliş'));
   const snapshot=copy(formation),current=++sequence;
   try{storage?.setItem(storageKey,JSON.stringify({matchKey,roster,formation:snapshot}))}catch{}
   queue=queue.then(()=>save({...snapshot,matchKey})).then(()=>{if(sequence===current)clear()},error=>{if(sequence===current)onError(error)});
   return queue;
  },
  flush(){return queue},
  clear
 };
}
