from pathlib import Path
import xml.etree.ElementTree as E
root=Path(__file__).resolve().parents[1];d=root/'dist'
s=(d/'index.html').read_text()
if 'id="pad-lute"' in s:
 print('World layout already applied');raise SystemExit(0)
start=s.index('<svg');end=s.index('</svg>')+6;r=E.fromstring(s[start:end]);S='http://www.w3.org/2000/svg';E.register_namespace('',S);E.register_namespace('xlink','http://www.w3.org/1999/xlink')
def tag(t):return '{'+S+'}'+t
def el(id):return next(e for e in r.iter() if e.get('id')==id)
def path(g,data):E.SubElement(g,tag('path'),{'d':data})
for id,colors in [('panel-False',['#7a8170','#283c39']),('panel-True',['#151524','#080c17'])]:
 for stop,color in zip(el(id),colors):stop.set('stop-color',color);stop.set('stop-opacity','.97')
el('yav-world')[0].set('stroke','#a4ac91');el('nav-world')[0].set('stroke','#48405a')
# На очищенном макете нет фоновых волн; старый туман заменён общим Canvas-слоем.
for child in list(r):
 if child.get('id')=='moving-fog':r.remove(child)
for e in r.iter():
 if e.get('aria-label'):e.set('aria-label',e.get('aria-label').replace('Морок, шаг','Навь, шаг'))
r.set('aria-label','Морок: светлая Явь слева, тёмная Навь справа');el('nav-world').set('aria-label','Навь')
# Две формы синтезатора и три обрядовых инструмента, без расширения панели.
for id,x in [('wave-saw',95),('wave-square',264)]:
 g=el(id);rect=g.find(tag('rect'));rect.set('height','52');g.find(tag('g')).set('transform',f'translate({x+56.5},440) scale(1.25)');g.set('aria-pressed','false')
icons={
'lute':'M19 3l7 4-9 12m3-15-8 11C2 12 0 24 8 28c8 5 16-5 11-11L26 7M7 23l13-16M10 25L23 8M6 19l8 5M21 3l5 4',
'drum':'M5 10C5 4 27 4 27 10S5 16 5 10Zm0 0 2 17c3 5 16 5 18 0l2-17M8 15l4 13 5-12 5 12 3-14M3 1l14 7M29 1 18 7',
'frame':'M16 3a13 13 0 1 0 0 26 13 13 0 0 0 0-26Zm0 4a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 15h4m18 0h4M15 3v4m0 18v4',
'beast':'M8 11 3 2l2 16 4 9 7 3 7-3 4-9 2-16-5 9M8 16l5 3m11-3-5 3M10 24l3-3 3 4 3-4 3 3',
'spirit':'M6 28V13C6 0 26 0 26 13v15l-5-4-5 5-5-5-5 4ZM11 13v3m10-3v3M14 20c0-3 4-3 4 0s-4 3-4 0'
}
for i,kind in enumerate(['lute','drum','frame']):
 g=E.SubElement(el('yav-world'),tag('g'),{'id':'pad-'+kind,'class':'icon-button control ritual-pad','role':'button','tabindex':'0','aria-label':{'lute':'Лютня','drum':'Обрядовый барабан','frame':'Бубен'}[kind],'aria-pressed':str(kind=='lute').lower()})
 x=95+i*110;E.SubElement(g,tag('rect'),{'x':str(x),'y':'496','width':'102','height':'52','rx':'10','fill':'#354a43','stroke':'#99a48b'})
 ig=E.SubElement(g,tag('g'),{'transform':f'translate({x+31},502) scale(1.25)','fill':'none','stroke':'#dddcc2','stroke-width':'1.15','stroke-linecap':'round','stroke-linejoin':'round'});path(ig,icons[kind])
for old,new,name in [('pad-drum','beast','Рычание нечисти'),('pad-string','spirit','Призрачный вой')]:
 # Старые пэды ищем только в Нави: в Яви уже есть новый барабан.
 g=next(e for e in el('nav-world') if e.get('id')==old);g.set('id','pad-'+new);g.set('aria-label',name)
 ig=g.find(tag('g'))
 for c in list(ig):ig.remove(c)
 path(ig,icons[new])
svg=E.tostring(r,encoding='unicode');html=s[:start]+svg+s[end:]
html=html.replace('</main>','</main><canvas id="morok-fog" aria-hidden="true"></canvas>')
(d/'index.html').write_text(html);(d/'assets/instrument.svg').write_text(svg)
