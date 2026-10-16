// Browser-only battle replay preview. No wallet or live room mutations.
const $=id=>document.getElementById(id);
const demoA=[['Hulk','tank',85],['Thor','fighter',88],['Wolverine','fighter',78],['Scarlet Witch','energy',90],['Iron Man','support',80]];
const demoB=[['Superman','fighter',92],['Wonder Woman','fighter',85],['Doomsday','tank',84],['The Flash','assassin',81],['Doctor Fate','energy',87]];
const roleNames={tank:'TANK',fighter:'SAVAŞÇI',energy:'ENERJİ',assassin:'SUİKASTÇI',support:'DESTEK'};
let states=[],events=[],cursor=0,timer=null;
const roleOptions=['tank','fighter','energy','assassin','support'];
const assignedRoles=demoA.map(x=>x[1]);
const slotRoles=['tank','fighter','energy','assassin','support'];
const positions=[null,null,null,null,null];let selectedHero=null,dragHero=null,dragGhost=null,dragOrigin=null;
function placeHero(hero,slot){if(prepDone||hero===null)return;const old=positions.indexOf(hero);if(old===slot)return;const displaced=positions[slot];if(old>=0)positions[old]=displaced;positions[slot]=hero;selectedHero=null;renderBoard();renderRolePickers()}
function renderBoard(){for(const [container,indices] of [['front-slots',[0,1]],['back-slots',[2,3,4]]]){const root=$(container);root.replaceChildren();for(const slot of indices){const heroIndex=positions[slot];const wrap=document.createElement('div');wrap.className='slot-wrap';const label=document.createElement('span');label.className='slot-role';label.textContent=roleIcons[slotRoles[slot]]+' '+roleNames[slotRoles[slot]];const btn=document.createElement('button');btn.type='button';btn.className='board-slot circle-slot'+(heroIndex===null?' empty':' filled');btn.dataset.slot=slot;btn.disabled=prepDone;const name=document.createElement('strong');name.textContent=heroIndex===null?'+':demoA[heroIndex][0];btn.append(name);btn.setAttribute('aria-label',roleNames[slotRoles[slot]]+' bölgesi: '+(heroIndex===null?'Boş':demoA[heroIndex][0]));btn.onclick=()=>{if(selectedHero!==null)placeHero(selectedHero,slot);else if(heroIndex!==null){selectedHero=heroIndex;renderBoard();renderRolePickers()}};wrap.append(label,btn);root.append(wrap)}}}
function completeSlots(){const used=new Set(positions.filter(x=>x!==null));const remaining=[0,1,2,3,4].filter(x=>!used.has(x));for(let i=0;i<5;i++)if(positions[i]===null)positions[i]=remaining.shift();for(let i=0;i<5;i++)assignedRoles[positions[i]]=slotRoles[i];renderBoard()}
function attachDrag(card,i){card.classList.add('draggable-hero');card.draggable=true;card.addEventListener('dragstart',e=>{if(prepDone){e.preventDefault();return}dragHero=i;e.dataTransfer.setData('text/plain',String(i));e.dataTransfer.effectAllowed='move'});card.addEventListener('dragend',()=>{dragHero=null;document.querySelectorAll('.board-slot').forEach(x=>x.classList.remove('drop-target'))});card.addEventListener('pointerdown',e=>{if(prepDone||e.pointerType==='mouse')return;dragOrigin={x:e.clientX,y:e.clientY,i};});card.addEventListener('pointermove',e=>{if(!dragOrigin||dragOrigin.i!==i||prepDone)return;if(!dragGhost&&Math.hypot(e.clientX-dragOrigin.x,e.clientY-dragOrigin.y)<9)return;if(!dragGhost){dragGhost=document.createElement('div');dragGhost.className='drag-ghost';dragGhost.textContent=demoA[i][0];document.body.append(dragGhost);document.body.classList.add('dragging-formation')}dragGhost.style.left=e.clientX+'px';dragGhost.style.top=e.clientY+'px';document.querySelectorAll('.board-slot').forEach(x=>x.classList.remove('drop-target'));const slot=document.elementFromPoint(e.clientX,e.clientY)?.closest('.board-slot');if(slot)slot.classList.add('drop-target')});card.addEventListener('pointerup',e=>{if(!dragOrigin)return;const slot=dragGhost?document.elementFromPoint(e.clientX,e.clientY)?.closest('.board-slot'):null;clearDrag();if(slot)placeHero(i,Number(slot.dataset.slot))});card.addEventListener('pointercancel',clearDrag)}
function clearDrag(){dragOrigin=null;if(dragGhost){dragGhost.remove();dragGhost=null}document.body.classList.remove('dragging-formation');document.querySelectorAll('.board-slot').forEach(x=>x.classList.remove('drop-target'))}
document.addEventListener('dragover',e=>{if(e.target.closest('.board-slot'))e.preventDefault()});document.addEventListener('drop',e=>{const slot=e.target.closest('.board-slot');if(!slot||prepDone)return;e.preventDefault();const i=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(i)&&i>=0&&i<5)placeHero(i,Number(slot.dataset.slot))});
let prepTimer=null,prepDeadline=0,prepDone=false;
function lockFormation(){if(prepDone)return;completeSlots();prepDone=true;if(prepTimer!==null){clearInterval(prepTimer);prepTimer=null}document.querySelectorAll('.formation-choices button,.board-slot,.formation-select').forEach(b=>b.disabled=true);$('apply-roles').disabled=true;$('apply-roles').textContent='✓ HAZIR';$('ready-a').textContent='🔵 Sen: Hazır';$('prep-note').textContent='İki taraf hazır. Savaş başlıyor!';stop();$('events').replaceChildren();$('play').textContent='▶ SAVAŞI OYNAT';void build().then(()=>{if(events.length)$('play').click()})}
function startPreparation(){if(prepTimer!==null)clearInterval(prepTimer);prepDone=false;prepDeadline=Date.now()+30000;const tick=()=>{const remaining=Math.max(0,Math.ceil((prepDeadline-Date.now())/1000));$('prep-clock').textContent='00:'+String(remaining).padStart(2,'0');if(!remaining)lockFormation()};tick();prepTimer=setInterval(tick,200)}
const roleIcons={tank:'🛡️',fighter:'⚔️',energy:'⚡',assassin:'🗡️',support:'💚'};
const modifiers={tank:[-12,22,30,-8],fighter:[6,7,8,0],energy:[15,-10,-12,2],assassin:[17,-14,-15,17],support:[-7,0,4,9]};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function roleStats(power,role){const m=modifiers[role];return [clamp(30+Math.round(power*.65)+m[0],10,120),clamp(25+Math.round(power*.45)+m[1],5,110),clamp(95+power+m[2],50,250),clamp(25+Math.round(power*.5)+m[3],10,110)]}
function renderRolePickers(){const root=$('role-pickers');root.replaceChildren();demoA.forEach(([name,,power],i)=>{
 const card=document.createElement('article');card.className='formation-card';
 const heading=document.createElement('div');heading.className='formation-hero';heading.textContent=name;
 const badge=document.createElement('div');badge.className='formation-role';
 const stats=document.createElement('div');stats.className='formation-stats';
 const choices=document.createElement('div');choices.className='formation-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label',name+' için rol seçimi');
 function update(){const placed=positions.indexOf(i),role=placed>=0?slotRoles[placed]:assignedRoles[i],v=roleStats(power,role);badge.textContent=roleIcons[role]+' '+roleNames[role];stats.textContent='❤️ '+v[2]+'   ⚔ '+v[0]+'   🛡 '+v[1]+'   ⚡ '+v[3];for(const b of choices.children){b.classList.toggle('selected',b.dataset.role===role);b.setAttribute('aria-pressed',String(b.dataset.role===role))}}
 for(const role of roleOptions){const btn=document.createElement('button');btn.type='button';btn.dataset.role=role;btn.textContent=roleIcons[role]+' '+roleNames[role];btn.onclick=()=>{assignedRoles[i]=role;update();renderBoard();$('apply-roles').textContent='✓ HAZIRIM'};choices.append(btn)}
 const pick=document.createElement('button');pick.className='formation-select';pick.type='button';pick.textContent='📍 YUVAYA YERLEŞTİR';pick.onclick=()=>{selectedHero=i;renderBoard()};card.append(heading,badge,stats,choices,pick);root.append(card);attachDrag(card,i);update();
 })}
