import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cards=JSON.parse(await fs.readFile(path.join(root,'public/cards.json'),'utf8'));
const manifest=JSON.parse(await fs.readFile(path.join(root,'tools/offline-art-manifest.json'),'utf8'));
const errors=[];
const approved=[];
const supported=new Set(['CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','Public Domain']);
for(const [id,entry] of Object.entries(manifest)){
 if(!/^(marvel|dc|lotr):/.test(id)||!cards[id])errors.push(id+': unknown card');
 if(!entry||entry.approved!==true)continue;
 if(!supported.has(entry.license))errors.push(id+': unsupported license');
 if(!entry.attribution?.trim())errors.push(id+': missing attribution');
 try{
  const page=new URL(entry.sourcePage);
  const image=new URL(entry.downloadUrl);
  if(page.protocol!=='https:'||page.hostname!=='commons.wikimedia.org'||!page.pathname.startsWith('/wiki/File:'))errors.push(id+': invalid Commons file page');
  if(image.protocol!=='https:'||image.hostname!=='upload.wikimedia.org')errors.push(id+': invalid download host');
 }catch{errors.push(id+': invalid URL')}
 approved.push(id);
}
const counts={};
for(const universe of ['marvel','dc','lotr']){
 const ids=Object.keys(cards).filter(id=>id.startsWith(universe+':'));
 let ready=0;
 for(const id of ids){
  const art=cards[id].image;
  if(!art||!art.startsWith('/images/'))continue;
  const filename=path.resolve(root,'public',art.slice(1));
  if(!filename.startsWith(path.join(root,'public','images')+path.sep)){errors.push(id+': image path outside images');continue}
  try{const stat=await fs.stat(filename);if(stat.isFile()&&stat.size>100)ready++}catch{errors.push(id+': image path missing')}
 }
 counts[universe]={cards:ids.length,localImages:ready,remaining:ids.length-ready};
}
console.log(JSON.stringify({counts,approvedManifestEntries:approved.length,errors},null,2));
if(errors.length||process.argv.includes('--strict')&&Object.values(counts).some(x=>x.remaining))process.exitCode=1;
