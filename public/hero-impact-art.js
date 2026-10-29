// Contact artwork, not an icon laid over the victim. Open, unfilled strokes
// briefly sweep through the contact point; small fragments carry the visible tail.
// Coordinates stay in the portrait envelope. No random particles or extra hits.
export function heroImpactArtwork(signature,special=false){
 const patterns={
  blade:{color:'#ffd199',strokes:['M18 69 Q35 32 80 25','M25 73 Q51 39 77 37'],origin:[49,45]},
  dagger:{color:'#e4c9ff',strokes:['M24 68 Q38 40 73 23','M69 67 Q53 51 35 44'],origin:[49,46]},
  hammer:{color:'#ffd486',strokes:['M19 59 Q32 36 49 44 Q65 33 82 57','M32 62 Q48 51 68 61'],origin:[49,49]},
  arrow:{color:'#d7f3ac',strokes:['M18 49 L63 49','M53 43 L67 49 L55 56'],origin:[62,49]},
  magic:{color:'#d9b6ff',strokes:['M20 48 Q23 22 47 28','M61 27 Q84 35 76 58','M72 70 Q50 83 31 66'],origin:[50,48]},
  lightning:{color:'#b8f1ff',strokes:['M25 22 L43 36 L38 43 L63 65','M41 39 L59 36 L72 48'],origin:[47,43]},
  light:{color:'#c3f4ff',strokes:['M23 54 Q38 35 52 46 Q66 57 78 39','M31 65 Q50 69 67 56'],origin:[50,49]}
 };
 const pattern=patterns[signature];if(!pattern)return null;
 const angles=[-150,-94,-38,18,74,134];
 const count=special?6:4;
 const fragments=angles.slice(0,count).map((degrees,index)=>{
  const angle=degrees*Math.PI/180,length=(special?22:16)+(index%2)*5;
  const [x,y]=pattern.origin;
  return {x,y,dx:Math.cos(angle)*length,dy:Math.sin(angle)*length,angle:degrees,length:index%2?7:11};
 });
 return {...pattern,strokes:special?pattern.strokes:pattern.strokes.slice(0,signature==='magic'?2:1),fragments};
}
export function appendHeroImpactArt(document,node,signature,special){
 const art=heroImpactArtwork(signature,special);if(!art)return false;
 const make=tag=>document.createElementNS?document.createElementNS('http://www.w3.org/2000/svg',tag):document.createElement(tag);
 const svg=make('svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.setAttribute('class','hero-contact-art');
 node.style.setProperty('--contact-color',art.color);
 for(const [index,d] of art.strokes.entries()){
  for(const [layer,width] of [['shade',special?6:5],['edge',special?4:3],['core',1.25]]){
   const path=make('path');path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('pathLength','1');path.setAttribute('stroke-width',width);path.setAttribute('stroke-linecap','round');path.setAttribute('class','hero-contact-stroke '+layer);path.style.setProperty('--stroke-index',index);path.style.setProperty('--stroke-lag',(index*70)+'ms');svg.append(path);
  }
 }
 for(const fragment of art.fragments){
  const group=make('g');group.setAttribute('class','hero-contact-fragment');
  group.style.setProperty('--fragment-dx',fragment.dx+'px');group.style.setProperty('--fragment-dy',fragment.dy+'px');
  const path=make('path');path.setAttribute('d',`M${fragment.x} ${fragment.y} l${fragment.length} 0`);path.setAttribute('fill','none');path.setAttribute('stroke-width',special?1.8:1.4);path.setAttribute('stroke-linecap','round');path.setAttribute('transform',`rotate(${fragment.angle} ${fragment.x} ${fragment.y})`);group.append(path);svg.append(group);
 }
 node.append(svg);return true;
}
