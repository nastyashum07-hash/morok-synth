/** Процедурные тембры: авторские эскизы, не реальные записи инструментов/голосов. */
export class SoundPalette {
  static create(context, kind) {
    const durations={lute:3.2,drum:1.5,frame:1.8,whisper:2.8,wind:4.5,beast:3.2,spirit:4};
    if(!durations[kind])throw new Error('Неизвестный тембр: '+kind);
    const seconds=durations[kind],rate=context.sampleRate;
    const buffer=context.createBuffer(1,Math.ceil(rate*seconds),rate),out=buffer.getChannelData(0);
    let seed=7291,low=0,mid=0,phase=0,phase2=0;
    const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2147483648-1;};
    for(let i=0;i<out.length;i++){
      const t=i/rate,n=random();low+=.013*(n-low);mid+=.19*(n-mid);
      const edge=Math.max(0,Math.min(1,t/.004,(seconds-t)/.08));
      let v=0;
      if(kind==='lute'){
        // Парный курс струн D3: лёгкая расстройка, щипок и резонанс деревянного корпуса.
        for(let h=1;h<=10;h++){
          const amp=Math.sin(Math.PI*h*.19)/Math.pow(h,1.24),env=Math.exp(-t*(1.35+h*.46));
          v+=amp*env*(Math.sin(2*Math.PI*146.832*h*t)+.68*Math.sin(2*Math.PI*147.19*h*Math.max(0,t-.009)));
        }
        v+=.14*Math.sin(2*Math.PI*310*t)*Math.exp(-t*13)+.1*(n-mid)*Math.exp(-t*190);
      }
      if(kind==='drum'){
        phase+=2*Math.PI*(64+64*Math.exp(-t*26))/rate;
        v=.75*Math.sin(phase)*Math.exp(-t*4.7)+.19*Math.sin(phase*1.59)*Math.exp(-t*8)+.17*(n-mid)*Math.exp(-t*75);
      }
      if(kind==='frame'){
        phase+=2*Math.PI*(122+26*Math.exp(-t*32))/rate;
        const jingle=(Math.sin(t*2*Math.PI*2160)+.6*Math.sin(t*2*Math.PI*3341))*(.6+.4*Math.sin(t*43));
        v=.48*Math.sin(phase)*Math.exp(-t*7)+.2*(n-mid)*Math.exp(-t*10)+.15*jingle*Math.exp(-t*4.5);
      }
      if(kind==='wind')v=low*4*Math.sin(Math.PI*t/seconds)*(.7+.3*Math.sin(t*2.3));
      if(kind==='whisper'){
        const syllables=Math.pow(Math.max(0,Math.sin(t*8.5+.3)),2)*Math.sin(Math.PI*t/seconds);
        v=(mid-low)*1.8*syllables*(.6+.4*Math.sin(t*2*Math.PI*960));
      }
      if(kind==='beast'){
        phase+=2*Math.PI*(46+9*Math.sin(t*2.1)+3*Math.sin(t*37))/rate;
        const throat=Math.sin(phase)+.48*Math.sin(phase*2)+.3*Math.sin(phase*5)+.16*Math.sin(phase*9);
        const breath=Math.pow(Math.sin(Math.PI*t/seconds),.8);
        v=(Math.tanh(throat*2)*.32+mid*.55)*breath*(.7+.3*Math.sin(t*31));
      }
      if(kind==='spirit'){
        // Нечеловеческий вой: скольжение частоты, биения и шумное дыхание.
        const f=230+95*Math.sin(t*.85)-t*19+5*Math.sin(t*29);
        phase+=2*Math.PI*f/rate;phase2+=2*Math.PI*(f*1.012)/rate;
        v=(Math.sin(phase)*.4+Math.sin(phase2)*.3+Math.sin(phase*2.02)*.09+mid*.3)*Math.pow(Math.sin(Math.PI*t/seconds),1.4);
      }
      out[i]=v*edge;
    }
    let sum=0,peak=0;
    for(const x of out){sum+=x*x;peak=Math.max(peak,Math.abs(x));}
    const gain=Math.min(.15/Math.max(.0001,Math.sqrt(sum/out.length)),.75/Math.max(.001,peak));
    for(let i=0;i<out.length;i++)out[i]*=gain;
    return buffer;
  }
}
