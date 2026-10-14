import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(), out=path.join(root,'public','images','pokemon');
const cardsPath=path.join(root,'public','cards.json');
const statTr={hp:'dayanıklılığı',attack:'fiziksel saldırısı',defense:'savunması','special-attack':'özel saldırısı','special-defense':'özel savunması',speed:'hızı'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function getJson(url){for(let i=0;i<4;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}catch(e){if(i===3)throw e;await sleep(800*(i+1))}}}
async function getPng(url){for(let i=0;i<4;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status);const b=Buffer.from(await r.arrayBuffer());if(b.length<200||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Geçersiz PNG');return b}catch(e){if(i===3)throw e;await sleep(800*(i+1))}}}
const start=Number(process.argv[2]||1),end=Number(process.argv[3]||1025);
if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end>1025||start>end)throw Error('Aralık 1..1025 olmalı');
await fs.mkdir(out,{recursive:true});
const cards=JSON.parse(await fs.readFile(cardsPath,'utf8'));let ok=0,fail=[];
for(let n=start;n<=end;n++){
 try{
  const [p,s]=await Promise.all([getJson('https://pokeapi.co/api/v2/pokemon/'+n),getJson('https://pokeapi.co/api/v2/pokemon-species/'+n)]);
  const image=p.sprites?.other?.['official-artwork']?.front_default;
  if(!image)throw Error('Resim yok');
  const imagePath=path.join(out,n+'.png');
  try{const existing=await fs.readFile(imagePath);if(existing.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('invalid')}catch{await fs.writeFile(imagePath,await getPng(image))}
  const name=s.name.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
  const stats=p.stats||[],total=stats.reduce((sum,x)=>sum+x.base_stat,0);
  const top=[...stats].sort((a,b)=>b.base_stat-a.base_stat)[0];
  const power=s.is_legendary||s.is_mythical?Math.max(86,Math.min(98,Math.round(15+(total-180)*83/540))):Math.max(15,Math.min(98,Math.round(15+(total-180)*83/540)));
  const id='pokemon:'+name.toLowerCase();
  const previous=cards[id]||{};
  cards[id]={...previous,name,image:'/images/pokemon/'+n+'.png',description:name+', '+(s.genera?.find(x=>x.language.name==='en')?.genus||'Pokémon')+' türündedir. '+(statTr[top?.stat?.name]||'Yetenekleri')+' öne çıkar; toplam temel istatistiği '+total+'.',power:n===493?100:power,powerStatus:'stats-based',pokedex:n,statsTotal:total,source:'PokéAPI official-artwork'};
  ok++;
 }catch(e){fail.push({number:n,error:e.message})}
 if(n%25===0||n===end)console.log('İlerleme',n,'/',end,'başarılı',ok,'hatalı',fail.length);
}
await fs.writeFile(cardsPath,JSON.stringify(cards,null,2)+'\n');
console.log(JSON.stringify({ok,fail},null,2));
if(fail.length)process.exitCode=1;
