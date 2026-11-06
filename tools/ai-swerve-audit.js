/* ============================================================================
   СПРАВКА — РЕЗКИЕ ПЕРЕСТРОЕНИЯ СОПЕРНИКОВ (06.11.2026, вопрос владельца п.37)

   Владелец (после v1.17.31, «дрожь»): «дрожи меньше, но иногда соперник резко
   и довольно амплитудно перестраивается — на грани телепортации».
   Скачка за кадр нет (вбок не быстрее 8 м/с — mlat, ≤ 13 см за кадр); резкость —
   ЦЕЛЬ полосы (want) прыгает за кадр на метры, и болид сразу идёт к ней вбок
   на пределе 8 м/с, нос поворачивается за 0.07 с.

   Что делает: в копию игрового скрипта ставит «датчики» в блок полосы соперника
   (какая ветка задала цель: линия гонки / объезд goAr / дуэль / объезд вставшего,
   кто передний, какая сторона) — сам index.html не меняется. Гонка с решётки
   (игрок — автопилот с P11), отсчёт с T0 секунд (первый круг — свалка старта):
     · «резкий манёвр» — за 0.5 с сдвиг вбок > 1.5 м и скорость вбок ≥ 7 м/с;
       причина — самый крупный скачок цели внутри манёвра;
     · «смена стороны» — объезжает ТОГО ЖЕ переднего, а цель перескочила > 1 м
       (сторона объезда сменилась на ходу: до v1.17.49 — 9 из 322 резких у v1.17.30,
       28 из 340 у v1.17.48).
   НЕ пробник, порога нет.

     node tools/ai-swerve-audit.js [индекс трассы=0] [зерно=7] [секунд=400] [T0=100]
     APEX_INDEX=<сборка> node tools/ai-swerve-audit.js …
   ========================================================================== */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const H = require('./harness');
const TR = +(process.argv[2] || 0), SEED = +(process.argv[3] || 7), SECS = +(process.argv[4] || 400), T0 = +(process.argv[5] || 100);
const SRC = process.env.APEX_INDEX ? path.resolve(process.env.APEX_INDEX) : path.join(__dirname, '..', 'index.html');

let src = fs.readFileSync(SRC, 'utf8');
function ins(anchor, post) {
  if (src.split(anchor).length !== 2) throw new Error('датчик не встал — нет единственного места: ' + anchor.slice(0, 60));
  src = src.replace(anchor, anchor + post);
}
ins('let want=line+c.laneJit;', "c._br='line';");
// цель объезда — внутри if(goAr){…}: датчик до закрывающей скобки
if (src.split('want=c.ahd.lane+ov*off;}').length !== 2) throw new Error('датчик объезда не встал');
src = src.replace('want=c.ahd.lane+ov*off;}', "want=c.ahd.lane+ov*off;c._br='goAr';}");
ins('else if(c.duel&&!c.ovLock)want=c.duel.lane+c.duelDir*LANE_OV;', "if(c._br!=='goAr'){if(c.duel&&!c.ovLock)c._br='duel';if(c.ovLock)c._br='lock';}c._ahdR=c.ahd;");
ins('let nl=c.lane+(', '');   // только проверка: блок полосы на месте
src = src.replace(/(const mix=c\.gridLane\+\(want-c\.gridLane\)\*eff;)/, '$1c._w=want;c._l0=c.lane;');
if (!src.includes('c._w=want;c._l0=c.lane;')) throw new Error('датчик цели не встал');
const tmp = path.join(os.tmpdir(), 'apex26-swerve-' + process.pid + '.html');
fs.writeFileSync(tmp, src);

const env = H.loadGame({ seed: SEED, file: tmp });
fs.unlinkSync(tmp);
H.setupWeekend(env, { trackIdx: TR, view: 'cockpit' }); H.startRaceAt(env, 11); H.lightsOut(env);
const r = env.evalIn(`(function(){var N=${SECS}*60,Q={},sharp=0,cause={},flips=0,jumps={};
  for(var f=0;f<N;f++){__AP.drive();update(1/60);var t=f/60;
    field.forEach(function(c,ci){if(c.retired||c._l0===undefined)return;var h=Q[ci]||(Q[ci]={q:[]});
      var fr={l:c.lane,w:c._w,br:c._br,ahd:c._ahdR,dl:c.lane-c._l0};c._l0=undefined;
      var p=h.q[h.q.length-1];
      if(p&&t>=${T0}&&Math.abs(fr.w-p.w)>1.0){
        var k=p.br===fr.br?(fr.br==='line'?'линия гонки':(p.ahd!==fr.ahd?fr.br+': другой передний':fr.br+': тот же передний')):p.br+'→'+fr.br;
        fr.jk=k;jumps[k]=(jumps[k]||0)+1;if(k==='goAr: тот же передний')flips++;}
      h.q.push(fr);if(h.q.length>31)h.q.shift();var n=h.q.length;if(n<31||t<${T0})return;
      if(Math.abs(h.q[30].l-h.q[0].l)>1.5&&(!h.last||f-h.last>45)){h.last=f;var vmax=0,jk='',wj=0;
        for(var k2=1;k2<31;k2++){var q=h.q[k2];vmax=Math.max(vmax,Math.abs(q.dl)*60);if(q.jk&&Math.abs(q.w-h.q[k2-1].w)>wj){wj=Math.abs(q.w-h.q[k2-1].w);jk=q.jk;}}
        if(vmax>=7){sharp++;var cl=jk||'без скачка цели';cause[cl]=(cause[cl]||0)+1;}}});}
  return {name:track.spec.name,sharp:sharp,cause:cause,flips:flips,jumps:jumps};})()`);
const fmt = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ');
console.log(`${r.name.padEnd(12)} зерно ${SEED}, ${T0}–${SECS} с: резких манёвров ${r.sharp} (${fmt(r.cause)}) · смен стороны объезда ${r.flips}`);
if (process.env.V) console.log('   скачки цели > 1 м: ' + fmt(r.jumps));
