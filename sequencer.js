import {RecordedSamples} from './recorded-samples.js';
import {SoundPalette} from './sound-palette.js';
/** Два голоса на чистом Web Audio. Источники создаются заново для каждой ноты. */
export class AudioEngine {
  constructor(context = null) {
    this.context = context;
    this.nodes = {};
    this.active = new Set();
    this.ready = false;
    this.enabled = false;
    this.waveform = 'sawtooth';
    this.envelopes = {
      yav: { attack: .06, decay: .24, sustain: .65, release: .5 },
      nav: { attack: .015, decay: .3, sustain: .65, release: 1.1 }
    };
    this.buffers = {};
  }
  async initialize() {
    if (this.ready) return;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!this.context && !Context) throw new Error('Браузер не поддерживает Web Audio.');
    const c = this.context ||= new Context({latencyHint: 'interactive'});
    const n = this.nodes;
    n.master = c.createGain(); n.master.gain.value = 0;
    n.limiter = c.createDynamicsCompressor();
    n.limiter.threshold.value = -10; n.limiter.knee.value = 6;
    n.limiter.ratio.value = 12; n.limiter.attack.value = .003; n.limiter.release.value = .18;
    n.analyser = c.createAnalyser(); n.analyser.fftSize = 512;
    n.master.connect(n.limiter).connect(n.analyser).connect(c.destination);
    this.levelData = new Float32Array(n.analyser.fftSize);

    n.synthFilter = c.createBiquadFilter(); n.synthFilter.type = 'lowpass';
    n.synthFilter.frequency.value = 420; n.synthFilter.Q.value = .9;
    n.distortion = c.createWaveShaper(); n.distortion.oversample = '2x';
    this.delay = this.rack(c.createDelay(2), .22);
    this.delay.effect.delayTime.value = .375;
    n.feedback = c.createGain(); n.feedback.gain.value = .28;
    this.delay.effect.connect(n.feedback).connect(this.delay.effect);
    n.synthLevel = c.createGain(); n.synthLevel.gain.value = .5;
    n.synthPan = c.createStereoPanner(); n.synthPan.pan.value = -.22;
    n.synthFilter.connect(n.distortion).connect(this.delay.input);
    this.delay.output.connect(n.synthLevel).connect(n.synthPan).connect(n.master);

