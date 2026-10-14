import fs from 'node:fs/promises';
const cards=JSON.parse(await fs.readFile(new URL('../public/cards.json',import.meta.url),'utf8'));
const ids=Object.keys(cards).filter(x=>x.startsWith('marvel:'));
const output={generatedAt:new Date().toISOString(),scanVersion:2,candidates:{},unmatched:[],errors:{}};
const aliases={'spider-man':['spiderman','spider man'],'iron man':['ironman'],'scarlet witch':['wanda maximoff'],'black widow':['natasha romanoff'],'captain america':['steve rogers'],'winter soldier':['bucky barnes'],'doctor strange':['dr strange'],'star-lord':['star lord'],'ant-man':['ant man'],'ms. marvel':['kamala khan'],'she-hulk':['she hulk'],'moon knight':['moonknight'],'silver surfer':['silver surfer marvel'],'the wasp':['wasp marvel'],'falcon':['sam wilson marvel']};
const allowed=/^(CC0|CC BY 4\.0|CC BY-SA 4\.0|Public domain)$/i;
function clean(x){return String(x??'').replace(/<[^>]*>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim()}
async function search(query){
 const url=new URL('https://commons.wikimedia.org/w/api.php');
 url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'15',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'700',format:'json',origin:'*'}).toString();
 const r=await fetch(url,{headers:{'User-Agent':'HeroAuctionArtResearch/1.0 (GitHub project; image license research)'},signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error('Commons HTTP '+r.status);
 const j=await r.json();
 return Object.values(j.query?.pages??{}).flatMap(p=>{
  const info=p.imageinfo?.[0],meta=info?.extmetadata??{};
  const license=clean(meta.LicenseShortName?.value),author=clean(meta.Artist?.value);
  const page=info?.descriptionurl;
  if(!info?.url||!page||!allowed.test(license)||!author)return [];
  if(!/\.(jpg|jpeg|png|webp)$/i.test(info.url.split('?')[0]))return [];
  return [{title:p.title,sourcePage:page,downloadUrl:info.thumburl??info.url,license,attribution:author,licenseUrl:meta.LicenseUrl?.value??'',approved:false,reviewNote:'Candidate only: visually verify exact character/costume and underlying rights before approval'}];
 });
}
for(const [index,id] of ids.entries()){
 const name=id.slice(7);
 const queries=[`"${name}" cosplay`,`${name} Marvel costume`,...(aliases[name]??[]).map(x=>`"${x}" cosplay`)];
 const all=[];
 for(const q of queries){try{all.push(...await search(q))}catch(e){(output.errors[id]??=[]).push(q+': '+e.message)}await new Promise(r=>setTimeout(r,160))}
 const seen=new Set();const candidates=all.filter(x=>{if(seen.has(x.sourcePage))return false;seen.add(x.sourcePage);return true}).slice(0,25);
 if(candidates.length)output.candidates[id]=candidates;else output.unmatched.push(id);
 console.log((index+1)+'/'+ids.length+' '+id+' '+(output.candidates[id]?.length??0));
 await new Promise(r=>setTimeout(r,250));
}
await fs.writeFile(new URL('./marvel-art-candidates.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log('Finished: '+Object.keys(output.candidates).length+' with candidates; '+output.unmatched.length+' unmatched; '+Object.keys(output.errors).length+' request errors');
