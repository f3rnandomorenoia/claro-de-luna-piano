"""Rebuild mobile data and original engraved score SVGs. Requires pypdf, pdfplumber, reportlab and pdftocairo."""
from pathlib import Path
from fractions import Fraction
import json, copy, io, subprocess, tempfile
import pdfplumber
from pypdf import PdfReader,PdfWriter,PageObject,Transformation
from pypdf.generic import RectangleObject
from reportlab.pdfgen import canvas
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'scripts/mobile-source';OUT=ROOT/'public/movil'
notes=json.loads((SOURCE/'notes.json').read_text())
for n in notes:
 n['start']=Fraction(n['start']);n['end']=Fraction(n['end'])
times=sorted({n['start'] for n in notes});assert len(times)==821
measures=[]
for m in range(1,70):
 steps=[]
 for t in times:
  if not (m-1)*4<=t<m*4:continue
  active={}
  for n in notes:
   if n['start']<=t<n['end']:active[n['midi']]=active.get(n['midi'],False) or n['start']==t
  steps.append({'notes':[{'midi':k,'press':v} for k,v in sorted(active.items())]})
 measures.append({'number':m,'score':f'partitura/compas-{m:02}.svg','steps':steps})
assert sum(len(m['steps']) for m in measures)==821
regions=[]
with pdfplumber.open(SOURCE/'moonlight-mutopia.pdf') as pdf:
 for pi,p in enumerate(pdf.pages[:5]):
  ys=sorted(set(round(l['top'],3) for l in p.lines if l['width']>500))
  for j in range(0,len(ys),10):
   top,bottom=ys[j],ys[j+9]
   raw=sorted(set(round(r['x0'],2) for r in p.rects if .7<r['width']<2 and abs(r['top']-top)<.4 and 19<r['height']<22))
   bars=[]
   for x in raw:
    if not bars or x-bars[-1]>1:bars.append(x)
   bounds=[22]+bars
   for k in range(len(bars)):
    x0=bounds[k] if k==0 else bounds[k]-.2;x1=bounds[k+1]+1.3 if k<len(bars)-1 else 567.5
    y0=top-26 if not(pi==0 and j==0) else top-7;y1=min(bottom+38,p.height-18)
    regions.append((pi,[x0,p.height-y1,x1,p.height-y0]))
assert len(regions)==69
src=PdfReader(SOURCE/'moonlight-mutopia.pdf')
buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(595.28,841.89));c.setFillColorRGB(1,1,1);c.rect(94,841.89-240.77,178,11.5,fill=1,stroke=0)
c.setFillColorRGB(0,0,0);c.rect(247.29,841.89-240.77,.946,11.5,fill=1,stroke=0);c.setFont('Times-Italic',8.2);c.drawString(95.8,841.89-238,'sempre pianissimo e senza sordini');c.save();buf.seek(0)
src.pages[0].merge_page(PdfReader(buf).pages[0])
(OUT/'partitura').mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as temp:
 for i,(pi,box) in enumerate(regions):
  x0,y0,x1,y1=box;part=copy.copy(src.pages[pi]);part.cropbox=RectangleObject(box);part.trimbox=RectangleObject(box)
  page=PageObject.create_blank_page(width=x1-x0,height=y1-y0);page.merge_transformed_page(part,Transformation().translate(-x0,-y0))
  w=PdfWriter();w.add_page(page);f=Path(temp)/f'{i}.pdf'
  with f.open('wb') as out:w.write(out)
  svg=OUT/f'partitura/compas-{i+1:02}.svg'
  subprocess.run(['pdftocairo','-svg',str(f),str(svg)],check=True)
  measures[i]['scoreWidth']=round(x1-x0,2);measures[i]['scoreHeight']=round(y1-y0,2)
(OUT/'data.json').write_text(json.dumps({'version':1,'source':'Mutopia-2007/02/11-276','measures':measures},separators=(',',':')))
print('69 SVGs, 821 steps; notes from the original edition MIDI.')
