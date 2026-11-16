import {MELEE_SPRITES} from './hero-melee-sprites-data.js';
import {CASTER_SPRITES} from './hero-caster-sprites-data.js';

const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => {const t = clamp(value);return t * t * (3 - 2 * t)};
const images = new Map();

export function meleeSpriteProfile(hero = {}) {
 return MELEE_SPRITES[hero.id] || null;
}
export function heroSpriteProfile(hero={}) {
 return MELEE_SPRITES[hero.id] || CASTER_SPRITES[hero.id] || null;
}
export function casterEmissionPoint(profile,{from,to,width,special=false}){
 const size=Math.max(110,Math.min(220,width*2.7)),direction=to.x>=from.x?1:-1;
 const hand=special?profile.specialContact:profile.contact;
 return {x:from.x+direction*(width*.6+(hand[0]-.5)*size),y:from.y+width*.18+(hand[1]-.5)*size};
}
// The special channel belongs to this body, so multi-target abilities draw it
// once. It is decoration only and shares the body's frame/cancellation owner.
export function drawCasterChannel(ctx,profile,{x,y,progress,size=100}){
 if(progress<=0||progress>=1.45)return;
 const t=clamp(progress),r=size*(.1+.13*t),fade=Math.sin(Math.min(1,progress/1.45)*Math.PI);
 ctx.save();ctx.translate(x,y);ctx.globalAlpha=fade*.85;
 ctx.strokeStyle=profile.role==='support'?'#92f3b0':profile.color;ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=Math.max(1.4,size*.008);
 for(const direction of [-1,1]){ctx.beginPath();ctx.arc(0,0,r,direction*t*2,direction*t*2+Math.PI*.72);ctx.stroke()}
 const motif=profile.motif;
 for(let i=0;i<6;i++){
  const a=i*Math.PI/3+t,radius=r*1.25,px=Math.cos(a)*radius,py=Math.sin(a)*radius;
  ctx.save();ctx.translate(px,py);ctx.rotate(a);
  ctx.beginPath();
  if(profile.role==='support'){ctx.ellipse(0,0,r*.18,r*.07,.5,0,Math.PI*2);ctx.fill()}
  else if(['storm','wind'].includes(motif)){ctx.moveTo(-r*.15,-r*.12);ctx.lineTo(r*.04,0);ctx.lineTo(-r*.04,r*.04);ctx.lineTo(r*.17,r*.14);ctx.stroke()}
  else{ctx.moveTo(0,-r*.14);ctx.lineTo(r*.09,0);ctx.lineTo(0,r*.14);ctx.lineTo(-r*.09,0);ctx.closePath();ctx.stroke()}
  ctx.restore();
 }
 ctx.restore();
}
export function meleeSpritePose(progress, special = false) {
 const t = clamp(progress);
 const first = special ? 3 : 0;
 const value = t < .55 ? ease(t / .55) : 1 + ease((t - .55) / .45);
 const index = Math.min(1, Math.floor(value));
 return {from:first + index,to:first + index + 1,blend:value - index};
}
export function drawMeleeSprite(ctx, image, profile, {progress=0,special=false,size=256} = {}) {
 const pose = meleeSpritePose(progress, special);
 const cellWidth = image.width / 3, cellHeight = image.height / 2;
 ctx.clearRect(0, 0, size, size);
 function draw(index, opacity) {
  ctx.globalAlpha = opacity;
  ctx.drawImage(image, (index % 3) * cellWidth, Math.floor(index / 3) * cellHeight,
   cellWidth, cellHeight, 0, 0, size, size);
 }
 ctx.save();
 // Adjacent painted poses retain their distinct hand, elbow and torso shapes.
 if(pose.blend < 1)draw(pose.from, 1 - pose.blend);
 if(pose.blend > 0)draw(pose.to, pose.blend);
 ctx.globalAlpha = 1;
 ctx.globalCompositeOperation = 'destination-in';
 const mask = ctx.createLinearGradient(0, 0, size, 0);
 mask.addColorStop(0, 'rgba(0,0,0,.18)');
 mask.addColorStop(.28, 'rgba(0,0,0,.68)');
 mask.addColorStop(.58, '#000');
 mask.addColorStop(1, '#000');
 ctx.fillStyle = mask;ctx.fillRect(0, 0, size, size);
 ctx.restore();
}
export function preloadMeleeSprite(document, hero) {
 const profile = heroSpriteProfile(hero);
 if(!profile)return null;
 if(images.has(profile.src))return images.get(profile.src);
 const image = document.createElement('img');
 const entry = {image,ready:false};
 image.decoding = 'async';
 image.onload = () => {entry.ready = true};
 image.onerror = () => {entry.ready = false;if(images.get(profile.src)===entry)images.delete(profile.src)};
 image.src = profile.src;
 entry.ready = image.complete && image.naturalWidth > 0;
 if(images.size>=12)images.delete(images.keys().next().value);
 images.set(profile.src, entry);
 return entry;
}
// Each special uses the actual roster ability. Decoration never emits damage.
export function drawMeleeSpecial(ctx, profile, {x,y,age,size=100,direction=1}) {
 if(age < 0 || age > .5)return;
 const t = age / .5, fade = (1 - t) ** 1.5, r = size * (.18 + .25 * t);
 const effect = profile.effect, color = profile.color;
 ctx.save();ctx.translate(x,y);ctx.scale(direction,1);ctx.globalAlpha = fade;
 ctx.strokeStyle = color;ctx.fillStyle = color;ctx.lineWidth = Math.max(1.5,size*.018);
 ctx.lineCap = 'round';
 const stroke = points => {ctx.beginPath();points.forEach(([a,b],i)=>i?ctx.lineTo(a,b):ctx.moveTo(a,b));ctx.stroke()};
 if(profile.id === 'original:14') {
  for(const s of [-1,1])stroke([[0,0],[r*.32,s*r*.23],[r*.1,s*r*.42],[r*.7,s*r*.56],[r*.5,s*r*.74],[r,s*r]]);
 } else if(effect === 'shield') {
  ctx.beginPath();ctx.moveTo(-r*.7,-r);ctx.lineTo(r*.7,-r);ctx.lineTo(r*.8,0);
  ctx.quadraticCurveTo(r*.6,r*.8,0,r*1.18);ctx.quadraticCurveTo(-r*.6,r*.8,-r*.8,0);ctx.closePath();ctx.stroke();
  stroke([[-r*.33,0],[0,r*.3],[r*.4,-r*.4]]);
 } else if(effect === 'pierce') {
  stroke([[-r*1.3,0],[r*1.15,0]]);
  stroke([[r*.55,-r*.35],[r*1.15,0],[r*.55,r*.35]]);
  for(const side of [-1,1])stroke([[0,side*r*.7],[r*.26,side*r*.36],[r*.09,side*r*.12]]);
 } else if(effect === 'sunder') {
  for(const side of [-1,1])stroke([[0,-r*.8],[side*r*.25,-r*.35],[side*r*.05,0],[side*r*.45,r*.35],[side*r*.26,r*.78]]);
 } else if(effect === 'drain') {
  ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(-r*.2,-r*.8,-r*1.6,r*.5,-r*(1+2*t),0);ctx.stroke();
  for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(-r*(t*2+i*.23),Math.sin(i+t*4)*r*.15,2,0,Math.PI*2);ctx.fill()}
 } else if(effect === 'execute') {
  ctx.beginPath();ctx.arc(0,0,r,-1.3,1.3);ctx.stroke();stroke([[0,-r*.8],[0,r*.8]]);
 } else if(effect === 'weaken') {
  ctx.beginPath();ctx.ellipse(0,0,r*.8,r,0,0,Math.PI*2);ctx.stroke();
  for(const side of [-1,1])stroke([[side*r*.5,-r*.3],[side*r*.2,0],[side*r*.5,r*.3]]);
 } else if(effect === 'haste') {
  for(let i=0;i<3;i++)stroke([[-r*(1+i*.4),-r*.45],[-r*(.5+i*.4),0],[-r*(1+i*.4),r*.45]]);
 } else {
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7;stroke([[Math.cos(a)*r*.2,Math.sin(a)*r*.2],[Math.cos(a+.12)*r,Math.sin(a+.12)*r]])}
 }
 ctx.restore();
}
export function appendHeroSprite({document,effects,hero,from,to,width,arrival,charge,special=false,clock=()=>Date.now(),valid=()=>true}) {
 const profile = heroSpriteProfile(hero);
 if(!profile || !document.defaultView?.requestAnimationFrame || arrival <= 0)return false;
 const entry = preloadMeleeSprite(document,hero);
 const canvas = document.createElement('canvas'),ctx=canvas.getContext?.('2d');
 if(!ctx)return false;
 const node = document.createElement('span');
 node.className = 'hero-melee-sprite' + (special ? ' is-special' : '');
 node.setAttribute('aria-hidden','true');
 const size = Math.max(110,Math.min(220,width*2.7));
 node.style.width=size+'px';node.style.height=size+'px';node.append(canvas);
 canvas.width=canvas.height=384;
 const direction=to.x>=from.x?1:-1,started=clock(),fadeMs=special?430:260,total=arrival+fadeMs;
 const hand=special?profile.specialContact:profile.contact;
 const poseAt=profile.stationary?Math.max(120,charge??arrival*.4):arrival;
 let active=true,frame;
 const view=document.defaultView;
 effects.node(node,document.body,total+80);
 effects.own(()=>{active=false;if(frame!==undefined)view.cancelAnimationFrame(frame)},total+80);
 function draw(){
  if(!active||!valid())return;
  const elapsed=clock()-started,p=clamp(elapsed/poseAt),out=ease(p/.3),approach=ease((p-.22)/.78);
  const endX=to.x-direction*(hand[0]-.5)*size,endY=to.y-(hand[1]-.5)*size;
  const x=profile.stationary?from.x+direction*width*.6*out:from.x+(endX-from.x)*approach;
  const y=profile.stationary?from.y+width*.18*out:from.y+(endY-from.y)*approach;
  node.style.left=x+'px';node.style.top=y+'px';
  node.style.opacity=String(out*(special?.94:.84)*(1-ease((elapsed-arrival)/fadeMs)));
  node.style.transform='translate(-50%,-50%) scaleX('+direction+')';
  if(entry.ready){
   drawMeleeSprite(ctx,entry.image,profile,{progress:p,special,size:384});
   if(special&&profile.stationary)drawCasterChannel(ctx,profile,{x:hand[0]*384,y:hand[1]*384,progress:elapsed/poseAt,size:384});
   if(special&&!profile.stationary)drawMeleeSpecial(ctx,profile,{
    x:(profile.effect==='shield'?.43:hand[0])*384,
    y:(profile.effect==='shield'?.47:hand[1])*384,
    age:(elapsed-arrival)/1000,size:384*width/size
   });
  }
  if(elapsed<total)frame=view.requestAnimationFrame(draw);
 }
 draw();return true;
}


export function appendMeleeSprite(options){
 if(!meleeSpriteProfile(options.hero))return false;
 return appendHeroSprite(options);
}
