"use strict";
// Procedural audio for Influence — no files, everything synthesized via Web Audio.
// Menu music is generative (never loops exactly); SFX are short synth hits.
// Autoplay policy: nothing can sound before the first user gesture, so the game
// calls SND.unlock() on the first pointer/key event and we resume from there.
window.SND=(()=>{
  let ctx=null, master=null, musicBus=null;
  let enabled = localStorage.getItem("snd")!=="off";
  let musicWanted=false, musicTimer=null, bar=0;
  const lastPlay={};
  const THROTTLE={ expand:90, wallPlace:70, wallChip:120, wallBreak:200, attack:1500, outpostFire:900, zoneWarn:400 };

  function ensure(){
    if(!ctx){
      const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return false;
      ctx=new AC();
      master=ctx.createGain(); master.gain.value=0.5; master.connect(ctx.destination);
      musicBus=ctx.createGain(); musicBus.gain.value=0.16; musicBus.connect(master);
    }
    if(ctx.state==="suspended") ctx.resume();
    return true;
  }
  const now=()=>ctx.currentTime;

  // A tone with a frequency glide and a percussive-ish envelope.
  function tone(f0,f1,dur,type,vol,at=0,bus){
    const t=now()+at;
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(f0,t);
    if(f1!==f0) o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(vol,t+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(bus||master);
    o.start(t); o.stop(t+dur+0.05);
  }
  // A pad note: slow attack and release, low-passed (for the menu music).
  function pad(freq,dur,vol,at=0){
    const t=now()+at;
    const o=ctx.createOscillator(), g=ctx.createGain(), f=ctx.createBiquadFilter();
    o.type="triangle"; o.frequency.value=freq;
    f.type="lowpass"; f.frequency.value=750;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(vol,t+dur*0.35);
    g.gain.linearRampToValueAtTime(0.0001,t+dur);
    o.connect(f); f.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t+dur+0.1);
  }
  // Filtered noise burst (explosions, crumbles, rumbles).
  function noise(dur,vol,lpFrom,lpTo,at=0){
    const t=now()+at, n=Math.floor(ctx.sampleRate*dur);
    const buf=ctx.createBuffer(1,n,ctx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
    const src=ctx.createBufferSource(); src.buffer=buf;
    const f=ctx.createBiquadFilter(); f.type="lowpass";
    f.frequency.setValueAtTime(lpFrom,t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40,lpTo),t+dur);
    const g=ctx.createGain();
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t+dur+0.05);
  }
  const rnd=(a,b)=>a+Math.random()*(b-a);

  const FX={
    expand(o){ const p=(o&&o.p)||0.3; tone(rnd(190,230),rnd(320,380),0.09,"triangle",0.05+0.12*p); },
    wallPlace(){ tone(150,95,0.07,"square",0.10); noise(0.04,0.05,2500,600); },
    wallChip(){ noise(0.05,0.12,3200,900); tone(rnd(800,1000),450,0.04,"triangle",0.06); },
    wallBreak(){ noise(0.28,0.18,1600,180); tone(220,90,0.2,"square",0.07); },
    farm(){ tone(523.25,523.25,0.12,"sine",0.12); tone(659.25,659.25,0.14,"sine",0.11,0.10); },
    outpost(){ tone(330,190,0.13,"sawtooth",0.09); tone(190,190,0.08,"square",0.06,0.12); },
    outpostFire(){ noise(0.12,0.06,1400,300); },
    bomb(){ noise(0.55,0.32,3500,90); tone(150,38,0.55,"sine",0.35); tone(90,45,0.4,"triangle",0.2,0.05); },
    node(){ tone(660,660,0.11,"sine",0.13); tone(880,880,0.16,"sine",0.12,0.09); },
    nodeLost(){ tone(392,262,0.22,"sine",0.13); },
    baseBuilt(){ [440,554.37,659.25].forEach((f,i)=>tone(f,f,0.14,"sine",0.11,i*0.09)); },
    baseLost(){ tone(196,73,0.5,"sawtooth",0.14); noise(0.3,0.1,900,150,0.05); },
    attack(){ tone(130,95,0.09,"square",0.09); },
    zoneWarn(){ tone(880,880,0.14,"square",0.07); tone(660,660,0.14,"square",0.07,0.18); },
    zoneShrink(){ noise(1.3,0.16,320,60); },
    go(){ tone(440,440,0.08,"sine",0.10); tone(587.33,587.33,0.1,"sine",0.10,0.09); },
    win(){ [523.25,659.25,783.99,1046.5].forEach((f,i)=>tone(f,f,0.16,"sine",0.11,i*0.11)); },
    lose(){ [392,311.13,261.63].forEach((f,i)=>tone(f,f,0.22,"sine",0.11,i*0.14)); },
  };

  // Generative menu music: a slow minor progression with sparse pentatonic plucks.
  const CHORDS=[[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66],[164.81,196,246.94]];
  const PENTA=[440,523.25,587.33,659.25,783.99,880];
  const BAR=3.6;
  function playBar(){
    if(!enabled||!musicWanted||!ctx||ctx.state!=="running") return;
    const ch=CHORDS[bar%CHORDS.length]; bar++;
    ch.forEach(f=>pad(f,BAR*1.05,0.035));
    pad(ch[0]/2,BAR*1.05,0.045);                                   // bass root
    const plucks=(Math.random()<0.75?1:2);
    for(let i=0;i<plucks;i++){
      const f=PENTA[(Math.random()*PENTA.length)|0];
      tone(f,f,1.1,"sine",0.05,rnd(0.1,BAR-1.2),musicBus);
    }
  }
  function syncMusic(){
    if(musicWanted && enabled && ctx && ctx.state==="running"){
      if(!musicTimer){ playBar(); musicTimer=setInterval(playBar,BAR*1000); }
    } else if(musicTimer){ clearInterval(musicTimer); musicTimer=null; }
  }

  return {
    unlock(){ if(!enabled) return; if(ensure()) syncMusic(); },
    play(name,opt){
      if(!enabled||!FX[name]) return;
      if(!ctx||ctx.state!=="running"){ ensure(); if(!ctx||ctx.state!=="running") return; }
      const t=performance.now(), th=THROTTLE[name]||0;
      if(th && lastPlay[name] && t-lastPlay[name]<th) return;
      lastPlay[name]=t;
      try{ FX[name](opt); }catch(e){}
    },
    music(on){ musicWanted=on; if(ctx) syncMusic(); },
    toggle(){
      enabled=!enabled;
      localStorage.setItem("snd",enabled?"on":"off");
      if(enabled){ ensure(); } syncMusic();
      return enabled;
    },
    enabled(){ return enabled; },
  };
})();
