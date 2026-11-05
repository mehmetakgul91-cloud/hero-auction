import {appendDetailedWeapon,DETAILED_WEAPON_GEOMETRY} from './hero-melee-weapon-art.js';
// Cosmetic weapon identity only. Never changes roles, range, damage or clocks.
const weapons=new Map([
 ['original:expansion-03','axe'],
 ...['original:02','original:06','original:07','original:expansion-04','original:expansion-10','original:expansion-22'].map(id=>[id,'sword']),
 ...['original:05','original:12','original:expansion-02','original:expansion-12','original:expansion-18','original:expansion-19','original:expansion-20','original:expansion-26','original:expansion-30','original:expansion-32'].map(id=>[id,'dagger']),
 ['original:01','hammer'],['original:expansion-29','hammer']
]);
export function targetMeleeWeapon(hero={},signature){
 if(!['blade','dagger','hammer'].includes(signature))return null;
 // Bow identities are excluded even if a caller passes a physical stat role.
 if(['original:08','original:13'].includes(hero.id)||hero.role==='archer')return null;
 return weapons.get(hero.id)||'slash';
}
export function targetSwingGeometry({left,top,width,height},direction,size,weapon='sword'){
 // Carry the leading edge across the portrait so the weapon remains readable
 // over armor at contact; the existing front-edge impact canvas stays intact.
 const x=left+width*(direction>0?.76:.24),y=top+height*.55;
 const [tipX,tipY]=DETAILED_WEAPON_GEOMETRY[weapon]?.contact.map(n=>n/100)|| (weapon==='hammer'?[.7024,.15]:[.5,.15]);
 const angle=targetWeaponProfile(weapon).angle*Math.PI/180,dx=tipX-.5,dy=tipY-.9;
 const contactX=.5+dx*Math.cos(angle)-dy*Math.sin(angle),contactY=.9+dx*Math.sin(angle)+dy*Math.cos(angle);
 return {left:x-size*(direction>0?contactX:1-contactX),top:y-size*contactY,contactX,contactY};
}
export function targetWeaponProfile(weapon){
 return ({sword:{scale:1.55,max:110,min:30,angle:76,windup:-20,recovery:290},axe:{scale:1.4,max:100,min:28,angle:80,windup:-24,recovery:280},dagger:{scale:1.25,max:90,min:26,angle:66,windup:-30,recovery:180}})[weapon]||{scale:2,max:180,min:95,angle:74,windup:-20,recovery:240};
}
export function appendTargetWeapon(document,node,weapon){
 node.className+=' weapon-'+weapon;
 const arm=document.createElement('i');arm.className='hero-target-weapon';
 if(!appendDetailedWeapon(document,arm,weapon))for(const part of ['head','grip','guard']){const piece=document.createElement('span');piece.className='hero-weapon-'+part;arm.append(piece)}
 node.append(arm);
 const hit=document.createElement('span');hit.className='hero-melee-hit';node.append(hit);
}
