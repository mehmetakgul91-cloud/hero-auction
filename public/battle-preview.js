// Browser-only battle replay preview. No wallet or live room mutations.
const $=id=>document.getElementById(id);
let demoA=[['Hulk','tank',85],['Thor','fighter',88],['Wolverine','fighter',78],['Scarlet Witch','energy',90],['Iron Man','support',80]];
// Preview uses zero credits until verified auction balances are wired in.
let previewCredits=0;
const creditBonus=credits=>credits<0?Math.max(-0.99,credits*0.01):Math.min(credits,8)*0.01+Math.max(0,credits-8)*0.005;
const effectivePower=power=>Math.round(power*(1+creditBonus(previewCredits))*10)/10;
let demoB=[['Superman','fighter',92],['Wonder Woman','fighter',85],['Doomsday','tank',84],['The Flash','assassin',81],['Doctor Fate','energy',87]];
const roleNames={tank:'TANK',fighter:'SAVAŞÇI',energy:'ENERJİ / MESAFELİ',assassin:'SUİKASTÇI',support:'DESTEK'};
let states=[],events=[],cursor=0,timer=null;
const roleOptions=['tank','fighter','energy'];
let assignedRoles=demoA.map(x=>['tank','fighter','energy'].includes(x[1])?x[1]:'energy');
const slotRoles=['tank','fighter','energy','energy','energy'];
const lanes=['front','front','back','back','back'];
function roleAt(slot){return lanes[slot]==='back'?'energy':(positions[slot]===null?'tank':assignedRoles[positions[slot]]==='tank'?'tank':'fighter')}
function setLane(slot,lane){if(prepDone)return;lanes[slot]=lane;renderBoard();renderRolePickers()}

const heroArtCache=new Map();
async function loadHeroArt(i){if(heroArtCache.has(i))return heroArtCache.get(i);const promise=fetch('/api/art?universe='+encodeURIComponent(demoA[i][3]||'marvel')+'&name='+encodeURIComponent(demoA[i][0])).then(r=>r.ok?r.json():null).then(data=>data?.url||null).catch(()=>null);heroArtCache.set(i,promise);return promise}
function heroPortrait(i,container){const img=document.createElement('img');img.className='slot-portrait';img.alt=demoA[i][0];img.loading='lazy';const fallback=document.createElement('span');fallback.className='portrait-fallback';fallback.textContent=demoA[i][0].slice(0,1);container.append(fallback);void loadHeroArt(i).then(url=>{if(!url||!container.isConnected)return;img.src=url;img.onload=()=>{if(container.isConnected){fallback.remove();container.append(img)}};img.onerror=()=>img.remove()})}

