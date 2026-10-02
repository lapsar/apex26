/* Справка: оставшаяся качка носа и камеры на рельефе Монако (02.10.2026, вопрос владельца после v1.16.28).
   Проезд круга (20 и 50 м/с, 60 кадров) на отступах 0 и ±4 м; кивок — как в reliefSit. Качка — отклонение
   наклона от его среднего по 30 м пути (длинная волна — сам холм, она задумана). Варианты лечения пробуются
   на месте, игра не меняется: сглаживание профиля HY по S (гаусс σ) и «камера-голова» — наклон камеры
   догоняет наклон болида с постоянной времени, с.
   node tools/monaco-scan/relief-sway.js */
'use strict';
const H = require('../harness');
const env = H.loadGame({ seed: 3 });
H.setupWorld(env, { trackIdx: 3 });
const out = env.evalIn(`(function(){
  const M=track.M,R=track.relief,HY0=Float32Array.from(R.HY);
  function smoothHY(sig){ // гаусс по S, шаг точек 4 м
    const w=Math.ceil(sig*3/4),k=[];let s=0;for(let j=-w;j<=w;j++){const v=Math.exp(-0.5*(j*4/sig)**2);k.push(v);s+=v;}
    const o=new Float32Array(M);for(let i=0;i<M;i++){let a=0;for(let j=-w;j<=w;j++)a+=HY0[(i+j+M)%M]*k[j+w];o[i]=a/s;}return o;}
  function at(s,off){s=((s%track.length)+track.length)%track.length;
    let lo=0,hi=M-1;while(lo<hi){const m=(lo+hi+1)>>1;if(track.S[m]<=s)lo=m;else hi=m-1;}
    const k=lo,k2=(k+1)%M,t=(s-track.S[k])/((k2?track.S[k2]:track.length)-track.S[k]);
    const p=track.P[k],q=track.P[k2],r=track.R[k],r2=track.R[k2];
    return {x:p.x+(q.x-p.x)*t+(r.x*(1-t)+r2.x*t)*off,z:p.z+(q.z-p.z)*t+(r.z*(1-t)+r2.z*t)*off};}
  function run(v,off,cam){const step=v/60,P=[],E=[];let cp=null;
    for(let s=0;s<track.length;s+=step){const a=at(s,off),b=at(s+0.5,off),h=Math.atan2(b.x-a.x,b.z-a.z),fx=Math.sin(h),fz=Math.cos(h);
      const yf=reliefAt(a.x+fx*1.8,a.z+fz*1.8,true).y,yb=reliefAt(a.x-fx*1.8,a.z-fz*1.8,true).y;let sl=(yf-yb)/3.6;
      if(cam){cp=cp===null?sl:cp+(sl-cp)*Math.min(1,(1/60)/cam);sl=cp;}
      P.push(Math.atan(sl)*180/Math.PI);E.push(1.42+(yf+yb)/2-0.62*sl+14*sl);} // точка взгляда относительно...
    // качка = отклонение от сглаженного по 1 с (длинная волна — сам холм)
    const n=P.length,W=Math.round(30/step/2)*2;let rms=0,mx=0,flips=0,prevd=0;
    for(let i=0;i<n;i++){let a=0,c=0;for(let j=-W/2;j<=W/2;j++){a+=P[(i+j+n)%n];c++;}const r=P[i]-a/c;rms+=r*r;mx=Math.max(mx,Math.abs(r));}
    return {rms:Math.sqrt(rms/n).toFixed(2),max:mx.toFixed(2)};}
  const res=[];
  for(const [nm,hy,cam] of [['сейчас',HY0,0],['профиль сглажен σ 6 м',smoothHY(6),0],['профиль сглажен σ 10 м',smoothHY(10),0],['камера-голова 0.15 с',HY0,0.15],['σ 8 м + камера 0.15 с',smoothHY(8),0.15],['σ 8 м + камера 0.25 с',smoothHY(8),0.25]]){
    R.HY=hy;let dev=0;for(let i=0;i<M;i++)dev=Math.max(dev,Math.abs(hy[i]-HY0[i]));
    for(const v of [20,50])for(const off of [0,-4,4]){const r=run(v,off,cam);res.push([nm,dev.toFixed(2),v,off,r.rms,r.max]);}}
  R.HY=HY0;return res;})()`);
console.log('вариант | сдвиг полотна, м | скорость м/с | отступ | качка носа: средняя ° | худшая °');
out.forEach(r => console.log(r.join(' | ')));
