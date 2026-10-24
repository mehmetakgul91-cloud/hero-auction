// A second view of the existing five positions, never a second formation model.
export function preparationThumbModel({heroes,positions,lanes,selectedHero,locked=false,loading=false}){
 const selected=Number.isInteger(selectedHero)&&selectedHero>=0&&selectedHero<heroes.length?selectedHero:null;
 const selectedSlot=selected===null?-1:positions.indexOf(selected);
 return {selected,selectedSlot,disabled:locked||loading,loading,
  heroes:heroes.map((hero,index)=>({...hero,index,slot:positions.indexOf(index),selected:index===selected})),
  slots:positions.map((hero,slot)=>({slot,hero,lane:lanes[slot],name:Number.isInteger(hero)?heroes[hero]?.name:'',selected:slot===selectedSlot}))};
}

export function preparationDockLayout({compact,active,overlay,editing,height,viewportHeight,viewportWidth}){
 if(!compact||!active)return 'off';
 // At large text sizes, landscape, or an open keyboard, use ordinary document flow.
 if(overlay||editing||viewportWidth<300||viewportHeight<560||height>Math.min(320,viewportHeight*.48))return 'inline';
 return 'fixed';
}

export function createPreparationThumbDock({document:doc=document,window:win=window,getState,onSelect,onPlace,onLane,renderPortrait,translate:t=value=>value}){
 const formation=doc.querySelector('.formation'),ready=doc.getElementById('apply-roles'),note=doc.getElementById('prep-note'),roster=doc.getElementById('role-pickers'),board=formation?.querySelector('.battle-board');
 if(!formation||!ready||!note||!roster||!board)return {update(){},destroy(){}};
 const node=(tag,className,text)=>{const el=doc.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
 const text=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
 const toggle=(el,name,on)=>{if(el.classList.contains(name)!==on)el.classList.toggle(name,on);};
 const home=doc.createComment('preparation ready controls');ready.before(home);
 const rosterHome=doc.createComment('preparation hero details');roster.before(rosterHome);
 const rosterDetails=node('details','prep-thumb-roster');rosterDetails.hidden=true;
 rosterDetails.append(node('summary','',t('Kahraman bilgileri ve roller')));roster.after(rosterDetails);
 const dock=node('section','prep-thumb-dock');dock.hidden=true;dock.setAttribute('aria-label',t('Tek elle takım yerleştirme'));
 const status=node('div','prep-thumb-status'),clock=node('span','prep-thumb-clock'),instruction=node('span','prep-thumb-instruction');
 clock.setAttribute('role','timer');clock.setAttribute('aria-label',t('Hazırlık için kalan süre'));instruction.setAttribute('role','status');
 status.append(clock,instruction);
 const heroes=node('div','prep-thumb-heroes'),slots=node('div','prep-thumb-slots'),actions=node('div','prep-thumb-actions');
 heroes.setAttribute('role','group');heroes.setAttribute('aria-label',t('Kahraman seç'));
 slots.setAttribute('role','group');slots.setAttribute('aria-label',t('Konum seç'));
 const button=(parent,label)=>{const el=node('button','',label);el.type='button';parent.append(el);return el;};
 const heroButtons=Array.from({length:5},(_,index)=>{
  const el=button(heroes,''),portrait=node('span','prep-thumb-portrait'),name=node('span','prep-thumb-hero-name'),position=node('small');
  name.setAttribute('translate','no');portrait.setAttribute('aria-hidden','true');el.append(portrait,name,position);
  el.onclick=()=>{if(!preparationThumbModel(getState()).disabled)onSelect(index);};
  return {el,portrait,name,position,identity:null};
 });
 const slotButtons=Array.from({length:5},(_,slot)=>{
  const el=button(slots,''),label=node('strong'),occupant=node('small');occupant.setAttribute('translate','no');el.append(label,occupant);
  el.onclick=()=>{
   const state=preparationThumbModel(getState());if(state.disabled||state.selected===null||state.selectedSlot===slot)return;
   const hero=state.selected;onPlace(hero,slot);
   // Stable controls keep keyboard focus predictable after the board rerenders.
   heroButtons[hero].el.focus({preventScroll:true});
  };
  return {el,label,occupant};
 });
 const front=button(actions,t('Öne al')),back=button(actions,t('Arkaya al'));
 for(const [el,lane] of [[front,'front'],[back,'back']])el.onclick=()=>{
  const state=preparationThumbModel(getState());if(!state.disabled&&state.selectedSlot>=0){onLane(state.selectedSlot,lane);heroButtons[state.selected].el.focus({preventScroll:true});}
 };
 dock.append(status,heroes,slots,actions);
 // The original Ready and feedback nodes move, so handlers/IDs/errors stay authoritative.
 board.before(dock);
 const media=win.matchMedia('(max-width:700px)');
 let mounted=false,destroyed=false,pending=false,mode='off';
 const laneName=lane=>t(lane==='front'?'Ön':'Arka');
 const mark=name=>t('Konum')+' '+(name.slot+1)+' · '+laneName(name.lane);
 function visibleOverlay(){return [...doc.querySelectorAll('dialog[open],[aria-modal="true"],#moderation-panel[open],#room-invites-inbox[open],#room-invites[open],#room-invite-compose:not([hidden])')].some(el=>el.getClientRects().length>0);}
 function preserveFocus(move){const focused=doc.activeElement;move();if(focused?.isConnected&&doc.activeElement!==focused)focused.focus({preventScroll:true});}
 function restore(){if(mounted){preserveFocus(()=>{home.after(ready,note);rosterHome.after(roster);});mounted=false;}rosterDetails.hidden=true;}
 function layout(){
  pending=false;if(destroyed)return;
  const state=getState(),active=!state.locked&&!formation.hidden;
  const compact=media.matches;
  if(!compact||!active){
   const dockFocused=(dock.contains(doc.activeElement)&&doc.activeElement!==ready)||(rosterDetails.contains(doc.activeElement)&&!roster.contains(doc.activeElement));
   restore();dock.hidden=true;mode='off';
   if(dockFocused&&active)ready.focus({preventScroll:true});
  }
  else{
   dock.hidden=false;rosterDetails.hidden=false;
   if(!mounted){if(roster.contains(doc.activeElement))rosterDetails.open=true;preserveFocus(()=>{actions.append(ready);dock.append(note);rosterDetails.append(roster);});mounted=true;}
   const viewportHeight=win.visualViewport?.height||win.innerHeight;
   const editing=!!doc.activeElement?.matches('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
   mode=preparationDockLayout({compact,active,overlay:visibleOverlay(),editing,height:dock.getBoundingClientRect().height,viewportHeight,viewportWidth:win.visualViewport?.width||win.innerWidth});
  }
  toggle(dock,'is-fixed',mode==='fixed');
  toggle(doc.documentElement,'prep-thumb-active',mode!=='off');
  toggle(doc.documentElement,'prep-thumb-fixed',mode==='fixed');
  const clearance=mode==='fixed'?Math.ceil(dock.getBoundingClientRect().height)+12:0;
  doc.documentElement.style.setProperty('--prep-thumb-clearance',clearance+'px');
 }
 function schedule(){if(!destroyed&&!pending){pending=true;win.requestAnimationFrame(layout);}}
 function update(){
  if(destroyed)return;
  const state=preparationThumbModel(getState());
  text(clock,doc.getElementById('prep-clock')?.textContent||'--:--');
  text(instruction,state.selected===null?t('Kahraman seç → Konum seç'):state.heroes[state.selected].name+' · '+t('Konum seç'));
  for(const hero of state.heroes){
   const entry=heroButtons[hero.index];if(!entry)continue;
   entry.el.disabled=state.disabled;entry.el.setAttribute('aria-pressed',String(hero.selected));
   toggle(entry.el,'selected',hero.selected);text(entry.name,hero.name);
   const place=hero.slot<0?t('Yerleşmedi'):mark(state.slots[hero.slot]);text(entry.position,place);
   entry.el.setAttribute('aria-label',hero.name+' · '+place+' · '+t('Kahraman seç'));
   entry.el.title=hero.name+' · '+place;
   const identity=hero.artKey||hero.name;
   if(!state.loading&&entry.identity!==identity){
    // Detach the old container: an in-flight portrait may only write to connected nodes.
    const portrait=node('span','prep-thumb-portrait');portrait.setAttribute('aria-hidden','true');
    entry.portrait.replaceWith(portrait);entry.portrait=portrait;
    renderPortrait?.(hero.index,portrait);entry.identity=identity;
   }
  }
  for(const slot of state.slots){
   const entry=slotButtons[slot.slot];entry.el.disabled=state.disabled||state.selected===null||slot.selected;
   text(entry.label,laneName(slot.lane)+' '+(slot.slot+1));text(entry.occupant,slot.name||t('Boş'));
   entry.el.setAttribute('aria-label',mark(slot)+' · '+(slot.name||t('Boş'))+' · '+t(slot.name?'Yer değiştir':'Yerleştir'));
   toggle(entry.el,'occupied',Number.isInteger(slot.hero));toggle(entry.el,'selected',slot.selected);
  }
  const lane=state.selectedSlot<0?null:state.slots[state.selectedSlot].lane;
  front.disabled=state.disabled||lane===null||lane==='front';back.disabled=state.disabled||lane===null||lane==='back';
  front.setAttribute('aria-label',t('Seçili kahramanı ön safa al'));back.setAttribute('aria-label',t('Seçili kahramanı arka safa al'));
  schedule();
 }
 const clockObserver=new win.MutationObserver(update);const sourceClock=doc.getElementById('prep-clock');if(sourceClock)clockObserver.observe(sourceClock,{childList:true,characterData:true,subtree:true});
 const overlayObserver=new win.MutationObserver(records=>{if(records.some(record=>!dock.contains(record.target)))schedule();});
 overlayObserver.observe(doc.body,{attributes:true,subtree:true,attributeFilter:['hidden','open','class']});
 const sizeObserver=win.ResizeObserver?new win.ResizeObserver(schedule):null;sizeObserver?.observe(dock);
 media.addEventListener('change',schedule);win.addEventListener('resize',schedule);win.visualViewport?.addEventListener('resize',schedule);doc.addEventListener('toggle',schedule,true);doc.addEventListener('focusin',schedule);doc.addEventListener('focusout',schedule);
 update();
 return {update,destroy(){destroyed=true;clockObserver.disconnect();overlayObserver.disconnect();sizeObserver?.disconnect();media.removeEventListener('change',schedule);win.removeEventListener('resize',schedule);win.visualViewport?.removeEventListener('resize',schedule);doc.removeEventListener('toggle',schedule,true);doc.removeEventListener('focusin',schedule);doc.removeEventListener('focusout',schedule);restore();dock.remove();home.remove();rosterDetails.remove();rosterHome.remove();toggle(doc.documentElement,'prep-thumb-active',false);toggle(doc.documentElement,'prep-thumb-fixed',false);doc.documentElement.style.removeProperty('--prep-thumb-clearance');}};
}
