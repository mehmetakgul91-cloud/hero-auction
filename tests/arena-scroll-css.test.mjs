import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/battle-preview.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const rules=selector=>[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([,head])=>head.trim()===selector).map(([,head,body])=>body);
const properties=rule=>Object.fromEntries(rule.split(';').filter(Boolean).map(line=>{const at=line.indexOf(':');return[line.slice(0,at).trim(),line.slice(at+1).trim()]}));

test('arena CSS permits document vertical scrolling while containing horizontal overflow',()=>{
 const [body]=rules('body.arena-fit').map(properties);
 assert.equal(body.height,'auto');assert.match(body['min-height'],/--arena-viewport-height/);
 assert.equal(body['overflow-y'],'auto');assert.equal(body['overflow-x'],'hidden');
 assert.equal(body['overscroll-behavior-y'],'auto');
 assert.equal(body.overflow,undefined);assert.equal(body['overscroll-behavior'],undefined);
});
test('fitted grid keeps definite viewport sizing without trapping overflow',()=>{
 const shell=rules('.arena-room.arena-fit .shell').map(properties);
 assert.match(shell[0].height,/--arena-viewport-height/);
 assert.equal(shell[0].overflow,'visible');
 for(const rule of shell){
  if(rule.overflow)assert.equal(rule.overflow,'visible');
  if(rule['grid-template-rows'])assert.doesNotMatch(rule['grid-template-rows'],/minmax\(0,1fr\)/);
 }
 assert.match(shell[0]['grid-template-rows'],/minmax\(280px,1fr\)/);
 assert.ok(shell.some(rule=>/minmax\(180px,1fr\)/.test(rule['grid-template-rows'])));
});
test('scroll fallback preserves commander tap targets and avoids a fixed shell',()=>{
 const [buttons]=rules('.arena-fit .arena-commander-dock #experimental-commander-controls [data-command]').map(properties);
 assert.equal(buttons.height,'44px');assert.equal(buttons['min-height'],'44px!important');
 for(const rule of rules('.arena-room.arena-fit .shell').map(properties))assert.notEqual(rule.position,'fixed');
});
