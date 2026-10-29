import {heroCombatPresentation} from './hero-combat-presentation.js';
// Visual identity only. Formation roles and server combat rules are untouched.
export function heroAttackSignature(hero,kind){
 if(['heal','shield','lightning'].includes(kind))return kind;
 if(heroCombatPresentation(hero).projectile==='arrow')return 'arrow';
 if(kind==='magic')return 'magic';
 if(hero.role==='tank')return 'hammer';
 if(hero.role==='assassin')return 'dagger';
 if(['support','healer'].includes(hero.role))return 'light';
 return 'blade';
}
export function heroAttackTiming(time,{self=false}={}){
 const duration=Math.max(320,Math.min(780,time));
 const charge=self?0:Math.round(duration*.12);
 const travel=self?0:Math.round(duration*.34);
 return {charge,travel,arrival:charge+travel,impact:Math.round(duration*.54)};
}
// All nodes use the shared bounded owner; cancellation removes delayed CSS too.
// Fixed, portrait-sized transparent overlays escape portrait/board clipping but
// never cover HP bars with a filled panel. Damage labels retain their higher layer.
export function playHeroAttack({document,effects,actor,target,hero,kind,special=false,splash=false,time=650}){
 if(!actor||!target)return;
 const signature=heroAttackSignature(hero,kind);
 const rect=el=>(el.querySelector('.arena-portrait')||el).getBoundingClientRect();
 const a=rect(actor),b=rect(target),from={x:a.left+a.width/2,y:a.top+a.height/2},to={x:b.left+b.width/2,y:b.top+b.height/2};
 if(!a.width||!b.width)return;
 const timing=heroAttackTiming(time,{splash,self:actor===target});
 const angle=Math.atan2(to.y-from.y,to.x-from.x);
 function make(phase,point,ms,delay=0){
  const node=document.createElement('span');
  node.className=`hero-fx hero-fx-${phase} signature-${signature}${special?' is-special':''}${splash?' is-splash':''}`;
  node.setAttribute('aria-hidden','true');
  const size=Math.max(38,Math.min(80,phase==='cast'?a.width:b.width));
  for(const [key,value] of Object.entries({'--hero-size':size+'px','--hero-ms':ms+'ms','--hero-delay':delay+'ms','--hero-angle':angle+'rad','--hero-dx':(to.x-from.x)+'px','--hero-dy':(to.y-from.y)+'px'}))node.style.setProperty(key,value);
  node.style.left=point.x+'px';node.style.top=point.y+'px';
  for(let i=0;i<4;i++){const part=document.createElement('i');part.style.setProperty('--part',i);node.append(part)}
  effects.node(node,document.body,delay+ms+80);return node;
 }
 if(!splash&&actor!==target){
  make('cast',from,Math.max(180,timing.arrival));
  make('flight',from,timing.travel,timing.charge);
 }
 make('impact',to,timing.impact,timing.arrival);
 return {signature,...timing};
}
