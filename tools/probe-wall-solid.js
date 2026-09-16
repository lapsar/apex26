/* ============================================================================
   Пробник — СКВОЗЬ БОРТ НЕ ПРОЕХАТЬ

   Владелец увидел на устройстве (09.2026): болид въезжает внутрь борта целиком
   или частично, после чего его мгновенно возвращает на трассу. Причина была
   в том, что физика стены читала ВИДИМОСТЬ ленты: там, где лента спрятана
   (в тесных апексах она сложилась бы сама на себя, §8 п.2), стены не было
   вовсе, хотя визуально разрыв закрыт прямой перемычкой wallBridges.
   Запись §8 «физика идёт по той же хорде» была неверной.

   Пробник меряет не формулу, а ПОВЕДЕНИЕ: болид ставится на осевую и
   толкается строго в борт. Через 90 кадров (22 м хода) он обязан остаться
   внутри линии барьера. Проверяются в первую очередь РАЗРЫВЫ ленты — ровно
   те места, где дыра и была, — плюс контрольные точки с лентой.

   Порог 1.0 м по центру болида: физика отталкивает по восьми точкам корпуса
   (колёса и крылья), поэтому центр вправе зайти за линию на полкорпуса вбок.
   Настоящая дыра даёт десятки метров — грубого порога достаточно.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const OVER = 1.0;      // м за линией барьера по ЦЕНТРУ болида — больше считается проездом
const FRAMES = 90;     // кадров езды в борт
const SPEED  = 15;     // м/с строго поперёк дороги
const SPOTS = 6;       // контрольных точек с лентой на трассу

/* где лента спрятана: середина каждого разрыва, по обеим сторонам */
const GAPS = `(function(){
  var M=track.M, out=[];
  [[-1,track.VL,'L'],[1,track.VR,'R']].forEach(function(t){
    var sign=t[0], V=t[1], side=t[2];
    if(!V) return;
    for(var i=0;i<M;i++){
      if(V[i]||!V[(i-1+M)%M]) continue;
      var len=0; while(len<M && !V[(i+len)%M]) len++;
      out.push({i:(i+(len>>1))%M, side:side, sign:sign, len:len, kind:'разрыв'});
    }
  });
  return out;
})()`;

/* один опыт: поставить болид на осевую в точке i и толкать строго В БОРТ

   Курс и скорость перезадаются КАЖДЫЙ кадр: иначе выравниватель руля разворачивает
   болид вдоль дороги, и до стены он не доезжает. Нас интересует только одно —
   остановит ли его проверка барьера. */
function ram(env, i, sign) {
  return env.evalIn(`(function(){
    var i=${i}, sign=${sign};
    var P=track.P[i], Rr=track.R[i];
    player.x=P.x; player.z=P.z; player.hint=i; player.prevIdx=i;
    player.arcPrev=track.S[i]; player.steerAmt=0; player.steerVis=0;
    var hdg=Math.atan2(Rr.x*sign, Rr.z*sign);
    var worst=-1e9, atIdx=i, wallAt=0;
    for(var f=0;f<${FRAMES};f++){
      player.hdg=hdg; player.speed=${SPEED};
      controls.gas=1; controls.brake=0; controls.left=0; controls.right=0;
      update(1/60);
      var pr=project(player.x,player.z,player.hint);
      var W=(pr.off>=0?track.WR:track.WL)[pr.idx];
      var ex=Math.abs(pr.off)-W;
      if(ex>worst){ worst=ex; atIdx=pr.idx; wallAt=W; }
    }
    return {over:+worst.toFixed(2), idx:atIdx, wall:+wallAt.toFixed(2)};
  })()`);
}

function run(opt) {
  opt = opt || {};
  const r = R.result('Сквозь борт не проехать — стена стоит и в разрывах ленты');

  for (const T of H.tracks()) {
    const env = H.loadGame({ seed: opt.seed || 11 });
    H.setupWeekend(env, { trackIdx: T.idx, laps: 1 });
    const name = env.evalIn('track.name');
    const M = env.evalIn('track.M');
    const hidden = T.hidden;

    const spots = env.evalIn(GAPS);
    const gaps = spots.length;
    for (let k = 0; k < SPOTS; k++) {                 // контрольные точки с лентой
      const i = Math.floor(M * (k + 0.5) / SPOTS);
      spots.push({ i, side: 'L', sign: -1, kind: 'лента' });
      spots.push({ i, side: 'R', sign: 1, kind: 'лента' });
    }

    let worst = -1e9, worstSpot = null, bad = [];
    for (const s of spots) {
      const m = ram(env, s.i, s.sign);
      if (m.over > worst) { worst = m.over; worstSpot = Object.assign({}, s, m); }
      if (m.over > OVER) bad.push(Object.assign({}, s, m));
    }

    const head = `${name.padEnd(12)} разрывов ленты ${String(gaps).padStart(2)}, опытов ${spots.length}; `
      + `глубже всего за линию ${worst.toFixed(2)} м (${worstSpot.kind}, ${worstSpot.side}, i=${worstSpot.idx})`;
    if (hidden) { r.note(head + ' — скрытая трасса, в зачёт не идёт'); continue; }
    r.line(head);
    if (bad.length) {
      r.fail(`${name}: болид вышел за барьер в ${bad.length} местах из ${spots.length} — `
        + bad.slice(0, 4).map(b => `${b.kind} ${b.side} i=${b.idx}: ${b.over.toFixed(1)} м`).join(', '));
    }
  }

  r.note(`порог ${OVER} м по центру болида: физика отталкивает по восьми точкам корпуса, центр вправе зайти за линию на полкорпуса вбок`);
  r.note('ловит возврат к проверке видимости ленты в физике игрока: в спрятанных участках стены не было вовсе');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
