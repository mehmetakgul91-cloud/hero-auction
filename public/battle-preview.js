// Browser-only battle replay preview. No wallet or live room mutations.
const $=id=>document.getElementById(id);
const demoA=[['Hulk','tank',85],['Thor','fighter',88],['Wolverine','fighter',78],['Scarlet Witch','energy',90],['Iron Man','support',80]];
const demoB=[['Superman','fighter',92],['Wonder Woman','fighter',85],['Doomsday','tank',84],['The Flash','assassin',81],['Doctor Fate','energy',87]];
const roleNames={tank:'TANK',fighter:'SAVAŞÇI',energy:'ENERJİ',assassin:'SUİKASTÇI',support:'DESTEK'};
let states=[],events=[],cursor=0,timer=null;
const roleOptions=['tank','fighter','energy','assassin','support'];
const assignedRoles=demoA.map(x=>x[1]);
const slotRoles=['tank','fighter','energy','assassin','support'];
const heroArtCache=new Map();
async function loadHeroArt(i){if(heroArtCache.has(i))return heroArtCache.get(i);const promise=fetch('/api/art?universe=marvel&name='+encodeURIComponent(demoA[i][0])).then(r=>r.ok?r.json():null).then(data=>data?.url||null).catch(()=>null);heroArtCache.set(i,promise);return promise}
function heroPortrait(i,container){const img=document.createElement('img');img.className='slot-portrait';img.alt=demoA[i][0];img.loading='lazy';const fallback=document.createElement('span');fallback.className='portrait-fallback';fallback.textContent=demoA[i][0].slice(0,1);container.append(fallback);void loadHeroArt(i).then(url=>{if(!url||!container.isConnected)return;img.src=url;img.onload=()=>{if(container.isConnected){fallback.remove();container.append(img)}};img.onerror=()=>img.remove()})}