$('apply-roles').onclick=lockFormation;
renderRolePickers();renderBoard();startPreparation();
const motion=()=> $('motion').checked&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const duration=()=>Number($('speed').value);
function animateMove(e){
 if(!motion())return;
 const actor=[...document.querySelectorAll('.hero')].find(x=>x.dataset.heroId===e.actorId);
 const target=[...document.querySelectorAll('.hero')].find(x=>x.dataset.heroId===e.targetId);
 if(!actor)return;
 const ranged=/thor|iron man|scarlet witch|doctor fate|storm|superman|vision|magneto/i.test(e.actorId)||/burst|splash|shield|heal|energy|magic/i.test(e.action||'');
 actor.classList.add(ranged?'attack-energy':'attack-melee');
 if(target){
  const ar=actor.getBoundingClientRect(),tr=target.getBoundingClientRect();
  if(ranged){const orb=document.createElement('span');orb.className='battle-projectile'+(/thor/i.test(e.actorId)?' lightning':/witch|fate/i.test(e.actorId)?' magic':'');orb.style.setProperty('--from-x',ar.left+ar.width/2+'px');orb.style.setProperty('--from-y',ar.top+ar.height/2+'px');orb.style.setProperty('--to-x',tr.left+tr.width/2+'px');orb.style.setProperty('--to-y',tr.top+tr.height/2+'px');orb.style.setProperty('--duration',Math.min(600,duration()*.5)+'ms');document.body.append(orb);setTimeout(()=>orb.remove(),Math.min(600,duration()*.5)+100)}
  if(Number(e.value)>0){const label=document.createElement('span');label.className='damage-number'+(/heal/i.test(e.action||'')?' heal-number':'');label.textContent=(/heal/i.test(e.action||'')?'+':'−')+e.value;target.append(label);setTimeout(()=>label.remove(),850)}
 }
 setTimeout(()=>actor.classList.remove('attack-melee','attack-energy'),650);
}

