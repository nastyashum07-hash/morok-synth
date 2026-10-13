/** Плотность зависит только от сигнала Нави после её эффектов, не от Яви. */
export class FogDynamics {
  constructor(){this.power=0;this.activity=0;this.density=0;}
  update(dt,on,navLevel,amount){
    dt=Math.max(0,Math.min(dt,.1));
    this.power+=((on?1:0)-this.power)*(1-Math.exp(-dt/(on?3:2)));
    // Тихие шёпоты тоже заметны; паузы постепенно рассеивают накопленный морок.
    const drive=on?Math.min(1,Math.sqrt(Math.max(0,navLevel)*18)):0;
    this.activity+=(drive-this.activity)*(1-Math.exp(-dt/(drive>this.activity?2.4:9)));
    const target=this.power*(.19+.73*this.activity)*Math.max(0,Math.min(1,amount));
    this.density+=(target-this.density)*(1-Math.exp(-dt/1.2));
    return this.density;
  }
}
export class FogScene {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.dynamics=new FogDynamics();
    this.time=0;this.last=0;this.sprite=document.createElement('canvas');
    this.sprite.width=384;this.sprite.height=384;
    const c=this.sprite.getContext('2d');
    // Мягкие неоднородные сгустки рисуются один раз, затем только перемещаются.
    for(let i=0;i<12;i++){
      const x=192+Math.sin(i*2.4)*90,y=192+Math.cos(i*1.8)*65,r=72+i%4*12;
      const g=c.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,'rgba(178,191,190,.24)');g.addColorStop(.45,'rgba(133,154,167,.12)');g.addColorStop(1,'rgba(100,119,135,0)');
      c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
    }
    this.resize=()=>{this.canvas.width=Math.round(innerWidth*.85);this.canvas.height=Math.round(innerHeight*.85);};
    window.addEventListener('resize',this.resize);this.resize();
  }
  update(now,on,navLevel,amount,paused){
    const dt=this.last?Math.min(.1,(now-this.last)/1000):0;this.last=now;
    const density=this.dynamics.update(dt,on,navLevel,amount);
    if(!paused)this.time+=dt;
    this.draw(density);
  }
  draw(density){
    const c=this.ctx,w=this.canvas.width,h=this.canvas.height,t=this.time;
    c.clearRect(0,0,w,h);if(density<.001)return;
    // Вуаль и три слоя проходят поверх обеих панелей и секвенсора.
    c.fillStyle=`rgba(132,151,164,${density*.12})`;c.fillRect(0,0,w,h);
    for(let layer=0;layer<3;layer++)for(let i=0;i<7;i++){
      const speed=layer%2?-.009:.006;
      const x=(((i/6+layer*.21+t*speed)%1.65+1.65)%1.65-.32)*w;
      const y=(.12+layer*.34+Math.sin(t*.12+i*1.7+layer)*.12)*h;
      const size=w*(.65+.1*Math.sin(i*4));
      c.globalAlpha=Math.min(.7,density*(.7+layer*.1));
      c.drawImage(this.sprite,x-size/2,y-h*.23,size,h*.46);
    }
    c.globalAlpha=1;
  }
}
