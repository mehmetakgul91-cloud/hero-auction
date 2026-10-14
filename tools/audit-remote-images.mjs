import fs from 'node:fs/promises';
const cards=JSON.parse(await fs.readFile(new URL('../public/cards.json',import.meta.url),'utf8'));
const ids=Object.keys(cards).filter(id=>/^(marvel|dc|lotr):/.test(id));
const result={generatedAt:new Date().toISOString(),total:ids.length,verified:[],missing:[],errors:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const context={marvel:/marvel|x-men|spider-man|avengers|comic/i,dc:/dc comics|dc universe|batman|superman|comic/i,lotr:/tolkien|middle-earth|lord of the rings|silmarillion|hobbit/i};
for(let i=0;i<ids.length;i++){
 const id=ids[i],universe=id.split(':')[0],name=cards[id]?.name||id.slice(universe.length+1);
 const suffixes={marvel:['',' (Marvel Comics)',' (Marvel Comics character)',' (comics)'],dc:['',' (DC Comics)',' (DC Comics character)',' (comics)'],lotr:['',' (Middle-earth)',' (The Lord of the Rings)']};
 let found=null,hadError=false;
 for(const suffix of suffixes[universe]){
  try{
   const url='https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent((name+suffix).replaceAll(' ','_'));
   const r=await fetch(url,{headers:{'User-Agent':'HeroAuctionImageAudit/1.0 (https://github.com/mehmetakgul91-cloud/hero-auction)'},signal:AbortSignal.timeout(12000)});
   if(r.status===429||r.status===503){hadError=true;await pause(12000);continue;}
   if(!r.ok)continue;
   const j=await r.json();if(j.type==='disambiguation')continue;
   const title=String(j.title||'').toLowerCase(),base=name.toLowerCase();
   if(title!==base&&!title.startsWith(base+' ('))continue;
   if(!context[universe].test((j.description||'')+' '+(j.extract||'').slice(0,350)))continue;
   if(j.thumbnail?.source){found={id,name,url:j.thumbnail.source,source:j.content_urls?.desktop?.page||null};break;}
  }catch(e){hadError=true;}
  await pause(500);
 }
 if(found)result.verified.push(found);else if(hadError)result.errors.push({id,name,reason:'API request failure or rate limit'});else result.missing.push({id,name});
 console.log((i+1)+'/'+ids.length+' '+id+' '+(found?'IMAGE':hadError?'ERROR':'MISSING'));
 await pause(1000);
}
await fs.writeFile(new URL('./remote-image-audit.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log('RESULT '+JSON.stringify({total:result.total,withImage:result.verified.length,withoutImage:result.missing.length,errors:result.errors.length}));
