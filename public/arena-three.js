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
    renderer.domElement.className='three-arena-canvas';
    stage.prepend(renderer.domElement);
    const scene=new THREE.Scene();
    scene.background=new THREE.Color(0x050b1b);scene.fog=new THREE.FogExp2(0x050b1b,0.018);
    const mobile=window.matchMedia('(max-width: 700px)').matches;
    const camera=new THREE.OrthographicCamera(-10,10,7,-7,.1,100);
    const fitCamera=()=>{
      const aspect=Math.max(.5,stage.clientWidth/Math.max(1,stage.clientHeight));
      const halfHeight=Math.max(mobile?9.8:7.8,5.9/aspect);
      camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;
      camera.top=halfHeight;camera.bottom=-halfHeight;
      camera.updateProjectionMatrix();
    };
    fitCamera();
    // Tactical bird's-eye view: the 3D models remain visible, not flat sprites.
    camera.position.set(0,21,7.8);camera.lookAt(0,.3,0);
    scene.add(new THREE.HemisphereLight(0xa8dfff,0x201025,2.5));
    const keyLight=new THREE.DirectionalLight(0xffffff,2.5);keyLight.position.set(0,12,7);scene.add(keyLight);
    const light=new THREE.PointLight(0x42ddff,45,24);light.position.set(-6,7,2);scene.add(light);
    const red=new THREE.PointLight(0xff43b9,45,24);red.position.set(6,7,2);scene.add(red);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(32,22),new THREE.MeshStandardMaterial({color:0x101a33,metalness:.7,roughness:.23}));
    floor.rotation.x=-Math.PI/2;scene.add(floor);
    const grid=new THREE.GridHelper(30,30,0x3299cf,0x23345d);grid.position.y=.025;scene.add(grid);
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
      const baseX=(side?3.15:-3.15)+(side?-.25:.25)*(i%2);
      const baseZ=(i-2)*2.15;
      mesh.position.set(baseX,0,baseZ);
      mesh.scale.setScalar(cardScale(unit));
      mesh.userData={key,baseX,baseZ,side,i,phase:i*.9,unit,until:0,kind:'',rig,style:profiles[String(unit.id||'').toLowerCase()]?.style||'charge'};
      scene.add(mesh);fighters.set(key,mesh);
      const hpBg=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.11),new THREE.MeshBasicMaterial({color:0x47172a,side:THREE.DoubleSide}));
      hpBg.position.y=2.25;mesh.add(hpBg);
      const hpFill=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.11),new THREE.MeshBasicMaterial({color:0x4affb5,side:THREE.DoubleSide}));
      hpFill.position.set(0,2.25,.005);mesh.add(hpFill);mesh.userData.hpFill=hpFill;
    };
    const sync=next=>{
      teams=next||[];
      const valid=new Set();
      teams.forEach((team,side)=>team.forEach((unit,i)=>{
        const key=side+':'+i;valid.add(key);
        if(!fighters.has(key))make(unit,side,i);
        const mesh=fighters.get(key);mesh.userData.unit=unit;mesh.scale.setScalar(cardScale(unit));mesh.userData.style=profiles[String(unit.id||'').toLowerCase()]?.style||'charge';
        const ratio=Math.max(0,Math.min(1,unit.hp/Math.max(1,unit.maxHp)));
        mesh.userData.hpFill.scale.x=ratio;mesh.userData.hpFill.position.x=-(1-ratio)*.9;
        mesh.visible=unit.hp>0;
      }));
      for(const [key,mesh] of fighters)if(!valid.has(key)){scene.remove(mesh);mesh.traverse(node=>{node.geometry?.dispose();if(node.material){(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>m.dispose())}});fighters.delete(key)}
    };
    const visualEffect=(actor,target)=>{
      const profile=profiles[String(actor.userData.unit.id||'').toLowerCase()]||{style:'charge',accent:'#65ddff'};
      const style=profile.style,color=new THREE.Color(profile.accent);
      const from=actor.position.clone(),to=target.position.clone(),direction=to.clone().sub(from);

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
    const move=e=>{
      const event=e.detail.event;sync(e.detail.teams);
      const actor=[...fighters.values()].find(m=>m.userData.unit.id===event.actor||m.userData.unit.name===event.actor);
      const target=[...fighters.values()].find(m=>m.userData.unit.id===event.target||m.userData.unit.name===event.target);
      if(actor){actor.userData.until=elapsed+.55;actor.userData.kind='attack'}
      if(target){target.userData.until=elapsed+.5;target.userData.kind='hit'}
      if(actor&&target)visualEffect(actor,target);
    };
    window.addEventListener('heroarena:ready',e=>sync(e.detail.teams));
    window.addEventListener('heroarena:move',move);
    if(Array.isArray(window.heroArenaTeams))sync(window.heroArenaTeams);
    const resize=new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;if(w&&h){fitCamera();renderer.setSize(w,h,false)}});resize.observe(stage);
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const maxFps=mobile?30:60;let lastDraw=0;
    const tick=now=>{
      if(!active)return;
      elapsed+=Math.min(.05,(now-last)/1000);last=now;
      if(!document.hidden&&now-lastDraw>=1000/maxFps){lastDraw=now;
        for(const mesh of fighters.values()){
          const d=mesh.userData,progress=Math.max(0,Math.min(1,(d.until-elapsed)/.55));
          const travel=d.style==='speed'?3.2:d.style==='charge'||d.style==='slash'?2.3:.65;
          mesh.position.x=d.baseX+(d.kind==='attack'?(d.side?-1:1)*travel*Math.sin(progress*Math.PI):0);
          mesh.position.y=0+(reduce?0:Math.sin(elapsed*2+d.phase)*.07)+(d.kind==='hit'?Math.sin(progress*40)*.14:0)+(d.kind==='attack'&&['cosmic','speed','lightning'].includes(d.style)?Math.sin(progress*Math.PI)*.6:0);
          mesh.rotation.y=d.side?-Math.PI/2:Math.PI/2;
          const hpBg=d.hpFill.parent.children.find(n=>n!==d.hpFill&&n.geometry?.type==='PlaneGeometry');
          if(hpBg)hpBg.quaternion.copy(camera.quaternion);
          d.hpFill.quaternion.copy(camera.quaternion);
          d.rig.animate(elapsed,d.kind==='attack'?Math.sin(progress*Math.PI):0,d.kind==='hit'?Math.sin(progress*Math.PI):0,reduce);
        }
        for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.mesh.material.opacity=Math.max(0,(e.expires-elapsed)/.4);if(elapsed>=e.expires){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();effects.splice(i,1)}}
        if(!reduce){camera.position.x=Math.sin(elapsed*.23)*.12;camera.lookAt(0,.3,0)}
        renderer.render(scene,camera);
      }
      animationId=requestAnimationFrame(tick);
    };
    animationId=requestAnimationFrame(tick);
    window.addEventListener('pagehide',()=>{active=false;cancelAnimationFrame(animationId);resize.disconnect();renderer.dispose()},{once:true});
    stage.classList.add('three-enabled');
  }catch(error){showError(error);try{await fallback()}catch(fallbackError){showError(fallbackError)}}
}
