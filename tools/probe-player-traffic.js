/* ============================================================================
   Пробник 16 — ТРАФИК ВОКРУГ ИГРОКА НЕ СТАЛ ПЛОТНЕЕ

   Сторож, а не проверка нового умения. Правки, делающие соперников настойчивее
   в обгоне ДРУГ ДРУГА, достаются заодно и игроку: болид, доводящий обгон до
   конца, доведёт его и против него. Это прямая угроза требованию «Новичок должен
   быть проходим ребёнком ~6.5 лет» (CLAUDE.md §2), а на узких трассах — ещё и
   лишний контакт.

   Меряется на каждой видимой трассе и на обоих играбельных режимах:
     • время круга игрока под автопилотом — сколько ему стоит трафик;
     • доля времени, когда ближайший соперник ближе 8 м (трафик рядом);
     • доля времени, когда ближайший соперник ближе 6.5 м (в затылок или борт о борт).

   Эталон снят с НЕТРОНУТОЙ сборки v1.15.44, до правки защёлки обгона, поэтому
   в момент записи он фиксирует именно то, что было.

   ЧЕГО ЗДЕСЬ НЕТ. Финишного места игрока: автопилот — грубая погоня за осевой,
   он и так приезжает последним почти везде, и проверка по месту была бы пустой
   (упёрта в пол). Проходимость «Новичка» ребёнком этот пробник тоже не проверяет
   и проверить не может — это только владелец на устройстве. Здесь ловится ровно
   одно: не стало ли поле вокруг игрока заметно плотнее и злее.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const NEAR = 8.0, TOUCH = 6.5;   // м между центрами: рядом / вплотную
// эталон v1.15.44: [время круга с, % кадров ближе 8 м, % кадров ближе 6.5 м]
const REF = {
  'easy|Monza':         [123.91, 70.1, 40.1],
  'easy|Silverstone':   [142.72, 14.8, 12.1],
  'easy|Montreal':      [109.09, 14.8, 10.7],
  'normal|Monza':       [117.09, 56.1, 36.5],
  'normal|Silverstone': [138.86, 15.3, 10.7],
  'normal|Montreal':    [107.09, 20.6, 15.8],
};
const LAP_SLACK = 0.04;          // круг игрока может просесть на 4 % — дальше трафик его держит
const NEAR_MUL = 1.6;            // во столько раз может вырасти время рядом с соперником

function run(opt) {
  opt = opt || {};
  const seeds = opt.seeds ? String(opt.seeds).split(',').map(Number) : [7, 91];
  const write = !!opt.write;     // --write печатает строки эталона, чтобы перенести их в REF
  const r = R.result('Трафик вокруг игрока не стал плотнее');
  const dump = [];

  for (const diff of ['easy', 'normal']) {
    for (const T of H.tracks(true)) {
      const rows = [];
      for (const seed of seeds) {
        const env = H.loadGame({ seed });
        H.setupWeekend(env, { trackIdx: T.idx, diff, laps: 1 });
        H.startRaceAt(env, 11);
        H.lightsOut(env);
        H.noRetirements(env);      // сход разредил бы поле и занизил давление
        rows.push(env.evalIn(`(function(){
          var dt=1/60, near=0, touch=0, frames=0;
          __drive(Math.round(900/dt),dt,'auto',function(){
            frames++;
            var bn=1e9;
            for(var i=0;i<field.length;i++){ var c=field[i]; if(c.retired) continue;
              var dx=c.x-player.x, dz=c.z-player.z, d=Math.sqrt(dx*dx+dz*dz);
              if(d<bn) bn=d; }
            if(bn<${NEAR}) near++;
            if(bn<${TOUCH}) touch++;
            return !(phase===''||raceOver);});
          var order=(window.__raceOrder||cars.slice().sort(rankCmp));
          return {lap:player.last, pos:order.findIndex(function(c){return c.isPlayer;})+1,
                  near:100*near/Math.max(1,frames), touch:100*touch/Math.max(1,frames)};})()`));
      }
      const n = rows.length;
      const lap = rows.reduce((a, x) => a + x.lap, 0) / n;
      const near = rows.reduce((a, x) => a + x.near, 0) / n;
      const touch = rows.reduce((a, x) => a + x.touch, 0) / n;
      const key = diff + '|' + T.name;
      const ref = REF[key];

      r.line(`${(diff === 'easy' ? 'Новичок' : 'Норма').padEnd(8)} ${T.name.padEnd(12)}`
        + ` круг ${lap.toFixed(2)} с · рядом ${near.toFixed(1)} % · вплотную ${touch.toFixed(1)} %`
        + ` · место P${(rows.reduce((a, x) => a + x.pos, 0) / n).toFixed(0)}`
        + (ref && ref[0] ? ` · эталон ${ref[0]} с / ${ref[1]} % / ${ref[2]} %` : ' · эталона нет'));
      dump.push(`  '${key}':${' '.repeat(Math.max(0, 20 - key.length))}[${lap.toFixed(2)}, ${near.toFixed(1)}, ${touch.toFixed(1)}],`);
      if (write) continue;
      if (!ref || !ref[0]) { r.note(`${key}: эталон не записан — снять прогоном с --write`); continue; }

      if (lap > ref[0] * (1 + LAP_SLACK))
        r.fail(`${key}: круг игрока ${lap.toFixed(2)} с против эталонных ${ref[0]} с`
          + ` — трафик стал дороже игроку`);
      if (near > ref[1] * NEAR_MUL + 1)
        r.fail(`${key}: рядом с соперником ${near.toFixed(1)} % времени против эталонных ${ref[1]} %`
          + ` — поле вокруг игрока заметно плотнее`);
      if (touch > ref[2] * NEAR_MUL + 1)
        r.fail(`${key}: вплотную к сопернику ${touch.toFixed(1)} % времени против эталонных ${ref[2]} %`
          + ` — контакта стало заметно больше`);
    }
  }

  if (write) { r.line('строки эталона:'); dump.forEach(s => r.line(s)); }
  r.note('автопилот не игрок: ловится смена обстановки в разы, проходимость «Новичка» проверяет только владелец');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
