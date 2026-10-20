// Read-only visual layer: never alters combat results or server decisions.
const names={attack:'SALDIRI',defense:'SAVUNMA',magic:'BÜYÜ',support:'DESTEK'};
const symbols={attack:'⚔',defense:'🛡',magic:'✦',support:'✚'};
let cleanupTimer;
const activeEffects=new Set();
function clearHeroEffects(){for(const item of activeEffects){clearTimeout(item.timer);item.element.classList.remove(item.className)}activeEffects.clear()}
function highlightHeroes(kind,side,ability){
 clearHeroEffects();
 const targetSide=kind==='attack'||kind==='magic'?1-side:side;
 const team=document.getElementById(targetSide===0?'team-a':'team-b');
 if(!team)return;
 const className='commander-hero-'+kind;
 const cards=[...team.querySelectorAll('.arena-hero:not(.dead)')];
 // The combat log owns exact targets; the aura deliberately marks the opposing team, not invented targets.
 const targets=cards;
 for(const element of targets){
  element.classList.add(className);
  const item={element,className,timer:null};
  item.timer=setTimeout(()=>{element.classList.remove(className);activeEffects.delete(item)},2000);
  activeEffects.add(item);
 }
}

function showCommanderAbility(event){
 const entries=event.detail?.events||[event.detail?.event];
 const commander=entries.find(e=>/^commander-(attack|defense|magic|support)-(normal|ultimate)$/.test(e?.action||''));
 if(!commander)return;
 // Background-tab catch-up replays multiple moves immediately; avoid flashing stale skills.
 if(document.hidden||document.body.classList.contains('arena-catching-up'))return;
 const match=/^commander-(attack|defense|magic|support)-(normal|ultimate)$/.exec(commander.action);
 const [,kind,ability]=match;
 const arena=document.getElementById('battle-arena');
 if(!arena||arena.hidden)return;
 document.getElementById('commander-ability-flash')?.remove();
 if(cleanupTimer)clearTimeout(cleanupTimer);
 const banner=document.createElement('div');
 banner.id='commander-ability-flash';
 banner.className='commander-ability-flash'+(ability==='ultimate'?' ultimate':'');
 banner.setAttribute('role','status');
 banner.setAttribute('aria-live','polite');
 const symbol=document.createElement('span');
 symbol.className='commander-ability-symbol';symbol.textContent=symbols[kind];
 const label=document.createElement('strong');
 label.textContent=(commander.side===0?'MAVİ':'KIRMIZI')+' · '+names[kind]+' KOMUTANI';
 const skill=document.createElement('span');
 skill.textContent=ability==='ultimate'?'NİHAİ YETENEK':'NORMAL YETENEK';
 banner.append(symbol,label,skill);
 arena.append(banner);
 highlightHeroes(kind,commander.side,ability);
 requestAnimationFrame(()=>banner.classList.add('visible'));
 cleanupTimer=setTimeout(()=>{banner.remove();cleanupTimer=null},2000);
}
window.addEventListener('heroarena:move',showCommanderAbility);
window.addEventListener('heroarena:commander-round',showCommanderAbility);
