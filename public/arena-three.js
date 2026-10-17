import {makeRig} from '/arena-skeleton.js?v=1';
// Visual-only Three.js renderer. All outcomes and HP come from server replay events.
const stage=document.getElementById('arena-3d-stage');
const showError=error=>{
  console.error('[Hero Auction 3D]',error);
  const message=document.getElementById('message');
  if(message)message.textContent='3D arena yüklenemedi: '+(error?.message||'Bilinmeyen hata')+' · Ayrıntılar tarayıcı konsolunda.';
};
const fallback=()=>import('/arena-3d.js?v=1');
if(stage){
  try{
    const THREE=await import('https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js');
    if(!stage.clientWidth||!stage.clientHeight)throw Error('Arena boyutları sıfır');
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.setSize(stage.clientWidth,stage.clientHeight,false);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
    renderer.domElement.className='three-arena-canvas';
    stage.prepend(renderer.domElement);
    const scene=new THREE.Scene();
    scene.background=new THREE.Color(0x050b1b);scene.fog=new THREE.FogExp2(0x050b1b,0.018);
    const mobile=window.matchMedia('(max-width: 700px)').matches;
    const heroShowcase=new URLSearchParams(location.search).get('showcase')==='1';
    const camera=new THREE.OrthographicCamera(-10,10,7,-7,.1,100);
    const fitCamera=()=>{
      const aspect=Math.max(.5,stage.clientWidth/Math.max(1,stage.clientHeight));
      const halfHeight=Math.max(mobile?9.8:8.2,7.6/aspect);
      camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;
      camera.top=halfHeight;camera.bottom=-halfHeight;
      camera.updateProjectionMatrix();
    };
    fitCamera();
    // Tactical bird's-eye view: the 3D models remain visible, not flat sprites.
    camera.position.set(0,19,11);camera.lookAt(0,.3,0);
    scene.add(new THREE.HemisphereLight(0xa8dfff,0x201025,2.5));
    const keyLight=new THREE.DirectionalLight(0xffffff,2.5);keyLight.position.set(0,12,7);keyLight.castShadow=true;keyLight.shadow.mapSize.set(1024,1024);keyLight.shadow.camera.left=-12;keyLight.shadow.camera.right=12;keyLight.shadow.camera.top=12;keyLight.shadow.camera.bottom=-12;scene.add(keyLight);
    const light=new THREE.PointLight(0x42ddff,45,24);light.position.set(-6,7,2);scene.add(light);
    const red=new THREE.PointLight(0xff43b9,45,24);red.position.set(6,7,2);scene.add(red);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(32,22),new THREE.MeshStandardMaterial({color:0x101a33,metalness:.7,roughness:.23}));
    floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
    // Magic Chess-inspired checkerboard with raised beveled tiles and distinct team territories.
    const tileGeometry=new THREE.BoxGeometry(1.8,.16,1.8);
    const tileMaterials=[0x1d3152,0x263b61,0x253051,0x35274f].map(color=>new THREE.MeshStandardMaterial({color,metalness:.32,roughness:.65}));
    for(let x=0;x<8;x++)for(let z=0;z<6;z++){
      const tile=new THREE.Mesh(tileGeometry,tileMaterials[(x+z)%2+(x>=4?2:0)]);
      tile.position.set((x-3.5)*1.85,-.02,(z-2.5)*1.85);
      tile.receiveShadow=true;scene.add(tile);
    }
    const ring=new THREE.Mesh(new THREE.TorusGeometry(7,.045,6,96),new THREE.MeshBasicMaterial({color:0x5e6ef5}));
    ring.rotation.x=Math.PI/2;ring.position.y=.06;scene.add(ring);
    const platform=new THREE.Mesh(new THREE.CylinderGeometry(8.4,8.8,.35,64),new THREE.MeshStandardMaterial({color:0x121b38,metalness:.72,roughness:.3}));
    platform.position.y=-.22;scene.add(platform);
    const platformRim=new THREE.Mesh(new THREE.TorusGeometry(8.25,.11,8,80),new THREE.MeshBasicMaterial({color:0x38cfff}));
    platformRim.rotation.x=Math.PI/2;platformRim.position.y=-.02;scene.add(platformRim);
    const centerSigil=new THREE.Mesh(new THREE.RingGeometry(1.65,1.75,48),new THREE.MeshBasicMaterial({color:0xb454ff,side:THREE.DoubleSide,transparent:true,opacity:.72}));
    centerSigil.rotation.x=-Math.PI/2;centerSigil.position.y=.05;scene.add(centerSigil);
    const pillars=[];
    for(const x of [-8.1,8.1])for(const z of [-5.1,5.1]){
      const pillar=new THREE.Mesh(new THREE.BoxGeometry(.28,3.6,.28),new THREE.MeshStandardMaterial({color:0x27365c,emissive:x<0?0x004d77:0x6a003f,emissiveIntensity:.9}));
      pillar.position.set(x,1.6,z);scene.add(pillar);pillars.push(pillar);
      const beacon=new THREE.PointLight(x<0?0x25caff:0xff4ac3,12,8);beacon.position.set(x,3.7,z);scene.add(beacon);
    }
    const teamPads=[-4.4,4.4].map((x,i)=>{
      const pad=new THREE.Mesh(new THREE.RingGeometry(2.4,2.55,48),new THREE.MeshBasicMaterial({color:i?0xff4ca7:0x35cfff,side:THREE.DoubleSide,transparent:true,opacity:.85}));
      pad.rotation.x=-Math.PI/2;pad.position.set(x,.07,0);scene.add(pad);return pad;
    });
    const profiles=await fetch('/arena-hero-profiles.json').then(r=>{if(!r.ok)throw Error('Hero visual profiles unavailable');return r.json()}).then(v=>v.characters);
    const fighters=new Map();
    // GLB asset loader: assets are optional until individually licensed and uploaded.
    const modelManifest=await fetch('/arena-models.json').then(r=>r.ok?r.json():{}).catch(()=>({}));
    const modelDefinitions=modelManifest.heroes||{};
    let loaderPromise;
    const loadHeroModel=async(mesh,unit)=>{
      const id=String(unit.id||'').toLowerCase(),entry=modelDefinitions[id];
      if(!entry?.url||!entry.url.startsWith('/models/')||!entry.url.endsWith('.glb')||entry.url.includes('..'))return;
      const requestId=Symbol('hero-model');mesh.userData.modelRequest=requestId;
      try{
        loaderPromise??=import('https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/loaders/GLTFLoader.js').then(m=>new m.GLTFLoader());
        const loader=await loaderPromise,gltf=await loader.loadAsync(entry.url);
        if(mesh.userData.modelRequest!==requestId||!mesh.parent)return;
        const model=gltf.scene,box=new THREE.Box3().setFromObject(model);
        const height=box.max.y-box.min.y;if(height<=0)return;
        model.scale.setScalar(2.05/height);
        const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
        model.position.set(-center.x,-bounds.min.y,-center.z);
        model.traverse(n=>{if(n.isMesh)n.castShadow=true});
        for(const child of mesh.userData.proceduralChildren||[])child.visible=false;
        mesh.add(model);mesh.userData.importedModel=model;
        mesh.userData.mixer=new THREE.AnimationMixer(model);
        mesh.userData.clips=Object.fromEntries(gltf.animations.map(clip=>[clip.name.toLowerCase(),clip]));
        mesh.userData.currentClip='';
        const idle=mesh.userData.clips.idle||gltf.animations[0];
        if(idle){mesh.userData.mixer.clipAction(idle).play();mesh.userData.currentClip=idle.name.toLowerCase()}
      }catch(error){console.warn('Optional 3D model unavailable:',id,error)}
    };

    const cardScale=unit=>{
      const tier=String(unit.rarity||'').toLowerCase();
      if(tier==='legendary')return 1.65;
      if(tier==='rare')return 1.35;
      if(tier==='advanced')return 1.12;
      if(tier==='common')return .94;
      const power=Number(unit.power);
      return Number.isFinite(power)?power>=90?1.65:power>=70?1.35:power>=50?1.12:.94:1.12;
    };
    let teams=[],effects=[],last=performance.now(),elapsed=0,active=true,animationId=0;
    const make=(unit,side,i)=>{
      const key=side+':'+i;
      const rig=makeRig(THREE,{...(profiles[String(unit.id||'').toLowerCase()]||{}),id:unit.id,name:unit.name});
      const mesh=rig.root;
      // Respect the actual formation chosen in preparation. Front units face the centre.
      const lane=unit.lane==='front'?'front':'back';
      const laneIndex=teams[side].slice(0,i).filter(u=>(u.lane==='front'?'front':'back')===lane).length;
      const laneCount=teams[side].filter(u=>(u.lane==='front'?'front':'back')===lane).length;
      const baseX=(side?1:-1)*(lane==='front'?2.15:5.25);
      const baseZ=(laneIndex-(laneCount-1)/2)*1.85;
      mesh.position.set(baseX,0,baseZ);
      mesh.traverse(node=>{if(node.isMesh)node.castShadow=true});
      mesh.scale.setScalar(cardScale(unit));
      if(/hulk|juggernaut|doomsday|the thing|bane|solomon grundy|killer croc/i.test(String(unit.name)))mesh.scale.x*=1.22;
      mesh.userData={key,baseX,baseZ,side,i,phase:i*.9,unit,until:0,kind:'',rig,style:profiles[String(unit.id||'').toLowerCase()]?.style||'charge'};
      mesh.userData.proceduralChildren=[...mesh.children];
      scene.add(mesh);fighters.set(key,mesh);
      const hpBg=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.11),new THREE.MeshBasicMaterial({color:0x47172a,side:THREE.DoubleSide}));
      hpBg.position.y=2.25;mesh.add(hpBg);
      const hpFill=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.11),new THREE.MeshBasicMaterial({color:0x4affb5,side:THREE.DoubleSide}));
      hpFill.position.set(0,2.25,.005);mesh.add(hpFill);mesh.userData.hpFill=hpFill;
      const halo=new THREE.Mesh(new THREE.RingGeometry(.8,.91,32),new THREE.MeshBasicMaterial({color:0x49cbff,side:THREE.DoubleSide,transparent:true,opacity:.8}));halo.rotation.x=-Math.PI/2;halo.position.y=.08;mesh.add(halo);mesh.userData.halo=halo;
      const selection=new THREE.Mesh(new THREE.RingGeometry(1.02,1.09,40),new THREE.MeshBasicMaterial({color:side?0xff5eab:0x55dcff,side:THREE.DoubleSide,transparent:true,opacity:.45}));selection.rotation.x=-Math.PI/2;selection.position.y=.085;mesh.add(selection);mesh.userData.selection=selection;
      void loadHeroModel(mesh,unit);
    };
    const sync=next=>{
      teams=next||[];
      const valid=new Set();
      teams.forEach((team,side)=>team.forEach((unit,i)=>{
        const key=side+':'+i;valid.add(key);
        if(fighters.has(key)&&fighters.get(key).userData.unit.id!==unit.id){
          const old=fighters.get(key);scene.remove(old);old.traverse(node=>{node.geometry?.dispose();if(node.material)(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>m.dispose())});fighters.delete(key);
        }
        if(!fighters.has(key))make(unit,side,i);
        const mesh=fighters.get(key);mesh.userData.unit=unit;mesh.scale.setScalar(cardScale(unit));
        if(/hulk|juggernaut|doomsday|the thing|bane|solomon grundy|killer croc/i.test(String(unit.name)))mesh.scale.x*=1.22;
        mesh.userData.style=profiles[String(unit.id||'').toLowerCase()]?.style||'charge';
        const ratio=Math.max(0,Math.min(1,unit.hp/Math.max(1,unit.maxHp)));
        mesh.userData.hpFill.scale.x=ratio;
        const tier=String(unit.rarity||'').toLowerCase();mesh.userData.halo.material.color.setHex(tier==='legendary'?0xffd36c:tier==='rare'?0xb877ff:tier==='advanced'?0x49cbff:0x8ca2b8);mesh.userData.hpFill.position.x=-(1-ratio)*.9;
        mesh.visible=unit.hp>0;
      }));
      for(const [key,mesh] of fighters)if(!valid.has(key)){scene.remove(mesh);mesh.traverse(node=>{node.geometry?.dispose();if(node.material){(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>m.dispose())}});fighters.delete(key)}
    };
    const impactBursts=[];
    const specialEffects=[];
    const spawnAbility=(actor,style,color)=>{
      if(!actor)return;
      const origin=actor.position.clone();origin.y=.14;
      const ring=new THREE.Mesh(new THREE.RingGeometry(.5,.67,40),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));
      ring.rotation.x=-Math.PI/2;ring.position.copy(origin);scene.add(ring);
      specialEffects.push({mesh:ring,born:elapsed,style});
    };
    const spawnImpact=(position,color)=>{
      const group=new THREE.Group();group.position.copy(position);group.position.y+=.9;
      const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false});
      for(let j=0;j<8;j++){
        const spark=new THREE.Mesh(new THREE.OctahedronGeometry(.075,0),material.clone());
        const angle=j*Math.PI/4;spark.userData.velocity=new THREE.Vector3(Math.cos(angle)*2.5,.9+Math.sin(j*2)*.3,Math.sin(angle)*2.5);
        group.add(spark);
      }
      scene.add(group);impactBursts.push({group,born:elapsed});
      const shockwave=new THREE.Mesh(new THREE.RingGeometry(.18,.32,24),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));shockwave.rotation.x=-Math.PI/2;shockwave.position.copy(position);shockwave.position.y=.12;scene.add(shockwave);effects.push({mesh:shockwave,expires:elapsed+.45,shockwave:true});
    };
    const visualEffect=(actor,target)=>{
      const profile=profiles[String(actor.userData.unit.id||'').toLowerCase()]||{style:'charge',accent:'#65ddff'};
      const style=profile.style,color=new THREE.Color(profile.accent);
      const from=actor.position.clone(),to=target.position.clone();from.y+=1;to.y+=1;const direction=to.clone().sub(from);

      const segments=style==='lightning'?7:style==='web'?5:style==='speed'?4:1;
      const radius=style==='beam'?.12:style==='cosmic'?.25:.07;
      const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,depthWrite:false});
      if(style==='magic'||style==='shield'||style==='mind'){
        const ring=new THREE.Mesh(new THREE.TorusGeometry(style==='shield'?1.1:.8,.065,8,32),material);
        ring.position.copy(style==='shield'?actor.position:target.position);ring.rotation.y=Math.PI/2;
        scene.add(ring);effects.push({mesh:ring,expires:elapsed+.55});
      }
      if(style==='charge'||style==='slash'){
        const shock=new THREE.Mesh(new THREE.TorusGeometry(.8,.13,6,24),material.clone());
        shock.position.copy(to);scene.add(shock);effects.push({mesh:shock,expires:elapsed+.4});
      }else{
        for(let i=0;i<segments;i++){
          const start=from.clone().lerp(to,i/segments),end=from.clone().lerp(to,(i+1)/segments);
          if(style==='lightning'||style==='web'||style==='speed'){
            const jitter=(style==='lightning'?.42:.19);
            if(i>0)start.y+=(i%2?1:-1)*jitter;
            if(i<segments-1)end.y+=((i+1)%2?1:-1)*jitter;
          }
          const vector=end.clone().sub(start);
          const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius*.65,radius,vector.length(),6),material.clone());
          mesh.position.copy(start).add(end).multiplyScalar(.5);
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vector.normalize());
          scene.add(mesh);effects.push({mesh,expires:elapsed+.45});
        }
      }
      if(style==='water'||style==='cosmic'){
        const wave=new THREE.Mesh(new THREE.TorusGeometry(1.1,.12,8,32),material.clone());
        wave.rotation.x=Math.PI/2;wave.position.copy(to);scene.add(wave);effects.push({mesh:wave,expires:elapsed+.55});
      }
    };
    const spark=(from,to,heal=false)=>{
      const dir=to.clone().sub(from);const geo=new THREE.CylinderGeometry(.07,.15,dir.length(),7);
      const mat=new THREE.MeshBasicMaterial({color:heal?0x6cffae:0x65ddff,transparent:true,opacity:1});
      const beam=new THREE.Mesh(geo,mat);beam.position.copy(from).add(to).multiplyScalar(.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
      scene.add(beam);effects.push({mesh:beam,expires:elapsed+.4});
    };
    const floatingNumbers=[];
    const floatDamage=(target,event)=>{
      const value=Number(event.value||0),absorbed=Number(event.absorbed||0);
      const action=String(event.action||'');
      const healing=/heal/i.test(action),shield=/shield/i.test(action),critical=Boolean(event.critical);
      const labels=[];
      if(healing&&value>0)labels.push({text:'+'+Math.round(value)+' CAN',color:'#65f5a5'});
      else if(shield&&value>0)labels.push({text:'+'+Math.round(value)+' KALKAN',color:'#5ecaff'});
      else {
        if(value>0)labels.push({text:'-'+Math.round(value)+(critical?' KRİTİK':event.damageType==='special'?' ÖZEL':event.damageType==='splash'?' ALAN':''),color:critical?'#ff637e':event.damageType==='special'?'#c69aff':'#ffe277'});
        if(absorbed>0)labels.push({text:Math.round(absorbed)+' ENGELLENDİ',color:'#5ecaff'});
      }
      labels.forEach(({text,color},i)=>{
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=112;
        const ctx=canvas.getContext('2d');if(!ctx)return;
        ctx.font='bold 42px sans-serif';ctx.textAlign='center';ctx.lineWidth=7;ctx.strokeStyle='#100c29';ctx.strokeText(text,256,73);ctx.fillStyle=color;ctx.fillText(text,256,73);
        const texture=new THREE.CanvasTexture(canvas);
        const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
        sprite.position.copy(target.position);sprite.position.y+=2.7+i*.65;sprite.scale.set(3.3,.72,1);
        scene.add(sprite);floatingNumbers.push({sprite,born:elapsed});
      });
    };
    const move=e=>{
      const event=e.detail.event;sync(e.detail.teams);
      const actor=[...fighters.values()].find(m=>m.userData.unit.id===event.actor||m.userData.unit.name===event.actor);
      const target=[...fighters.values()].find(m=>m.userData.unit.id===event.target||m.userData.unit.name===event.target);
      if(actor){actor.userData.until=elapsed+.7;actor.userData.kind='attack';actor.userData.attackStart=elapsed;actor.userData.targetPosition=target?target.position.clone():null}
      if(target){target.userData.until=elapsed+.5;target.userData.kind='hit';target.userData.hitStart=elapsed}
      if(actor&&target){
        const profile=profiles[String(actor.userData.unit.id||'').toLowerCase()]||{};
        visualEffect(actor,target);spawnImpact(target.position,profile.accent||'#65ddff');floatDamage(target,event);
        if(['magic','cosmic','lightning','mind','shield'].includes(profile.style))spawnAbility(actor,profile.style,profile.accent||'#65ddff');
      }
    };
    window.addEventListener('heroarena:ready',e=>sync(e.detail.teams));
    window.addEventListener('heroarena:move',move);
    if(Array.isArray(window.heroArenaTeams))sync(window.heroArenaTeams);
    if(heroShowcase){sync([[{id:'marvel:hulk',name:'Hulk',hp:100,maxHp:100,rarity:'legendary'},{id:'marvel:iron man',name:'Iron Man',hp:100,maxHp:100,rarity:'rare'},{id:'marvel:doctor strange',name:'Doctor Strange',hp:100,maxHp:100,rarity:'advanced'}],[]]);}
    const resize=new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;if(w&&h){fitCamera();renderer.setSize(w,h,false)}});resize.observe(stage);
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const maxFps=mobile?30:60;let lastDraw=0;
    const stageVisible={value:true};
    const observer=new IntersectionObserver(entries=>{stageVisible.value=entries.some(e=>e.isIntersecting)},{threshold:.01});observer.observe(stage);
    const cameraTarget=new THREE.Vector3(0,.3,0);
    const tick=now=>{
      if(!active)return;
      elapsed+=Math.min(.05,(now-last)/1000);last=now;
      if(!document.hidden&&stageVisible.value&&now-lastDraw>=1000/maxFps){lastDraw=now;
        for(const mesh of fighters.values()){
          const d=mesh.userData;if(elapsed>=d.until){d.kind='';d.targetPosition=null}const progress=Math.max(0,Math.min(1,(d.until-elapsed)/.55));
          const travel=d.style==='speed'?2.2:d.style==='charge'||d.style==='slash'?1.65:.5;
          const attackPhase=d.kind==='attack'?Math.max(0,Math.min(1,(elapsed-(d.attackStart||0))/.7)):0;
          const lunge=d.kind==='attack'?(attackPhase<.16?0:attackPhase<.53?(attackPhase-.16)/.37:1-(attackPhase-.53)/.47):0;
          const jump=d.kind==='attack'?Math.sin(attackPhase*Math.PI)*.42:0;
          mesh.position.x=d.baseX+(d.targetPosition?(d.targetPosition.x-d.baseX)*.73:((d.side?-1:1)*travel))*lunge;
          mesh.position.z=d.baseZ+(d.targetPosition?(d.targetPosition.z-d.baseZ)*.73:0)*lunge;
          mesh.position.y=jump+(reduce?0:Math.sin(elapsed*2+d.phase)*.07)+(d.kind==='hit'?Math.sin(progress*40)*.14:0)+(d.kind==='attack'&&['cosmic','speed','lightning'].includes(d.style)?Math.sin(progress*Math.PI)*.6:0);
          mesh.rotation.y=d.side?-Math.PI/2:Math.PI/2;
          if(d.kind==='attack'&&d.targetPosition)mesh.rotation.y=Math.atan2(d.targetPosition.x-mesh.position.x,d.targetPosition.z-mesh.position.z);
          mesh.rotation.z=d.kind==='hit'?Math.sin(progress*Math.PI)*.13:0;
          const hpBg=d.hpFill.parent.children.find(n=>n!==d.hpFill&&n.geometry?.type==='PlaneGeometry');
          if(hpBg)hpBg.quaternion.copy(camera.quaternion);
          d.hpFill.quaternion.copy(camera.quaternion);
          d.halo.material.opacity=.72+(reduce?0:Math.sin(elapsed*2+d.phase)*.12);
          d.selection.material.opacity=d.kind==='attack'?.9:d.kind==='hit'?.75:.23;
          d.selection.scale.setScalar(d.kind==='attack'?1.18:1);
          if(d.importedModel&&d.mixer){
            const state=d.kind==='attack'?'attack':d.kind==='hit'?'hit':'idle';
            const clip=d.clips[state]||d.clips[state==='attack'?'cast':'idle'];
            if(clip&&d.currentClip!==clip.name.toLowerCase()){
              d.mixer.stopAllAction();d.mixer.clipAction(clip).reset().play();d.currentClip=clip.name.toLowerCase();
            }
            d.mixer.update(Math.min(.05,1/maxFps));
          }else d.rig.animate(elapsed,d.kind==='attack'?Math.sin(attackPhase*Math.PI):0,d.kind==='hit'?Math.sin(progress*Math.PI):0,reduce);
        }
        for(let i=specialEffects.length-1;i>=0;i--){
          const fx=specialEffects[i],age=elapsed-fx.born;
          fx.mesh.scale.setScalar(1+age*(fx.style==='cosmic'?5:3));
          fx.mesh.material.opacity=Math.max(0,1-age/.8);
          fx.mesh.rotation.z=age*1.8;
          if(age>.8){scene.remove(fx.mesh);fx.mesh.geometry.dispose();fx.mesh.material.dispose();specialEffects.splice(i,1)}
        }
        for(let i=floatingNumbers.length-1;i>=0;i--){
          const d=floatingNumbers[i],age=elapsed-d.born;
          d.sprite.position.y+=.035;d.sprite.material.opacity=Math.max(0,1-age/.85);
          if(age>.85){scene.remove(d.sprite);d.sprite.material.map.dispose();d.sprite.material.dispose();floatingNumbers.splice(i,1)}
        }
        for(let i=impactBursts.length-1;i>=0;i--){
          const burst=impactBursts[i],age=elapsed-burst.born;
          for(const spark of burst.group.children){spark.position.copy(spark.userData.velocity).multiplyScalar(age);spark.material.opacity=Math.max(0,1-age/.65)}
          if(age>.65){scene.remove(burst.group);burst.group.traverse(node=>{node.geometry?.dispose();node.material?.dispose()});impactBursts.splice(i,1)}
        }
        for(let i=effects.length-1;i>=0;i--){const e=effects[i];if(e.shockwave)e.mesh.scale.setScalar(1+(1-(e.expires-elapsed)/.45)*5);e.mesh.material.opacity=Math.max(0,(e.expires-elapsed)/.4);if(elapsed>=e.expires){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();effects.splice(i,1)}}
        if(!reduce){
          const activeAttacker=[...fighters.values()].find(m=>m.userData.kind==='attack'&&m.userData.until>elapsed);
          const desiredX=activeAttacker?THREE.MathUtils.clamp(activeAttacker.position.x*.14,-.7,.7):0;
          const desiredZ=activeAttacker?THREE.MathUtils.clamp(activeAttacker.position.z*.08,-.4,.4):0;
          cameraTarget.x=THREE.MathUtils.lerp(cameraTarget.x,desiredX,.045);
          cameraTarget.z=THREE.MathUtils.lerp(cameraTarget.z,desiredZ,.045);
          camera.position.x=cameraTarget.x;camera.position.z=11+cameraTarget.z;camera.lookAt(cameraTarget);
        }
        renderer.render(scene,camera);
      }
      animationId=requestAnimationFrame(tick);
    };
    animationId=requestAnimationFrame(tick);
    window.addEventListener('pagehide',()=>{active=false;cancelAnimationFrame(animationId);resize.disconnect();observer.disconnect();renderer.dispose()},{once:true});
    stage.classList.add('three-enabled');
  }catch(error){showError(error);try{await fallback()}catch(fallbackError){showError(fallbackError)}}
}