const query=new URLSearchParams(location.search);
const arenaMode=query.get('room')==='arena';
const multiplayerCode=query.get('code');
const multiplayerToken=query.get('token');
let battlePoll=null;
const savedFormation=(()=>{try{return JSON.parse(sessionStorage.getItem('hero-auction-formation')||'null')}catch{return null}})();
const positions=arenaMode&&Array.isArray(savedFormation)&&savedFormation.length===5&&new Set(savedFormation).size===5&&savedFormation.every(x=>Number.isInteger(x)&&x>=0&&x<5)?savedFormation:[null,null,null,null,null];let selectedHero=null,dragHero=null,dragGhost=null,dragOrigin=null,nativeDragAvatar=null;
function clearNativeDragAvatar(){if(nativeDragAvatar){nativeDragAvatar.remove();nativeDragAvatar=null}}
function makeNativeDragAvatar(i){clearNativeDragAvatar();const avatar=document.createElement('div');avatar.className='drag-ghost native-drag-avatar';heroPortrait(i,avatar);document.body.append(avatar);nativeDragAvatar=avatar;return avatar}
let hoverSlot=null,hoverHero=null,hoverTimer=null;
function clearHover(){if(hoverTimer!==null)clearTimeout(hoverTimer);hoverTimer=null;hoverSlot=null;hoverHero=null;document.querySelectorAll('.board-slot').forEach(x=>x.classList.remove('hover-preview'));document.querySelectorAll('.formation-card').forEach(x=>{x.classList.remove('previewing');const stats=x.querySelector('.formation-stats');if(stats&&x.dataset.baseStats)stats.textContent=x.dataset.baseStats})}
function previewHover(hero,slot){if(prepDone||hero===null||!Number.isInteger(slot)){clearHover();return}if(hoverSlot===slot&&hoverHero===hero)return;clearHover();hoverSlot=slot;hoverHero=hero;hoverTimer=setTimeout(()=>{if(prepDone||hoverSlot!==slot||hoverHero!==hero)return;const card=[...document.querySelectorAll('.formation-card')].find(x=>Number(x.dataset.heroIndex)===hero);const role=slotRoles[slot],v=roleStats(demoA[hero][2],role);if(card){const stats=card.querySelector('.formation-stats');if(stats){card.dataset.baseStats=stats.textContent;stats.textContent='❤️ '+v[2]+'   ⚔ '+v[0]+'   🛡 '+v[1]+'   ⚡ '+v[3];card.classList.add('previewing')}}document.querySelector('.board-slot[data-slot="'+slot+'"]')?.classList.add('hover-preview')},2000)}
function placeHero(hero,slot){clearHover();if(prepDone||hero===null)return;const old=positions.indexOf(hero);if(old===slot)return;const displaced=positions[slot];if(old>=0)positions[old]=displaced;positions[slot]=hero;selectedHero=null;renderBoard();renderRolePickers()}
function renderBoard(){for(const [container,indices] of [['front-slots',[0,1]],['back-slots',[2,3,4]]]){const root=$(container);root.replaceChildren();for(const slot of indices){const heroIndex=positions[slot];const wrap=document.createElement('div');wrap.className='slot-wrap';const label=document.createElement('span');label.className='slot-role';label.textContent=roleIcons[slotRoles[slot]]+' '+roleNames[slotRoles[slot]];const btn=document.createElement('button');btn.type='button';btn.className='board-slot circle-slot'+(heroIndex===null?' empty':' filled');btn.dataset.slot=slot;btn.disabled=prepDone;const name=document.createElement('strong');if(heroIndex===null){name.textContent='+';btn.append(name)}else heroPortrait(heroIndex,btn);btn.setAttribute('aria-label',roleNames[slotRoles[slot]]+' bölgesi: '+(heroIndex===null?'Boş':demoA[heroIndex][0]));btn.onclick=()=>{if(selectedHero!==null)placeHero(selectedHero,slot);else if(heroIndex!==null){selectedHero=heroIndex;renderBoard();renderRolePickers()}};wrap.append(label,btn);root.append(wrap)}}}
function completeSlots(){const used=new Set(positions.filter(x=>x!==null));const remaining=[0,1,2,3,4].filter(x=>!used.has(x));for(let i=0;i<5;i++)if(positions[i]===null)positions[i]=remaining.shift();for(let i=0;i<5;i++)assignedRoles[positions[i]]=slotRoles[i];renderBoard()}
function attachDrag(card,i){card.classList.add('draggable-hero');card.draggable=true;card.addEventListener('dragstart',e=>{if(prepDone){e.preventDefault();return}dragHero=i;e.dataTransfer.setData('text/plain',String(i));e.dataTransfer.effectAllowed='move';e.dataTransfer.setDragImage(makeNativeDragAvatar(i),36,36)});card.addEventListener('dragend',()=>{clearNativeDragAvatar();clearHover();dragHero=null;document.querySelectorAll('.board-slot').forEach(x=>x.classList.remove('drop-target'))});card.addEventListener('pointerdown',e=>{if(prepDone||e.pointerType==='mouse')return;dragOrigin={x:e.clientX,y:e.clientY,i};});card.addEventListener('pointermove',e=>{if(!dragOrigin||dragOrigin.i!==i||prepDone)return;if(!dragGhost&&Math.hypot(e.clientX-dragOrigin.x,e.clientY-dragOrigin.y)<9)return;if(!dragGhost){dragGhost=document.createElement('div');dragGhost.className='drag-ghost';heroPortrait(i,dragGhost);document.body.append(dragGhost);document.body.classList.add('dragging-formation')}dragGhost.style.left=e.clientX+'px';dragGhost.style.top=(e.clientY-94)+'px';document.querySelectorAll('.board-slot').forEach(x=>x.classList.remove('drop-target'));const slot=document.elementFromPoint(e.clientX,e.clientY)?.closest('.board-slot');if(slot){slot.classList.add('drop-target');previewHover(i,Number(slot.dataset.slot))}else clearHover()});card.addEventListener('pointerup',e=>{if(!dragOrigin)return;const slot=dragGhost?document.elementFromPoint(e.clientX,e.clientY)?.closest('.board-slot'):null;clearDrag();if(slot)placeHero(i,Number(slot.dataset.slot))});card.addEventListener('pointercancel',clearDrag)}
function clearDrag(){clearNativeDragAvatar();clearHover();dragOrigin=null;if(dragGhost){dragGhost.remove();dragGhost=null}document.body.classList.remove('dragging-formation');document.querySelectorAll('.board-slot').forEach(x=>x.classList.remove('drop-target'))}
document.addEventListener('dragover',e=>{const slot=e.target.closest('.board-slot');if(slot){e.preventDefault();if(dragHero!==null)previewHover(dragHero,Number(slot.dataset.slot))}else clearHover()});document.addEventListener('drop',e=>{const slot=e.target.closest('.board-slot');if(!slot||prepDone)return;e.preventDefault();const i=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(i)&&i>=0&&i<5)placeHero(i,Number(slot.dataset.slot))});
let prepTimer=null,prepDeadline=0,prepDone=false;
function lockFormation(){if(prepDone)return;clearHover();completeSlots();if(!arenaMode){sessionStorage.setItem('hero-auction-formation',JSON.stringify(positions));if(multiplayerCode&&multiplayerToken){void fetch('/api/battle-room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ready',code:multiplayerCode,token:multiplayerToken,positions})}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error);location.href='/battle-preview.html?room=arena&code='+encodeURIComponent(multiplayerCode)+'&token='+encodeURIComponent(multiplayerToken)}).catch(e=>{$('prep-note').textContent='⚠ '+e.message});return}location.href='/battle-preview.html?room=arena';return}prepDone=true;document.querySelector('.formation').hidden=true;$('battle-arena').hidden=false;if(prepTimer!==null){clearInterval(prepTimer);prepTimer=null}document.querySelectorAll('.formation-choices button,.board-slot,.formation-select').forEach(b=>b.disabled=true);$('apply-roles').disabled=true;$('apply-roles').textContent='✓ HAZIR';$('ready-a').textContent='🔵 Sen: Hazır';$('prep-note').textContent='İki taraf hazır. Savaş başlıyor!';stop();$('events').replaceChildren();$('play').textContent='▶ SAVAŞI OYNAT';void build().then(()=>{if(events.length)$('play').click()})}
function startPreparation(){if(prepTimer!==null)clearInterval(prepTimer);prepDone=false;prepDeadline=Date.now()+60000;const tick=()=>{const remaining=Math.max(0,Math.ceil((prepDeadline-Date.now())/1000));$('prep-clock').textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');if(!remaining)lockFormation()};tick();prepTimer=setInterval(tick,200)}
const roleIcons={tank:'🛡️',fighter:'⚔️',energy:'⚡',assassin:'🗡️',support:'💚'};
const modifiers={tank:[-12,22,30,-8],fighter:[6,7,8,0],energy:[15,-10,-12,2],assassin:[17,-14,-15,17],support:[-7,0,4,9]};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function roleStats(power,role){const m=modifiers[role];return [clamp(30+Math.round(power*.65)+m[0],10,120),clamp(25+Math.round(power*.45)+m[1],5,110),clamp(95+power+m[2],50,250),clamp(25+Math.round(power*.5)+m[3],10,110)]}
function renderRolePickers(){const root=$('role-pickers');root.replaceChildren();demoA.forEach(([name,,power],i)=>{if(positions.includes(i))return;
 const card=document.createElement('article');card.className='formation-card';card.dataset.heroIndex=i;
 const heading=document.createElement('div');heading.className='formation-hero';heading.textContent=name;
 const badge=document.createElement('div');badge.className='formation-role';
 const stats=document.createElement('div');stats.className='formation-stats';
 const choices=document.createElement('div');choices.className='formation-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label',name+' için rol seçimi');
 function update(){const placed=positions.indexOf(i),role=placed>=0?slotRoles[placed]:assignedRoles[i],v=roleStats(power,role);badge.textContent=roleIcons[role]+' '+roleNames[role];stats.textContent='❤️ '+v[2]+'   ⚔ '+v[0]+'   🛡 '+v[1]+'   ⚡ '+v[3];for(const b of choices.children){b.classList.toggle('selected',b.dataset.role===role);b.setAttribute('aria-pressed',String(b.dataset.role===role))}}
 for(const role of roleOptions){const btn=document.createElement('button');btn.type='button';btn.dataset.role=role;btn.textContent=roleIcons[role]+' '+roleNames[role];btn.onclick=()=>{assignedRoles[i]=role;update();renderBoard();$('apply-roles').textContent='✓ HAZIRIM'};choices.append(btn)}
 const pick=document.createElement('button');pick.className='formation-select';pick.type='button';pick.textContent='📍 YUVAYA YERLEŞTİR';pick.onclick=()=>{selectedHero=i;renderBoard()};card.append(heading,badge,stats,choices,pick);root.append(card);attachDrag(card,i);update();
 })}
$('apply-roles').onclick=lockFormation;
if(arenaMode){document.body.classList.add('arena-room');document.querySelector('.formation').hidden=true;$('battle-arena').hidden=false;$('play').textContent='▶ SAVAŞI BAŞLAT';}else{renderRolePickers();renderBoard();startPreparation()}
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

async function build(overrideResult){
 stop();cursor=0;events=[];$('next').disabled=true;$('play').disabled=true;
 $('message').textContent='Sunucudan gerçek savaş sonucu alınıyor…';
 try{
  let result=overrideResult;
  if(!result){const response=await fetch('/api/battle-preview?roles='+encodeURIComponent(positions.map((i,slot)=>slotRoles[slot]).join(','))+'&positions='+encodeURIComponent(positions.join(',')),{cache:'no-store'});if(!response.ok)throw Error('Savaş verisi alınamadı ('+response.status+')');result=await response.json()}
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
const arenaArtCache=new Map();
let finalResult=null;
function render(flash){
 for(let side=0;side<2;side++){
  const parent=$(side?'team-b':'team-a');parent.replaceChildren();
  for(const [unitIndex,u] of states[side].entries()){
   const card=document.createElement('article');card.dataset.heroId=u.id;card.className='hero arena-hero'+(unitIndex<2?' frontline':' backline')+(u.hp<=0?' dead':'')+(flash?.actorId===u.id?' cast':'')+(flash?.targetId===u.id?' hit':'');
   const portrait=document.createElement('div');portrait.className='arena-portrait';portrait.setAttribute('role','img');portrait.setAttribute('aria-label',u.name+' - '+roleNames[u.role]);
   const fallback=document.createElement('span');fallback.className='portrait-fallback';fallback.textContent=u.name.slice(0,1);portrait.append(fallback);
   const universe=side?'dc':'marvel';const artKey=universe+':'+u.name;
   if(!arenaArtCache.has(artKey))arenaArtCache.set(artKey,fetch('/api/art?universe='+universe+'&name='+encodeURIComponent(u.name)).then(r=>r.ok?r.json():null).then(j=>j?.url||null).catch(()=>null));
   void arenaArtCache.get(artKey).then(url=>{if(!url||!portrait.isConnected)return;const img=document.createElement('img');img.className='arena-portrait-image';img.alt=u.name;img.src=url;img.onload=()=>{if(portrait.isConnected){fallback.remove();portrait.append(img)}}});
   const bar=document.createElement('div');bar.className='hp';bar.setAttribute('aria-label','Can '+u.hp+' / '+u.maxHp);const fill=document.createElement('span');fill.style.width=(100*u.hp/u.maxHp)+'%';bar.append(fill);
   card.title=u.name+' · '+roleNames[u.role]+' · Can '+u.hp+'/'+u.maxHp;
   const heroLabel=document.createElement('span');heroLabel.className='arena-hero-label';heroLabel.textContent=u.name;card.append(portrait,heroLabel,bar);parent.append(card);
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
if(multiplayerCode&&multiplayerToken){const check=async()=>{try{const response=await fetch('/api/battle-room?code='+encodeURIComponent(multiplayerCode)+'&token='+encodeURIComponent(multiplayerToken),{cache:'no-store'});const v=await response.json();if(!response.ok)throw Error(v.error);if(v.started){clearInterval(battlePoll);battlePoll=null;document.body.classList.add('online-battle');if(!arenaMode){location.href='/battle-preview.html?room=arena&code='+encodeURIComponent(multiplayerCode)+'&token='+encodeURIComponent(multiplayerToken);return}await build(v.result);if(events.length)$('play').click()}else{$('message').textContent='Rakibin hazırlanması bekleniyor… '+v.ready.filter(Boolean).length+'/2 hazır';if(arenaMode)$('play').disabled=true}}catch(e){$('message').textContent='⚠ '+e.message}};void check();battlePoll=setInterval(check,1800)}else if(arenaMode){void build().then(()=>{if(events.length)$('play').click()})}
