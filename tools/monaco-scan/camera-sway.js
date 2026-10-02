/* Справка: качка НАСТОЯЩЕЙ камеры кокпита на рельефе Монако (v1.16.29). Болид ведётся по кругу
   (20 и 50 м/с, 60 кадров, отступ 0 и ±4 м) через игровые placePlayer и updateCamera; кивок камеры —
   угол её взгляда к горизонту. Качка — отклонение от среднего по 30 м пути (сам холм — длинная волна).
   Сравнить сборки: APEX_INDEX=archive/v1.16.28.html node tools/monaco-scan/camera-sway.js */
'use strict';
const H = require('../harness');
const env = H.loadGame({ seed: 3 });
H.setupWorld(env, { trackIdx: H.tracks().find(t => t.key === 'Monaco').idx });
const out = env.evalIn(`(function(){
  if(!player){const r=ROSTER[0];player=makeState(r.name,r.num,r.color,r.skill,true);scene.add(player.mesh);}
  const M=track.M,res=[],d=new THREE.Vector3();camMode='cockpit';
  function at(s,off){s=((s%track.length)+track.length)%track.length;
    let lo=0,hi=M-1;while(lo<hi){const m=(lo+hi+1)>>1;if(track.S[m]<=s)lo=m;else hi=m-1;}
    const k=lo,k2=(k+1)%M,t=(s-track.S[k])/((k2?track.S[k2]:track.length)-track.S[k]);
    const p=track.P[k],q=track.P[k2],r=track.R[k],r2=track.R[k2];
    return {x:p.x+(q.x-p.x)*t+(r.x*(1-t)+r2.x*t)*off,z:p.z+(q.z-p.z)*t+(r.z*(1-t)+r2.z*t)*off};}
  for(const v of [20,50])for(const off of [0,-4,4]){const step=v/60,A=[];
    for(let s=-30;s<track.length;s+=step){const a=at(s,off),b=at(s+0.5,off);
      player.x=a.x;player.z=a.z;player.hdg=Math.atan2(b.x-a.x,b.z-a.z);placePlayer(player);updateCamera(1/60);
      cam.updateMatrixWorld(true);cam.getWorldDirection(d);if(s>=0)A.push(Math.asin(d.y)*180/Math.PI);}
    const n=A.length,W=Math.round(30/step/2)*2;let rms=0,mx=0;
    for(let i=0;i<n;i++){let a=0,c=0;for(let j=-W/2;j<=W/2;j++){a+=A[(i+j+n)%n];c++;}const r=A[i]-a/c;rms+=r*r;mx=Math.max(mx,Math.abs(r));}
    res.push([v,off,Math.sqrt(rms/n).toFixed(2),mx.toFixed(2)]);}
  return res;})()`);
console.log('скорость м/с | отступ | качка камеры: средняя ° | худшая °');
out.forEach(r => console.log(r.join(' | ')));
