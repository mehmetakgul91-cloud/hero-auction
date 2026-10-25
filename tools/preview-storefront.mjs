// Offline fixture built from the shipped store markup, styling and controller.
// No live account/API, payment, ad, database or reward activation is performed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const index=read('public/index.html');
const panel=index.slice(index.indexOf('<section id="store-panel"'),index.indexOf('<section id="friends-panel"'));
let nav=index.slice(index.indexOf('<nav class="home-quick-nav"'),index.indexOf('</nav>',index.indexOf('<nav class="home-quick-nav"'))+6);
nav=nav.replace(/src="([^"]+)"/g,(_,src)=>{const file=path.join(root,'public',decodeURIComponent(src));const mime=src.endsWith('.svg')?'image/svg+xml':src.endsWith('.webp')?'image/webp':'image/png';return `src="data:${mime};base64,${fs.readFileSync(file).toString('base64')}"`});
const sources=['public/wallet-operations.js','public/commander-exchange-view.js','public/storefront.js'].map(name=>read(name).replace(/^import .*;\n/gm,'').replace(/\bexport /g,'')).join('\n');
const css=['public/style.css','public/lobby-chrome.css','public/friends.css','public/storefront.css'].map(read).join('\n');
const fixture=`
const memory=new Map(),events={},el=id=>document.getElementById(id);
const rewards=[100,150,200,250,300,400,0].map((gold,i)=>({day:i+1,gold,diamonds:i===6?5:0}));
let data,day=1,sequence=0;const account={type:'google',authToken:'offline-example',user:{sub:'offline-example',provider:'google'}};
function snapshot(mode){
 day=mode==='day6'?6:mode==='day7'||mode==='claimed'?7:1;
 const active=!['off','guest','unavailable'].includes(mode),claimed=mode==='claimed';
 return {gold:1200,diamonds:mode==='off'?null:15,diamondsEnabled:mode!=='off',purchase:{available:false},rewardedAds:{enabled:false},exchange:{enabled:active,available:active,rate:500,pricingVersion:'diamonds-to-gold-500-v1'},loginRewards:{enabled:mode!=='off',available:active&&!claimed,eligible:mode!=='guest',serverDay:'2026-10-25',timezone:'Europe/Istanbul',claimedToday:claimed,nextDay:day,completedDay:claimed?7:day-1,rewards,receipt:claimed?{day:7,gold:0,diamonds:5,rewardDate:'2026-10-25'}:null}};
}
const fetch=async(path,options)=>{
 const request=JSON.parse(options.body||'{}');
 if(path==='/api/store/status')return {ok:true,json:async()=>structuredClone(data)};
 if(path==='/api/login-rewards/claim'){
  const reward=rewards[day-1],receipt={...reward,rewardDate:request.rewardDate};
  data.gold+=reward.gold;data.diamonds+=reward.diamonds;data.loginRewards={...data.loginRewards,claimedToday:true,available:false,completedDay:day,receipt};
  return {ok:true,json:async()=>({gold:data.gold,diamonds:data.diamonds,receipt,loginRewards:structuredClone(data.loginRewards)})};
 }
 if(path==='/api/diamonds/exchange'){
  data.diamonds-=request.diamondsToSpend;data.gold+=request.diamondsToSpend*500;
  return {ok:true,json:async()=>({gold:data.gold,diamonds:data.diamonds,diamondsSpent:request.diamondsToSpend,goldGranted:request.diamondsToSpend*500,exchange:data.exchange})};
 }
 throw Error('Offline fixture: no route');
};
const environment={fetch,confirm:text=>window.confirm('YALNIZ ÖRNEK — GERÇEK İŞLEM YOK\\n\\n'+text),crypto:{randomUUID:()=> 'offline-store-request-'+(++sequence)},sessionStorage:{getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)},addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name]};
const store=createStorefront({document,window:environment});
function select(){memory.clear();data=snapshot(el('preview-state').value);store.setLogin(null);store.setLogin(account);store.open();}
for(const item of document.querySelectorAll('.home-quick-nav .quick-nav-item'))if(item.id!=='home-store-tab')item.addEventListener('click',event=>{event.preventDefault();store.close();el('preview-help').textContent='Bu dosyada yalnız mağaza önizlenir. Mağaza düğmesiyle geri dönebilirsin.'});
el('preview-state').onchange=select;select();
`;
const html=`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none';"><title>Hero Auction · Mağaza ve 7 günlük ödüller · Çevrimdışı önizleme</title><style>${css}
[hidden]{display:none!important}body{margin:0;padding:12px 12px 30px;background:#09111f}.shell{max-width:850px;margin:auto;padding:0}.preview-top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 3px 14px;color:#8ca3c0;font:10px system-ui}.preview-top strong{font-size:14px;color:#b1daf2;letter-spacing:1px}.preview-top span{font-size:9px;text-align:right}.preview-settings{max-width:850px;margin:0 auto 10px;border:1px solid #334c69;border-radius:9px;padding:0 12px;background:#132238;color:#a1b4cf;font:11px/1.6 system-ui}.preview-settings summary{min-height:44px;display:flex;align-items:center;cursor:pointer}.preview-settings label{font-size:10px;letter-spacing:0;color:#bdcce1;margin:0}.preview-settings select{display:block;width:100%;min-height:44px;background:#1b3048;color:#e8edf8;border:1px solid #60728c;border-radius:8px;padding:8px;margin-top:6px}.preview-settings p{font-size:10px;color:#93a8c5;margin:9px 0 12px}.preview-footer{font-size:10px;color:#7d93af;text-align:center;line-height:1.6;margin:10px 0}.cinema-home{padding:0!important}
</style></head><body><main class="shell"><header class="preview-top"><strong>HERO AUCTION</strong><span>ÇEVRİMDIŞI MAĞAZA ÖNİZLEMESİ<br>Gerçek işlem veya ödül yok</span></header><details class="preview-settings"><summary>Önizleme seçenekleri · yalnız örnek veriler</summary><label for="preview-state">Durum seç<select id="preview-state"><option value="off">Varsayılan · bütün özellikler kapalı</option><option value="day1">Örnek · 1. gün / 100 altın</option><option value="day6">Örnek · 6. gün / 400 altın</option><option value="day7">Örnek · 7. gün / 5 elmas</option><option value="claimed">Örnek · 7. gün ödülü alınmış</option><option value="guest">Örnek · misafir / uygun değil</option><option value="unavailable">Örnek · altyapı kullanılamıyor</option></select></label><p>Aktif durumlar yalnız tasarım ve kontrol örneğidir; canlı ödüller açılmaz. Reklam ve satın alma hiçbir durumda çalışmaz. Dönüşüm ve ödül düğmeleri yalnız bu dosyadaki örnek sayıları değiştirir.</p></details><section id="home" class="cinema-home">${nav}${panel}</section><p id="preview-help" class="preview-footer">Google yeni üyelik hediyesi ayrı bir özelliktir: yalnız uygun yeni hesaplara bir kez 10 elmas. Bu haftalık serinin 7. gün ödülü 5 elmastır.</p></main><script type="module">${sources}\n${fixture}</script></body></html>`;
const destination=path.resolve(process.argv[2]||'/tmp/hero-auction-store-preview.html');fs.writeFileSync(destination,html);console.log(destination+' ('+Buffer.byteLength(html)+' bytes)');
