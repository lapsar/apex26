/* ============================================================================
   Пробник 4 — ОБЪЕЗД СТОЯЩЕГО НА СТАРТЕ

   Игрок стоит на 11-й позиции и не трогается вообще. За 25 с все 11 соперников
   позади него обязаны объехать неподвижный болид и уйти вперёд.

   Сходы отключены: они убирают машины из потока и портят счёт.
   Гоняется на нескольких зёрнах — реакции, полосы и сторона обгона случайны.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const SECONDS = 25;
const CLEAR = 5;                 // «объехал» = ушёл вперёд минимум на 5 м

function run(opt) {
  opt = opt || {};
  const diff = opt.diff || 'normal';
  const seeds = opt.seed ? [opt.seed] : [1, 2, 3];
  const r = R.result(`Объезд стоящего на старте — 11 из 11 за ${SECONDS} с`);

  for (const T of H.tracks(true)) {                    // видимые в меню: гоночные пробники долгие
    const ti = T.idx;
    for (const seed of seeds) {
      const env = H.loadGame({ seed });
      H.setupWeekend(env, { trackIdx: ti, diff, laps: 3 });
      H.startRaceAt(env, 11);
      H.noRetirements(env);
      H.lightsOut(env);
      const res = env.evalIn(`(function(){
        var dt=1/60;
        var behind=field.filter(function(c){return c.dist < player.dist;});
        for(var f=0;f<Math.round(${SECONDS}/dt);f++) __drive(1,dt,'idle');   // игрок не жмёт ничего
        var stuck=[];
        behind.forEach(function(c){
          if(!(c.dist > player.dist + ${CLEAR}))
            stuck.push(c.code+' (отстаёт на '+(player.dist-c.dist).toFixed(1)+' м, '+c.speed.toFixed(0)+' м/с)');
        });
        return {behind:behind.length, passed:behind.length-stuck.length, stuck:stuck,
                shoved:+(player.dist+gridSpot(gridPos).back).toFixed(1), v:+player.speed.toFixed(2)};
      })()`);

      const name = env.evalIn('track.name');
      r.line(`${name.padEnd(12)} зерно ${seed}: объехали ${res.passed}/${res.behind}`
        + ` · стоящего протолкнули вперёд на ${res.shoved} м контактами`);
      if (res.passed !== res.behind) r.fail(`${name} / зерно ${seed}: застряли — ${res.stuck.join(', ')}`);
      if (res.behind !== 11) r.fail(`${name} / зерно ${seed}: позади игрока ${res.behind} соперников вместо 11`);
    }
  }
  if (r.ok) r.line(`поток обходит неподвижный болид на всех ${H.tracks(true).length} видимых трассах и всех зёрнах`);
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
