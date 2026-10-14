import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cards=JSON.parse(fs.readFileSync(path.join(root,'public/cards.json'),'utf8'));
const universes=['marvel','dc','lotr'];
const rows=[['universe','id','name','image_status','image_path','source_url','license','attribution']];
for(const [id,card] of Object.entries(cards)){
 const universe=id.split(':',1)[0];
 if(!universes.includes(universe))continue;
 const local=card.image&&card.image.startsWith('/images/')&&fs.existsSync(path.join(root,'public',card.image.slice(1)));
 rows.push([universe,id,card.name||id.slice(universe.length+1),local?'ready':'needs-licensed-image',card.image||'','','','']);
}
const escape=value=>'"'+String(value).replaceAll('"','""')+'"';
const csv=rows.map(row=>row.map(escape).join(',')).join('\n')+'\n';
const target=path.join(root,'tools','offline-art-inventory.csv');
fs.writeFileSync(target,csv);
const missing=rows.slice(1).filter(r=>r[3]!=='ready');
console.log('Total non-Pokemon:',rows.length-1,'Missing licensed local art:',missing.length);
if(process.argv.includes('--strict')&&missing.length)process.exitCode=1;
