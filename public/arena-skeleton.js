// Lightweight procedural skeletal fighter. Real THREE.SkinnedMesh with bone weights.
// These are stylized humanoid rigs, not licensed character likenesses or imported GLB models.
export function makeRig(THREE,profile={}){
 const root=new THREE.Group(),style=profile.style||'charge';
 const accent=new THREE.Color(profile.accent||'#7feaff');
 const armor=new THREE.MeshStandardMaterial({color:accent,metalness:.36,roughness:.48});
 const dark=new THREE.MeshStandardMaterial({color:0x16223d,metalness:.3,roughness:.65});
 const skin=new THREE.MeshStandardMaterial({color:0xd4a889,roughness:.82});
 const geo=new THREE.CylinderGeometry(.44,.32,1.25,8,5);
 geo.translate(0,.9,0);
 const p=geo.attributes.position,indices=[],weights=[];
 for(let i=0;i<p.count;i++){const y=p.getY(i);const t=THREE.MathUtils.clamp((y-.55)/.85,0,1);indices.push(0,1,0,0);weights.push(1-t,t,0,0)}
 geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
 geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
 const hip=new THREE.Bone();hip.name='hips';hip.position.y=.45;
 const spine=new THREE.Bone();spine.name='spine';spine.position.y=.85;hip.add(spine);
 const body=new THREE.SkinnedMesh(geo,armor);body.add(hip);body.bind(new THREE.Skeleton([hip,spine]));root.add(body);
 const part=(parent,material,radius,length,y)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius*.83,radius,length,7),material);mesh.position.y=y;parent.add(mesh);return mesh};
 const head=new THREE.Mesh(new THREE.SphereGeometry(.3,10,8),skin);head.position.y=1.48;root.add(head);
 const limbs={};
 for(const side of [-1,1]){
  const arm=new THREE.Group();arm.position.set(side*.53,1.24,0);root.add(arm);part(arm,armor,.17,.57,-.28);
  const elbow=new THREE.Group();elbow.position.y=-.55;arm.add(elbow);part(elbow,dark,.135,.52,-.25);
  const leg=new THREE.Group();leg.position.set(side*.23,.46,0);root.add(leg);part(leg,dark,.21,.55,-.28);
  const knee=new THREE.Group();knee.position.y=-.53;leg.add(knee);part(knee,armor,.16,.48,-.23);
  limbs[side<0?'leftArm':'rightArm']=arm;limbs[side<0?'leftElbow':'rightElbow']=elbow;
  limbs[side<0?'leftLeg':'rightLeg']=leg;limbs[side<0?'leftKnee':'rightKnee']=knee;
 }
 if(['magic','cosmic','mind','lightning','beam'].includes(style)){
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.42,.055,6,18),new THREE.MeshBasicMaterial({color:accent}));
  halo.position.y=1.95;halo.rotation.x=Math.PI/2;root.add(halo);
 }
 if(style==='shield'){
  const shield=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,.075,12),armor);
  shield.rotation.x=Math.PI/2;shield.position.set(-.85,.7,.32);root.add(shield);
 }
 // Low-poly identity cues are attached to the rig, not separate textures.
 const id=String(profile.id||'').toLowerCase();
 const name=String(profile.name||'').toLowerCase();
 const add=(geometry,material,x,y,z,parent=root)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m};
 const bright=new THREE.MeshBasicMaterial({color:accent});
 const capeNames=/superman|thor|doctor strange|shazam|black adam|magneto|raven|hela|sentry|doctor fate|vision/;
 if(capeNames.test(name)){const cape=add(new THREE.PlaneGeometry(.95,1.15),new THREE.MeshStandardMaterial({color:accent,side:THREE.DoubleSide}),0,.85,-.31);cape.rotation.x=-.15}
 if(/batman|black panther|wolverine|nightwing|deathstroke|deadpool|spider-man/.test(name)){
  add(new THREE.BoxGeometry(.6,.16,.08),bright,0,1.5,.22);
 }
 if(/iron man|cyborg|metallo|colossus|vision/.test(name)){
  add(new THREE.BoxGeometry(.43,.35,.13),bright,0,.96,.37);
 }
 if(/thor|shazam|black adam|storm/.test(name)){
  const bolt=add(new THREE.ConeGeometry(.13,.7,5),bright,.85,.55,.3);bolt.rotation.z=.5;
 }
 if(/captain america|wonder woman|green lantern/.test(name)){
  const disc=add(new THREE.CylinderGeometry(.38,.38,.065,12),bright,-.9,.78,.2);disc.rotation.x=Math.PI/2;
 }
 if(/wolverine|deadpool|elektra|hela|deathstroke/.test(name)){
  for(const side of [-1,1]){const blade=add(new THREE.ConeGeometry(.07,.62,5),bright,side*.8,.22,.25);blade.rotation.z=side*.25}
 }
 if(/aquaman|namor/.test(name)){
  const spear=add(new THREE.CylinderGeometry(.045,.045,1.8,6),bright,.85,.6,.15);spear.rotation.z=.16;
 }
 if(/spider-man/.test(name)){
  for(const side of [-1,1])add(new THREE.SphereGeometry(.09,7,5),bright,side*.14,1.52,.26);
 }
 if(/hulk|juggernaut|doomsday|the thing|bane|solomon grundy/.test(name))root.scale.set(1.32,1.17,1.32);
 if(/quicksilver|the flash|nightwing/.test(name))root.scale.set(.85,1.05,.85);
 if(/silver surfer/.test(name)){const board=add(new THREE.BoxGeometry(.65,.07,1.6),bright,0,-.38,.2);board.rotation.x=.08}
 const animate=(time,attack,hit,reduced)=>{
  const wave=reduced?0:Math.sin(time*2)*.065;
  spine.rotation.z=wave+hit*Math.sin(time*40)*.22;
  spine.rotation.x=attack*.22;
  limbs.leftArm.rotation.x=wave+attack*(style==='magic'||style==='beam'?-1.5:-1.1);
  limbs.rightArm.rotation.x=-wave+attack*(style==='slash'||style==='charge'?-2.2:-1.3);
  limbs.leftElbow.rotation.x=-.2-attack*.55;limbs.rightElbow.rotation.x=-.2-attack*.75;
  limbs.leftLeg.rotation.x=attack*.55;limbs.rightLeg.rotation.x=-attack*.55;
  limbs.leftKnee.rotation.x=Math.max(0,attack*.35);limbs.rightKnee.rotation.x=Math.max(0,attack*.4);
  root.rotation.z=hit*.15;
 };
 return {root,animate};
}
