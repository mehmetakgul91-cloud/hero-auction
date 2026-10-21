import * as T from 'three';
import {loadObsidian} from './arena-3d-assets.js';
import {SoftwareArenaRenderer} from './arena-3d-software.js';
import {box,cylinder,ring,material} from './arena-3d-models.js';
const $=id=>document.getElementById(id),clamp=T.MathUtils.clamp,smooth=t=>t*t*(3-2*t);
const labels={idle:'Hazır · Hafif nefes hareketi',walk:'Yürüyor · Kol ve bacak hareketi',attack:'Saldırı · Silah darbesi',hit:'Darbe aldı · Geri tepme',death:'Yenildi · Yere düşme',victory:'Hedef yenildi · Zafer'};
const sequence=[['idle',.6],['walk',1.2],['attack',1.2],['hit',.6],['attack',1.2],['hit',.6],['attack',1.2],['victory',1.6]];
let renderer,scene,camera,asset,hero,dummy,observer,last=0,time=0,elapsed=0,mode='idle',playing=false,auto=false,step=0,impacted=false,angle=0,heroHp=100,dummyHp=100,damageAt=-10,damageSide='dummy',width=1,height=1;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function hp(){for(const [id,value] of [['hero',heroHp],['dummy',dummyHp]]){$(id+'-health').style.transform='scaleX('+value/100+')';$(id+'-health-text').textContent=value+' / 100';}}
function choose(next,run=true){mode=next;elapsed=0;impacted=false;playing=run;$('motion-label').textContent=labels[mode];$('model-canvas').dataset.motion=mode;for(const button of document.querySelectorAll('[data-motion]'))button.setAttribute('aria-pressed',String(button.dataset.motion===mode));}
function reset(){heroHp=dummyHp=100;hp();time=0;elapsed=0;step=0;damageAt=-10;hero.position.set(-.55,0,0);hero.rotation.set(0,-.12,0);hero.scale.setScalar(1);dummy.rotation.set(0,0,0);dummy.position.y=0;dummy.visible=true;}
function project(position){const p=position.clone().project(camera);return {x:(p.x*.5+.5)*width,y:(.5-p.y*.5)*height};}
function resize(){const rect=$('model-canvas').parentElement.getBoundingClientRect();width=rect.width;height=rect.height;renderer.setSize(width,height,false);const ratio=width/height,half=Math.max(1.45,1.7/ratio);camera.left=-half*ratio;camera.right=half*ratio;camera.top=half;camera.bottom=-half;camera.position.set(angle?4.3:2.5,2.3,angle?2.2:5.7);camera.lookAt(.12,.80,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();}
function impact(){
 if(mode==='attack'){const amount=Math.min(dummyHp,34);dummyHp-=amount;damageSide='dummy';$('damage').textContent='−'+amount;}
 else if(mode==='hit'){heroHp=Math.max(0,heroHp-18);damageSide='hero';$('damage').textContent='−18';}
 else return;
 damageAt=time;hp();
}
function tick(now){
 const dt=last?Math.max(0,(now-last)/1000):0;last=now;time+=dt;
 if(playing)elapsed+=dt;
 const duration=auto?sequence[step][1]:mode==='walk'?2:mode==='death'?1:1.2;
 const p=clamp(elapsed/duration,0,1);
 if(playing&&!impacted&&p>=.5){impacted=true;impact();}
 hero.position.y=0;hero.rotation.z=0;hero.rotation.x=0;hero.scale.setScalar(1);hero.visible=true;
 if(mode==='walk'){
  hero.position.x=-.55+smooth(p)*.45;hero.rotation.y=Math.PI/2;
  if(!reduced)hero.position.y=Math.abs(Math.sin(elapsed*10))*.012;
 }else if(mode==='attack'){hero.rotation.y=Math.PI/2;hero.position.x=-.10;}
 else if(mode==='idle'){hero.position.x=-.55;hero.rotation.y=-.12;if(!reduced)hero.position.y=Math.sin(time*2.1)*.006;}
 else if(mode==='death'){hero.rotation.z=smooth(p)*1.5;hero.position.y=-p*.12;}
 if(mode==='hit'&&!reduced)hero.position.x=-.10-Math.sin(p*Math.PI)*.07;
 asset.motion.apply({time:mode==='walk'?elapsed:time,mode,progress:p,reduced});
 const damageTime=time-damageAt;
 dummy.rotation.z=damageSide==='dummy'&&damageTime<.4?-Math.sin(damageTime/.4*Math.PI)*.17:0;
 if(dummyHp===0){dummy.rotation.z=-Math.min(1,damageTime/.6)*1.5;dummy.position.y=-Math.min(1,damageTime/.6)*.2;}
 scene.updateMatrixWorld(true);
 const heroPoint=project(new T.Vector3(hero.position.x,2.02,0)),dummyPoint=project(new T.Vector3(dummy.position.x,1.72,0));
 for(const [id,point] of [['hero-tag',heroPoint],['dummy-tag',dummyPoint]])$(id).style.transform=`translate(${point.x}px,${point.y}px)`;
 if(damageTime<.9){const point=project(new T.Vector3(damageSide==='hero'?hero.position.x:dummy.position.x,1.6+damageTime*.6,.1));$('damage').style.left=point.x+'px';$('damage').style.top=point.y+'px';$('damage').style.opacity=String(1-damageTime/.9);}else $('damage').style.opacity='0';
 renderer.render(scene,camera);
 if(playing&&p===1){
  if(auto&&step<sequence.length-1){step++;choose(sequence[step][0]);$('step-count').textContent=String(step+1).padStart(2,'0')+' / 08';}
  else{playing=false;auto=false;$('demo').textContent='↻ DENEMEYİ TEKRARLA';$('demo').setAttribute('aria-pressed','false');if(mode==='walk'||mode==='attack'||mode==='hit')choose('idle',false);}
 }
}
async function boot(){try{
 const canvas=$('model-canvas'),context=canvas.getContext('webgl2',{antialias:true,alpha:false});
 renderer=context?new T.WebGLRenderer({canvas,context,antialias:true}):new SoftwareArenaRenderer(canvas);
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0x101d2c);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
 scene=new T.Scene();camera=new T.OrthographicCamera(-2,2,2,-2,.1,30);
 scene.add(new T.HemisphereLight(0xd2e6ff,0x454447,2.8));const key=new T.DirectionalLight(0xffe3bb,3);key.position.set(-3,6,5);scene.add(key);const fill=new T.DirectionalLight(0x81b7ff,1.5);fill.position.set(4,2,-3);scene.add(fill);
 const floor=new T.Group();scene.add(floor);cylinder(floor,2.25,2.35,.12,material(0x25384b,.25),0,-.10,0,64);ring(floor,2.12,.012,material(0x957649,.3),0,-.02,0);for(const r of [.9,1.5])ring(floor,r,.008,material(0x456177,.15),0,-.02,0);
 hero=new T.Group();scene.add(hero);asset=await loadObsidian();hero.add(asset.root);asset.root.scale.setScalar(1.12);
 dummy=new T.Group();dummy.position.x=1.10;scene.add(dummy);const wood=material(0x6e4e37,.05),trim=material(0xa89065,.3),dark=material(0x2b2526,.05);
 cylinder(dummy,.10,.14,1.35,wood,0,.65,0,10);box(dummy,.82,.12,.14,wood,0,1.05,0);cylinder(dummy,.22,.22,.40,dark,0,1.12,0,12);const target=ring(dummy,.21,.035,trim,0,1.15,.25);target.rotation.x=0;const inner=ring(dummy,.11,.02,material(0xe29786,0,true),0,1.15,.255);inner.rotation.x=0;cylinder(dummy,.33,.4,.08,dark,0,.02,0,16);
 observer=new ResizeObserver(resize);observer.observe(canvas.parentElement);resize();reset();choose('idle',false);
 $('model-loader').hidden=true;canvas.dataset.ready='true';$('render-mode').textContent=renderer.isSoftwareRenderer?'YAZILIM GÖRÜNÜMÜ · 3D MODEL':'GERÇEK 3D MODEL · DOKULU';
 for(const button of document.querySelectorAll('button'))button.disabled=false;
 document.querySelectorAll('[data-motion]').forEach(button=>button.addEventListener('click',()=>{auto=false;reset();choose(button.dataset.motion);$('demo').textContent='▶ SAVAŞ DENEMESİNİ BAŞLAT';$('demo').setAttribute('aria-pressed','false');$('step-count').textContent='01 / 01';}));
 $('demo').addEventListener('click',()=>{if(auto&&playing){playing=false;$('demo').textContent='▶ DEVAM ET';$('demo').setAttribute('aria-pressed','false');return;}if(auto){playing=true;}else{reset();auto=true;choose(sequence[0][0]);$('step-count').textContent='01 / 08';}$('demo').textContent='Ⅱ DURAKLAT';$('demo').setAttribute('aria-pressed','true');});
 $('view').addEventListener('click',()=>{angle=1-angle;resize();});
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer.setAnimationLoop(null);throwDisplay('Grafik bağlantısı kesildi. Sayfayı yeniden açabilirsin.');});
 renderer.setAnimationLoop(tick);
 document.addEventListener('visibilitychange',()=>{last=0;renderer.setAnimationLoop(document.hidden?null:tick);});
 window.addEventListener('pagehide',()=>renderer.setAnimationLoop(null));window.addEventListener('pageshow',()=>{last=0;renderer.setAnimationLoop(tick);});
 }catch(error){console.error('Obsidian model:',error);throwDisplay('Model yüklenemedi. Bağlantını kontrol edip tekrar deneyebilirsin.');}}
function throwDisplay(message){const loader=$('model-loader');loader.hidden=false;loader.replaceChildren();const text=document.createElement('p');text.textContent=message;const link=document.createElement('a');link.href='/arena-model.html';link.textContent='Yeniden aç';loader.append(text,link);}
void boot();
