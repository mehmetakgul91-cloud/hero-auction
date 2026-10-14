import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cards=JSON.parse(fs.readFileSync(path.join(root,'public/cards.json'),'utf8'));
const problems=[];const counts={total:0,withImage:0,withDescription:0,reviewedPower:0,missingImage:0,provisionalPower:0};
for(const [id,c] of Object.entries(cards)){
 counts.total++;
 if(typeof c.description==='string'&&c.description.trim().length>20)counts.withDescription++;else problems.push(`${id}: Türkçe açıklama eksik`);
 if(Number.isInteger(c.power)&&c.power>=1&&c.power<=100&&c.powerStatus!=='provisional-needs-editorial-review')counts.reviewedPower++;
 else {counts.provisionalPower++;problems.push(`${id}: güç puanı onaysız`)}
 if(c.image&&/^\/images\/[\w/-]+\.(png|jpg|jpeg|webp|svg)$/i.test(c.image)&&fs.existsSync(path.join(root,'public',c.image.slice(1))))counts.withImage++;
 else {counts.missingImage++;problems.push(`${id}: yerel resim eksik`)}
}
console.log(JSON.stringify({counts,problems:problems.slice(0,30),note:'Bu denetim yalnızca cards.json kayıtlarını sayar.'},null,2));
if(process.argv.includes('--strict')&&problems.length)process.exit(1);
