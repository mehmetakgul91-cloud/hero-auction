import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {reportOptions,readAdminSessionReport} from '../admin-player-reports.js';
const now=new Date('2026-10-28T22:30:00Z');
test('report accepts only bounded calendar periods, pagination and allowlisted filters',()=>{
 for(const days of [1,7,30])assert.equal(reportOptions({days},now).days,days);
 for(const request of [{days:0},{days:'7'},{days:31},{offset:-1},{offset:1.5},{limit:101},{source:'sql'},{platform:'ios'},{accountId:[]},{search:'x'.repeat(101)},{until:'bad'},{until:'2026-10-28T22:31:00Z'},{until:'2026-10-27T22:30:00Z'}])assert.throws(()=>reportOptions(request,now),e=>e.status===400);
});
test('disabled measurements never read storage or invent zero counts',async()=>{
 const r=await readAdminSessionReport({database:{connect(){throw Error('must not query');}},policy:{enabled:false},now});assert.equal(r.available,false);assert.equal(r.summary,null);
});
test('report snapshot is read-only, parameterized and released on failure',async()=>{
 const calls=[];let released=false;const database={connect:async()=>({query:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT'))throw Object.assign(Error('missing'),{code:'42P01'});return {rows:[]};},release(){released=true;}})};
 const r=await readAdminSessionReport({database,policy:{enabled:true},request:{search:"';drop table wallets;--"},now});assert.equal(r.reason,'storage_unavailable');assert.equal(released,true);assert.equal(calls[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(calls.at(-1).sql,'ROLLBACK');assert.equal(calls[1].args[2],"';drop table wallets;--");assert.ok(!calls[1].sql.includes('drop table'));
});
const context={window:{}};vm.createContext(context);vm.runInContext(readFileSync(new URL('../public/admin-reports.js',import.meta.url),'utf8'),context);const reportTools=context.window.HeroAdminReports;
function parseCSV(text){let rows=[],row=[],value='',quoted=false;for(let i=1;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(ch===';'&&!quoted){row.push(value);value='';}else if(ch==='\r'&&!quoted&&text[i+1]==='\n'){row.push(value);rows.push(row);row=[];value='';i++;}else value+=ch;}row.push(value);rows.push(row);return rows;}
test('CSV round trips Turkish, quotes, delimiters and multiline values; neutralizes formula prefixes',()=>{
 const values=['İzmir; Manisa','"Oyuncu"','iki\nsatır','=HYPERLINK("x")','  +SUM(1;1)','\t@danger','-1','normal',null];
 const csv=reportTools.csv([values]);assert.equal(csv.charCodeAt(0),0xfeff);assert.deepEqual(parseCSV(csv),[[values[0],values[1],values[2],...values.slice(3,7).map(v=>"'"+v),'normal','']]);
});
test('daily rows use server snapshot in Istanbul, month rollover and unknown days; never sum daily uniques',()=>{
 const rows=reportTools.dailyRows({options:{until:now.toISOString(),days:7},days:[{day:'2026-10-29',sessions:3,uniqueAccounts:1}]});assert.equal(rows[0][0],'2026-10-29');assert.equal(rows[0][2],1);assert.equal(rows[1][1],'—');assert.equal(rows.length,7);
 const boundary=reportTools.dailyRows({options:{until:'2026-02-28T22:00:00Z',days:7},days:[]});assert.equal(boundary[0][0],'2026-03-01');assert.equal(boundary[1][0],'2026-02-28');
});

test('oversized export fails atomically rather than returning a silently truncated CSV',async()=>{
 let reads=0,released=false;const calls=[];
 const database={connect:async()=>({query:async(sql)=>{calls.push(sql);if(!sql.startsWith('SELECT'))return {rows:[]};reads++;return reads===1?{rows:[{sessions:10001,unique_accounts:20}]}:reads===2?{rows:[]}:{rows:Array(10001).fill({})};},release(){released=true;}})};
 await assert.rejects(readAdminSessionReport({database,policy:{enabled:true},request:{export:true},now}),e=>e.status===400&&e.message.includes('10.000'));
 assert.equal(calls.at(-1),'ROLLBACK');assert.equal(released,true);assert.ok(!calls.includes('COMMIT'));
});
