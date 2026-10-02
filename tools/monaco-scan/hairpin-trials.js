// Справка (10.2026, вопрос владельца «шпилька узкая»): node tools/monaco-scan/hairpin-trials.js [сдвиг внешней стены, м] [сдвиг внутренней, м]
// Перебор скорости, отступа подъезда и точки поворота в НАСТОЯЩЕЙ физике игры, касания стен в шпильке S 1215-1305 (геометрия v1.16.22+).
// Шпилька Монако в НАСТОЯЩЕЙ физике игры: скорость V, подъезд с отступом o, руль до упора с S1 до выравнивания на выход.
const H=require('/home/user/apex26/tools/harness');
const T=H.tracks(false).find(t=>t.key==='Monaco');
const exO=+(process.argv[2]||0), exI=+(process.argv[3]||0);
const env=H.loadGame({seed:1});H.setupWeekend(env,{trackIdx:T.idx,diff:'normal',laps:5});H.startRaceAt(env,21);H.noRetirements(env);H.lightsOut(env);
env.evalIn(`field.forEach(c=>{c.retired=true;c.mesh.visible=false;c.u=0.5;});`);   // соперники не мешают
const res=env.evalIn(`(function(){const M=track.M;
  for(let i=0;i<M;i++){const S=track.S[i];if(S>=1225&&S<=1300){const f=Math.min(1,(S-1225)/12,(1300-S)/12);track.WR[i]+=${exO}*f;track.WL[i]+=${exI}*f;}}
  const iAt=S=>{let b=0,d=1e9;for(let i=0;i<M;i++){const x=Math.abs(track.S[i]-S);if(x<d){d=x;b=i;}}return b;};
  const i0=iAt(1140),iE=iAt(1300);const hEnd=Math.atan2(track.F[iE].x,track.F[iE].z);
  function place(){const p=track.P[i0],f=track.F[i0];player.x=p.x;player.z=p.z;player.hdg=Math.atan2(f.x,f.z);player.speed=14;player.hint=i0;player.prevIdx=i0;player.steerAmt=0;player.lapLock=0;wallTouch=false;}
  function trial(V,o,S1){place();let mode=0,touch=0;const dt=1/60;
    for(let f=0;f<60*20;f++){const pr=project(player.x,player.z,player.hint);const S=track.S[pr.idx];
      if(S>1310&&S<2000)break;
      // скорость
      controls.gas=player.speed<V-0.3?1:0;controls.brake=player.speed>V+0.3?1:0;
      let st=0;
      if(mode===0&&S>=S1)mode=1;
      if(mode===1){let d=hEnd-player.hdg;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;st=-1; if(d<0.05)mode=2;}  // влево до упора (hdg-=steer*.. ; влево = -1)
      if(mode!==1){const ah=Math.max(3,Math.round(2+player.speed*0.15));const k=(pr.idx+ah)%M;const tx=track.P[k].x+track.R[k].x*(mode===0?o:0),tz=track.P[k].z+track.R[k].z*(mode===0?o:0);
        let d=Math.atan2(tx-player.x,tz-player.z)-player.hdg;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;st=Math.max(-1,Math.min(1,-d*2.4));}
      controls.left=st<-0.12?1:0;controls.right=st>0.12?1:0;
      update(dt);if(wallTouch&&S>1215&&S<1305)touch++;}
    return touch;}
  const out=[];
  for(const kmh of [35,40,45,50,55,60]){const V=kmh/3.6;let ok=0,n=0,bestRun=0;
    for(let o=-4;o<=4;o+=2){let cur=0;for(let S1=1215;S1<=1265;S1+=2){n++;const t=trial(V,o,S1);if(t===0){ok++;cur+=2;bestRun=Math.max(bestRun,cur);}else cur=0;}}
    out.push(kmh+' км/ч: чисто '+ok+'/'+n+', окно до '+bestRun+' м');}
  return out.join(' | ');})()`);
console.log('внешняя +'+exO+', внутренняя +'+exI+':  '+res);
