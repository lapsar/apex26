/* Справка: рельеф Монако «для глаза» (v1.16.27).
   1) каждая точка полотна, обочины и линии стены берёт высоту СВОЕЙ ноги трассы
      (reliefAt ищет ближайший отрезок; ошибка — чужая нога ближе, высота другая);
   2) земля нигде не выше полотна и обочины (сетка земли — нижняя огибающая);
   3) время сборки рельефа.
   node tools/monaco-scan/relief-audit.js */
'use strict';
const H = require('../harness');
const env = H.loadGame({ seed: 3 });
const ti = H.tracks().find(t => t.key === 'Monaco' || t.name === 'Monaco').idx;
const t0 = Date.now(); H.setupWorld(env, { trackIdx: ti }); const tb = Date.now() - t0;
const out = env.evalIn(`(function(){
  const M=track.M,R=track.relief,bad=[];let n=0,worst=0;
  for(let k=0;k<M;k++){const p=track.P[k],r=track.R[k];
    for(const off of [-track.WL[k],-track.HW[k],0,track.HW[k],track.WR[k]]){
      const x=p.x+r.x*off,z=p.z+r.z*off,y=reliefY(x,z),e=Math.abs(y-R.HY[k]);n++;
      if(e>0.15){bad.push([Math.round(track.S[k]),off.toFixed(1),y.toFixed(2),R.HY[k].toFixed(2)]);}
      worst=Math.max(worst,e);}}
  // земля против полотна: высота земли (по сетке) под точками полотна
  let gr=null;scene.traverse(o=>{if(o.isMesh&&o.userData.reliefDone&&o.geometry.index&&!gr)gr=o;});
  const pa=gr.geometry.attributes.position,ix=gr.geometry.index.array;
  // растр земли: по треугольникам — ищем, превышает ли земля полотно у точек полотна
  const tri=[];for(let i=0;i<ix.length;i+=3)tri.push([ix[i],ix[i+1],ix[i+2]]);
  const cell=new Map(),C=20;
  tri.forEach((t,ti)=>{let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const v of t){x0=Math.min(x0,pa.getX(v));x1=Math.max(x1,pa.getX(v));z0=Math.min(z0,pa.getZ(v));z1=Math.max(z1,pa.getZ(v));}
    if(x1-x0>60)return;for(let a=Math.floor(x0/C);a<=Math.floor(x1/C);a++)for(let b=Math.floor(z0/C);b<=Math.floor(z1/C);b++){const k=a*100000+b;if(!cell.has(k))cell.set(k,[]);cell.get(k).push(ti);}});
  function gy(x,z){const l=cell.get(Math.floor(x/C)*100000+Math.floor(z/C))||[];
    for(const ti of l){const [a,b,c]=tri[ti];const ax=pa.getX(a),az=pa.getZ(a),bx=pa.getX(b),bz=pa.getZ(b),cx=pa.getX(c),cz=pa.getZ(c);
      const d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);const l1=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,l2=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d,l3=1-l1-l2;
      if(l1>=-1e-6&&l2>=-1e-6&&l3>=-1e-6)return l1*pa.getY(a)+l2*pa.getY(b)+l3*pa.getY(c);}return null;}
  let up=0,upw=0,m=0;const ups=[];
  for(let k=0;k<M;k++){const p=track.P[k],r=track.R[k];
    for(let off=-track.WL[k];off<=track.WR[k];off+=1){const x=p.x+r.x*off,z=p.z+r.z*off,g=gy(x,z);if(g===null)continue;m++;
      const d=g-reliefY(x,z);if(d>-0.02){up++;if(d>upw)upw=d;if(ups.length<12)ups.push([Math.round(track.S[k]),off.toFixed(0),d.toFixed(2)]);}}}
  return {n,bad:bad.length,badList:bad.slice(0,25),worst:worst.toFixed(2),m,up,upw:upw.toFixed(2),ups};})()`);
console.log('сборка мира Монако с рельефом: ' + tb + ' мс');
console.log('точек полотна/обочины/стены: ' + out.n + ', чужая нога (ошибка > 0.15 м): ' + out.bad + ', худшая ' + out.worst + ' м');
out.badList.forEach(b => console.log('   S ' + b[0] + ' отступ ' + b[1] + ' м: ' + b[2] + ' вместо ' + b[3]));
console.log('земля выше полотна/обочины (ближе 2 см): ' + out.up + ' из ' + out.m + ', худшая +' + out.upw + ' м');
out.ups.forEach(b => console.log('   S ' + b[0] + ' отступ ' + b[1] + ': +' + b[2]));