const query=new URLSearchParams(location.search);
const arenaMode=query.get('room')==='arena';
const auctionCode=query.get('auctionCode');
const auctionToken=query.get('auctionToken');
const auctionMode=Boolean(auctionCode&&auctionToken);
const multiplayerCode=query.get('code');
const multiplayerToken=query.get('token');
let battlePoll=null;
async function battleLobby(action){try{const code=$('join-battle-code').value.trim();const response=await fetch('/api/battle-room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,code})});const v=await response.json();if(!response.ok)throw Error(v.error);location.href='/battle-preview.html?code='+encodeURIComponent(v.code)+'&token='+encodeURIComponent(v.token)}catch(e){$('battle-lobby-status').textContent='⚠ '+e.message}}
$('create-battle-room').onclick=()=>battleLobby('create');
$('join-battle-room').onclick=()=>battleLobby('join');
if(multiplayerCode){$('battle-lobby-status').textContent='Oda kodu: '+multiplayerCode+' · Arkadaşınla paylaş. Dizilişini hazırlayıp Hazırım düğmesine bas.';$('battle-lobby').classList.add('lobby-connected')}if(arenaMode)$('battle-lobby').hidden=true;
const savedFormation=(()=>{try{return JSON.parse(sessionStorage.getItem('hero-auction-formation')||'null')}catch{return null}})();
if(arenaMode){try{const savedLanes=JSON.parse(sessionStorage.getItem('hero-auction-lanes')||'null');if(Array.isArray(savedLanes)&&savedLanes.length===5&&savedLanes.every(x=>x==='front'||x==='back'))lanes.splice(0,5,...savedLanes)}catch{}}
const positions=arenaMode&&Array.isArray(savedFormation)&&savedFormation.length===5&&new Set(savedFormation).size===5&&savedFormation.every(x=>Number.isInteger(x)&&x>=0&&x<5)?savedFormation:[null,null,null,null,null];let selectedHero=null,dragHero=null,dragGhost=null,dragOrigin=null,nativeDragAvatar=null;
function clearNativeDragAvatar(){if(nativeDragAvatar){nativeDragAvatar.remove();nativeDragAvatar=null}}
function makeNativeDragAvatar(i){clearNativeDragAvatar();const avatar=document.createElement('div');avatar.className='drag-ghost native-drag-avatar';heroPortrait(i,avatar);document.body.append(avatar);nativeDragAvatar=avatar;return avatar}
let hoverSlot=null,hoverHero=null,hoverTimer=null;
function clearHover(){if(hoverTimer!==null)clearTimeout(hoverTimer);hoverTimer=null;hoverSlot=null;hoverHero=null;document.querySelectorAll('.board-slot').forEach(x=>x.classList.remove('hover-preview'));document.querySelectorAll('.formation-card').forEach(x=>{x.classList.remove('previewing');const stats=x.querySelector('.formation-stats');if(stats&&x.dataset.baseStats)stats.textContent=x.dataset.baseStats})}
function previewHover(hero,slot){if(prepDone||hero===null||!Number.isInteger(slot)){clearHover();return}if(hoverSlot===slot&&hoverHero===hero)return;clearHover();hoverSlot=slot;hoverHero=hero;hoverTimer=setTimeout(()=>{if(prepDone||hoverSlot!==slot||hoverHero!==hero)return;const card=[...document.querySelectorAll('.formation-card')].find(x=>Number(x.dataset.heroIndex)===hero);const role=roleAt(slot),v=roleStats(demoA[hero][2],role);if(card){const stats=card.querySelector('.formation-stats');if(stats){card.dataset.baseStats=stats.textContent;stats.textContent='❤️ '+v[2]+'   ⚔ '+v[0]+'   🛡 '+v[1]+'   ⚡ '+v[3];card.classList.add('previewing')}}document.querySelector('.board-slot[data-slot="'+slot+'"]')?.classList.add('hover-preview')},2000)}
function placeHero(hero,slot){clearHover();if(prepDone||hero===null)return;const old=positions.indexOf(hero);if(old===slot)return;const displaced=positions[slot];if(old>=0)positions[old]=displaced;positions[slot]=hero;selectedHero=null;renderBoard();renderRolePickers()}
function renderBoard(){for(const [container,indices] of [['front-slots',[0,1,2,3,4].filter(i=>lanes[i]==='front')],['back-slots',[0,1,2,3,4].filter(i=>lanes[i]==='back')]]){const root=$(container);root.replaceChildren();for(const slot of indices){const heroIndex=positions[slot];const wrap=document.createElement('div');wrap.className='slot-wrap';const label=document.createElement('span');label.className='slot-role';label.textContent=roleIcons[roleAt(slot)]+' '+roleNames[roleAt(slot)];const btn=document.createElement('button');btn.type='button';btn.className='board-slot circle-slot'+(heroIndex===null?' empty':' filled');btn.dataset.slot=slot;btn.disabled=prepDone;const name=document.createElement('strong');if(heroIndex===null){name.textContent='+';btn.append(name)}else {heroPortrait(heroIndex,btn);const powerBadge=document.createElement('span');powerBadge.className='board-power';powerBadge.textContent='GÜÇ '+effectivePower(demoA[heroIndex][2]);btn.append(powerBadge)};btn.setAttribute('aria-label',roleNames[roleAt(slot)]+' bölgesi: '+(heroIndex===null?'Boş':demoA[heroIndex][0]));btn.onclick=()=>{if(selectedHero!==null)placeHero(selectedHero,slot);else if(heroIndex!==null){selectedHero=heroIndex;renderBoard();renderRolePickers()}};const move=document.createElement('button');move.type='button';move.className='lane-switch';move.textContent=lanes[slot]==='front'?'↓ Arka safa':'↑ Ön safa';move.disabled=prepDone;move.onclick=()=>setLane(slot,lanes[slot]==='front'?'back':'front');wrap.append(label,btn,move);root.append(wrap)}}}
function completeSlots(){const used=new Set(positions.filter(x=>x!==null));const remaining=[0,1,2,3,4].filter(x=>!used.has(x));for(let i=0;i<5;i++)if(positions[i]===null)positions[i]=remaining.shift();for(let i=0;i<5;i++)assignedRoles[positions[i]]=roleAt(i);renderBoard()}
function attachDrag(card,i){card.classList.add('draggable-hero');card.draggable=true;card.addEventListener('dragstart',e=>{if(prepDone){e.preventDefault();return}dragHero=i;e.dataTransfer.setData('text/plain',String(i));e.dataTransfer.effectAllowed='move';e.dataTransfer.setDragImage(makeNativeDragAvatar(i),36,36)});card.addEventListener('dragend',()=>{clearNativeDragAvatar();clearHover();dragHero=null;document.querySelectorAll('.board-slot').forEach(x=>x.classList.remove('drop-target'))});card.addEventListener('pointerdown',e=>{if(prepDone||e.pointerType==='mouse')return;dragOrigin={x:e.clientX,y:e.clientY,i};});card.addEventListener('pointermove',e=>{if(!dragOrigin||dragOrigin.i!==i||prepDone)return;if(!dragGhost&&Math.hypot(e.clientX-dragOrigin.x,e.clientY-dragOrigin.y)<9)return;if(!dragGhost){dragGhost=document.createElement('div');dragGhost.className='drag-ghost';heroPortrait(i,dragGhost);document.body.append(dragGhost);document.body.classList.add('dragging-formation')}dragGhost.style.left=e.clientX+'px';dragGhost.style.top=(e.clientY-94)+'px';document.querySelectorAll('.board-slot').forEach(x=>x.classList.remove('drop-target'));const slot=document.elementFromPoint(e.clientX,e.clientY)?.closest('.board-slot');if(slot){slot.classList.add('drop-target');previewHover(i,Number(slot.dataset.slot))}else clearHover()});card.addEventListener('pointerup',e=>{if(!dragOrigin)return;const slot=dragGhost?document.elementFromPoint(e.clientX,e.clientY)?.closest('.board-slot'):null;clearDrag();if(slot)placeHero(i,Number(slot.dataset.slot))});card.addEventListener('pointercancel',clearDrag)}
function clearDrag(){clearNativeDragAvatar();clearHover();dragOrigin=null;if(dragGhost){dragGhost.remove();dragGhost=null}document.body.classList.remove('dragging-formation');document.querySelectorAll('.board-slot').forEach(x=>x.classList.remove('drop-target'))}
document.addEventListener('dragover',e=>{const slot=e.target.closest('.board-slot');if(slot){e.preventDefault();if(dragHero!==null)previewHover(dragHero,Number(slot.dataset.slot))}else clearHover()});document.addEventListener('drop',e=>{const slot=e.target.closest('.board-slot');if(!slot||prepDone)return;e.preventDefault();const i=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(i)&&i>=0&&i<5)placeHero(i,Number(slot.dataset.slot))});
let prepTimer=null,prepDeadline=0,prepDone=false,auctionLoaded=false;
function lockFormation(){if(prepDone||auctionMode&&!auctionLoaded)return;clearHover();completeSlots();if(!arenaMode){sessionStorage.setItem('hero-auction-formation',JSON.stringify(positions));sessionStorage.setItem('hero-auction-lanes',JSON.stringify(lanes));if(multiplayerCode&&multiplayerToken){void fetch('/api/battle-room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ready',code:multiplayerCode,token:multiplayerToken,positions,lanes,roles:positions.map((_,slot)=>roleAt(slot))})}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error);location.href='/battle-preview.html?room=arena&code='+encodeURIComponent(multiplayerCode)+'&token='+encodeURIComponent(multiplayerToken)}).catch(e=>{$('prep-note').textContent='⚠ '+e.message});return}if(auctionMode){void fetch('/api/battle-auction-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:auctionCode,token:auctionToken,positions,lanes,roles:positions.map((_,slot)=>roleAt(slot))})}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Diziliş gönderilemedi');location.href='/battle-preview.html?room=arena&auctionCode='+encodeURIComponent(auctionCode)+'&auctionToken='+encodeURIComponent(auctionToken)}).catch(e=>{$('prep-note').textContent='⚠ '+e.message});return}location.href='/battle-preview.html?room=arena'+(auctionCode&&auctionToken?'&auctionCode='+encodeURIComponent(auctionCode)+'&auctionToken='+encodeURIComponent(auctionToken):'');return}prepDone=true;document.querySelector('.formation').hidden=true;$('battle-arena').hidden=false;if(prepTimer!==null){clearInterval(prepTimer);prepTimer=null}document.querySelectorAll('.formation-choices button,.board-slot,.formation-select').forEach(b=>b.disabled=true);$('apply-roles').disabled=true;$('apply-roles').textContent='✓ HAZIR';$('ready-a').textContent='🔵 Sen: Hazır';$('prep-note').textContent='İki taraf hazır. Savaş başlıyor!';stop();$('events').replaceChildren();$('play').textContent='▶ SAVAŞI OYNAT';void build().then(()=>{if(events.length)$('play').click()})}
function startPreparation(){if(prepTimer!==null)clearInterval(prepTimer);prepDone=false;prepDeadline=Date.now()+60000;const tick=()=>{const remaining=Math.max(0,Math.ceil((prepDeadline-Date.now())/1000));$('prep-clock').textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');if(!remaining)lockFormation()};tick();prepTimer=setInterval(tick,200)}
const roleIcons={tank:'🛡️',fighter:'⚔️',energy:'⚡',assassin:'🗡️',support:'💚'};
const modifiers={tank:[-12,22,30,-8],fighter:[6,7,8,0],energy:[15,-10,-12,2],assassin:[17,-14,-15,17],support:[-7,0,4,9]};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function roleStats(power,role){const m=modifiers[role];return [clamp(30+Math.round(power*.65)+m[0],10,120),clamp(25+Math.round(power*.45)+m[1],5,110),clamp(95+power+m[2],50,250),clamp(25+Math.round(power*.5)+m[3],10,110)]}
function renderRolePickers(){const root=$('role-pickers');root.replaceChildren();demoA.forEach(([name,,power],i)=>{if(positions.includes(i))return;
 const card=document.createElement('article');card.className='formation-card';card.dataset.heroIndex=i;
 const heading=document.createElement('div');heading.className='formation-hero';heading.textContent=name+' · GÜÇ '+effectivePower(power);
 const badge=document.createElement('div');badge.className='formation-role';
 const stats=document.createElement('div');stats.className='formation-stats';
 const choices=document.createElement('div');choices.className='formation-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label',name+' için rol seçimi');
 function update(){const placed=positions.indexOf(i),role=placed>=0?slotRoles[placed]:assignedRoles[i],v=roleStats(power,role);badge.textContent=roleIcons[role]+' '+roleNames[role];stats.textContent='❤️ '+v[2]+'   ⚔ '+v[0]+'   🛡 '+v[1]+'   ⚡ '+v[3];for(const b of choices.children){b.classList.toggle('selected',b.dataset.role===role);b.setAttribute('aria-pressed',String(b.dataset.role===role))}}
 for(const role of roleOptions){const btn=document.createElement('button');btn.type='button';btn.dataset.role=role;btn.textContent=roleIcons[role]+' '+roleNames[role];btn.onclick=()=>{assignedRoles[i]=role;update();renderBoard();$('apply-roles').textContent='✓ HAZIRIM'};choices.append(btn)}
 const pick=document.createElement('button');pick.className='formation-select';pick.type='button';pick.textContent='📍 YUVAYA YERLEŞTİR';pick.onclick=()=>{selectedHero=i;renderBoard()};card.append(heading,badge,stats,choices,pick);root.append(card);attachDrag(card,i);update();
 })}
$('apply-roles').onclick=lockFormation;
if(arenaMode){document.body.classList.add('arena-room');document.querySelector('.formation').hidden=true;$('battle-arena').hidden=false;$('play').textContent='▶ SAVAŞI BAŞLAT';}else{renderRolePickers();renderBoard();if(!auctionMode)startPreparation();else{$('apply-roles').disabled=true;$('prep-clock').textContent='--:--';$('prep-note').textContent='Açık artırma kartları doğrulanıyor…'}}
const motion=()=> $('motion').checked&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const duration=()=>Number($('speed').value);
function comicBattleCue(e){
 if(!motion()||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const action=String(e.action||'');
 const healing=/heal|regen/i.test(action),guard=/shield|guard|resist/i.test(action);
 const special=/special|burst|splash|pierce|magic|energy|ultimate/i.test(action);
 const impact=Number(e.value)>0&&!healing&&!guard;
 if(!special&&!healing&&!guard&&!(impact&&Number(e.value)>=100))return;
 const cue=document.createElement('div');
 cue.className='battle-comic-banner'+(healing?' heal':guard?' shield':'');
 cue.textContent=healing?'ŞİFA!':guard?'KALKAN!':special?'ÖZEL GÜÇ!':'BAM!';
 cue.setAttribute('aria-hidden','true');document.body.append(cue);
 setTimeout(()=>cue.remove(),750);
}
function animateMove(e){
 if(!motion())return;
 comicBattleCue(e);
 const actor=[...document.querySelectorAll('.hero')].find(x=>x.dataset.heroId===e.actorId);
 const target=[...document.querySelectorAll('.hero')].find(x=>x.dataset.heroId===e.targetId);
 if(!actor)return;
 const action=String(e.action||'');
 const heal=/heal|regen/i.test(action),shield=/shield|guard|resist/i.test(action);
 const special=/special|burst|splash|pierce|magic|energy|ultimate/i.test(action);
 const ranged=special||heal||shield||/thor|iron man|scarlet witch|doctor fate|storm|superman|vision|magneto/i.test(e.actorId);
 const style=heal?'heal':shield?'shield':/thor|lightning/i.test(e.actorId+' '+action)?'lightning':/witch|fate|magic/i.test(e.actorId+' '+action)?'magic':special?'special':'standard';
 // Move the existing hero card toward the opponent and return it without changing combat state.
 if(target&&!heal&&!shield&&typeof actor.animate==='function'){
  const ar=actor.getBoundingClientRect(),tr=target.getBoundingClientRect();
  const dx=(tr.left+tr.width/2)-(ar.left+ar.width/2);
  const dy=(tr.top+tr.height/2)-(ar.top+ar.height/2);
  const time=Math.max(320,Math.min(780,duration()*.72));
  if(!ranged){
   actor.animate([{transform:'translate(0,0) scale(1)',offset:0},{transform:`translate(${dx*.77}px,${dy*.77}px) scale(1.13)`,offset:.42},{transform:`translate(${dx*.77}px,${dy*.77}px) scale(1.13)`,offset:.56},{transform:'translate(0,0) scale(1)',offset:1}],{duration:time,easing:'ease-in-out'});
  }else{
   actor.animate([{transform:'scale(1)',filter:'brightness(1)'},{transform:'scale(1.12)',filter:'brightness(1.7)'},{transform:'scale(1)',filter:'brightness(1)'}],{duration:time*.8,easing:'ease-out'});
  }
  target.animate([{transform:'translate(0,0)'},{transform:`translate(${Math.sign(dx)*-13}px,7px) rotate(3deg)`,offset:.55},{transform:'translate(0,0)'}],{duration:time,easing:'ease-out'});
  if(special){
   const flash=document.createElement('div');flash.className='arena-impact-flash';document.body.append(flash);setTimeout(()=>flash.remove(),Math.min(time,550));
  }
  const hit=document.createElement('span');hit.className='arena-impact-burst';target.append(hit);setTimeout(()=>hit.remove(),650);
 }
 actor.classList.add(ranged?'attack-energy':'attack-melee');
 if(special)actor.classList.add('special-cast');
 const effectTarget=target||actor;
 if(heal||shield)effectTarget.classList.add(heal?'healing-aura':'shield-aura');
 if(target&&ranged&&!heal&&!shield){
  const ar=actor.getBoundingClientRect(),tr=target.getBoundingClientRect();
  const orb=document.createElement('span');orb.className='battle-projectile effect-'+style;
  orb.style.setProperty('--from-x',ar.left+ar.width/2+'px');orb.style.setProperty('--from-y',ar.top+ar.height/2+'px');
  orb.style.setProperty('--to-x',tr.left+tr.width/2+'px');orb.style.setProperty('--to-y',tr.top+tr.height/2+'px');
  orb.style.setProperty('--duration',Math.min(600,duration()*.5)+'ms');document.body.append(orb);
  setTimeout(()=>orb.remove(),Math.min(600,duration()*.5)+120);
 }
 if(effectTarget&&Number(e.value)>0&&(heal||shield||!(/haste/i.test(action)))){const label=document.createElement('span');label.className='damage-number'+(heal?' heal-number':'');label.textContent=(heal||shield?'+':'−')+e.value;effectTarget.append(label);setTimeout(()=>label.remove(),850)}
 setTimeout(()=>{actor.classList.remove('attack-melee','attack-energy','special-cast');effectTarget.classList.remove('healing-aura','shield-aura')},700);
}

async function build(overrideResult){
 stop();cursor=0;events=[];$('arena-score').hidden=true;if($('battle-summary'))$('battle-summary').hidden=true;$('next').disabled=true;$('play').disabled=true;
 $('message').textContent='Sunucudan gerçek savaş sonucu alınıyor…';
 try{
  let result=overrideResult;
  if(!result&&auctionMode){const response=await fetch('/api/battle-auction-preview?code='+encodeURIComponent(auctionCode)+'&token='+encodeURIComponent(auctionToken),{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Savaş alınamadı');if(!data.started){$('message').textContent='Rakibin dizilişi bekleniyor… '+data.ready.filter(Boolean).length+'/2 hazır';return}result=data.result}
  if(!result){const response=await fetch('/api/battle-preview?roles='+encodeURIComponent(positions.map((i,slot)=>roleAt(slot)).join(','))+'&positions='+encodeURIComponent(positions.join(','))+'&lanes='+encodeURIComponent(lanes.join(',')),{cache:'no-store'});if(!response.ok)throw Error('Savaş verisi alınamadı ('+response.status+')');result=await response.json()}
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
  $('arena-score').hidden=false;
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
   const universe=String(u.id||'').split(':')[0]|| (side?'dc':'marvel');const artKey=universe+':'+u.name;
   if(!arenaArtCache.has(artKey))arenaArtCache.set(artKey,fetch('/api/art?universe='+universe+'&name='+encodeURIComponent(u.name)).then(r=>r.ok?r.json():null).then(j=>j?.url||null).catch(()=>null));
   void arenaArtCache.get(artKey).then(url=>{if(!url||!portrait.isConnected)return;const img=document.createElement('img');img.className='arena-portrait-image';img.alt=u.name;img.src=url;img.onload=()=>{if(portrait.isConnected){fallback.remove();portrait.append(img)}}});
   const bar=document.createElement('div');bar.className='hp';bar.setAttribute('aria-label','Can '+u.hp+' / '+u.maxHp);const fill=document.createElement('span');fill.style.width=(100*u.hp/u.maxHp)+'%';bar.append(fill);
   card.title=u.name+' · '+roleNames[u.role]+' · Can '+u.hp+'/'+u.maxHp;
   const heroLabel=document.createElement('span');heroLabel.className='arena-hero-label';heroLabel.textContent=u.name;card.append(portrait,heroLabel,bar);parent.append(card);
  }
  $(side?'score-b':'score-a').textContent=states[side].filter(u=>u.hp>0).length+' / 5';
  const suffix=side?'b':'a';
  const maxHp=states[side].reduce((sum,u)=>sum+Math.max(0,Number(u.maxHp)||0),0);
  const remainingHp=states[side].reduce((sum,u)=>sum+Math.max(0,Math.min(Number(u.hp)||0,Number(u.maxHp)||0)),0);
  const percent=maxHp>0?Math.max(0,Math.min(100,remainingHp/maxHp*100)):0;
  $('team-hp-'+suffix+'-fill').style.width=percent+'%';
  $('team-hp-'+suffix+'-label').textContent=Math.round(remainingHp).toLocaleString('tr-TR')+' / '+Math.round(maxHp).toLocaleString('tr-TR')+' HP';
  $('team-hp-'+suffix+'-track').setAttribute('aria-valuenow',String(Math.round(percent)));
  $('team-hp-'+suffix+'-track').setAttribute('aria-valuetext',Math.round(remainingHp)+' / '+Math.round(maxHp)+' HP');
 }
 $('round').textContent=cursor?events[cursor-1].round:'0';
 $('next').disabled=cursor>=events.length;
 $('play').disabled=cursor>=events.length;
 if(cursor===events.length){
  showBattleSummary();
  if(auctionMode)void showAuctionRematch();
  $('message').textContent=finalResult?.winner===null?'🤝 Beraberlik':finalResult?.winner===0?'🏆 Mavi takım kazandı!':'🏆 Kırmızı takım kazandı!';
 }
}
function showBattleSummary(){
 const panel=$('battle-summary');if(!panel||!finalResult)return;
 const winner=finalResult.winner;
 const survivors=states.map(team=>team.filter(unit=>unit.hp>0).length);
 $('battle-summary-title').textContent=winner===null?'🤝 BERABERLİK':winner===0?'🏆 MAVİ TAKIM KAZANDI':'🏆 KIRMIZI TAKIM KAZANDI';
 $('battle-summary-detail').textContent='Açık artırma gücü, diziliş ve kahraman yetenekleri savaş sonucunu belirledi.';
 $('battle-summary-rounds').textContent=String(finalResult.rounds??events.at(-1)?.round??0);
 $('battle-summary-survivors').textContent=survivors.join(' - ');
 $('battle-summary-actions').textContent=String(events.length);
 panel.hidden=false;
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
if(multiplayerCode&&multiplayerToken){const check=async()=>{try{const response=await fetch('/api/battle-room?code='+encodeURIComponent(multiplayerCode)+'&token='+encodeURIComponent(multiplayerToken),{cache:'no-store'});const v=await response.json();if(!response.ok)throw Error(v.error);if(v.started){clearInterval(battlePoll);battlePoll=null;document.body.classList.add('online-battle');if(!arenaMode){location.href='/battle-preview.html?room=arena&code='+encodeURIComponent(multiplayerCode)+'&token='+encodeURIComponent(multiplayerToken);return}await build(v.result);if(events.length)$('play').click()}else{$('message').textContent='Rakibin hazırlanması bekleniyor… '+v.ready.filter(Boolean).length+'/2 hazır';if(arenaMode)$('play').disabled=true}}catch(e){$('message').textContent='⚠ '+e.message}};void check();battlePoll=setInterval(check,1800)}else if(arenaMode&&!auctionCode){void build().then(()=>{if(events.length)$('play').click()})}

if(auctionCode&&auctionToken){void (async()=>{try{
 const response=await fetch('/api/battle-auction-team?code='+encodeURIComponent(auctionCode)+'&token='+encodeURIComponent(auctionToken),{cache:'no-store'});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Açık artırma verisi alınamadı');
 const own=data.teams[data.seat],rival=data.teams[1-data.seat];
 if(!Array.isArray(own)||own.length!==5||!Array.isArray(rival)||rival.length!==5)throw Error('Her oyuncunun beş kahramanı olmalı');
 demoA=own.map(c=>[c.name,'fighter',c.power,c.universe]);demoB=rival.map(c=>[c.name,'fighter',c.power,c.universe]);
 previewCredits=data.credits[data.seat];assignedRoles=demoA.map(()=> 'fighter');heroArtCache.clear();
 $('battle-lobby-status').textContent='Açık artırma kartların yüklendi · Kalan kredi: '+previewCredits+' · Bonus: %'+(creditBonus(previewCredits)*100).toFixed(1);
 if(!arenaMode){auctionLoaded=true;renderBoard();renderRolePickers();$('apply-roles').disabled=false;startPreparation();$('prep-note').textContent='Kartlar doğrulandı. Diziliş için 60 saniyen var.'}else{const check=async()=>{try{const response=await fetch('/api/battle-auction-preview?code='+encodeURIComponent(auctionCode)+'&token='+encodeURIComponent(auctionToken),{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Savaş durumu alınamadı');if(data.started){if(battlePoll)clearInterval(battlePoll);battlePoll=-1;await build(data.result);if(events.length)$('play').click()}else $('message').textContent='Rakibin dizilişi bekleniyor… '+data.ready.filter(Boolean).length+'/2 hazır'}catch(e){$('message').textContent='⚠ '+e.message}};await check();if(battlePoll===null)battlePoll=setInterval(check,1800)}
 }catch(e){$('prep-note').textContent='⚠ '+e.message;$('message').textContent='⚠ '+e.message;$('apply-roles').disabled=true}})()}

let battleRematchShown=false;
async function showAuctionRematch(){
 if(battleRematchShown||!auctionMode)return;battleRematchShown=true;
 try{const response=await fetch('/api/battle-auction-complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:auctionCode,token:auctionToken})});const data=await response.json();if(!response.ok)throw Error(data.error||'Savaş tamamlanamadı');
 const controls=document.querySelector('.controls .buttons');if(!controls)return;
 const button=document.createElement('button');button.type='button';button.textContent='⚔ RÖVANŞ İSTE';button.className='primary';controls.append(button);
 button.onclick=async()=>{button.disabled=true;try{const auth=JSON.parse(localStorage.getItem('hero-auction-login')||'null');const response=await fetch('/api/rematch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:auctionCode,token:auctionToken,authToken:auth?.authToken})});const result=await response.json();if(!response.ok)throw Error(result.error||'Rövanş gönderilemedi');button.textContent='✓ RÖVANŞ İSTEĞİ GÖNDERİLDİ';const watch=setInterval(async()=>{try{const response=await fetch('/api/battle-auction-team?code='+encodeURIComponent(auctionCode)+'&token='+encodeURIComponent(auctionToken),{cache:'no-store'});if(response.status===409){clearInterval(watch);location.replace('/')} }catch{}},2500);}catch(e){button.disabled=false;$('message').textContent='⚠ '+e.message}};
 }catch(e){battleRematchShown=false;$('message').textContent='⚠ '+e.message}
}
