/* ============================================================================
   Справка — НЕ ВЫГОДНО ЛИ «ЕХАТЬ НА СТЕНЕ» (v1.16.49)

   С v1.16.49 касание стены по касательной дешёвое (wall-touch-audit). Риск такой
   правки — стена становится тормозом и рулём: влетел в поворот быстрее, чем можно,
   и проехал его, опираясь на внешнюю стену.

   Опыт по ОТДЕЛЬНЫМ поворотам (круг автопилота для этого не годится: он осторожен,
   и позднее торможение ускоряет его и без всякой стены). Для каждого крутого
   поворота болид ставится за 200 м до вершины на скорость, с которой туда приходит
   автопилот, и едет до 150 м после неё. Руль — автопилот harness, скорость вне
   поворота — тоже автопилот (одинаково во всех заездах); меняется ТОЛЬКО скорость vc,
   на которую пилот тормозит «точно в точку» к вершине и держит до выхода из поворота
   (0.6…2.0 от скорости автопилота в вершине). Из всех заездов берутся лучший ЧИСТЫЙ
   (без касания) и лучший С КАСАНИЕМ. Если второй быстрее — стена выгоднее тормоза
   на этом повороте. Печатает выигрыш стены, с (плюс — стена выгоднее).
   Оговорка: руль автопилота не идеален — у старой сборки тоже бывают плюсы; смотреть
   разницу сборок, а не ноль.

   Режим Профи (автопилот читает DIFF_CORNERK). Сравнивать сборки — двумя
   процессами: APEX_INDEX=archive/v1.16.48.html.
   Запуск: node tools/wall-ride-audit.js [--track=monaco] [--fps=60]
   ========================================================================== */
'use strict';
const H = require('./harness');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const ONLY = arg('track', '');
const DT = 1 / Number(arg('fps', '60'));
const VCS = vl => { const a = []; for (let f = 0.6; f < 2.001; f += 0.025) a.push(+(vl * f).toFixed(3)); return a; };
const BEFORE = 200, AFTER = 150;

const SRC = `
var __K0=DIFF_CORNERK.hard;
// Пилот: руль автопилота; скорость — автопилот (×1.3, одинаково во всех заездах), но перед вершиной
// ИЗУЧАЕМОГО поворота — тормоз «точно в точку» на vc (замедление 45 м/с², у болида 50), до выхода из
// поворота держит vc, дальше снова автопилот.
function __cornerRun(i0, ia, ib, vin, vc, dt, len){
  var P=track.P[i0], F=track.F[i0], M=track.M;
  player.x=P.x; player.z=P.z; player.hdg=Math.atan2(F.x,F.z); player.speed=vin;
  player.hint=i0; player.prevIdx=i0; player.arcPrev=track.S[i0]; player.dist=0; player.lapLock=0;
  player.steerAmt=0; player.steerVis=0; player.revArm=0; player.revLeft=REV_RANGE;
  wallTouch=false; qualiLapsLeft=99; DIFF_CORNERK.hard=__K0*1.69;
  var Sa=track.S[ia], Sb=track.S[ib], L=track.length, t=0, touch=0, was=false, tw=0, n=Math.round(60/dt);
  for(var k=0;k<n;k++){
    __AP.drive();
    var s=track.S[player.hint], da=Sa-s, db=Sb-s;
    if(da<-L/2)da+=L; if(da>L/2)da-=L; if(db<-L/2)db+=L; if(db>L/2)db-=L;
    if(db>0){ var vt=da>0?Math.sqrt(vc*vc+2*45*da):vc;
      if(player.speed>vt+0.5){controls.gas=0;controls.brake=1;} else if(player.speed<vt){ if(controls.brake){controls.brake=0;controls.gas=1;} } else {controls.gas=0;controls.brake=0;}
      if(controls.gas&&player.speed>=vt)controls.gas=0; }
    var d0=player.dist; update(dt); t+=dt;
    if(wallTouch){ tw+=dt; if(!was) touch++; } was=wallTouch;
    if(player.dist>=len){ DIFF_CORNERK.hard=__K0; return { t:t-dt*(player.dist-len)/Math.max(1e-6,player.dist-d0), touch:touch, tw:tw }; } }
  DIFF_CORNERK.hard=__K0; return { t:Infinity, touch:touch, tw:tw };
}`;

