// Selection is presentation-only. Only a confirmed server-validated cast spends energy.
export function commanderTargetMode(commanderId,ability){
 if(!['normal','ultimate'].includes(ability))throw Error('Invalid commander selection');
 if(commanderId==='magic')return ability==='normal'?'enemy-alive':'ally-alive';
 if(commanderId==='defense'&&ability==='ultimate')return 'ally-alive';
 if(commanderId==='attack'&&ability==='ultimate')return 'enemy-alive';
 if(commanderId==='support'&&ability==='ultimate')return 'ally-dead';
 return null;
}
export function isCommanderTargetEligible(hero,mode,{excludedTargetIds=[]}={}){
 if(!hero||typeof hero.id!=='string'||excludedTargetIds.includes(hero.id))return false;
 return mode==='ally-dead'?hero.hp<=0:['enemy-alive','ally-alive'].includes(mode)&&hero.hp>0;
}
export function requiredMagicTargets(ability,heroes,{commanderId='magic',...context}={}){
 if(!Array.isArray(heroes))throw Error('Invalid commander targets');
 const mode=commanderTargetMode(commanderId,ability);
 return heroes.some(hero=>isCommanderTargetEligible(hero,mode,context))?1:0;
}
export function validateMagicTargetSelection(ability,heroes,selectedIds,options={}){
 const count=requiredMagicTargets(ability,heroes,options),mode=commanderTargetMode(options.commanderId||'magic',ability);
 return count===1&&Array.isArray(selectedIds)&&selectedIds.length===1&&typeof selectedIds[0]==='string'&&heroes.some(hero=>hero.id===selectedIds[0]&&isCommanderTargetEligible(hero,mode,options));
}
export function createMagicTargetPicker(root,{onConfirm=()=>{}}={}){
 if(!root||typeof root.replaceChildren!=='function')throw Error('Invalid picker root');
 let heroes=[],ability='normal',selected=[],context={commanderId:'magic'};
 const render=()=>{
  root.replaceChildren();const mode=commanderTargetMode(context.commanderId,ability);
  const heading=document.createElement('p');heading.textContent=(mode==='enemy-alive'?'Rakip hedef':mode==='ally-dead'?'Düşen müttefik':'Yaşayan müttefik')+' · '+selected.length+'/'+requiredMagicTargets(ability,heroes,context);root.append(heading);
  for(const hero of heroes){
   const button=document.createElement('button');button.type='button';button.textContent=hero.name||hero.id;button.dataset.magicTarget=hero.id;
   button.disabled=!isCommanderTargetEligible(hero,mode,context);button.setAttribute('aria-pressed',String(selected.includes(hero.id)));
   button.style.cssText='margin:4px;padding:10px;min-height:44px;border-radius:10px;border:2px solid '+(selected.includes(hero.id)?'#bc8bff':'#526078')+';background:#1b2140;color:white';
   button.addEventListener('click',()=>{if(button.disabled)return;selected=selected.includes(hero.id)?[]:[hero.id];render()});root.append(button);
  }
  const confirm=document.createElement('button');confirm.type='button';confirm.textContent='Hedefi onayla';confirm.disabled=!validateMagicTargetSelection(ability,heroes,selected,context);
  confirm.addEventListener('click',()=>{if(!confirm.disabled)onConfirm({ability,targetIds:[...selected]})});root.append(confirm);
 };
 return {show(nextAbility,nextHeroes,options={}){ability=nextAbility;heroes=nextHeroes.map(h=>({...h}));context={commanderId:'magic',...options};selected=[];render()},getSelection:()=>[...selected]};
}
