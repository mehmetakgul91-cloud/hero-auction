"""Honest offline SVG compositions, not browser screenshots.
Reads production renderer metadata; static CSS dimensions are documented below.
Run render-samples.mjs first, then this script and Inkscape. No network/game calls.
"""
from pathlib import Path
import json, html, re
import xml.etree.ElementTree as ET
from PIL import Image, ImageFont
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/forest-premium'; OUT.mkdir(parents=True,exist_ok=True)
samples=json.loads((ROOT/'artifacts/arena-themes/sample-markup.json').read_text())
def text(x,y,s,size=14,color='#203047',weight=400,anchor='start'):
 return f'<text x="{x}" y="{y}" font-family="DejaVu Sans,sans-serif" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{html.escape(s)}</text>'
def rect(x,y,w,h,fill,rx=0,extra=''):
 return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" {extra}/>'
def board(theme,w,h,layout='normal',prefix='a'):
 # Fitted CSS: 2px arena border,4px arena padding,4px team gap,
 # 3px side padding,2 columns,60 equal tracks per independent lane,84x90 max card.
 # SVG approximation cannot prove CSS/browser layout or interactive behaviour.
 p=[f'<defs><clipPath id="{prefix}board"><rect width="{w}" height="{h}" rx="14"/></clipPath></defs>',f'<g clip-path="url(#{prefix}board)">']
 sourcew,sourceh=1024,1536; scale=max(w/sourcew,h/sourceh); aw,ah=sourcew*scale,sourceh*scale; offset=.5 if w<=600 else .18
 p.append(f'<image href="{(OUT/"forest-web-delivery.png").as_uri()}" x="{(w-aw)/2}" y="{(h-ah)*offset}" width="{aw}" height="{ah}"/>')
 sw=(w-12-4)/2
 for side in range(2):
  sx=6+side*(sw+4)
  edge='#75b9d6' if side==0 else '#dd9299'
  p.append(f'<defs><linearGradient id="{prefix}edge{side}" x1="{side}" x2="{1-side}"><stop stop-color="{edge}" stop-opacity=".10"/><stop offset=".24" stop-color="{edge}" stop-opacity="0"/></linearGradient></defs>')
  p.append(rect(sx,6,sw,h-12,f'url(#{prefix}edge{side})'))
  # Existing single blue divider; blue solid/red dashed static cues, not new box geometry.
  p.append(f'<path d="M{sx if side==0 else sx+sw} 6V{h-6}" stroke="{edge}" stroke-width="2" opacity=".55" '+('stroke-dasharray="5 4"' if side else '')+'/>')
  teamw=sw-6-(1 if side==0 else 0); teamh=h-18; cw=(teamw-3)/2
  for i,card in enumerate(ET.fromstring('<root>'+re.sub(r'<img([^>]*)>',r'<img\1/>',samples[layout]['teams'][side])+'</root>')):
   style=card.attrib['style']; col=int(re.search('grid-column:(\\d+)',style)[1]); track=re.search('--arena-fitted-row:(\\d+) / span (\\d+)',style);start,span=map(int,track.groups()); cx=sx+3+(col-1)*(cw+3)+cw/2; cy=9+(start-1+span/2)/60*teamh
   ch=min(90,span/60*teamh-3);cardw=min(84,cw);ps=min(70,cardw,ch-26);top=cy-ch/2;px=cx-ps/2;py=top
   portrait=card[0]; img=portrait.find('img'); path=ROOT/'public'/img.attrib['src'].lstrip('/'); iw,ih=Image.open(path).size
   if path.suffix=='.webp':
    # Lossless format conversion only: Inkscape's decoder here lacks WebP.
    png=OUT/'hero-art-png'/path.with_suffix('.png').name;png.parent.mkdir(exist_ok=True)
    if not png.exists():Image.open(path).save(png)
    path=png
   # Actual object-fit: cover; wide images use right center, portrait images center 25%.
   scale=max(ps/iw,ps/ih); dw,dh=iw*scale,ih*scale; ix=px+(ps-dw)*(1 if iw>ih else .5); iy=py+(ps-dh)*(.5 if iw>ih else .25)
   clip=f'{prefix}p{side}{i}';p.append(f'<defs><clipPath id="{clip}"><rect x="{px}" y="{py}" width="{ps}" height="{ps}" rx="8"/></clipPath></defs>')
   p.append(rect(px,py,ps,ps,'#102e4e',8));p.append(f'<image href="{path.as_uri()}" x="{ix}" y="{iy}" width="{dw}" height="{dh}" clip-path="url(#{clip})"/>')
   p.append(rect(px,py,ps,ps,'none',8,f'stroke="{edge}" stroke-width="2"'))
   rarity='#ffca50' if portrait.attrib['data-rarity']=='legendary' else '#b56bff'
   p.append(rect(px+3,py+3,ps-6,ps-6,'none',6,f'stroke="{rarity}" stroke-width="2"'))
   bw=max(10,min(18,ps*.35));bh=bw*8/9;by=py+ps-bh-2
   p.append(rect(cx-bw/2,by,bw,bh,'#080e20',4,f'stroke="{rarity}"'))
   badge=portrait.find('span/svg/path').attrib['d'];p.append(f'<path d="{badge}" transform="translate({cx-bw*.425} {by+bh*.075}) scale({bw*.85/24} {bh*.85/24})" stroke="{rarity}" stroke-width="2" fill="none"/>')
   ly=top+ch-24;name=card[1].text
   # Match CSS nowrap ellipsis conservatively at 10px; exact font rasterization is browser-dependent.
   font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',10)
   if font.getlength(name)>cardw:
    while name and font.getlength(name+'…')>cardw:name=name[:-1]
    name+='…'
   p.append(rect(cx-cardw/2,ly,cardw,11,'#17212b',3,'fill-opacity=".902"'));p.append(text(cx,ly+9,name,10,'#e7edf1',900,'middle'))
   barw=min(64,cardw); hp=float(re.search('width:([\\d.]+)%',card[2][0].attrib['style'])[1]);shield=float(re.search('width:([\\d.]+)%',card[3][0].attrib['style'])[1]);
   p += [rect(cx-barw/2,ly+13,barw,5,'#38445d',2),rect(cx-barw/2,ly+13,barw*hp/100,5,'#35e4a1',2),rect(cx-barw/2,ly+20,barw,4,'#22354a',2),rect(cx-barw/2,ly+20,barw*shield/100,4,'#69b9f3',2)]
 p += [f'<circle cx="{w/2}" cy="{h/2}" r="{13.5 if w<600 else 19}" fill="#303a3f" stroke="#aaac93"/>',text(w/2,h/2+4,'VS',10 if w<600 else 15,'#f0e7cd',700,'middle'),'</g>',rect(1,1,w-2,h-2,'none',14,'stroke="#84918b" stroke-width="2"')]
 return ''.join(p)
