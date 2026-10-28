import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/native.css',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
const portrait=css.slice(css.lastIndexOf('@media(max-width:599px)'));
// Source-contract regressions, not substitutes for Android/rendered layout QA.
test('Android requests portrait launch and keyboard viewport resize',()=>{
 assert.match(manifest,/android:screenOrientation="portrait"/);
 assert.match(manifest,/android:windowSoftInputMode="adjustResize"/);
});
test('auction inherits the shared responsive geometry without Android panel overrides',()=>{
 assert.doesNotMatch(css,/\.native-auction[^{}]*#game/);
 assert.doesNotMatch(css,/native-player-details|native-hero-details/);
 assert.match(css,/body:not\(\.native-auction\) :is\(button,summary,input/);
 assert.match(css,/>#native-status:not\(\[data-notice\]\)\{display:none\}/);
});
test('portrait arena uses content-height tracks and definite scrollable battlefield',()=>{
 assert.match(portrait,/\.shell\{height:auto;[^}]*grid-template-rows:auto auto auto auto auto/);
 assert.match(portrait,/\.arena-room-nav\{height:auto;min-height:44px;flex-wrap:wrap\}/);
 assert.match(portrait,/\.score\{height:auto;min-height:64px\}/);
 assert.match(portrait,/#battle-arena\{height:max\(var\(--native-arena-min-height\)/);
 assert.doesNotMatch(portrait,/overflow(?:-y)?:hidden/);
 assert.match(css,/min-height:44px/);
});
test('native menu layers above existing 9999-z-index audio control',()=>{
 assert.match(css,/#native-game-menu\[open\]\{z-index:11000\}/);
 assert.match(css,/\.native-menu-panel\{box-sizing:border-box\}/);
});
test('Ready action remains in document flow rather than covering preparation heroes',()=>{
 assert.match(css,/\.formation \.preparation-ready-bar\{position:static;bottom:auto\}/);
});
