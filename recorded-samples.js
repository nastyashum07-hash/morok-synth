import {AudioEngine} from './audio-engine.js';
import {Sequencer} from './sequencer.js';
import {FogScene} from './fog.js';

const engine=new AudioEngine(), svg=document.querySelector('#instrument');
const $=s=>document.querySelector(s);
const pattern=[Array(16).fill(false),Array(16).fill(false)];
for(const [i,kind] of [[0,'drum'],[2,'lute'],[4,'frame'],[6,'sawtooth'],[8,'drum'],[10,'lute'],[12,'frame'],[14,'square']])pattern[0][i]=kind;
for(const [i,kind] of [[1,'wind'],[7,'whisper'],[12,'spirit']])pattern[1][i]=kind;
const seq=new Sequencer(engine,pattern);
const fog=new FogScene($('#morok-fog'));
const yavSamples=['lute','drum','frame'],navSamples=['whisper','wind','beast','spirit'];
let selectedYav='lute';
let selected='whisper', busy=false, powered=false, fogDensity=.55;
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
const settings={filter:420,distortion:.18,delay:.3,reverb:.5,chorus:.4};
const envelopeValues={yav:[0.5,24,65,40],nav:[2,30,65,55]};
function announce(message){$('#engine-status').textContent=message;}
function point(event){const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
function activate(node,action){
  node.addEventListener('click',action);
  node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action(e);}});
}
function syncPower(){
  const b=$('#init-audio');b.classList.toggle('ready',powered);b.setAttribute('aria-pressed',String(powered));
  b.setAttribute('aria-label',powered?'Выключить звук':'Включить звук');
  $('#engine-dot').setAttribute('fill',powered?'#a7d4c3':'#89636e');
}
function syncPlay(){
  const b=$('#play-sequence');b.setAttribute('aria-pressed',String(seq.playing));
  b.setAttribute('aria-label',seq.playing?'Остановить секвенсор':'Запустить секвенсор');
  b.querySelector('path').setAttribute('d',seq.playing?'M8 6h16v20H8Z':'M10 5l17 11-17 11Z');
  if(!seq.playing)svg.querySelectorAll('.playing').forEach(n=>n.classList.remove('playing'));
}
function applySettings(){
  engine.setCutoff(settings.filter);
  for(const name of ['distortion','delay','reverb','chorus'])engine.setEffect(name,settings[name]);
}
async function ensureAudio(){
  if(powered)return true;
  if(busy)return false;
  busy=true;$('#init-audio').setAttribute('aria-busy','true');
  try {
    await engine.enable();powered=true;applySettings();
    $('#init-audio').classList.remove('failed');syncPower();
    announce('Звук включён.');return true;
  }catch(error){
    engine.disable();powered=false;syncPower();$('#init-audio').classList.add('failed');
    announce(error.message);return false;
  }finally{busy=false;$('#init-audio').removeAttribute('aria-busy');}
}
function shutdown(){seq.stop();engine.disable();powered=false;syncPower();syncPlay();}
activate($('#init-audio'),async()=>{
  if(powered){shutdown();return;}
  if(await ensureAudio()){seq.start();syncPlay();}
});
activate($('#play-sequence'),async()=>{
  if(seq.playing){seq.stop();syncPlay();return;}
  if(await ensureAudio()){seq.start();syncPlay();}
});
function range(node,initial,update){
  let held=false,startY=0,startValue=0;
  const fader=node.classList.contains('fader');
  function set(value){
    value=Math.max(0,Math.min(100,value));node.setAttribute('aria-valuenow',String(Math.round(value)));
    if(fader){
      const start=Number(node.dataset.start),x=start+Number(node.dataset.width)*value/100;
      const thumb=node.querySelector('.fader-thumb'),y=Number(thumb.getAttribute('cy'));
      thumb.setAttribute('cx',x);node.querySelector('.fader-fill').setAttribute('d',`M${start} ${y}H${x}`);
    }else{
      const {cx,cy}=node.dataset;
      node.querySelector('.knob-needle').setAttribute('transform',`rotate(${-135+value*2.7} ${cx} ${cy})`);
    }
    update(value);
  }
  const pointer=e=>set((point(e).x-Number(node.dataset.start))/Number(node.dataset.width)*100);
  node.addEventListener('pointerdown',e=>{if(e.button!==0)return;held=true;node.setPointerCapture(e.pointerId);startY=point(e).y;startValue=+node.getAttribute('aria-valuenow');if(fader)pointer(e);});
  node.addEventListener('pointermove',e=>{if(held){if(fader)pointer(e);else set(startValue+(startY-point(e).y)*.65);}});
  for(const t of ['pointerup','pointercancel','lostpointercapture'])node.addEventListener(t,()=>held=false);
  node.addEventListener('keydown',e=>{
    const v=+node.getAttribute('aria-valuenow');let next;
    if(['ArrowUp','ArrowRight'].includes(e.key))next=v+2;
    if(['ArrowDown','ArrowLeft'].includes(e.key))next=v-2;
    if(e.key==='Home')next=0;if(e.key==='End')next=100;
    if(next!==undefined){e.preventDefault();set(next);}
  });
  node.addEventListener('wheel',e=>{e.preventDefault();set(+node.getAttribute('aria-valuenow')-Math.sign(e.deltaY)*2);},{passive:false});
  set(initial);
}
for(const voice of ['yav','nav'])['attack','decay','sustain','release'].forEach((name,i)=>{
  const node=$(`#${voice}-${name}`);
  range(node,envelopeValues[voice][i],v=>{
    const n=v/100;
    engine.envelopes[voice][name]=name==='sustain'?n:name==='attack'?.005+n*.7:name==='decay'?.02+n:.04+n*2;
    node.setAttribute('aria-valuetext',name==='sustain'?`${v.toFixed(0)} процентов`:`${engine.envelopes[voice][name].toFixed(2)} секунды`);
  });
});
range($('#filter'),Math.log(420/60)/Math.log(80)*100,v=>{settings.filter=60*Math.pow(80,v/100);engine.setCutoff(settings.filter);$('#filter').setAttribute('aria-valuetext',`${Math.round(settings.filter)} герц`);});
for(const name of ['distortion','delay','reverb','chorus'])range($('#'+name),settings[name]*100,v=>{settings[name]=v/100;engine.setEffect(name,v/100);});
function selectYav(kind){
  selectedYav=kind;
  for(const [id,value] of [['wave-saw','sawtooth'],['wave-square','square'],...yavSamples.map(k=>['pad-'+k,k])])$('#'+id).setAttribute('aria-pressed',String(value===kind));
}
for(const [id,waveform] of [['wave-saw','sawtooth'],['wave-square','square']])activate($('#'+id),async()=>{
  selectYav(waveform);
  if(await ensureAudio())engine.playYav(waveform,engine.context.currentTime+.015,73.416,.7);
});
const hitTimers=new Map();
function flashPad(kind){
  const pad=$('#pad-'+kind);if(!pad)return;
  clearTimeout(hitTimers.get(kind));pad.classList.add('hit');
  hitTimers.set(kind,setTimeout(()=>{pad.classList.remove('hit');hitTimers.delete(kind);},160));
}
function selectPad(kind){
  if(yavSamples.includes(kind)){selectYav(kind);return;}
  selected=kind;seq.sampleKind=kind;
  for(const name of navSamples)$('#pad-'+name).setAttribute('aria-pressed',String(name===kind));
}
for(const kind of [...yavSamples,...navSamples]){
  const pad=$('#pad-'+kind);
  activate(pad,async e=>{
    selectPad(kind);
    if(e.shiftKey){$('#sample-file').dataset.kind=kind;$('#sample-file').click();return;}
    if(await ensureAudio()){engine.sample(kind);flashPad(kind);}
  });
  // Свой WAV/MP3 можно перетащить прямо на нужный пэд.
  pad.addEventListener('dragover',e=>{e.preventDefault();pad.classList.add('hit');});
  pad.addEventListener('dragleave',()=>pad.classList.remove('hit'));
  pad.addEventListener('drop',async e=>{e.preventDefault();pad.classList.remove('hit');const file=e.dataTransfer.files[0];if(file)await importSample(kind,file);});
}
async function importSample(kind,file){
  if(file.size>25*1024*1024){announce('Выбери аудиофайл меньше 25 МБ.');return;}
  try{if(!await ensureAudio())return;await engine.loadSample(kind,file);selectPad(kind);engine.sample(kind);announce('Семпл загружен.');}
  catch(error){announce('Не удалось прочитать семпл: '+error.message);$('#pad-'+kind).classList.add('failed');setTimeout(()=>$('#pad-'+kind).classList.remove('failed'),1500);}
}
$('#sample-file').addEventListener('change',async e=>{const file=e.target.files[0];if(file)await importSample(e.target.dataset.kind||selected,file);e.target.value='';});
selectPad(selected);selectYav(selectedYav);
function drawPattern(){for(const n of svg.querySelectorAll('.step')){const value=pattern[+n.dataset.row][+n.dataset.step];n.setAttribute('aria-pressed',String(!!value));n.dataset.sound=value||'';}}
for(const node of svg.querySelectorAll('.step'))activate(node,()=>{
  const row=+node.dataset.row,step=+node.dataset.step;
  pattern[row][step]=pattern[row][step]?false:row===0?selectedYav:selected;
  drawPattern();
});
activate($('#clear-pattern'),()=>{seq.stop();syncPlay();pattern.forEach(row=>row.fill(false));drawPattern();});
range($('#fog-density'),55,v=>fogDensity=v/100);
function syncMotion(){document.body.classList.toggle('motion-paused',paused);const b=$('#motion-toggle');b.setAttribute('aria-pressed',String(paused));b.setAttribute('aria-label',paused?'Оживить туман':'Остановить туман');}
activate($('#motion-toggle'),()=>{paused=!paused;syncMotion();});
function frame(nowMs){
  if(engine.ready){
    const now=engine.context.currentTime;let latest;
    while(seq.queue.length&&seq.queue[0].time<=now)latest=seq.queue.shift();
    if(latest){svg.querySelectorAll('.playing').forEach(n=>n.classList.remove('playing'));for(let row=0;row<2;row++){$(`#step-${row}-${latest.step}`).classList.add('playing');flashPad(pattern[row][latest.step]);}}
  }
  fog.update(nowMs,powered,engine.getNavLevel(),fogDensity,paused);
  requestAnimationFrame(frame);
}
// Уход со страницы останавливает партию, чтобы браузер не играл в фоне.
document.addEventListener('visibilitychange',()=>{if(document.hidden&&powered)shutdown();});
window.addEventListener('pagehide',()=>{if(powered)shutdown();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')shutdown();});
drawPattern();syncPower();syncPlay();syncMotion();requestAnimationFrame(frame);