def doc(w,h,body): return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>'

for filename,w,h in [('01-Onayli-Orman-Kahramanli-Mobil',390,692),('02-Onayli-Orman-Kahramanli-Masaustu',1018,660)]:
 mobile=w==390;aw,ah=(378,530) if mobile else (990,530);bx=6 if mobile else 14;by=97 if mobile else 70
 b=rect(0,0,w,h,'#e8eae3')+text(14,25,'Orman arenası · kahramanlı önizleme',17 if mobile else 22,weight=700)
 b+=text(14,46,'Onayladığınız görsel; yeniden çizim veya renk filtresi yok.',10 if mobile else 12)
 if mobile:
  b+=text(14,65,'390 px mobil alan · güncel eşit aralıklı takım dizilimi',10)+text(14,87,'MAVİ TAKIM',10,'#28627f',700)+text(376,87,'KIRMIZI TAKIM',10,'#973b59',700,'end')
 b+=f'<g transform="translate({bx} {by})">{board("ruins",aw,ah,prefix=filename[:2])}</g>'
 fy=649 if mobile else 625
 b+=text(14,fy,'Gerçek kahraman görselleri · örnek can ve kalkan',10 if mobile else 12)+text(14,fy+17,'Yerleşim maketi; tarayıcı ekran görüntüsü değildir.',9 if mobile else 12)+text(14,fy+32,'Henüz canlıya uygulanmadı.',9 if mobile else 12)
 (OUT/(filename+'.svg')).write_text(doc(w,h,b))
print('Two forest-only compositions from latest production lane metadata and approved image derivative.')
