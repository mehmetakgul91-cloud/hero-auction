import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('public landing describes current gameplay with real, accessible screenshots',async()=>{
 const html=await read('public/index.html');
 assert.match(html,/<h1>Hero Auction<br>/);
 assert.doesNotMatch(html,/showcase-placeholder|showcase-mini-board|ekran görüntüleri hazırlandığında/);
 for(const text of ['20 kredini','10 kartlık','5 kahraman','otomatik yerleşir','1000 altın','giriş 50 altın; galibiyette sabit ödül','İngilizce oyun arayüzünden'])assert.ok(html.includes(text),text);
 assert.match(html,/href="#nasil-oynanir"/);
 for(const [name,w,h] of [['auction',1180,757],['formation',1165,1583],['battle',1165,747]]){
  assert.ok(html.includes(`src="/images/screenshots/${name}.jpg" width="${w}" height="${h}" loading="lazy" decoding="async" alt="Hero Auction`));
  const bytes=await readFile(new URL(`../public/images/screenshots/${name}.jpg`,import.meta.url));
  assert.equal(bytes.readUInt16BE(0),0xffd8);assert.ok(bytes.length<300000);
 }
 assert.doesNotMatch(html,/aggregateRating|reviewCount/);
});
test('social preview is dedicated, small and absolute; privacy and CG remain isolated',async()=>{
 const html=await read('public/index.html');
 const url='https://heroauction.com.tr/images/social/hero-auction-share.jpg';
 for(const tag of ['property="og:image"','name="twitter:image"'])assert.ok(html.includes(`<meta ${tag} content="${url}">`));
 assert.match(html,/<meta property="og:image:type" content="image\/jpeg">/);
 assert.match(html,/<meta property="og:image:width" content="960">/);
 assert.match(html,/<meta property="og:image:height" content="800">/);
 const bytes=await readFile(new URL('../public/images/social/hero-auction-share.jpg',import.meta.url));
 assert.ok(bytes.length<300000);assert.equal(bytes.readUInt16BE(0),0xffd8);
 assert.equal((await readFile(new URL('../public/images/original/hero-01.png',import.meta.url))).length,3067229);
 assert.match(await read('public/privacy.html'),/content="noindex,follow"/);
 assert.match(await read('crazygames-build.js'),/\.landing-story,\.landing-gameplay,/);
 assert.ok(html.indexOf('/landing-content.css')<html.indexOf('/theme.css'));
});