    n.ritualFilter = c.createBiquadFilter(); n.ritualFilter.type='lowpass';
    n.ritualFilter.frequency.value=2600; n.ritualFilter.Q.value=.5;
    n.ritualFilter.connect(this.delay.input);
    n.samplerInput = c.createGain();
    this.reverb = this.rack(c.createConvolver(), .4);
    this.reverb.effect.buffer = this.impulse(2.7);
    this.chorus = this.rack(c.createDelay(.1), .32);
    this.chorus.effect.delayTime.value = .018;
    n.lfo = c.createOscillator(); n.lfo.frequency.value = .28;
    n.depth = c.createGain(); n.depth.gain.value = .003;
    n.lfo.connect(n.depth).connect(this.chorus.effect.delayTime); n.lfo.start();
    n.samplerLevel = c.createGain(); n.samplerLevel.gain.value = .75;
    n.samplerPan = c.createStereoPanner(); n.samplerPan.pan.value = .28;
    n.samplerInput.connect(this.reverb.input);
    this.reverb.output.connect(this.chorus.input);
    n.navAnalyser=c.createAnalyser(); n.navAnalyser.fftSize=1024;
    this.navData=new Float32Array(n.navAnalyser.fftSize);
    this.chorus.output.connect(n.samplerLevel).connect(n.navAnalyser).connect(n.samplerPan).connect(n.master);
    for (const kind of ['lute','drum','frame','whisper','wind','beast','spirit']) this.buffers[kind] = this.makeSample(kind);
    this.ready = true;
    this.setEffect('distortion', .18);
  }
  rack(effect, mix) {
    const c = this.context;
    const r = {input:c.createGain(), output:c.createGain(), dry:c.createGain(), wet:c.createGain(), effect};
    r.input.connect(r.dry).connect(r.output);
    r.input.connect(effect).connect(r.wet).connect(r.output);
    r.dry.gain.value = 1 - mix * .45; r.wet.gain.value = mix;
    return r;
  }
  async enable() {
    await this.initialize();
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Нажми кнопку питания ещё раз, чтобы разрешить звук.');
    this.enabled = true;
    this.nodes.master.gain.setTargetAtTime(.7, this.context.currentTime, .03);
  }
  disable() {
    if (!this.ready) return;
    this.enabled = false;
    this.stopVoices();
    this.nodes.master.gain.setTargetAtTime(0, this.context.currentTime, .015);
  }
  setCutoff(value) {
    if (!this.ready)return;
    this.nodes.synthFilter.frequency.setTargetAtTime(Math.min(value, this.context.sampleRate*.45), this.context.currentTime, .02);
    this.nodes.ritualFilter.frequency.setTargetAtTime(Math.min(600+value*3.5,this.context.sampleRate*.45),this.context.currentTime,.02);
  }
  setEffect(name, value) {
    if (!this.ready) return;
    if (name === 'distortion') {
      // Нормированная мягкая сатурация: нулевая ручка даёт линейную кривую.
      const curve = new Float32Array(4096), k = 1 + value * 15;
      for (let i=0;i<curve.length;i++) {
        const x = i*2/(curve.length-1)-1;
        curve[i] = value < .001 ? x : Math.tanh(k*x)/Math.tanh(k);
      }
      this.nodes.distortion.curve = curve;
    } else {
      const r = this[name], t = this.context.currentTime;
      r.wet.gain.setTargetAtTime(value * .75, t, .03);
      r.dry.gain.setTargetAtTime(1 - value * .35, t, .03);
      if (name === 'delay') this.nodes.feedback.gain.setTargetAtTime(.12 + value*.45, t, .03);
      if (name === 'chorus') this.nodes.depth.gain.setTargetAtTime(.0005 + value*.004, t, .03);
    }
  }
  envelope(voice, when, gate, peak) {
    const e = this.envelopes[voice], gain = this.context.createGain();
    const a = Math.max(.005,e.attack), d = Math.max(.005,e.decay);
    // Атака и спад всегда завершаются до отпускания ноты.
    const releaseAt = when + Math.max(gate, a+d+.02), end = releaseAt + e.release;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when+a);
    gain.gain.linearRampToValueAtTime(peak*e.sustain, when+a+d);
    gain.gain.setValueAtTime(peak*e.sustain, releaseAt);
    gain.gain.linearRampToValueAtTime(0, end);
    return {gain,end};
  }
  percussionEnvelope(when, duration, peak) {
    // Запись уже содержит атаку удара. Медленный ADSR синтезатора её стирал бы.
    // Сохраняем естественный удар; Release Яви управляет длиной затухания.
    const gain = this.context.createGain();
    const length = Math.min(duration, Math.max(.18, .5 + this.envelopes.yav.release * 2.5));
    const end = when + length, fade = Math.min(.12, length * .25);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + .001);
    gain.gain.setValueAtTime(peak, end - fade);
    gain.gain.linearRampToValueAtTime(0, end);
    return {gain, end};
  }
  track(sources, gain, end) {
    const item = {sources,gain,end}; this.active.add(item);
    let remaining = sources.length;
    for (const source of sources) source.onended = () => {
      source.disconnect();
      if (--remaining === 0) {gain.disconnect();this.active.delete(item);}
    };
    // Ограничиваем число хвостов при частых нажатиях.
    if (this.active.size > 32) this.stopItem(this.active.values().next().value);
  }
  stopItem(item) {
    const t = this.context.currentTime;
    item.gain.gain.cancelScheduledValues(t);
    item.gain.gain.setTargetAtTime(0,t,.008);
    for (const s of item.sources) {try{s.stop(t+.04);}catch{}}
  }
  stopVoices() {for(const item of this.active) this.stopItem(item);}
  synth(when = this.context.currentTime, frequency = 73.416, gate = .32) {
    if (!this.enabled) return;
    const c = this.context, {gain,end} = this.envelope('yav',when,gate,.16);
    gain.connect(this.nodes.synthFilter);
    const sources = [-5,5].map(detune => {
      const o = c.createOscillator(); o.type = this.waveform;
      o.frequency.setValueAtTime(frequency,when); o.detune.value = detune;
      o.connect(gain); o.start(when); o.stop(end+.01); return o;
    });
    this.track(sources,gain,end);
  }
  playYav(kind,when=this.context.currentTime,frequency=73.416,gate=.32){
    if(kind==='sawtooth'||kind==='square'){this.waveform=kind;this.synth(when,frequency,gate);}
    else this.sample(kind,when,frequency);
  }
  sample(kind, when = this.context.currentTime, frequency=73.416) {
    if (!this.enabled || !this.buffers[kind]) return;
    const c = this.context, buffer = this.buffers[kind];
    const isYav=['lute','drum','frame'].includes(kind);
    const percussion = kind === 'drum' || kind === 'frame';
    const {gain,end} = percussion ? this.percussionEnvelope(when,buffer.duration,1.85)
      : this.envelope(isYav?'yav':'nav',when,Math.min(buffer.duration*.7,isYav?2:3.5),isYav?.85:.65);
    const s = c.createBufferSource(); s.buffer = buffer;
    const rate=kind==='lute'?frequency*2/146.832:1;
    s.playbackRate.value=rate;
    gain.connect(isYav?this.nodes.ritualFilter:this.nodes.samplerInput);s.connect(gain);
    s.start(when);s.stop(Math.min(end+.01,when+buffer.duration/rate));
    this.track([s],gain,end);
  }
  async loadSample(kind, fileOrUrl) {
    await this.initialize();
    if (!(kind in this.buffers)) throw new Error('Неизвестный пэд.');
    let bytes;
    if (typeof fileOrUrl === 'string') {
      const response = await fetch(fileOrUrl);
      if (!response.ok) throw new Error('Не удалось загрузить аудиофайл.');
      bytes = await response.arrayBuffer();
    } else bytes = await fileOrUrl.arrayBuffer();
    const buffer = await this.context.decodeAudioData(bytes);
    if (buffer.duration > 30) throw new Error('Для прототипа выбери семпл короче 30 секунд.');
    this.buffers[kind] = buffer;
  }
  impulse(seconds) {
    const c = this.context, b = c.createBuffer(2,Math.ceil(c.sampleRate*seconds),c.sampleRate);
    for(let channel=0;channel<2;channel++) {
      const data=b.getChannelData(channel);
      for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,3);
    }
    return b;
  }
  makeSample(kind) { return RecordedSamples.create(this.context,kind) || SoundPalette.create(this.context,kind); }
  getNavLevel(){
    if(!this.ready||!this.enabled)return 0;
    this.nodes.navAnalyser.getFloatTimeDomainData(this.navData);
    return Math.sqrt(this.navData.reduce((sum,v)=>sum+v*v,0)/this.navData.length);
  }
  getLevel() {
    if (!this.ready || !this.enabled) return 0;
    this.nodes.analyser.getFloatTimeDomainData(this.levelData);
    return Math.sqrt(this.levelData.reduce((sum,v)=>sum+v*v,0)/this.levelData.length);
  }
}
