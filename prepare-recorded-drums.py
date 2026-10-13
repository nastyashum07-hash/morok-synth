from pathlib import Path
import re,zipfile
root=Path(__file__).resolve().parents[1];d=root/'dist'
html=(d/'index.html').read_text().replace('<link rel="stylesheet" href="styles.css">','<style>'+(d/'styles.css').read_text()+'</style>')
html=html.replace('<script type="module" src="js/app.js"></script>','')
js='\n'.join(re.sub(r'^import .*?;\s*','', (d/'js'/name).read_text(),flags=re.M).replace('export class ','class ') for name in ['sound-palette.js','recorded-samples.js','audio-engine.js','sequencer.js','fog.js','app.js'])
html=html.replace('</body>','<script type="module">\n'+js+'\n</script></body>')
out=Path('/workspace/scratch/24b424e8593a/Morok-Synth.html');out.write_text(html)
with zipfile.ZipFile(d/'morok-source.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in [root/'README.md',root/'package.json',*sorted((d/'js').glob('*.js')),d/'index.html',d/'styles.css',*sorted((root/'scripts').glob('*worlds.py')),*sorted((root/'scripts').glob('*standalone.py')),*sorted((root/'scripts').glob('*drums.py'))]:z.write(p,p.relative_to(root))
 # Изображения уже встроены в index.html: отдельные копии для запуска не нужны.
 for p in sorted((d/'assets'/'audio').glob('*')):z.write(p,p.relative_to(root))
print('Standalone:',out.stat().st_size,'bytes; source ZIP:',(d/'morok-source.zip').stat().st_size)
