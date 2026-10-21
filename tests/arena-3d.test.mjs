import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {Box3,Vector3} from 'three';
import {createArena3dDemo} from '../arena-3d-demo.js';
import {battleOutcome} from '../battle-result.js';
import {ArenaReplayClock,primaryAction,snapshotChanges} from '../public/arena-3d-timeline.js';
import {createHeroModel,homePosition} from '../public/arena-3d-models.js';

test('3D rehearsal uses five distinct roles, full authoritative snapshots and a terminal result',()=>{
 const d=createArena3dDemo(),roles=['tank','fighter','assassin','energy','support'];
 for(const team of d.initial)assert.deepEqual(team.map(h=>h.role),roles);
 assert.ok(d.frames.length>10&&d.frames.length<=180);
 const end=d.frames.at(-1).teams;assert.equal(d.winner,battleOutcome(end).winner);
 let previous=d.initial;
 for(const frame of d.frames){
  for(const [side,team] of frame.teams.entries())for(const hero of team){
   assert.ok(hero.hp>=0&&hero.hp<=hero.maxHp);assert.ok(hero.shield>=0);
   const old=previous[side].find(h=>h.id===hero.id);if(old.hp===0)assert.equal(hero.hp,0,'dead heroes are never resurrected by the renderer');
  }
  const action=primaryAction(frame);if(action?.target)assert.ok(frame.teams.flat().some(h=>h.id===action.target));
  previous=frame.teams;
 }
 assert.ok(d.frames.some(f=>f.events.some(e=>e.action.startsWith('commander-defense'))));
 assert.ok(d.frames.some(f=>f.events.some(e=>e.action.startsWith('commander-support'))));
 assert.ok(d.summary.actionCount>0);
 assert.equal(d.summary.teams.flat().reduce((n,h)=>n+h.dealt,0),end.flat().reduce((n,h)=>n+h.damage,0));
 const firstHealth=d.initial[0][0].hp;d.frames[0].teams[0][0].hp=0;assert.equal(d.initial[0][0].hp,firstHealth,'frames are independent snapshots');
});

test('pause, resume, speed and reset never apply an impact twice or skip the final state',()=>{
 const frames=[{events:[{actor:'a',action:'attack'}]},{events:[{actor:'commander:0',action:'commander-support-normal'}]}];
 const seen=[];const c=new ArenaReplayClock(frames,{start:(_,i)=>seen.push('start'+i),impact:(_,i)=>seen.push('hit'+i),end:(_,i)=>seen.push('end'+i),finish:()=>seen.push('finish')});
 c.play();c.advance(.3);c.pause();c.advance(100);assert.equal(c.cursor,0);assert.deepEqual(seen,['start0']);
 c.play();c.advance(.3);assert.deepEqual(seen,['start0','hit0']);c.pause();const progress=c.progress;c.advance(10);assert.equal(c.progress,progress);
 c.play();c.advance(100);assert.equal(c.finished,true);assert.deepEqual(seen,['start0','hit0','end0','start1','hit1','end1','finish']);
 c.advance(20);assert.equal(seen.length,7);c.reset();assert.equal(c.finished,false);assert.equal(c.cursor,0);assert.equal(c.playing,false);
 c.play();c.advance(100);assert.equal(seen.filter(s=>s==='hit0').length,2);
});

test('visual impacts derive exact health and shield changes and select attacks ahead of secondary effects',()=>{
 const before=[[{id:'same',hp:90,shield:30}],[{id:'same',hp:20,shield:0}]],after=[[{id:'same',hp:100,shield:15}],[{id:'same',hp:0,shield:0}]];
 assert.deepEqual(snapshotChanges(before,after),[{side:0,id:'same',hp:10,shield:-15,died:false},{side:1,id:'same',hp:-20,shield:0,died:true}]);
 const attack={actor:'a',action:'Special Name',damageType:'special',target:'b'};
 assert.equal(primaryAction({events:[{actor:'a',action:'heal'},attack]}),attack);
});

test('five original articulated meshes fit their board cells and carry selectable hero identities',()=>{
 const d=createArena3dDemo(),counts=new Set();
 for(const [side,team] of d.initial.entries())for(const [index,hero] of team.entries()){
  const model=createHeroModel(hero,side),bounds=new Box3().setFromObject(model.body),size=bounds.getSize(new Vector3());
  assert.equal(model.arms.length,2);assert.equal(model.legs.length,2);assert.ok(size.y>1.4&&size.y<3);
  assert.ok(size.x<2&&size.z<2,'miniature stays inside its cell');
  let meshes=0;model.root.traverse(obj=>{assert.equal(obj.userData.heroKey,side+':'+hero.id);if(obj.isMesh)meshes++;});counts.add(meshes);
  const p=homePosition(side,index);assert.ok(Math.abs(p.x)<3&&Math.abs(p.z)<4);
 }
 assert.ok(counts.size>=4,'role geometry must be visually distinct');
});

test('public rehearsal and pinned renderer load without login; vendor route only exposes required modules',{timeout:15000},async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:''},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 try{
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/api/info')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50));}assert.ok(ready,logs);
  const page=await fetch(base+'/arena-3d.html');assert.equal(page.status,200);assert.match(await page.text(),/type="importmap"/);
  const first=await (await fetch(base+'/api/arena-3d-demo')).json(),second=await (await fetch(base+'/api/arena-3d-demo?room=ignored')).json();
  assert.equal(first.demo,true);assert.deepEqual(first,second);assert.equal(first.initial[0].length,5);assert.equal(first.token,undefined);assert.equal(first.goldAward,undefined);
  for(const name of ['three.module.js','three.core.js']){const asset=await fetch(base+'/vendor/three-0.186.1/'+name);assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/javascript/);assert.equal(asset.headers.get('content-encoding'),'gzip');assert.ok((await asset.text()).length>10000);}
  assert.equal((await fetch(base+'/vendor/three-0.186.1/package.json')).status,404);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,1500).unref();});}
});
