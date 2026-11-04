import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const heroes=JSON.parse(fs.readFileSync(path.join(root,'battle-roster.json'),'utf8')).characters;
const counts={total:heroes.length,withImage:0,withAbilities:0,reviewedPower:0};
const problems=[],ids=new Set();
for(const hero of heroes){
 if(!hero.id.startsWith('original:')||ids.has(hero.id))problems.push(`${hero.id}: geçersiz veya yinelenen kimlik`);
 ids.add(hero.id);
 if(hero.active?.name?.trim()&&hero.passive?.name?.trim())counts.withAbilities++;
 else problems.push(`${hero.id}: aktif/pasif yetenek eksik`);
 if(Number.isInteger(hero.proposedPower)&&hero.proposedPower>=1&&hero.proposedPower<=100)counts.reviewedPower++;
 else problems.push(`${hero.id}: geçersiz güç`);
 const image=hero.portrait;
 if(typeof image==='string'&&/^\/images\/original\/[\w-]+\.(png|jpg|jpeg|webp|svg)$/i.test(image)&&fs.existsSync(path.join(root,'public',image.slice(1))))counts.withImage++;
 else problems.push(`${hero.id}: yerel resim eksik`);
}
console.log(JSON.stringify({counts,problems,note:'Aktif özgün kahraman havuzu.'},null,2));
if(process.argv.includes('--strict')&&problems.length)process.exit(1);
