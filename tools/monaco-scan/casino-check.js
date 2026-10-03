/* Справка к casino.py (v1.16.33): дома Монако по OSM — крыша над землёй под домом и запас до стены,
   по ПОСТРОЕННОМУ миру. Крыша ниже земли под домом (склон!) — дом утонул в горе; запас < 0 — дом за
   отбойником на асфальте.   node tools/monaco-scan/casino-check.js */
'use strict';
const H = require('../harness');
const env = H.loadGame({ seed: 3 });
const ti = H.tracks().find(t => t.key === 'Monaco').idx;
H.setupWorld(env, { trackIdx: ti });
const out = env.evalIn(`(function(){return (track.tunnelBld||[]).map(B=>{const o=B.o,pts=B.pts;
  let gmin=1e9,gmax=-1e9;for(const p of pts){const y=reliefY(p[0],p[1]);gmin=Math.min(gmin,y);gmax=Math.max(gmax,y);}
  const top=Math.max(o.top!=null?o.top:gmin+o.h,o.above!=null?gmax+o.above:-1e9);let m=1e9,S=null;
  for(let e=0;e<pts.length;e++){const a=pts[e],b=pts[(e+1)%pts.length],L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(L/0.5));
    for(let j=0;j<=n;j++){const x=a[0]+(b[0]-a[0])*j/n,z=a[1]+(b[1]-a[1])*j/n;
      for(let k=0;k<track.M;k++){const p=track.P[k],r=track.R[k],f=track.F[k],dx=x-p.x,dz=z-p.z;if(dx*dx+dz*dz>3600)continue;
        if(Math.abs(dx*f.x+dz*f.z)>2.5)continue;const off=dx*r.x+dz*r.z;if(tunnelOver(x,z)!=null)continue;
        const mm=Math.abs(off)-(off<0?track.WL[k]:track.WR[k]);if(mm<m){m=mm;S=Math.round(track.S[k]);}}}}
  return {name:o.name,top:+top.toFixed(1),gmin:+gmin.toFixed(1),gmax:+gmax.toFixed(1),m:+m.toFixed(2),S};});})()`);
let bad = 0;
out.forEach(b => {
  const sunk = b.top < b.gmax + 2, inside = b.m < 0.3;
  if (sunk || inside) bad++;
  console.log((sunk || inside ? '✗ ' : '  ') + b.name.padEnd(28) + ' крыша ' + String(b.top).padStart(5) + '  земля ' + b.gmin + '…' + b.gmax +
    '  до стены ' + (b.m > 1e8 ? '—' : b.m + ' м (S ' + b.S + ')'));
});
console.log(bad ? 'не сошлось: ' + bad : 'все дома: крыша выше земли под ними на 2+ м, до линии стены не ближе 0.3 м');
