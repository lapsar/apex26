/* Справка: тряска болида на рельефе Монако (v1.16.28).
   Проезд круга с шагом кадра (20 м/с, 60 кадров) на отступах 0, ±2, ±4 м от осевой; высота и
   кивок — как в reliefSit, глаз пилота — как в updateCamera. Толчок — вертикальное ускорение
   глаза (в g, разрыв высоты даёт всплеск), кивок — изменение наклона за кадр.
   «мир» — высота по ближайшему отрезку (так болид стоял в v1.16.27), «болид» — по сечениям ленты.
   node tools/monaco-scan/relief-shake.js */
'use strict';
const H = require('../harness');
const env = H.loadGame({ seed: 3 });
H.setupWorld(env, { trackIdx: H.tracks().find(t => t.key === 'Monaco').idx });
const out = env.evalIn(`(function(){
  const M=track.M,step=0.33,res=[];
  function at(s,off){s=((s%track.length)+track.length)%track.length;
    let lo=0,hi=M-1;while(lo<hi){const m=(lo+hi+1)>>1;if(track.S[m]<=s)lo=m;else hi=m-1;}
    const k=lo,k2=(k+1)%M,t=(s-track.S[k])/((k2?track.S[k2]:track.length)-track.S[k]);
    const p=track.P[k],q=track.P[k2],r=track.R[k],r2=track.R[k2];
    return {x:p.x+(q.x-p.x)*t+(r.x*(1-t)+r2.x*t)*off,z:p.z+(q.z-p.z)*t+(r.z*(1-t)+r2.z*t)*off};}
  for(const car of [false,true])for(const off of [0,-2,2,-4,4]){
    let prev=null,pp=null,acc=0,nod=0,big=0;
    for(let s=0;s<track.length;s+=step){const a=at(s,off),b=at(s+0.5,off),h=Math.atan2(b.x-a.x,b.z-a.z),fx=Math.sin(h),fz=Math.cos(h);
      const yf=reliefAt(a.x+fx*1.8,a.z+fz*1.8,car).y,yb=reliefAt(a.x-fx*1.8,a.z-fz*1.8,car).y,sl=(yf-yb)/3.6,cy=1.42+(yf+yb)/2-0.62*sl;
      if(pp){acc=Math.max(acc,Math.abs(cy-2*prev.cy+pp.cy)*3600/9.81);const d=Math.abs(Math.atan(sl)-Math.atan(prev.sl))*180/Math.PI;nod=Math.max(nod,d);if(d>0.3)big++;}
      pp=prev;prev={cy,sl};}
    res.push([car?'болид':'мир  ',off,acc.toFixed(1),nod.toFixed(2),big]);}
  return res;})()`);
console.log('высота   отступ  худший толчок, g  худший кивок, °/кадр  кивков > 0.3°');
out.forEach(r => console.log(r[0] + '   ' + String(r[1]).padStart(4) + '   ' + r[2].padStart(10) + '   ' + r[3].padStart(14) + '   ' + String(r[4]).padStart(10)));