async function build(){
 stop();cursor=0;events=[];$('next').disabled=true;$('play').disabled=true;
 $('message').textContent='Sunucudan gerçek savaş sonucu alınıyor…';
 try{
  const response=await fetch('/api/battle-preview?roles='+encodeURIComponent(positions.map((i,slot)=>slotRoles[slot]).join(','))+'&positions='+encodeURIComponent(positions.join(',')),{cache:'no-store'});
  if(!response.ok)throw Error('Savaş verisi alınamadı ('+response.status+')');
  const result=await response.json();
  states=result.teams.map(team=>team.map(u=>({...u,hp:u.maxHp,shield:0})));
  const lookup=new Map(states.flat().map(u=>[u.id,u.name]));
  const health=states.map(team=>team.map(u=>u.maxHp));
  events=result.log.map(entry=>{
   const side=entry.side??states.findIndex(team=>team.some(u=>u.id===entry.actor));
   const targetSide=1-side;
   const target=states[targetSide]?.findIndex(u=>u.id===entry.target)??-1;
    if(entry.action==='heal'||entry.action==='passive-heal'){
    const healSide=entry.action==='passive-heal'?side:side;
    const idx=states[healSide]?.findIndex(u=>u.id===(entry.target||entry.actor))??-1;
    if(idx>=0)health[healSide][idx]=Math.min(states[healSide][idx].maxHp,health[healSide][idx]+entry.value);
   }else if(target>=0&&entry.value>0){
    health[targetSide][target]=Math.max(0,health[targetSide][target]-entry.value);
   }
   return {...entry,actorId:entry.actor,targetId:entry.target,actor:lookup.get(entry.actor)||entry.actor,target:lookup.get(entry.target)||entry.target,snapshot:health.map(team=>team.slice())};
  });
  // The server is authoritative for winner; the UI reconstructs interim HP from logs.
  finalResult=result;
  $('message').textContent='Gerçek savaş motoru hazır · '+result.rounds+' tur';
  render();
 }catch(e){$('message').textContent='⚠ '+e.message}
}
let finalResult=null;
function render(flash){
 for(let side=0;side<2;side++){
  const parent=$(side?'team-b':'team-a');parent.replaceChildren();
  for(const u of states[side]){
   const card=document.createElement('article');card.dataset.heroId=u.id;card.className='hero'+(u.hp<=0?' dead':'')+(flash?.actorId===u.id?' cast':'')+(flash?.targetId===u.id?' hit':'');
   const top=document.createElement('div');top.className='hero-top';
   const name=document.createElement('span');name.className='hero-name';name.textContent=u.name;
   const role=document.createElement('span');role.className='role';role.textContent=roleNames[u.role];
   top.append(name,role);
   const stats=document.createElement('div');stats.className='stats';stats.textContent='⚔ '+u.attack+'  🛡 '+u.defense+'  ⚡ '+u.speed;
   const bar=document.createElement('div');bar.className='hp';const fill=document.createElement('span');fill.style.width=(100*u.hp/u.maxHp)+'%';bar.append(fill);
   const hp=document.createElement('div');hp.className='health';hp.textContent='❤️ '+u.hp+' / '+u.maxHp;
   card.append(top,stats,bar,hp);parent.append(card);
  }
  $(side?'score-b':'score-a').textContent=states[side].filter(u=>u.hp>0).length+' / 5';
 }
 $('round').textContent=cursor?events[cursor-1].round:'0';
 $('next').disabled=cursor>=events.length;
 $('play').disabled=cursor>=events.length;
 if(cursor===events.length){
  $('message').textContent=finalResult?.winner===null?'🤝 Beraberlik':finalResult?.winner===0?'🏆 Mavi takım kazandı!':'🏆 Kırmızı takım kazandı!';
 }
}
function step(){
 if(cursor>=events.length){stop();return}
 const e=events[cursor++];
 states.forEach((t,side)=>t.forEach((u,i)=>u.hp=e.snapshot[side][i]));
 const li=document.createElement('li');li.textContent='Tur '+e.round+' · '+e.actor+' · '+e.action+(e.target?' → '+e.target:'')+' ('+e.value+')';
 $('events').prepend(li);$('message').textContent=e.actor+' · '+e.action+(e.target?' → '+e.target:'');
 render(e);animateMove(e);if(cursor>=events.length)stop();
}
function stop(){if(timer!==null){clearInterval(timer);timer=null}}
$('play').onclick=()=>{if(timer!==null){stop();$('play').textContent='▶ DEVAM ET';return}timer=setInterval(step,duration());$('play').textContent='⏸ DURDUR'};
$('speed').onchange=()=>{if(timer!==null){stop();timer=setInterval(step,duration())}};
$('next').onclick=()=>{stop();$('play').textContent='▶ SAVAŞI OYNAT';step()};
$('reset').onclick=()=>{stop();$('play').textContent='▶ SAVAŞI OYNAT';$('events').replaceChildren();$('message').textContent='Başlamak için savaşı oynat.';build()};
void build();
