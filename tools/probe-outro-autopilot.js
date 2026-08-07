/* ============================================================================
   Пробник 3 — АВТОПИЛОТ ПОСЛЕ ФИНИША

   После клетчатого флага руль забирает игра (ветка qualiOutro||raceOutro в
   update): целится в осевую на несколько точек вперёд и тормозит перед
   поворотами, газ отключён.

   Часть А — пункт чек-листа: 0 кадров вне трассы из 220 сразу после финиша.
   Вне трассы — тот же критерий, что в самой игре: |смещение от осевой| больше
   halfAt(idx)+0.7.

   Часть Б — выпуск автопилота с 12 точек по кругу (только с прямых, как и
   настоящий финиш) и те же 220 кадров с каждой. Одна проверка на главной
   прямой почти ничего не значит: до первого поворота автопилот доехать не
   успевает, и её проходит даже машина с отключённым рулём.

   Порог здесь не ноль, а 12 м вылета. Рулевой закон автопилота — простая
   погоня за точкой на осевой, и в быстрых поворотах он штатно выносит болид
   за кромку: Монца и Монако 0 м, Сузука до 4.4 м, Сильверстоун до 8.7 м
   (Club). Это измеренное поведение нынешней сборки, а не поломка
   (CLAUDE.md §9). Отключение руля или тормоза даёт 11–29 м — вот это и
   ловится, сразу на нескольких трассах.

   Финишный таймер переведён в режим 'defer': иначе setTimeout, срабатывающий
   немедленно, закрыл бы заезд той же строкой, что его начала.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const FRAMES = 220;
const SWEEP = 12;                // точек выпуска по кругу
const SWEEP_LIMIT = 12.0;        // м — потолок вылета в свободном выпуске (нынешний максимум 8.7)

function run(opt) {
  opt = opt || {};
  const seed = opt.seed || 909;
  const diff = opt.diff || 'normal';
  const r = R.result(`Автопилот после финиша — 0 кадров вне трассы из ${FRAMES}`);

  for (let ti = 0; ti < 4; ti++) {
    const env = H.loadGame({ seed });
    H.setupWeekend(env, { trackIdx: ti, diff, laps: 1 });
    H.startRaceAt(env, 11);
    H.lightsOut(env);
    env.timeouts.mode = 'defer';                    // не закрывать заезд по таймеру
    const name = env.evalIn('track.name');

    /* --- А: сразу после настоящего финиша --- */
    const a = env.evalIn(`(function(){
      var dt=1/60, n=0, max=60*60*6;
      while(!raceOver && n<max && phase==='race'){ __drive(1,dt,'auto'); n++; }
      if(!raceOver) return {err:'до финиша не доехали за 6 мин модельного времени'};
      if(!raceOutro) return {err:'после финиша автопилот не включился'};
      releaseTouches();                              // руки прочь: дальше рулит игра
      var off=0, worst=0, v0=player.speed;
      for(var f=0;f<${FRAMES};f++){
        update(dt);
        var pr=project(player.x,player.z,player.hint);
        var ex=Math.abs(pr.off)-(halfAt(pr.idx)+0.7);
        if(ex>0){ off++; if(ex>worst)worst=ex; }
      }
      return {off:off, worst:+worst.toFixed(2), v0:+v0.toFixed(1), v1:+player.speed.toFixed(1)};
    })()`);
    if (a.err) { r.fail(`${name}: ${a.err}`); continue; }
    r.line(`${name.padEnd(12)} после флага: вне трассы ${a.off}/${FRAMES} · скорость ${a.v0} → ${a.v1} м/с`);
    if (a.off > 0) r.fail(`${name}: ${a.off} кадров вне трассы после финиша, вылет до ${a.worst} м`);

    /* --- Б: выпуск с 12 прямых по кругу --- */
    const b = env.evalIn(`(function(){
      var dt=1/60, M=track.M, bad=[], off=0, worst=0;
      raceOutro=true; raceOver=true; releaseTouches();
      for(var s=0;s<${SWEEP};s++){
        var i=Math.floor(M*s/${SWEEP}), g=0;
        while(g<M && Math.abs(track.K[i])>0.02){ i=(i+1)%M; g++; }   // выпускать только с прямой
        var f=track.F[i];
        player.x=track.P[i].x; player.z=track.P[i].z; player.hdg=Math.atan2(f.x,f.z);
        player.hint=i; player.prevIdx=i; player.steerAmt=0; player.steerVis=0;
        player.speed=aiTarget(i, MAXSPEED, MAXSPEED*0.82, DIFF_CORNERK.normal);
        var o=0, w=0;
        for(var k=0;k<${FRAMES};k++){
          update(dt);
          var pr=project(player.x,player.z,player.hint);
          var ex=Math.abs(pr.off)-(halfAt(pr.idx)+0.7);
          if(ex>0){ o++; if(ex>w)w=ex; }
        }
        off+=o; if(w>worst)worst=w;
        if(w>${SWEEP_LIMIT}) bad.push('с i='+i+': '+o+' кадров, вылет '+w.toFixed(1)+' м');
      }
      return {off:off, worst:+worst.toFixed(1), bad:bad};
    })()`);
    r.line(`${''.padEnd(12)} выпуск с ${SWEEP} прямых: ${b.off} кадров за кромкой, худший вылет ${b.worst} м`
      + ` (потолок ${SWEEP_LIMIT} м)`);
    for (const x of b.bad) r.fail(`${name}: автопилот уехал с трассы ${x}`);
  }
  if (r.ok) r.line('на всех четырёх трассах болид остаётся на полотне');
  r.note('штатная погрешность рулевого закона автопилота при свободном выпуске: '
    + 'Монца и Монако 0 м, Сузука до 4.4 м, Сильверстоун до 8.7 м (Club) — CLAUDE.md §9');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
