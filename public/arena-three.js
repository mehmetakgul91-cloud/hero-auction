// Visual-only Three.js renderer. All outcomes and HP come from server replay events.
const stage=document.getElementById('arena-3d-stage');
const fallback=()=>import('/arena-3d.js?v=1');
if(stage){
  try{
    const THREE=await import('https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js');
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.setSize(stage.clientWidth,stage.clientHeight,false);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.domElement.className='three-arena-canvas';
    stage.prepend(renderer.domElement);
    const scene=new THREE.Scene();
    scene.fog=new THREE.FogExp2(0x080f28,0.026);
    const camera=new THREE.PerspectiveCamera(43,stage.clientWidth/stage.clientHeight,.1,100);
    camera.position.set(0,9,20);camera.lookAt(0,0,0);
    scene.add(new THREE.HemisphereLight(0x7fdfff,0x151025,2));
    const light=new THREE.PointLight(0x42ddff,45,24);light.position.set(-6,7,2);scene.add(light);
    const red=new THREE.PointLight(0xff43b9,45,24);red.position.set(6,7,2);scene.add(red);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(32,18),new THREE.MeshStandardMaterial({color:0x111a35,metalness:.45,roughness:.35}));
    floor.rotation.x=-Math.PI/2;scene.add(floor);
    const grid=new THREE.GridHelper(32,22,0x3b8dd0,0x243957);grid.position.y=.02;scene.add(grid);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(7,.045,6,96),new THREE.MeshBasicMaterial({color:0x5e6ef5}));
    ring.rotation.x=Math.PI/2;ring.position.y=.06;scene.add(ring);
    const fighters=new Map();const textureLoader=new THREE.TextureLoader();const art=new Map();
    const geometry=new THREE.PlaneGeometry(1.9,2.5);
    let teams=[],effects=[],last=performance.now(),elapsed=0,active=true,animationId=0;
    const portrait=(unit,mesh)=>{
      const universe=String(unit.id||'').split(':')[0]||(/superman|batman|flash|wonder woman|doomsday|doctor fate/i.test(unit.name)?'dc':'marvel');
      const key=universe+':'+unit.name;
      if(!art.has(key))art.set(key,fetch('/api/art?universe='+encodeURIComponent(universe)+'&name='+encodeURIComponent(unit.name)).then(r=>r.ok?r.json():null).then(d=>d?.url||null).catch(()=>null));
      art.get(key).then(url=>{if(!url||!fighters.has(mesh.userData.key))return;textureLoader.load(url,t=>{if(!fighters.has(mesh.userData.key)){t.dispose();return}t.colorSpace=THREE.SRGBColorSpace;mesh.material.map=t;mesh.material.needsUpdate=true},undefined,()=>{})});
    };
    const make=(unit,side,i)=>{
      const key=side+':'+i;
      const mat=new THREE.MeshBasicMaterial({color:side?0xff83c6:0x9fefff,transparent:true,side:THREE.DoubleSide,depthWrite:false});
      const mesh=new THREE.Mesh(geometry,mat);
      const baseX=(side?4.5:-4.5)+(side?-.9:.9)*(i%3);
      const baseZ=(Math.floor(i/3)-.5)*3.2+(i%3)*.35;
      mesh.position.set(baseX,1.6,baseZ);
      mesh.userData={key,baseX,baseZ,side,i,phase:i*.9,unit,until:0,kind:''};
      scene.add(mesh);fighters.set(key,mesh);portrait(unit,mesh);
      const hpBg=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.11),new THREE.MeshBasicMaterial({color:0x47172a,side:THREE.DoubleSide}));
      hpBg.position.y=1.53;mesh.add(hpBg);
      const hpFill=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.11),new THREE.MeshBasicMaterial({color:0x4affb5,side:THREE.DoubleSide}));
      hpFill.position.set(0,1.53,.005);mesh.add(hpFill);mesh.userData.hpFill=hpFill;
    };
    const sync=next=>{
      teams=next||[];
      const valid=new Set();
      teams.forEach((team,side)=>team.forEach((unit,i)=>{
        const key=side+':'+i;valid.add(key);
        if(!fighters.has(key))make(unit,side,i);
        const mesh=fighters.get(key);mesh.userData.unit=unit;
        const ratio=Math.max(0,Math.min(1,unit.hp/Math.max(1,unit.maxHp)));
        mesh.userData.hpFill.scale.x=ratio;mesh.userData.hpFill.position.x=-(1-ratio)*.9;
        mesh.material.opacity=unit.hp>0?1:.25;
      }));
      for(const [key,mesh] of fighters)if(!valid.has(key)){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();fighters.delete(key)}
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
      const actor=[...fighters.values()].find(m=>m.userData.unit.name===event.actor);
      const target=[...fighters.values()].find(m=>m.userData.unit.name===event.target);
      if(actor){actor.userData.until=elapsed+.55;actor.userData.kind='attack'}
      if(target){target.userData.until=elapsed+.5;target.userData.kind='hit'}
      if(actor&&target)spark(actor.position,target.position,/heal/i.test(event.action));
    };
    window.addEventListener('heroarena:ready',e=>sync(e.detail.teams));
    window.addEventListener('heroarena:move',move);
    const resize=new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;if(w&&h){camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}});resize.observe(stage);
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick=now=>{
      if(!active)return;
      elapsed+=Math.min(.05,(now-last)/1000);last=now;
      if(!document.hidden){
        for(const mesh of fighters.values()){
          const d=mesh.userData,progress=Math.max(0,Math.min(1,(d.until-elapsed)/.55));
          mesh.position.x=d.baseX+(d.kind==='attack'? (d.side?-1:1)*2.3*Math.sin(progress*Math.PI):0);
          mesh.position.y=1.6+(reduce?0:Math.sin(elapsed*2+d.phase)*.07)+(d.kind==='hit'?Math.sin(progress*40)*.14:0);
          mesh.rotation.y=d.side?-.23:.23;
          mesh.lookAt(camera.position.x,mesh.position.y,camera.position.z);
        }
        for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.mesh.material.opacity=Math.max(0,(e.expires-elapsed)/.4);if(elapsed>=e.expires){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();effects.splice(i,1)}}
        if(!reduce){camera.position.x=Math.sin(elapsed*.23)*.65;camera.lookAt(0,0,0)}
        renderer.render(scene,camera);
      }
      animationId=requestAnimationFrame(tick);
    };
    animationId=requestAnimationFrame(tick);
    window.addEventListener('pagehide',()=>{active=false;cancelAnimationFrame(animationId);resize.disconnect();renderer.dispose()},{once:true});
    stage.classList.add('three-enabled');
  }catch(error){console.warn('3D arena unavailable; using lightweight fallback',error);await fallback()}
}
