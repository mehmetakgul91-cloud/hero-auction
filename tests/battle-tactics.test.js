import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
const team=(prefix,role='fighter')=>Array.from({length:5},(_,i)=>({id:prefix+i,name:prefix+i,power:65,role:i===0?'tank':role}));
test('identical seed produces identical tactical combat',()=>{const a=team('a'),b=team('b');assert.deepEqual(simulateBattle(a,b,{seed:'fixed'}),simulateBattle(a,b,{seed:'fixed'}))});
test('normal attackers hit living front line before rear line',()=>{const a=team('a'),b=team('b');const result=simulateBattle(a,b,{seed:'front',maxRounds:1});const first=result.log.find(e=>e.side===0&&e.target);assert.ok(first);assert.match(first.target,/^b[01]$/)});
test('assassins can infiltrate enemy rear line',()=>{const a=team('a');a[0].role='assassin';const b=team('b');const result=simulateBattle(a,b,{seed:'rear',maxRounds:1});const assassinHit=result.log.find(e=>e.actor==='a0'&&e.target);assert.ok(assassinHit);assert.match(assassinHit.target,/^b[234]$/)});
