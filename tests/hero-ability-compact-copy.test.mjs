import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {abilityImpact,translateAbilityDescription} from '../public/hero-ability-text.js';
import {translate} from '../public/crazygames-en.js';

const roster=JSON.parse(fs.readFileSync(new URL('../battle-roster.json',import.meta.url))).characters;
const hero=name=>roster.find(h=>h.name===name);
const compact=ability=>abilityImpact(ability,{compact:true});
const quantities=text=>(text.match(/\d+(?:[.,]\d+)?/g)||[]).map(n=>Number(n.replace(',','.'))).sort((a,b)=>a-b);

test('all 100 full descriptions match the authorized personal-clock and stun-copy snapshot in both languages',()=>{
 const full=roster.map(h=>({id:h.id,...Object.fromEntries(['active','passive'].flatMap(k=>[[k,abilityImpact(h[k])],[k+'English',abilityImpact(h[k],{english:true})]]))}));
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(full)).digest('hex'),
  '2ae0a368dd4ee0952c4c43ec4f87ea155ff4511fb5e10654559bd138ac9fcc66');
 // Removing only the approved cadence and stun-trigger wording recovers the
 // previous snapshot, guarding every unrelated full-description byte.
 const previous=JSON.stringify(full).replaceAll('Tamamlanan her 3 eylemde: ','Her 3 turda: ').replaceAll('Every 3 completed actions: ','Every 3 rounds: ').replaceAll('; sersemken tetiklenmez','').replaceAll('; cannot trigger while stunned','');
 assert.equal(crypto.createHash('sha256').update(previous).digest('hex'),'fb2c7cef63b4728b3f6680cb08ec1bb8063bd384eed72798d7b7b85a31bcb337');
 for(const h of roster)for(const kind of ['active','passive'])assert.equal(abilityImpact(h[kind]),abilityImpact(h[kind],{compact:false}));
});

test('all 100 gameplay summaries are shorter, retain every quantity and translate exactly',()=>{
 assert.equal(roster.length,50);
 let total=0;
 for(const h of roster)for(const kind of ['active','passive']){
  const text=compact(h[kind]),full=abilityImpact(h[kind]),en=abilityImpact(h[kind],{compact:true,english:true});total+=text.length;
  assert.ok(text.length<full.length,h.name+' '+kind);
  assert.ok(text.length<=(kind==='active'?95:55),h.name+' '+kind+': '+text);
  assert.doesNotMatch(text,/…|\.\.\.|undefined|NaN|\{\d+\}/);
  assert.deepEqual(quantities(text),quantities(full),h.name+' '+kind+' numeric mechanics');
  assert.deepEqual(quantities(en),quantities(text));
  assert.equal(translateAbilityDescription(text),en);assert.equal(translate(text),en);
  assert.equal(translate(en),en);assert.doesNotMatch(en,/[çğıöşüÇĞİÖŞÜ]/u);
  if(kind==='active')assert.match(text,/^Her 3 eylemde:/);
 }
 // Full descriptions include cadence and stun qualifications; gameplay summaries must stay substantially shorter.
 assert.ok(total<=4800,`Gameplay copy grew to ${total} characters`);
});

test('tank summary keeps separately rounded shield rates, own-defense basis and duration',()=>{
 assert.equal(compact(hero('Obsidyen Muhafız').active),
  'Her 3 eylemde: Kendi savunmasından kendine %45 + %20, ön safa +%18 kalkan (tükenene dek)');
 assert.equal(compact({effect:'shield',shieldRate:.4}),
  'Her 3 eylemde: Kendine savunması × %40 kalkan; tükenene dek kalır');
 assert.match(abilityImpact(hero('Obsidyen Muhafız').active),/her yaşayan ön saf müttefikine ek kalkan/);
});

test('delay summary names next action, while full copy retains timing and anti-chain conditions',()=>{
 assert.equal(compact(hero('Kael').active),
  'Her 3 eylemde: Vuruş hasarı +%12; hedefin sonraki hareketini sona erteler');
 const full=abilityImpact(hero('Kael').active);
 assert.match(full,/hareketini atlamadan/);assert.match(full,/hareket ettiyse sonraki tur/);
 assert.match(full,/geciktirilen hareketten sonraki tur boyunca yeniden geciktirmeye bağışık/);
});

test('healing summaries retain ratio target and own stats; full copy keeps fallback and no-attack rules',()=>{
 assert.equal(compact(hero('Seraphine').active),
  'Her 3 eylemde: En düşük can oranlı müttefike kendi saldırısı × %52 şifa, savunması × %28 kalkan');
 assert.equal(compact(hero('Fener Şifacısı').active),
  'Her 3 eylemde: Can oranı en düşük yaralı müttefike kendi saldırısı × %52 şifa');
 assert.match(abilityImpact(hero('Seraphine').active),/tam canda da kalkan verir, saldırmaz/);
 assert.match(abilityImpact(hero('Fener Şifacısı').active),/yaralı yoksa saldırır/);
});

test('damage summaries retain damage basis, threshold, stat changes and timing',()=>{
 const expectations={
  Morvan:'Her 3 eylemde: Diğer her düşmana ana vuruşun ham hasarı × %27 hasar',
  'Kızıl Düellocu':'Her 3 eylemde: Ana vuruşun can hasarı × %18 kendine şifa',
  'Gece Orağı':'Her 3 eylemde: Vuruş sonrası canı %12 altındaki hedefi bitirir',
  'Kül Bıçağı':'Her 3 eylemde: Hız +8 (tavan 150); sonraki turda etkili',
  'Kadim Koruyucu':'Her 3 eylemde: Vuruş sonrası hedef savunması −%15, kalıcı',
  'Ay Cadısı':'Her 3 eylemde: Vuruş sonrası hedef saldırısı −%14, kalıcı',
 };
 for(const [name,expected]of Object.entries(expectations))assert.equal(compact(hero(name).active),expected);
});

test('passive summaries retain battle/round triggers and once-only conditional permanence',()=>{
 assert.equal(compact(hero('Kael').passive),'Sersem değilse tur başı can <%50: tek kalıcı SAL +%12');
 assert.equal(compact(hero('Morvan').passive),'Sersem değilse tur başı: azami can × %3 şifa');
 assert.equal(compact(hero('Vandra').passive),'Savaş başı: hız +%8');
 assert.equal(compact(hero('Kadim Koruyucu').passive),'Savaş başı: saldırı +%6');
 assert.equal(compact(hero('Obsidyen Muhafız').passive),'Savaş başı: savunma +%8');
 assert.match(abilityImpact(hero('Vandra').passive),/yalnız sıra, kaçınma değil/);
});

test('both modes format custom fractional rates and translate their actual values',()=>{
 for(const ability of [{effect:'shield',shieldRate:.455,frontShieldRate:.165,tankShieldRate:.205},{effect:'burst',power:1.125,delay:true},{effect:'focus',value:.065}])for(const compact of [false,true]){
  const tr=abilityImpact(ability,{compact}),en=abilityImpact(ability,{compact,english:true});
  assert.match(tr,/,5/);assert.equal(translateAbilityDescription(tr),en);
 }
});
