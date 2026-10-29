import prototypeParticles from './hero-contact-particles.js';
// Approved isolated GIF v2, seed 84: ballistic warm sparks, not weapon glyphs.
// All geometry uses the prototype's 190 x 232 portrait coordinate system.
export const CONTACT_STYLE=Object.freeze({portraitWidth:190,portraitHeight:232,coreRadius:23,drag:3,gravity:42,maxLife:1.12,normalCount:32,specialCount:44,maxCount:68});
export function heroImpactArtwork(signature,special=false,width=54){
 if(['heal','shield'].includes(signature))return null;
 const count=Math.min(68,Math.round((special?44:32)*Math.sqrt(Math.max(1,width)/54)));
 return {particles:prototypeParticles.filter((_,i)=>Math.floor((i+1)*count/68)>Math.floor(i*count/68))};
}
// Pure sampled frame, also used by deterministic visual QA and the native port.
export function contactFrame(art,seconds){
 return {core:{radius:23+seconds*12,alpha:Math.min(1,seconds/.035)*Math.exp(-seconds/.21)},sparks:art.particles.flatMap(p=>{
  const age=seconds-p.delay;if(age<0||age>=p.life)return [];
  const travel=p.speed*(1-Math.exp(-age*3))/3;
  return [{x:Math.cos(p.angle)*travel,y:Math.sin(p.angle)*travel+42*age*age,angle:p.angle,size:p.size,alpha:Math.min(1,age/.025)*(1-age/p.life)**.7,tail:Math.min(9,3+p.speed*.018)*Math.max(.25,1-age/p.life)}];
 })};
}
export function drawContactFrame(ctx,art,seconds,{width=54,height=54,direction=1,reducedMotion=false}={}){
 ctx.clearRect(0,0,width,height);ctx.save();
 const scale=width/190,originX=direction>0?width*.30:width*.70,originY=height*.595;
 // The reference masks the face and HP strip; retain that protection at any size.
 ctx.beginPath();ctx.rect(0,height*.345,width,height*.65);ctx.clip();
 ctx.translate(originX,originY);ctx.scale(scale*direction,scale);
 if(reducedMotion){ctx.fillStyle='rgba(255,234,186,.55)';ctx.fillRect(-4,-2,8,4);ctx.restore();return;}
 const frame=contactFrame(art,seconds),core=frame.core;
 const gradient=ctx.createRadialGradient(0,0,0,0,0,core.radius+12);
 gradient.addColorStop(0,`rgba(255,234,186,${core.alpha*.96})`);gradient.addColorStop(.6,`rgba(255,234,186,${core.alpha*.55})`);gradient.addColorStop(1,'rgba(255,234,186,0)');
 ctx.fillStyle=gradient;ctx.fillRect(-core.radius-12,-core.radius-12,(core.radius+12)*2,(core.radius+12)*2);
 for(const p of frame.sparks){
  ctx.globalAlpha=p.alpha;ctx.shadowColor='rgb(255,151,57)';ctx.shadowBlur=4*scale;ctx.strokeStyle='rgb(255,226,171)';ctx.lineWidth=Math.max(1,p.size);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x-Math.cos(p.angle)*p.tail,p.y-Math.sin(p.angle)*p.tail);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='rgb(255,250,229)';ctx.beginPath();ctx.ellipse(p.x,p.y,p.size*.65,p.size*.5,0,0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}
export function appendHeroImpactArt(document,node,signature,special,{width=54,height=54}={}){
 const art=heroImpactArtwork(signature,special,width);if(!art)return null;
 const canvas=document.createElement('canvas');canvas.className='hero-contact-art';canvas.setAttribute('aria-hidden','true');
 const dpr=Math.min(2,document.defaultView?.devicePixelRatio||1);canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';node.append(canvas);
 const ctx=canvas.getContext?.('2d');ctx?.scale(dpr,dpr);
 return {draw:(seconds,options)=>{if(ctx)drawContactFrame(ctx,art,seconds,{width,height,...options})},art};
}
