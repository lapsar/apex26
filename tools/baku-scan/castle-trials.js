// Справка (10.2026): проходим ли замок Баку в НАСТОЯЩЕЙ физике игры. node tools/baku-scan/castle-trials.js [S0] [S1]
// Автопилот ведёт болид по точке осевой впереди (упреждение растёт со скоростью) с постоянным отступом o, держит скорость V;
// считаются кадры касания стены на участке S0..S1 (по умолчанию 2560–2860: улица вдоль стены Старого города, замок, подъём).
// Русселл на поуле 2026: в замке 99–122 км/ч (кадры 233–241).
const H=require('/home/user/apex26/tools/harness');
const T=H.tracks(true).concat(H.tracks(false)).find(t=>t.key==='Baku');
const A=+(process.argv[2]||2560),B=+(process.argv[3]||2860),EX=+(process.argv[4]||0);   // EX — опыт: полотно и стены шире на EX м с каждой стороны на участке
const env=H.loadGame({seed:1});H.setupWeekend(env,{trackIdx:T.idx,diff:'normal',laps:5});H.startRaceAt(env,21);H.noRetirements(env);H.lightsOut(env);
env.evalIn(`field.forEach(c=>{c.retired=true;c.mesh.visible=false;c.u=0.5;});`);
const res=env.evalIn(`(function(){const M=track.M;
  const iAt=S=>{let b=0,d=1e9;for(let i=0;i<M;i++){const x=Math.abs(track.S[i]-S);if(x<d){d=x;b=i;}}return b;};
  for(let i=0;i<M;i++){const S=track.S[i];if(S>=${A}&&S<=${B}){track.HW[i]+=${EX};track.WL[i]+=${EX};track.WR[i]+=${EX};}}
  if(${EX})wallSegsBuild();
  const i0=iAt(${A}-120);
  let minHW=1e9,minS=0;for(let i=0;i<M;i++){const S=track.S[i];if(S>=${A}&&S<=${B}&&track.HW[i]<minHW){minHW=track.HW[i];minS=S;}}
  function place(V){const p=track.P[i0],f=track.F[i0];player.x=p.x;player.z=p.z;player.hdg=Math.atan2(f.x,f.z);player.speed=V;player.hint=i0;player.prevIdx=i0;player.steerAmt=0;player.lapLock=0;wallTouch=false;}
  function trial(V,o,ahK){place(V);let touch=0,minV=1e9;const dt=1/60;
    for(let f=0;f<60*25;f++){const pr=project(player.x,player.z,player.hint);const S=track.S[pr.idx];
      if(S>${B}+20)break;
      controls.gas=player.speed<V-0.3?1:0;controls.brake=player.speed>V+0.3?1:0;
      const ah=Math.max(2,Math.round(1+player.speed*ahK));const k=(pr.idx+ah)%M;const tx=track.P[k].x+track.R[k].x*o,tz=track.P[k].z+track.R[k].z*o;
      let d=Math.atan2(tx-player.x,tz-player.z)-player.hdg;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;const st=Math.max(-1,Math.min(1,-d*2.4));
      controls.left=st<-0.12?1:0;controls.right=st>0.12?1:0;
      update(dt);if(S>=${A}&&S<=${B}){if(wallTouch)touch++;minV=Math.min(minV,player.speed);}}
    return touch;}
  const out=[];
  for(const kmh of [45,50,55,60,65,70,80,100]){const V=kmh/3.6;let ok=0,n=0;
    for(const o of [-1,-0.5,0,0.5,1])for(const ahK of [0.08,0.12,0.16]){n++;if(trial(V,o,ahK)===0)ok++;}
    out.push(kmh+' км/ч: чисто '+ok+' из '+n);}
  return 'наименьшая полуширина на участке '+minHW.toFixed(2)+' м у S '+minS.toFixed(0)+'\\n'+out.join('\\n');})()`);
console.log(res);
