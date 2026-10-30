import * as T from 'three';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
// Two original, texture-free full-body archetypes. Static details are merged by joint.
// All instances share immutable geometry and one vertex-colour material.
export function createModelKit(){
 const geometries=new Set(),material=new T.MeshStandardMaterial({vertexColors:true,roughness:.7,metalness:.3,flatShading:true});
 const colors={steel:0x728ca3,dark:0x172536,gold:0xceb171,blue:0x3988a5,purple:0x68529d,light:0xb3efff,skin:0xe4bb91};
 function part(items){const sources=items.map(([kind,size,pos,color,rotation])=>{
  let g=kind==='box'?new T.BoxGeometry(...size):kind==='cone'?new T.ConeGeometry(...size):kind==='orb'?new T.IcosahedronGeometry(...size):new T.CylinderGeometry(...size);
  if(g.index) {const old=g;g=g.toNonIndexed();old.dispose();}
  const c=new T.Color(color),array=new Float32Array(g.attributes.position.count*3);for(let i=0;i<array.length;i+=3){array[i]=c.r;array[i+1]=c.g;array[i+2]=c.b;}g.setAttribute('color',new T.BufferAttribute(array,3));
  if(rotation)g.rotateZ(rotation);g.translate(...pos);return g;
 });const g=mergeGeometries(sources,false);sources.forEach(s=>s.dispose());geometries.add(g);return g;}
 const {steel,dark,gold,blue,purple,light,skin}=colors;
 const parts={
  tankTorso:part([['cyl',[.36,.26,.58,6],[0,1.03,0],steel],['box',[.61,.1,.37],[0,.77,0],gold],['box',[.3,.48,.07],[0,1.06,.27],blue],['orb',[.085,0],[0,1.22,.32],light],['box',[.55,.65,.05],[0,.87,-.24],blue]]),
  mageTorso:part([['cyl',[.24,.45,.86,7],[0,.65,0],purple],['cyl',[.28,.22,.44,6],[0,1.14,0],purple],['cyl',[.43,.45,.07,7],[0,.26,0],gold],['box',[.44,.07,.31],[0,.91,0],gold],['orb',[.07,0],[0,1.22,.25],light],['box',[.5,.75,.055],[0,.88,-.23],dark]]),
  tankHead:part([['orb',[.22,1],[0,0,0],steel],['box',[.35,.105,.075],[0,0,.17],dark],['box',[.28,.025,.08],[0,.01,.21],light],['box',[.045,.26,.07],[0,.015,.24],gold],['cone',[.065,.29,5],[-.22,.19,0],gold,-.55],['cone',[.065,.29,5],[.22,.19,0],gold,.55]]),
  mageHead:part([['orb',[.23,1],[0,.02,-.035],purple],['box',[.25,.23,.07],[0,-.015,.17],dark],['box',[.21,.03,.08],[0,.025,.21],light],['cone',[.23,.48,7],[0,.4,-.045],purple],['cyl',[.29,.29,.035,9],[0,.17,0],gold]]),
  tankLeg:part([['cyl',[.1,.085,.42,6],[0,-.2,0],dark],['box',[.22,.24,.24],[0,-.35,0],steel],['box',[.24,.15,.35],[0,-.5,.075],dark]]),
  mageLeg:part([['cyl',[.085,.07,.42,6],[0,-.2,0],dark],['box',[.18,.13,.29],[0,-.5,.055],dark]]),
 };
 for(const type of ['tank','mage'])for(const side of [-1,1]){
  const items=[['orb',[type==='tank'?.22:.15,0],[0,0,0],type==='tank'?steel:gold],['cyl',[.085,.08,.35,6],[0,-.22,0],type==='tank'?blue:purple],['cyl',[.1,.075,.2,6],[0,-.44,0],type==='tank'?steel:purple],['orb',[.083,0],[0,-.57,0],type==='tank'?dark:skin]];
  if(type==='tank'&&side<0)items.push(['box',[.58,.69,.09],[-.07,-.38,.15],gold],['box',[.49,.58,.1],[-.07,-.38,.21],blue],['box',[.05,.44,.03],[-.07,-.38,.28],light]);
  if(type==='tank'&&side>0)items.push(['cyl',[.033,.033,.8,6],[0,-.23,.06],dark],['box',[.52,.26,.29],[0,.18,.06],steel],['box',[.07,.29,.3],[0,.18,.06],gold]);
  if(type==='mage'&&side>0)items.push(['cyl',[.03,.03,1.65,6],[.03,-.12,.08],gold],['orb',[.15,0],[.03,.77,.08],light],['cone',[.12,.3,5],[.03,.54,.08],gold]);
  parts[type+'Arm'+side]=part(items);
 }
 const makeMesh=(geometry,parent,pos)=>{const m=new T.Mesh(geometry,material);if(pos)m.position.set(...pos);parent.add(m);return m;};
 return {create(role){const type=role==='tank'?'tank':'mage',root=new T.Group(),body=new T.Group();root.add(body);
  makeMesh(parts[type+'Torso'],body);const head=makeMesh(parts[type+'Head'],body,[0,1.55,0]);
  const arms=[-1,1].map(sign=>makeMesh(parts[type+'Arm'+sign],body,[sign*(type==='tank'?.38:.3),1.3,0]));
  const legs=[-1,1].map(sign=>makeMesh(parts[type+'Leg'],body,[sign*.16,.66,0]));
  return {root,body,head,arms,legs,type};},dispose(){geometries.forEach(g=>g.dispose());material.dispose();},geometries,material};
}