console.log('файл: ' + H.INDEX_HTML);
let total = 0, worse = 0;
for (const T of H.tracks(true)) {
  if (ONLY && T.key.toLowerCase() !== ONLY.toLowerCase()) continue;
  const env = H.loadGame({ seed: 11 });
  H.setupWeekend(env, { trackIdx: T.idx, diff: 'hard' });
  env.evalIn(SRC);
  // скорость автопилота по кругу (f = 1) и вершины крутых поворотов
  const info = env.evalIn(`(function(){
    var M=track.M, step=track.length/M, v=new Array(M).fill(0);
    qualiLapsLeft=99; var n=Math.round(500/${DT});
    for(var k=0;k<n;k++){ __AP.drive(); update(${DT}); v[player.hint]=player.speed; if(player.lap>=2) break; }
    var ap=[]; for(var i=0;i<M;i++){ var a=Math.abs(track.K[i]); if(a<0.02) continue; var top=true;
      for(var w=-12;w<=12;w++) if(Math.abs(track.K[(i+w+M)%M])>a) top=false;
      if(top && (!ap.length || (i-ap[ap.length-1].i)*step>60)) ap.push({i:i, R:1/a, S:track.S[i]}); }
    ap.forEach(function(c){ c.i0=(c.i-Math.round(${BEFORE}/step)+M)%M; c.v0=v[c.i0]||30; c.R=24/Math.abs(track.K[c.i]);
      var j=c.i; while(Math.abs(track.K[j%M])>0.006 && (j-c.i)*step<120) j++; c.ib=j%M;   // выход: кривизна спала
      c.vlim=Math.max(8,v[c.i]||15); });
    return {ap:ap, step:step};
  })()`);
  const lines = [];
  let gainSum = 0, nWorse = 0;
  for (const c of info.ap) {
    let clean = null, dirty = null;
    for (const vc of VCS(c.vlim)) {
      const r = env.evalIn(`__cornerRun(${c.i0},${c.i},${c.ib},${c.v0},${vc},${DT},${BEFORE + AFTER})`);
      if (!isFinite(r.t)) continue;
      if (r.touch === 0) { if (!clean || r.t < clean.t) clean = { t: r.t, vc }; }
      else if (!dirty || r.t < dirty.t) dirty = { t: r.t, vc, touch: r.touch, tw: r.tw };
    }
    total++;
    let cell;
    if (!clean) cell = 'чистого нет';
    else if (!dirty) cell = 'касаний нет';
    else {
      const g = clean.t - dirty.t;
      if (g > 0.005) { worse++; nWorse++; gainSum += g; }
      cell = `${g >= 0 ? '+' : ''}${g.toFixed(2)} с (чисто ${Math.round(clean.vc * 3.6)} км/ч ${clean.t.toFixed(2)}, `
        + `со стеной ${Math.round(dirty.vc * 3.6)} км/ч ${dirty.t.toFixed(2)}, ${dirty.touch} кас., ${dirty.tw.toFixed(2)} с на стене)`;
    }
    lines.push(`   S=${String(Math.round(c.S)).padStart(4)} R=${String(Math.round(c.R)).padStart(3)} м: ${cell}`);
  }
  console.log(`${T.name}: поворотов ${info.ap.length}, стена выгоднее в ${nWorse}, сумма выигрыша ${gainSum.toFixed(2)} с`);
  lines.forEach(l => console.log(l));
}
console.log(`\nвсего поворотов ${total}, со стеной быстрее в ${worse}`);
