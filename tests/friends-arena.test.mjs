import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {crazyGamesSource} from '../crazygames-build.js';
const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/battle-preview.css',import.meta.url),'utf8');
test('arena reuses friendship controller after portal identity verification and authenticates room lookup',()=>{
 assert.ok(source.indexOf('arenaFriends=createFriendsUI')>source.indexOf('await window.HeroPlatform.identity()'));
 assert.ok(source.includes("if(auctionMode){\n const nav=document.querySelector('.arena-room-nav')"));
 assert.ok(source.includes('opponentRoot:friendButton'));
 assert.ok(source.includes('arenaFriends.setLogin(auth)'));
 assert.ok(source.includes('code:auctionCode,token:auctionToken,authToken:auth.authToken'));
 assert.ok(source.includes('arenaFriends.setRoom(result.room)'));
 assert.ok(source.includes('nav?.append(friendButton)'));
 assert.ok(source.includes('if(title)title.hidden=!friendButton.hidden'));
 assert.ok(css.includes('#arena-friend-opponent[hidden]{display:none}'));
});
test('CrazyGames arena resolves shared friends module and isolated stored identity namespace',()=>{
 const cg=crazyGamesSource(source,'.js');
 assert.ok(cg.includes("from '/crazygames/friends.js'"));
 assert.ok(cg.includes("localStorage.getItem('hero-auction-cg-login')"));
 assert.ok(cg.includes("document.documentElement.lang==='en'?translate(text):text"));
});

test('arena mounts shared invitation dock outside the combat grid and persists transferred seat before navigation',()=>{
 assert.ok(source.includes("from '/room-invites.js'"));
 assert.ok(source.includes('inboxRoot:inviteBox'));
 assert.ok(source.includes('arenaInvites.setLogin(auth)'));
 assert.ok(source.includes('arenaInvites.setRoom(result.room,auctionToken)'));
 assert.ok(source.includes("localStorage.setItem('hero-auction-session',JSON.stringify({token,code:room.code}))"));
 assert.ok(source.includes("document.body.prepend(inviteBox)"));
 const inviteCSS=readFileSync(new URL('../public/room-invites.css',import.meta.url),'utf8');assert.ok(inviteCSS.includes('max-height:32dvh'));assert.ok(inviteCSS.includes('position:fixed'));assert.ok(!inviteCSS.includes('--room-invite-height'));assert.ok(inviteCSS.includes('min-height:44px'));
 const cg=crazyGamesSource(source,'.js');assert.ok(cg.includes("from '/crazygames/room-invites.js'"));
});
