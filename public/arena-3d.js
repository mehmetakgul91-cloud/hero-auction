import {ArenaReplayClock,primaryAction} from './arena-3d-timeline.js';
const $=id=>document.getElementById(id);
const roles={tank:'TANK',fighter:'SAVAŞÇI',assassin:'SUİKASTÇI',energy:'BÜYÜCÜ',support:'ŞİFACI'};
const descriptions={tank:'Ön safta durur, kalkanıyla darbeleri karşılar.',fighter:'Hedefine yaklaşır, silahıyla güçlü darbeler indirir.',assassin:'Önce arka safa atılır, çift hançeriyle saldırır.',energy:'Uzaktan büyü yollar, özel vuruşuyla alan hasarı verir.',support:'Yaralı dostuna yaşam enerjisi gönderir.'};
let scene,clock,data,currentTeams,selected,speed=1,actionCount=0,lastTime=0,autoQuality=true,slowSeconds=0;
function updateInspector(){
 if(!selected||!currentTeams)return;
 const hero=currentTeams[selected.side].find(h=>h.id===selected.id),meta=data.heroes.find(h=>h.id===selected.id);
 $('selected-name').textContent=hero.name;$('selected-role').textContent=roles[hero.role];$('selected-description').textContent=descriptions[hero.role];
 const portrait=$('selected-portrait');if(portrait.getAttribute('src')!==meta.portrait){portrait.src=meta.portrait;portrait.alt=hero.name;}
 $('selected-side').textContent=selected.side?'KIRMIZI TAKIM':'MAVİ TAKIM';$('selected-side').style.color=selected.side?'var(--red)':'var(--cyan)';
 $('selected-hp').textContent=hero.hp+' / '+hero.maxHp;$('selected-shield').textContent=hero.shield||0;$('selected-damage').textContent=hero.damage||0;
 for(const button of $('hero-selector').children)button.setAttribute('aria-pressed',String(button.dataset.hero===selected.id&&selected.side===0));
}
function select(key){const model=scene.models.get(key);if(!model)return;selected={side:model.side,id:model.hero.id};scene.select(key);updateInspector();}
function updateHud(teams,round=1){
 currentTeams=teams;
 teams.forEach((team,side)=>{const id=side?'red':'blue',hp=team.reduce((n,h)=>n+h.hp,0),max=team.reduce((n,h)=>n+h.maxHp,0);
  $(id+'-alive').textContent=team.filter(h=>h.hp>0).length+' / 5';$(id+'-health').value=hp/max*100;$(id+'-hp').textContent=hp+' / '+max+' CAN';});
 $('round-number').textContent=String(round).padStart(2,'0');updateInspector();
}
function describe(frame){
 const event=primaryAction(frame);if(!event){$('action-kicker').textContent='YENİ TUR';$('action-text').textContent='Kahramanlar sıradaki hamleye hazırlanıyor.';$('action-symbol').textContent='✦';return;}
 if(String(event.actor).startsWith('commander:')){
  const heal=event.action.includes('support');$('action-kicker').textContent=heal?'DESTEK KOMUTANI':'SAVUNMA KOMUTANI';$('action-text').textContent=heal?'Yaşam enerjisi yaralı kahramanlara ulaşıyor.':'Takımın etrafında koruyucu kalkan oluşuyor.';$('action-symbol').textContent=heal?'✚':'◇';
 }else{
  const actor=currentTeams.flat().find(h=>h.id===event.actor),target=currentTeams.flat().find(h=>h.id===event.target);
  const heal=event.action==='heal'||event.action==='passive-heal';
  $('action-kicker').textContent=(roles[actor?.role]||'KAHRAMAN')+(event.critical?' · KRİTİK VURUŞ':event.damageType==='special'?' · ÖZEL YETENEK':'');
  $('action-text').textContent=actor?.name+(target?' → '+target.name:'')+(Number(event.value)?' · '+event.value+(heal?' şifa':' hasar'):'');
  $('action-symbol').textContent=heal?'✚':actor?.role==='energy'?'✧':'⚔';
 }
}
function updatePlay(){
 $('play').textContent=clock.finished?'↻ TEKRAR İZLE':clock.playing?'Ⅱ DURAKLAT':clock.started||clock.cursor?'▶ DEVAM ET':'▶ SAVAŞI BAŞLAT';
 $('play').setAttribute('aria-pressed',String(clock.playing));$('phase-label').textContent=clock.finished?'BİTTİ':clock.playing?'SAVAŞ':clock.cursor||clock.started?'DURAKLADI':'HAZIR';
}
function reset(start=false){
 clock.reset();scene.finishFrame();scene.reset(data.initial);scene.winner=null;actionCount=0;$('result-panel').hidden=true;$('board-hint').hidden=false;
 $('action-kicker').textContent='TAKIMLAR HAZIR';$('action-text').textContent='Savaşı başlat, beş sınıfı hareket hâlinde gör.';$('action-symbol').textContent='✦';$('action-count').textContent='0 hareket';updateHud(data.initial);
 if(start)clock.play();updatePlay();
}
function showError(message){
 if(clock)clock.pause();$('play').disabled=true;
 const panel=$('load-panel');panel.hidden=false;panel.replaceChildren();
 const title=document.createElement('strong');title.textContent='3D arena açılamadı';const detail=document.createElement('p');detail.textContent=message;
 const retry=document.createElement('a');retry.href='/arena-3d.html';retry.textContent='Tekrar dene';const back=document.createElement('a');back.href='/';back.textContent='Ana menüye dön';panel.append(title,detail,retry,back);
}
async function boot(){
 try{
  const [module,response]=await Promise.all([import('./arena-3d-scene.js'),fetch('/api/arena-3d-demo')]);
  if(!response.ok)throw Error('Demo unavailable');data=await response.json();
  scene=new module.Arena3dScene($('arena-canvas'),$('hero-labels'),$('float-labels'),select);scene.setTeams(data.initial);currentTeams=data.initial;
  if(scene.economy){$('quality').textContent='EKO';$('quality').setAttribute('aria-label','Görüntü kalitesi: ekonomik');}
  for(const hero of data.initial[0]){
   const meta=data.heroes.find(h=>h.id===hero.id),button=document.createElement('button'),img=document.createElement('img');
   button.dataset.hero=hero.id;button.setAttribute('aria-label',hero.name+' · '+roles[hero.role]);button.title=roles[hero.role];img.src=meta.portrait;img.alt='';button.append(img);button.addEventListener('click',()=>select('0:'+hero.id));$('hero-selector').append(button);
  }
  clock=new ArenaReplayClock(data.frames,{
   start(frame){scene.startFrame(frame);describe(frame);$('round-number').textContent=String(frame.round).padStart(2,'0');},
   impact(frame){scene.impact(frame);updateHud(frame.teams,frame.round);},
   end(frame){scene.finishFrame();if(primaryAction(frame))actionCount++;$('action-count').textContent=actionCount+' hareket';},
   finish(){
    scene.winner=data.winner;$('result-panel').hidden=false;$('result-panel').dataset.winner=String(data.winner);
    $('winner-title').textContent=data.winner===null?'DENGE BOZULMADI':data.winner===0?'MAVİ TAKIM KAZANDI':'KIRMIZI TAKIM KAZANDI';
    $('result-copy').textContent=data.rounds+' tur · '+data.summary.actionCount+' hamle · Ücretsiz deneme';$('board-hint').hidden=true;
    $('action-kicker').textContent='SAVAŞ TAMAMLANDI';$('action-text').textContent='Yeni kamera açısıyla tekrar izleyebilirsin.';updatePlay();
   }
  });
  select('0:'+data.initial[0][0].id);updateHud(data.initial);$('play').disabled=false;$('load-panel').hidden=true;$('arena-canvas').dataset.ready='true';
  $('play').addEventListener('click',()=>{if(clock.finished)reset(true);else if(clock.playing)clock.pause();else clock.play();updatePlay();});
  $('reset').addEventListener('click',()=>reset());$('result-replay').addEventListener('click',()=>reset(true));
  $('speed').addEventListener('click',()=>{speed=speed===1?1.5:speed===1.5?2:1;$('speed').textContent=speed+'×';$('speed').setAttribute('aria-label','Oynatma hızı: '+speed);});
  $('camera').addEventListener('click',()=>scene.changeCamera());
  $('quality').addEventListener('click',()=>{autoQuality=false;scene.setEconomy(!scene.economy);$('quality').textContent=scene.economy?'EKO':'HD';$('quality').setAttribute('aria-label',scene.economy?'Görüntü kalitesi: ekonomik':'Görüntü kalitesi: yüksek');});
  $('arena-canvas').addEventListener('webglcontextlost',event=>{event.preventDefault();scene.renderer.setAnimationLoop(null);showError('Grafik bağlantısı kesildi. Denemeyi yeniden açabilirsin.');});
  const animate=time=>{
   const raw=lastTime?(time-lastTime)/1000:0;lastTime=time;const dt=Math.min(raw,.05),playing=clock.playing;
   if(autoQuality&&playing&&!scene.economy){slowSeconds=raw>.045?slowSeconds+dt:Math.max(0,slowSeconds-dt*.5);if(slowSeconds>3){scene.setEconomy(true);$('quality').textContent='EKO';$('quality').setAttribute('aria-label','Görüntü kalitesi: otomatik ekonomik');}}
   clock.advance(dt*speed);scene.render(dt,clock.progress,playing||!scene.active);
  };
  scene.renderer.setAnimationLoop(animate);
  document.addEventListener('visibilitychange',()=>{lastTime=0;if(document.hidden){clock.pause();updatePlay();scene.renderer.setAnimationLoop(null);}else scene.renderer.setAnimationLoop(animate);});
  window.addEventListener('pagehide',()=>{clock.pause();scene.renderer.setAnimationLoop(null);});
  window.addEventListener('pageshow',()=>{lastTime=0;scene.renderer.setAnimationLoop(animate);});
 }catch(error){console.error('3D arena:',error);showError('Bağlantını kontrol edip tekrar deneyebilirsin. Grafik desteği yoksa klasik arena ana menüde kullanılabilir.');}
}
void boot();
