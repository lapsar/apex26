/* ============================================================================
   Пробник 6 — ПОСТАНОВКА НА РЕШЁТКЕ

   22 из 22 на своих местах. По каждой клетке k:
     • отступ назад совпадает с расчётным: (row+1)*GRID_GAP, второй в ряду —
       ещё на пол-клетки назад;
     • стороны чередуются: чётные слева, нечётные справа, |полоса| = HW*0.45;
     • болид стоит ровно в своей точке (та же непрерывная координата gu, что
       рисует и разметку) — расхождение 0 м, а не «почти 0»;
     • стартовый путь c.dist равен -back;
     • дуговое расстояние до линии старт/финиша равно отступу клетки.

   Именно здесь ловилась ошибка «ровно +4 м на любой позиции»: игрока сажали
   в ближайший индекс вместо непрерывной координаты.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const POS_TOL = 1e-6;            // м — постановка обязана быть точной
const ARC_TOL = 0.10;            // м — хорда против дуги при шаге разбиения 4 м
const GAP = 8.0;                 // GRID_GAP из CLAUDE.md §4 — константа баланса, пинуется явно
const LANE_K = 0.45;             // доля полуширины полотна, на которой стоят столбцы решётки

function run(opt) {
  opt = opt || {};
  const diff = opt.diff || 'normal';
  const r = R.result('Постановка на решётке — 22 из 22 на своих местах');

  for (let ti = 0; ti < 4; ti++) {
    const env = H.loadGame({ seed: opt.seed || 5 });
    H.setupWeekend(env, { trackIdx: ti, diff, laps: 3 });
    H.startRaceAt(env, 11);
    const res = env.evalIn(`(function(){
      __drive(1,1/60,'idle');                 // один кадр: placeAI ставит соперников по u/lane
      var M=track.M, grid=window.__grid, bad=[], maxPos=0, maxArc=0, sides='';
      for(var k=0;k<grid.length;k++){
        var gs=gridSpot(k);
        var row=Math.floor(k/2), wantBack=(row+1)*${GAP}+(k%2?${GAP}*0.5:0);
        var wantSide=(k%2)?1:-1, wantLane=wantSide*track.roadHalf*${LANE_K};
        var fi=gs.gu*M, i=Math.floor(fi)%M, i2=(i+1)%M, t=fi-Math.floor(fi);
        var p=track.P[i].clone().lerp(track.P[i2],t);
        var f=track.F[i].clone().lerp(track.F[i2],t); if(f.lengthSq()<1e-6)f.copy(track.F[i]); f.normalize();
        var rr=track.R[i].clone().lerp(track.R[i2],t).normalize();
        var want=p.clone().addScaledVector(rr,gs.lane);
        var num=grid[k].num, c=null;
        for(var j=0;j<cars.length;j++) if(cars[j].num===num) c=cars[j];
        if(!c){ bad.push('клетка '+(k+1)+': болида #'+num+' нет в заезде'); continue; }
        sides += (k%2?'П':'Л');
        var dPos=Math.hypot(c.x-want.x, c.z-want.z); if(dPos>maxPos)maxPos=dPos;
        var pr=project(c.x,c.z,i);
        var arc=track.S[pr.idx]+((c.x-track.P[pr.idx].x)*track.F[pr.idx].x+(c.z-track.P[pr.idx].z)*track.F[pr.idx].z);
        var behind=track.length-arc; if(behind>track.length*0.5) behind-=track.length;
        var dArc=Math.abs(behind-gs.back); if(dArc>maxArc)maxArc=dArc;
        var who=(c.isPlayer?'ИГРОК':c.code);
        if(Math.abs(gs.back-wantBack)>1e-9)
          bad.push('клетка '+(k+1)+' ('+who+'): отступ '+gs.back.toFixed(2)+' м вместо '+wantBack.toFixed(2));
        if(Math.abs(gs.lane-wantLane)>1e-9)
          bad.push('клетка '+(k+1)+' ('+who+'): полоса '+gs.lane.toFixed(3)+' вместо '+wantLane.toFixed(3));
        if(dPos>${POS_TOL})
          bad.push('клетка '+(k+1)+' ('+who+'): стоит в '+dPos.toFixed(3)+' м от своей точки');
        if(Math.abs(c.dist+gs.back)>1e-9)
          bad.push('клетка '+(k+1)+' ('+who+'): стартовый путь '+c.dist.toFixed(3)+' вместо '+(-gs.back).toFixed(3));
        if(dArc>${ARC_TOL})
          bad.push('клетка '+(k+1)+' ('+who+'): до линии старта '+behind.toFixed(2)+' м вместо '+gs.back.toFixed(2));
      }
      var alt=/^(ЛП)+$/.test(sides);
      return {n:grid.length, bad:bad, maxPos:maxPos, maxArc:maxArc, sides:sides, alt:alt,
              gap:GRID_GAP, half:track.roadHalf};
    })()`);

    const name = env.evalIn('track.name');
    r.line(`${name.padEnd(12)} ${res.n}/22 клеток · шаг ${res.gap} м · полоса ±${(res.half * LANE_K).toFixed(2)} м`
      + ` · отклонение точки ${res.maxPos.toExponential(1)} м · по дуге до ${res.maxArc.toFixed(3)} м`);
    if (res.gap !== GAP) r.fail(`${name}: GRID_GAP = ${res.gap} м вместо ${GAP} м (константа баланса, CLAUDE.md §4)`);
    if (res.n !== 22) r.fail(`${name}: на решётке ${res.n} болидов вместо 22`);
    if (!res.alt) r.fail(`${name}: стороны не чередуются — ${res.sides}`);
    for (const b of res.bad) r.fail(`${name}: ${b}`);
  }
  if (r.ok) r.line('решётка сходится на всех четырёх трассах');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
