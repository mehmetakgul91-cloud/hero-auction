import test from 'node:test';
import assert from 'node:assert/strict';
import {translate,phrases} from '../public/crazygames-en.js';
import {crazyGamesSource} from '../crazygames-build.js';
test('portal locale translates core actions and dynamic state without changing hero names or numbers',()=>{
 assert.equal(translate('PAS'),'PASS');assert.equal(translate('PASS'),'PASS');
 assert.equal(translate('⏱ 15 saniye'),'⏱ 15 seconds');
 assert.equal(translate('Şu anda 50 özgün kahraman hazır'),'50 original heroes available');
 assert.equal(translate('Ruh Dokuyucu'),'Ruh Dokuyucu');
 for(const [tr,en] of Object.entries(phrases)){assert.equal(translate(en),en,`locale must be idempotent: ${tr}`);}
 const html=crazyGamesSource('<html lang="tr"><head></head><body></body></html>','.html');
 assert.match(html,/<html lang="en">/);assert.match(html,/crazygames-en\.js/);
});
