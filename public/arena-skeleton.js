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
 // Physical silhouette is modeled separately; rarity controls the overall root scale.
 if(/silver surfer/.test(name)){const board=add(new THREE.BoxGeometry(.65,.07,1.6),bright,0,-.38,.2);board.rotation.x=.08}
 // Distinct top-view silhouette: shoulder armor, helmet, torso insignia and equipment.
 const shoulderMat=new THREE.MeshStandardMaterial({color:accent,metalness:.65,roughness:.27});
 const visorMat=new THREE.MeshBasicMaterial({color:accent});
 const shoulderWidth=/hulk|juggernaut|doomsday|thing|bane|grundy|croc/.test(name)?.38:.26;
 for(const side of [-1,1]){
  const shoulder=add(new THREE.SphereGeometry(shoulderWidth,10,8),shoulderMat,side*.57,1.22,.02);
  shoulder.scale.set(1.15,.62,1.2);
 }
 const helmet=add(new THREE.SphereGeometry(.325,12,10),/iron man|batman|black panther|doctor fate|cyborg|deathstroke|magneto|ant-man/.test(name)?armor:dark,0,1.54,0);
 helmet.scale.set(1.05,.83,1.05);
 const crest=add(new THREE.BoxGeometry(.33,.055,.24),visorMat,0,1.81,.04);
 if(/batman|black panther|wolverine/.test(name)){
  for(const side of [-1,1]){const ear=add(new THREE.ConeGeometry(.11,.44,5),dark,side*.24,1.94,0);ear.rotation.z=side*.15}
 }
 if(/thor|loki|hela|wonder woman|magneto|doctor fate/.test(name)){
  for(const side of [-1,1]){const horn=add(new THREE.ConeGeometry(.09,.44,6),shoulderMat,side*.26,1.94,0);horn.rotation.z=side*.48}
 }
 if(/hulk|doomsday|juggernaut|the thing/.test(name)){
  const backPlate=add(new THREE.BoxGeometry(.85,.12,.55),dark,0,1.36,-.2);
  backPlate.rotation.x=-.12;
 }
 if(/doctor strange|scarlet witch|raven|doctor fate|zatanna/.test(name)){
  const rune=add(new THREE.TorusGeometry(.49,.035,6,24),visorMat,0,1.42,.15);
  rune.rotation.x=Math.PI/2;
 }
 if(/superman|shazam|black adam|sentry|vision|captain marvel|iron man/.test(name)){
  const emblem=add(new THREE.OctahedronGeometry(.18),visorMat,0,1.2,.35);
  emblem.rotation.y=Math.PI/4;
 }
 if(/green lantern|silver surfer|nova|starfire|storm/.test(name)){
  const energyOrb=add(new THREE.IcosahedronGeometry(.14,1),visorMat,.68,1.05,.28);
  energyOrb.name='energy-orb';
 }
 // Raised geometry remains readable from a high tactical camera.
 const plateMat=new THREE.MeshStandardMaterial({color:accent,metalness:.55,roughness:.32});
 const chest=add(new THREE.BoxGeometry(.57,.42,.19),plateMat,0,1.11,.31);
 chest.rotation.x=-.13;
 const belt=add(new THREE.BoxGeometry(.69,.13,.28),dark,0,.55,.14);
 for(const side of [-1,1]){
  const boot=add(new THREE.BoxGeometry(.29,.19,.46),dark,side*.23,-.07,.19);
  boot.rotation.y=side*.1;
  const glove=add(new THREE.SphereGeometry(.18,8,6),plateMat,side*.6,.48,.12);
  glove.scale.set(1,.8,1.15);
 }
 if(/iron man|war machine|cyborg|colossus|metallo/.test(name)){
  for(const side of [-1,1]){
   const thruster=add(new THREE.CylinderGeometry(.14,.18,.25,8),dark,side*.3,.8,-.4);
   thruster.rotation.x=Math.PI/2;
  }
 }
 if(/thor/.test(name)){
  const hammer=add(new THREE.BoxGeometry(.43,.31,.3),dark,.95,.39,.35);
  const grip=add(new THREE.CylinderGeometry(.045,.045,.65,7),shoulderMat,.95,.07,.35);
  grip.rotation.z=.18;
 }
 if(/doctor strange|scarlet witch|doctor fate|raven/.test(name)){
  const aura=add(new THREE.RingGeometry(.5,.58,32),new THREE.MeshBasicMaterial({color:accent,side:THREE.DoubleSide,transparent:true,opacity:.65}),0,.2,.02);
  aura.rotation.x=-Math.PI/2;
 }
 if(/the flash|quicksilver|sonic/.test(name)){
  for(const side of [-1,1]){
   const fin=add(new THREE.ConeGeometry(.12,.44,5),visorMat,side*.34,1.66,-.09);
   fin.rotation.z=side*1.15;
  }
 }
 const stance=style==='speed'?'runner':style==='magic'||style==='mind'||style==='cosmic'?'caster':style==='slash'?'blade':'brawler';
 const animate=(time,attack,hit,reduced)=>{
  const wave=reduced?0:Math.sin(time*2)*.065;
  spine.rotation.z=wave+hit*Math.sin(time*40)*.22;
  spine.rotation.x=attack*.22;
  limbs.leftArm.rotation.x=wave+attack*(stance==='caster'?-1.7:stance==='runner'?-1.3:-1.1);
  limbs.rightArm.rotation.x=-wave+attack*(stance==='blade'||stance==='brawler'?-2.2:-1.3);
  limbs.leftElbow.rotation.x=-.2-attack*.55;limbs.rightElbow.rotation.x=-.2-attack*.75;
  limbs.leftLeg.rotation.x=attack*(stance==='runner'?1.1:.55);limbs.rightLeg.rotation.x=-attack*(stance==='runner'?1.1:.55);
  limbs.leftKnee.rotation.x=Math.max(0,attack*.35);limbs.rightKnee.rotation.x=Math.max(0,attack*.4);
  root.rotation.z=hit*.15;
 };
 return {root,animate};
}
