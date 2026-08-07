/* ============================================================================
   Пробник 2 — ГОНКА ДОБЕГАЕТ ДО КОНЦА

   На каждой из четырёх трасс игрок стартует с середины решётки и едет
   автопилотом до клетчатого флага. Проверяется, что заезд заканчивается сам:
   finishRace() вызван, круги засчитаны, цикл не завис и не встал.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const LIMIT_MIN = 6;                 // потолок модельного времени на трассу, минут

function run(opt) {
  opt = opt || {};
  const laps = opt.laps || 1;
  const diff = opt.diff || 'normal';
  const seed = opt.seed || 4242;
  const r = R.result(`Гонка добегает до конца (${laps} кр., ${diff})`);
  let done = 0;

  for (let ti = 0; ti < 4; ti++) {
    const env = H.loadGame({ seed });
    H.setupWeekend(env, { trackIdx: ti, diff, laps });
    H.startRaceAt(env, 11);
    H.lightsOut(env);
    const res = env.evalIn(`(function(){
      var dt=1/60, n=0, max=Math.round(60*60*${LIMIT_MIN});
      while(!raceOver && n<max){ if(phase==='') break; __drive(1,dt,'auto'); n++; }
      var order=cars.slice().sort(rankCmp);
      return {secs:+(n*dt).toFixed(1), stalled:n>=max, over:raceOver, lap:player.lap, phase:phase,
              dist:+player.dist.toFixed(0), best:player.best, laps:totalLaps,
              pos:order.indexOf(player)+1, cars:cars.length,
              finished:order.filter(function(c){return !c.retired && c.dist>=track.length*totalLaps*0.98;}).length,
              retired:order.filter(function(c){return c.retired;}).length};
    })()`);

    const name = env.evalIn('track.name');
    r.line(`${name.padEnd(12)} ${String(res.secs).padStart(6)} с модельного времени · `
      + `круг ${res.lap}/${res.laps} · P${res.pos}/${res.cars} · лучший ${R.lap(res.best)} · сходов ${res.retired}`);
    if (res.stalled) r.fail(`${name}: гонка не закончилась за ${LIMIT_MIN} мин модельного времени (${res.dist} м пройдено)`);
    else if (!res.over) r.fail(`${name}: заезд прервался, raceOver=false (фаза «${res.phase}», круг ${res.lap})`);
    else if (res.lap < res.laps) r.fail(`${name}: финиш засчитан на круге ${res.lap} из ${res.laps}`);
    else done++;
    if (!isFinite(res.best)) r.fail(`${name}: ни одного полного круга не замерено`);
  }
  if (r.ok) r.line(`${done} из 4 трасс добежали`);
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
