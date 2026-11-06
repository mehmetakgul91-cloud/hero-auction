import {createArenaEmotes} from './arena-emotes.js?v=compact-overlay-20261106';
const nav=document.querySelector('.arena-room-nav');
if(nav)createArenaEmotes({window,document,nav,reactionHost:document.querySelector('#battle-arena')});
