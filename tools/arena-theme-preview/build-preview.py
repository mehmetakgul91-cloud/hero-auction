from pathlib import Path
from lxml import html, etree
import base64,json,mimetypes,re,hashlib
ROOT=Path(__file__).resolve().parents[2]; PUB=ROOT/'public'; OUT=ROOT/'artifacts/arena-themes'
samples=json.loads((OUT/'sample-markup.json').read_text()); source=html.fromstring((PUB/'battle-preview.html').read_text())
def get(id):return source.get_element_by_id(id)
def show(id):get(id).attrib.pop('hidden',None)
def replace(id,markup):
 e=get(id); e.text=None
 for c in list(e):e.remove(c)
 for c in html.fragments_fromstring(markup):e.append(c)
for script in source.xpath('//script'):script.getparent().remove(script)
for e in source.xpath('//main[contains(@class,"shell")]/*'):
 if e.get('id') not in ['arena-music-toggle','arena-score','battle-arena','arena-commander-matchup','experimental-commander-controls'] and 'arena-room-nav' not in e.get('class','') and e.get('class')!='controls':e.set('hidden','')
for id in ['arena-score','battle-arena','arena-commander-matchup','experimental-commander-controls']:show(id)
get('arena-score').set('aria-label','Örnek savaş göstergeleri')
for id,t in [('team-hp-a-label','380 / 500 HP'),('team-hp-b-label','380 / 500 HP'),('arena-live-seconds','01:23'),('round','4')]:get(id).text=t
get('team-hp-a-fill').set('style','width:76%');get('team-hp-b-fill').set('style','width:76%')
for e in source.xpath('//*[@data-energy]'):e.text='60 / 100'
for e in source.xpath('//*[@data-ultimate-energy]'):e.text='70 / 100'
for e in source.xpath('//*[@data-energy-fill]'):e.set('style','width:60%')
for e in source.xpath('//*[@data-ultimate-energy-fill]'):e.set('style','width:70%')
for e in source.xpath('//*[@data-live-cooldown]'):e.text='Görsel önizleme · Beceriler çalışmaz'
for e in source.xpath('//*[@data-status]'):e.text='Örnek savaş durumu'
get('message').text='Örnek savaş · Arka planlar dışında oyun değişmez.'
for e in source.xpath('//button'):e.set('disabled','')
for id,kind,name in [('arena-commander-left','attack','Saldırı'),('arena-commander-right','defense','Savunma')]:
 e=get(id);e.set('class','arena-commander-card '+('blue' if id.endswith('left') else 'red'))
 replace(id,f'<img class="arena-commander-portrait" src="/images/commander-{kind}.svg" alt="{name} komutanı"><span class="arena-commander-details"><strong>{name} · Sv. 10</strong><small>Örnek komutan</small></span>')
