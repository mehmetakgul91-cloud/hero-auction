// Browser-only battle replay preview. No wallet or live room mutations.
const $=id=>document.getElementById(id);
const demoA=[['Hulk','tank',85],['Thor','fighter',88],['Wolverine','fighter',78],['Scarlet Witch','energy',90],['Iron Man','support',80]];
const demoB=[['Superman','fighter',92],['Wonder Woman','fighter',85],['Doomsday','tank',84],['The Flash','assassin',81],['Doctor Fate','energy',87]];
const roleNames={tank:'TANK',fighter:'SAVAŞÇI',energy:'ENERJİ',assassin:'SUİKASTÇI',support:'DESTEK'};
let states=[],events=[],cursor=0,timer=null;
function build(){
 const team=(arr,side)=>arr.map(([name,role,power],position)=>({id:side+'-'+position,name,role,position,attack:Math.round(30+power*.65),defense:Math.round(25+power*.45),maxHp:95+power,hp:95+power,speed:Math.round(25+power*.5),shield:0}));
 const a=team(demoA,0),b=team(demoB,1);states=[a,b];events=[];cursor=0;
 // Visual demo only. The authoritative deterministic engine lives on the server.
 for(let round=1;round<=10;round++){
  const order=states.flatMap((team,side)=>team.map(u=>({u,side}))).sort((x,y)=>y.u.speed-x.u.speed||x.side-y.side);
  for(const {u,side} of order){
   if(u.hp<=0)continue;
   const enemies=states[1-side].filter(x=>x.hp>0);
   if(!enemies.length)break;
   const target=enemies.sort((x,y)=>x.hp-y.hp)[0];
   const special=round%3===0,damage=Math.min(target.hp,Math.max(1,Math.floor(u.attack*(special?1.35:1)*100/(100+target.defense))));
   target.hp-=damage;
   events.push({round,actor:u.name,actorId:u.id,target:target.name,targetId:target.id,damage,special,snapshot:states.map(t=>t.map(x=>x.hp))});
  }
  if(states.some(t=>t.every(x=>x.hp<=0)))break;
 }
 states=[team(demoA,0),team(demoB,1)];
 render();
}
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
  const a=states[0].reduce((s,u)=>s+u.hp/u.maxHp,0),b=states[1].reduce((s,u)=>s+u.hp/u.maxHp,0);
  $('message').textContent=a===b?'🤝 Beraberlik':a>b?'🏆 Mavi takım kazandı!':'🏆 Kırmızı takım kazandı!';
 }
}
function step(){
 if(cursor>=events.length){stop();return}
 const e=events[cursor++];
 states.forEach((t,side)=>t.forEach((u,i)=>u.hp=e.snapshot[side][i]));
 const li=document.createElement('li');li.textContent='Tur '+e.round+' · '+e.actor+(e.special?' ✨ özel saldırı':' ⚔ saldırı')+' → '+e.target+' (−'+e.damage+' can)';
 $('events').prepend(li);$('message').textContent=e.actor+' → '+e.target+' · '+e.damage+' hasar';
 render(e);if(cursor>=events.length)stop();
}
function stop(){if(timer!==null){clearInterval(timer);timer=null}}
$('play').onclick=()=>{if(timer!==null){stop();$('play').textContent='▶ DEVAM ET';return}timer=setInterval(step,550);$('play').textContent='⏸ DURDUR'};
$('next').onclick=()=>{stop();$('play').textContent='▶ SAVAŞI OYNAT';step()};
$('reset').onclick=()=>{stop();$('play').textContent='▶ SAVAŞI OYNAT';$('events').replaceChildren();$('message').textContent='Başlamak için savaşı oynat.';build()};
build();
