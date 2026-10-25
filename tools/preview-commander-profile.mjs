// Self-contained, offline UI fixture. No account, API, checkout or purchase actions.
// node tools/preview-commander-profile.mjs /tmp/commander-upgrade-preview.html
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {translate} from '../public/crazygames-en.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const index=read('public/index.html');
let section=index.slice(index.indexOf('<section id="commander-profile"'),index.indexOf('<section id="home"'));
section=section.replace(/^(<section[^>]*?) hidden/,'$1');
section=section.replace(/src="([^"]+)"/g,(_,src)=>{
 const local=path.join(root,'public',decodeURIComponent(src));
 if(!fs.existsSync(local))return 'src=""';
 const mime=src.endsWith('.svg')?'image/svg+xml':'image/png';
 return `src="data:${mime};base64,${fs.readFileSync(local).toString('base64')}"`;
});
const staticPhrases=Object.fromEntries([...section.matchAll(/>([^<]+)</g)].map(match=>match[1].trim()).filter(Boolean).map(value=>[value,translate(value)]));
const portrait=fs.readFileSync(path.join(root,'public/images/Kozmik Rünlerin Büyücü Komutanı.png')).toString('base64');
const branchImages=Object.fromEntries(['attack','defense','magic','support'].map(id=>[id,'data:image/svg+xml;base64,'+fs.readFileSync(path.join(root,'public/images/commander-branch-'+id+'.svg')).toString('base64')]));
const sources=['public/commander-ultimate-presentation.js','public/commander-ability-rules.js','public/commander-economy.js','public/commander-profile-view.js','public/commander-exchange-view.js'].map(name=>read(name).replace(/^import .*;\n/gm,'').replace(/\bexport /g,'')).join('\n').replace("art.src='/images/commander-branch-'+branch.id+'.svg';","art.src=offlineBranchImages[branch.id];");
const html=`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Komutan gelişim dalı · yerel önizleme</title><style>${read('public/style.css')}\n${read('public/lobby-chrome.css')}\n${read('public/commander-profile.css')}
body{margin:0;padding:12px;background:#0b111c;font-family:system-ui,sans-serif}.preview-badge{max-width:780px;margin:4px auto 8px;color:#7f8b9d;font-size:9px;letter-spacing:.6px;text-align:center}.preview-toolbar{max-width:540px;margin:18px auto;color:#8c9aae;font-size:11px}.preview-toolbar>summary{min-height:44px;cursor:pointer;padding:12px 0;text-align:center}.preview-options{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}.preview-toolbar select{background:#152030;color:#d4deeb;border:1px solid #536477;border-radius:7px;min-height:44px;padding:8px}.preview-toolbar label{font-size:10px;letter-spacing:0}.preview-toolbar p{font-size:10px;line-height:1.5;text-align:center;color:#7b8b9e}@media(max-width:680px){body{padding:12px 18px}}
</style><div class="preview-badge">YENİ TASLAK · 02 · YAYINLANMADI</div>${section}<details class="preview-toolbar"><summary>Önizleme seçenekleri</summary><div class="preview-options"><label>Dil / Language <select id="preview-language"><option value="tr">Türkçe</option><option value="en">English</option></select></label><label>Örnek seviye <select id="preview-level"><option value="9">9 → 10</option><option value="0">0 → 1</option><option value="19">19 → 20</option><option value="20">20 → 21</option><option value="39">39 → 40</option><option value="40">40 · Tamamlandı</option></select></label></div><p>Örnek hesap. Satın alma veya gerçek hesap işlemi yapılmaz.</p></details><script type="module">const offlineBranchImages=${JSON.stringify(branchImages)};${sources}
const $=id=>document.getElementById(id);let selected='magic';
const translations=${JSON.stringify(staticPhrases)},staticNodes=[];const walker=document.createTreeWalker($('commander-profile'),NodeFilter.SHOW_TEXT);while(walker.nextNode())staticNodes.push([walker.currentNode,walker.currentNode.textContent]);
const profile={commanderId:'magic',levels:{attack:40,defense:6,magic:9,support:3}};
function render(){
 const english=$('preview-language').value==='en';document.documentElement.lang=english?'en':'tr';
 for(const [node,value] of staticNodes)if(node.isConnected)node.textContent=english?(translations[value.trim()]||value):value;
 const stats=commanderAbilityStats(profile);$('commander-profile').dataset.type='magic';$('commander-active-art').dataset.type='magic';
 $('commander-profile-gold').textContent=(18000).toLocaleString(english?'en-US':'tr-TR');$('commander-active-portrait').src='data:image/png;base64,${portrait}';$('commander-active-portrait').alt=english?'Magic commander':'Büyücü komutanı';
 $('commander-active-name').textContent=english?'Magic Commander':'Büyücü Komutanı';$('commander-active-role').textContent=english?'Energy':'Enerji';
 $('commander-level-number').textContent=stats.level;$('commander-active-level').textContent=stats.level+' / 40';$('commander-active-progress').style.width=stats.level/40*100+'%';$('commander-main-progress').setAttribute('aria-valuenow',stats.level);
 $('commander-active-detail').textContent=english?'Every 2 main levels: +1 to each pool per round.':'Her 2 ana seviye: iki doluma da tur başına +1.';
 $('commander-start-energy').textContent=30;$('commander-round-energy').textContent='+'+stats.energyPerRound;$('commander-effect-bonus').textContent='NORMAL +'+stats.level+'%';
 renderCommanderDevelopment($('commander-upgrades'),profile,{branchesRoot:$('commander-branch-nodes'),selected,gold:18000,english,onSelect:id=>{selected=id;render();$('commander-branch-nodes').querySelector('[data-branch="'+id+'"]').focus();},onUpgrade:()=>{$('commander-upgrade-message').textContent=english?'Preview only: no purchase made.':'Yalnız önizleme: satın alma yapılmadı.';}});
 $('commander-command-tree').dataset.selected=selected;
 renderCommanderSkills($('commander-skill-summary'),profile,{english});
 renderCommanderExchange($('commander-exchange-controls'),{policy:null,diamonds:null,gold:18000,english});
}
$('commander-change-open').disabled=true;$('commander-profile-close').disabled=true;
$('preview-level').onchange=()=>{profile.levels.magic=Number($('preview-level').value);render();};$('preview-language').onchange=render;render();
</script></html>`;
const destination=path.resolve(process.argv[2]||'/tmp/commander-upgrade-preview.html');fs.writeFileSync(destination,html);console.log(destination+' ('+Buffer.byteLength(html)+' bytes)');