dock=etree.Element('div',id='arena-commander-dock',attrib={'class':'arena-commander-dock','aria-label':'Komutan kontrol paneli'})
get('battle-arena').addnext(dock);dock.append(get('arena-commander-matchup'));dock.append(get('experimental-commander-controls'))
for a in source.xpath('//a'):a.attrib.pop('href',None);a.set('aria-disabled','true')
assets={};manifest=[]
def embedded(path):
 path=path.split('?')[0].lstrip('/'); key='asset'+str(len(assets))
 existing=next((k for k,v in assets.items() if v['path']==path),None)
 if existing:return '__ARENA_ASSET_'+existing+'__'
 data=(PUB/path).read_bytes();mime=mimetypes.guess_type(path)[0] or 'application/octet-stream'
 assets[key]={'path':path,'uri':'data:'+mime+';base64,'+base64.b64encode(data).decode()};manifest.append({'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
 return '__ARENA_ASSET_'+key+'__'
styles=[]
for e in source.xpath('//head/link[@rel="stylesheet"]|//head/style'):
 css=(PUB/e.get('href').split('?')[0].lstrip('/')).read_text() if e.tag=='link' else e.text or ''
 css=re.sub(r'url\([\'\"]?(/[^)\'\"]+)[\'\"]?\)',lambda m:'url("'+embedded(m[1])+'")',css)
 styles.append(css)
body=source.find('body');body.set('class','arena-room arena-fit')
for e in body.xpath('.//img[@src]'):e.set('src',embedded(e.get('src')))
bodies={}
for layout,sample in samples.items():
 for id,markup in zip(['team-a','team-b'],sample['teams']):
  replace(id,markup);get(id).set('style','--arena-row-count:'+str(sample['rows']))
  for e in get(id).xpath('.//img[@src]'):e.set('src',embedded(e.get('src')))
 bodies[layout]=''.join(etree.tostring(e,encoding='unicode',method='html') for e in body)
labels=[['courtyard','Çin esintili avlu'],['savanna','Afrika savanası'],['fjord','Viking taş arenası'],['ruins','Orman harabeleri'],['space','Uzay platformu']]
payload={'styles':'\n'.join(styles),'bodies':bodies,'themes':labels,'assets':{k:v['uri'] for k,v in assets.items()}}
outer='''<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src 'self' data:; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'"><title>Hero Auction · Beş Arena Teması Önizlemesi</title><style>*{box-sizing:border-box}body{margin:0;background:#e5e9e4;color:#203047;font:15px/1.5 system-ui,sans-serif}.review-header,.review-footer{max-width:1180px;margin:auto;padding:24px 18px}.review-header small{font-size:11px;letter-spacing:.14em;color:#626c69}.review-header h1{font-size:clamp(24px,4vw,38px);line-height:1.15;margin:8px 0}.review-header p{margin:8px 0;color:#536171;max-width:850px}.review-controls{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.review-controls button{font:600 13px system-ui;min-height:44px;padding:10px 14px;color:#203047;background:#f1f2ee;border:1px solid #aebdb9;border-radius:10px;cursor:pointer}.review-controls button[aria-pressed="true"]{background:#d7b97d;border-color:#9f8147}.review-controls button:focus-visible{outline:3px solid #28627f;outline-offset:2px}.review-label{font-size:12px;color:#586676}.review-stage{padding:0 10px;overflow-x:auto}.review-frame-wrap{max-width:1150px;margin:auto;border:1px solid #aebbb7;border-radius:16px;overflow:hidden;background:#eeefeb}.review-frame-wrap iframe{display:block;width:100%;height:760px;border:0}.review-footer{font-size:12px;color:#586676}.review-footer strong{color:#203047}</style></head><body><header class="review-header"><small>HERO AUCTION · YEREL TASARIM ÖNİZLEMESİ</small><h1>Her savaş için farklı bir atmosfer.</h1><p>Beş hafif ve sabit sahne. Gerçek arena düzeni ve kahraman görselleri korunur; iki oyuncu maç boyunca aynı arka planı görür. Yeni maçta tekrar seçilir.</p><div id="themes" class="review-controls" aria-label="Arena temasını seç"></div><div class="review-controls" id="views" aria-label="Önizleme boyutu"><button data-width="1150" aria-pressed="true">Masaüstü</button><button data-width="390" aria-pressed="false">Mobil 390</button><button data-width="320" aria-pressed="false">Dar 320</button><button data-width="844" aria-pressed="false">Yatay 844</button></div><div class="review-controls" id="formations" aria-label="Örnek diziliş"><button data-layout="normal" aria-pressed="true">2 ön / 3 arka saf</button><button data-layout="all-front" aria-pressed="false">5 ön saf</button></div><p class="review-label" id="current">Çin esintili avlu</p></header><main class="review-stage"><div class="review-frame-wrap" id="wrap"><iframe id="arena-preview" title="Hero Auction · Örnek arena" sandbox="allow-scripts"></iframe></div></main><footer class="review-footer"><strong>Yayımlanmadı. Hesap, maç veya ödeme işlemi yapmaz.</strong><br>Üretim HTML/CSS ve kahraman oluşturucusundan çevrimdışı örnek durum. Can ve kalkan sayıları örnektir. Görseller kaynak SVG olarak kontrol edildi; bu dosya gerçek tarayıcı/saha testi veya ekran görüntüsü kanıtı değildir.<br>Kaynak: main da0688e4 · 26 Ekim 2026.</footer><script id="preview-data" type="application/json">__PAYLOAD__</script><script>const data=JSON.parse(document.getElementById('preview-data').textContent);let theme='courtyard',layout='normal',width=1150;const frame=document.getElementById('arena-preview');const hydrate=s=>s.replace(/__ARENA_ASSET_(asset\\d+)__/g,(_,k)=>data.assets[k]);function render(){const title=data.themes.find(x=>x[0]===theme)[1];document.getElementById('current').textContent=title+' · Örnek durum';const height=width===844?390:760;document.getElementById('wrap').style.width=width+'px';document.getElementById('wrap').style.maxWidth=width===1150?'100%':'none';frame.style.height=height+'px';const body=hydrate(data.bodies[layout]).replace('id="battle-arena"','id="battle-arena" data-arena-theme="'+theme+'" aria-label="'+title+'"');frame.srcdoc='<!doctype html><html lang="tr" style="--arena-viewport-height:'+height+'px"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \\'none\\'; img-src data:; style-src \\'unsafe-inline\\'; script-src \\'none\\'; connect-src \\'none\\'; form-action \\'none\\'; base-uri \\'none\\'; object-src \\'none\\'"><style>'+hydrate(data.styles)+'</style></head><body class="arena-room arena-fit">'+body+'</body></html>';frame.title='Hero Auction · '+title;}for(const [id,label]of data.themes){const b=document.createElement('button');b.textContent=label;b.type='button';b.dataset.theme=id;b.setAttribute('aria-pressed',String(id===theme));b.onclick=()=>{theme=id;document.querySelectorAll('[data-theme]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.theme===id)));render()};document.getElementById('themes').append(b)}document.querySelectorAll('[data-width]').forEach(b=>b.onclick=()=>{width=Number(b.dataset.width);document.querySelectorAll('[data-width]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render()});document.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>{layout=b.dataset.layout;document.querySelectorAll('[data-layout]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render()});render();</script></body></html>'''
outer=outer.replace('__PAYLOAD__',json.dumps(payload,ensure_ascii=False).replace('</','<\\/'))
path=OUT/'Hero-Auction-Bes-Arena-Temasi-Onizleme.html';path.write_text(outer)
(OUT/'preview-manifest.json').write_text(json.dumps({'file':path.name,'bytes':path.stat().st_size,'themes':labels,'sampleSource':'production createArenaTeamRenderer','browserQA':False,'sourceArtworkQA':'five SVGs rendered by Inkscape and visually inspected','assets':manifest},ensure_ascii=False,indent=2))
# Syntax-check the real preview script without executing a browser or game.
script=outer.rsplit('<script>',1)[1].split('</script>',1)[0];(OUT/'preview-runtime.js').write_text(script)
print(path, path.stat().st_size)
