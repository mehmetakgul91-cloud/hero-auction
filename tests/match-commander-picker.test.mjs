import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMatchCommanderState,commanderComparison} from '../public/match-commander-picker.js';
const profile=commanderId=>({commanderId,levels:{attack:25,magic:30,defense:0,support:0}});
const payload=(extra={})=>({matchKey:'match1',options:['attack','magic','defense','support'].map(commanderId=>({commanderId,profile:profile(commanderId),totals:{attack:100,defense:40,maxHp:500,speed:10,cardPower:200},heroes:[]})),baseline:{totals:{attack:80,defense:40,maxHp:500,speed:10,cardPower:200}},selection:null,ready:[false,false],started:false,...extra});
test('starts unselected, compares actual server stats, and preserves training levels',async()=>{
 const picker=createMatchCommanderState({matchKey:'match1',request:async()=>payload()});await picker.refresh();assert.equal(picker.snapshot().selected,null);picker.select('magic');assert.equal(picker.snapshot().selected,'magic');assert.equal(picker.snapshot().options[1].profile.levels.magic,30);assert.deepEqual(commanderComparison(picker.snapshot().options[1],picker.snapshot().baseline)[0],{key:'attack',value:100,delta:20});picker.select('bogus');assert.equal(picker.snapshot().selected,'magic');
});
test('no automatic confirmation and double clicks only send once; lock survives polling',async()=>{
 let posts=0,release,locked=null,starts=0;const picker=createMatchCommanderState({matchKey:'match1',onStarted:()=>starts++,request:async(method,id)=>{if(method==='POST'){posts++;await new Promise(resolve=>release=resolve);locked=profile(id)}return payload({selection:locked,ready:[false,!!locked]})}});
 await picker.refresh();await picker.confirm();assert.equal(posts,0);picker.select('magic');const pending=picker.confirm();await picker.confirm();picker.select('attack');assert.equal(picker.snapshot().selected,'magic');assert.equal(posts,1);release();await pending;await picker.refresh();assert.equal(picker.snapshot().locked.commanderId,'magic');assert.equal(starts,0);
 picker.resolve(payload({selection:locked,ready:[true,true],started:true}));picker.resolve(payload({selection:locked,started:true}));assert.equal(starts,1);
});
test('reload restores locked waiting state without using the account default',async()=>{
 const picker=createMatchCommanderState({matchKey:'match1',request:async()=>payload({selection:profile('defense'),ready:[true,false]})});await picker.refresh();assert.equal(picker.snapshot().selected,'defense');picker.select('magic');assert.equal(picker.snapshot().selected,'defense');
});
test('lost POST response resolves server selection rather than offering another pick',async()=>{
 let posted=false;const picker=createMatchCommanderState({matchKey:'match1',request:async(method)=>{if(method==='POST'){posted=true;throw Error('offline')}return payload({selection:posted?profile('magic'):null})}});await picker.refresh();picker.select('magic');await picker.confirm();assert.equal(picker.snapshot().locked.commanderId,'magic');assert.equal(picker.snapshot().error,null);
});
test('unresolved outcome blocks another choice until a successful refresh',async()=>{
 let offline=false;const picker=createMatchCommanderState({matchKey:'match1',request:async(method)=>{if(method==='POST')offline=true;if(offline)throw Error('offline');return payload()}});await picker.refresh();picker.select('magic');await picker.confirm();picker.select('attack');assert.equal(picker.snapshot().selected,'magic');offline=false;await picker.refresh();picker.select('attack');assert.equal(picker.snapshot().selected,'attack');
});
test('stale match and disposed results cannot start combat',async()=>{
 let starts=0;const picker=createMatchCommanderState({matchKey:'match1',request:async()=>payload({matchKey:'match2',started:true}),onStarted:()=>starts++});await picker.refresh();assert.equal(picker.snapshot().error,'MATCH_CHANGED');assert.equal(starts,0);picker.destroy();picker.resolve(payload({started:true}));assert.equal(starts,0);
});
test('old in-flight GET cannot undo a newer confirmed choice',async()=>{
 let release;let count=0;const picker=createMatchCommanderState({matchKey:'match1',request:async(method)=>{if(method==='POST')return payload({selection:profile('magic')});if(++count===2)await new Promise(resolve=>release=resolve);return payload()}});await picker.refresh();picker.select('magic');const pending=picker.refresh();await picker.confirm();release();await pending;assert.equal(picker.snapshot().locked.commanderId,'magic');
});
test('formation and direct arena routes enter combined preparation; account default is not fetched',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');assert.ok(source.includes("pendingEntryUrl.searchParams.delete('commanderTest')"));assert.match(source,/mountCombinedPreparation/);assert.ok(!source.includes("fetch('/api/commander/get'"));assert.ok(source.includes('auctionLoaded=true;showMatchCommanderPicker();return'));
});
test('authoritative level/stat changes replace options while identical polling preserves reference and selection',async()=>{
 let data=payload();const picker=createMatchCommanderState({matchKey:'match1',request:async()=>JSON.parse(JSON.stringify(data))});await picker.refresh();picker.select('magic');const original=picker.snapshot().options;await picker.refresh();assert.equal(picker.snapshot().options,original);
 data.options[1].profile.levels.magic=31;data.options[1].totals.attack=125;await picker.refresh();assert.notEqual(picker.snapshot().options,original);assert.equal(picker.snapshot().options[1].profile.levels.magic,31);assert.equal(picker.snapshot().options[1].totals.attack,125);assert.equal(picker.snapshot().selected,'magic');
});
