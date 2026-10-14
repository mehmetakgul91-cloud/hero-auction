import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cards=JSON.parse(fs.readFileSync(path.join(root,'public/cards.json'),'utf8'));
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const match=server.match(/const words=\{([\s\S]*?)\n\};/);
if(!match)throw Error('Sunucu karakter havuzu bulunamadı');
const universes=['marvel','dc','lotr'];
const report={};
for(const universe of universes){
 const line=match[1].match(new RegExp('\\b'+universe+":'([^']*)'"));
 if(!line)throw Error(universe+' karakter listesi bulunamadı');
 const names=line[1].split(',').map(x=>x.trim()).filter(Boolean);
 const missingRecords=[],missingDescriptions=[],missingImages=[],missingPower=[];
 for(const name of names){
  const key=universe+':'+name.toLowerCase();
  const card=cards[key];
  if(!card){missingRecords.push(name);continue}
  if(!card.description?.trim())missingDescriptions.push(name);
  if(!card.image||!fs.existsSync(path.join(root,'public',card.image.replace(/^\//,''))))missingImages.push(name);
  if(!Number.isInteger(card.power)||card.power<1||card.power>100)missingPower.push(name);
 }
 report[universe]={total:names.length,archived:names.length-missingRecords.length,missingRecords,missingDescriptions,missingImages,missingPower};
}
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--strict')&&Object.values(report).some(r=>r.missingRecords.length||r.missingDescriptions.length||r.missingImages.length||r.missingPower.length))process.exitCode=1;
