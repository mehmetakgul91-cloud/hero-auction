import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
test('only auction calculation view hides duplicate player cards and uses full-width single column',()=>{
 assert.match(app,/if\(r.phase==='finished'&&r.final\?\.length===2&&r.final.every\(p=>p.team\?\.length===5\)&&session\?\.token\)\{\s*\$\('game'\).classList.add\('auction-results-only'\)/);
 assert.match(css,/#game\.auction-results-only \.player-side\{display:none\}/);
 assert.match(css,/#game\.auction-results-only \.arena-layout\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(css,/#game\.auction-results-only \.arena-stage\{grid-column:1;grid-row:1;width:100%;min-width:0\}/);
});
test('auction/rematch transitions restore cards; calculation rows and arena confirmation stay intact',()=>{
 const reset=app.indexOf("classList.remove('auction-results-only')");
 const tail=app.indexOf("if(r.phase==='finished'&&(tailAwards.length");assert.ok(reset>0&&reset<tail);
 const result=app.slice(app.indexOf("classList.add('auction-results-only')"),app.indexOf(" }renderChat(r);"));
 assert.match(result,/hero.power\*\(1\+rate\/100\)/);
 assert.match(result,/base\*\(1\+rate\/100\)/);
 assert.match(result,/hero.power\} → \$\{updated/);
 assert.match(result,/id="confirm-arena-entry"/);
 assert.match(result,/location.assign\('\/battle-preview.html\?'/);
});
