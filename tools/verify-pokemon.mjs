import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cards=JSON.parse(fs.readFileSync(path.join(root,'public/cards.json'),'utf8'));
const pokemon=Object.entries(cards).filter(([id])=>id.startsWith('pokemon:'));
assert.equal(pokemon.length,1025,'1025 Pokemon kaydi olmali');
const ids=new Set(),files=new Set();
for(const [id,c] of pokemon){
 assert.ok(Number.isInteger(c.pokedex)&&c.pokedex>=1&&c.pokedex<=1025,id+' Pokedex numarasi gecersiz');
 assert.ok(!ids.has(c.pokedex),id+' yinelenen Pokedex numarasi');ids.add(c.pokedex);
 assert.ok(typeof c.description==='string'&&c.description.length>=40,id+' aciklama eksik');
 assert.ok(Number.isInteger(c.power)&&c.power>=1&&c.power<=100,id+' guc puani gecersiz');
 assert.equal(c.image,'/images/pokemon/'+c.pokedex+'.png',id+' gorsel yolu yanlis');
 const p=path.join(root,'public',c.image.slice(1));assert.ok(fs.existsSync(p),id+' resim dosyasi eksik');
 const fd=fs.openSync(p,'r');const header=Buffer.alloc(8);fs.readSync(fd,header,0,8,0);fs.closeSync(fd);
 assert.equal(header.toString('hex'),'89504e470d0a1a0a',id+' PNG basligi gecersiz');
 files.add(c.image);
}
assert.equal(ids.size,1025);
assert.equal(files.size,1025);
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
assert.ok(server.includes('cardDetails[id]?.power'),'Sunucu kayitli puanlari kullanmiyor');
assert.ok(server.includes('return {url:local.image'),'Sunucu yerel gorseli kullanmiyor');
assert.ok(!app.includes('raw.githubusercontent.com/PokeAPI/sprites'),'Arayuz dis Pokemon resimlerini kullaniyor');
console.log('BASARILI: 1025 Pokemon karti, 1025 yerel PNG, Turkce aciklamalar, sabit puanlar ve yerel resim baglantisi kontrol edildi.');
