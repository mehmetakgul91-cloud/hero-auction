// Browser-only battle replay preview. No wallet or live room mutations.
const $=id=>document.getElementById(id);
const demoA=[['Hulk','tank',85],['Thor','fighter',88],['Wolverine','fighter',78],['Scarlet Witch','energy',90],['Iron Man','support',80]];
const demoB=[['Superman','fighter',92],['Wonder Woman','fighter',85],['Doomsday','tank',84],['The Flash','assassin',81],['Doctor Fate','energy',87]];
const roleNames={tank:'TANK',fighter:'SAVAŞÇI',energy:'ENERJİ',assassin:'SUİKASTÇI',support:'DESTEK'};
let states=[],events=[],cursor=0,timer=null;
async function build(){
 stop();cursor=0;events=[];$('next').disabled=true;$('play').disabled=true;
 $('message').textContent='Sunucudan gerçek savaş sonucu alınıyor…';
 try{
  const response=await fetch('/api/battle-preview',{cache:'no-store'});
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
   const card=document.createElement('article');card.className='hero'+(u.hp<=0?' dead':'')+(flash?.actorId===u.id?' cast':'')+(flash?.targetId===u.id?' hit':'');
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
 render(e);if(cursor>=events.length)stop();
}
function stop(){if(timer!==null){clearInterval(timer);timer=null}}
$('play').onclick=()=>{if(timer!==null){stop();$('play').textContent='▶ DEVAM ET';return}timer=setInterval(step,550);$('play').textContent='⏸ DURDUR'};
$('next').onclick=()=>{stop();$('play').textContent='▶ SAVAŞI OYNAT';step()};
$('reset').onclick=()=>{stop();$('play').textContent='▶ SAVAŞI OYNAT';$('events').replaceChildren();$('message').textContent='Başlamak için savaşı oynat.';build()};
void build();
