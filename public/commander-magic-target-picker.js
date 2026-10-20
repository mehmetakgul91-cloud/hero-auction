// Experimental target-selection view only. No casts or energy changes are sent.
// Server-authoritative live battle endpoint remains disabled until integration.
export function requiredMagicTargets(ability,enemyHeroes){
 if(!['normal','ultimate'].includes(ability)||!Array.isArray(enemyHeroes))throw Error('Invalid magic selection');
 const alive=enemyHeroes.filter(h=>h&&h.hp>0);
 return Math.min(ability==='ultimate'?2:1,alive.length);
}
export function validateMagicTargetSelection(ability,enemyHeroes,selectedIds){
 const count=requiredMagicTargets(ability,enemyHeroes);
 return count>0&&Array.isArray(selectedIds)&&selectedIds.length===count&&new Set(selectedIds).size===count&&selectedIds.every(id=>typeof id==='string'&&enemyHeroes.some(h=>h.id===id&&h.hp>0));
}
export function createMagicTargetPicker(root,{onConfirm=()=>{}}={}){
 if(!root||typeof root.replaceChildren!=='function')throw Error('Invalid picker root');
 let heroes=[],ability='normal',selected=[];
 const render=()=>{
  root.replaceChildren();
  const heading=document.createElement('p');heading.textContent='Büyü hedefleri · '+selected.length+'/'+requiredMagicTargets(ability,heroes);root.append(heading);
  for(const hero of heroes){
   const button=document.createElement('button');
   button.type='button';button.textContent=hero.name||hero.id;button.dataset.magicTarget=hero.id;
   button.disabled=!(hero.hp>0);button.setAttribute('aria-pressed',String(selected.includes(hero.id)));
   button.style.cssText='margin:4px;padding:10px;min-height:44px;border-radius:10px;border:2px solid '+(selected.includes(hero.id)?'#bc8bff':'#526078')+';background:#1b2140;color:white';
   button.addEventListener('click',()=>{
    if(selected.includes(hero.id))selected=selected.filter(id=>id!==hero.id);
    else if(selected.length<requiredMagicTargets(ability,heroes))selected=[...selected,hero.id];
    render();
   });root.append(button);
  }
  const confirm=document.createElement('button');confirm.type='button';confirm.textContent='Hedefleri onayla (önizleme)';confirm.disabled=!validateMagicTargetSelection(ability,heroes,selected);
  confirm.addEventListener('click',()=>onConfirm({ability,targetIds:[...selected]}));root.append(confirm);
 };
 return {show(nextAbility,nextHeroes){
  ability=nextAbility;heroes=nextHeroes.map(h=>({...h}));selected=[];render();
 },getSelection:()=>[...selected]};
}
