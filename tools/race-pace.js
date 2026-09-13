/* ============================================================================
   ГОНОЧНЫЙ ТЕМП ПОЛЯ — средний, медианный и лучший круг соперников за полную гонку.

   ЗАЧЕМ. Якорь `pole` сторожит КВАЛИФИКАЦИОННЫЙ круг и считается формулой, которая
   не знает ни трафика, ни полосы, ни штрафа за съезд с линии. Поэтому правка, живущая
   в гонке, может не сдвинуть якорь ни на тысячную и при этом заметно поменять то,
   с какой скоростью поле реально едет. Эта справка меряет именно второе.

   ЛОВУШКА, стоившая первого прогона: время круга нельзя брать из `c.lapStart` —
   игра перезаписывает его в ТОМ ЖЕ кадре, в котором болид пересекает линию, поэтому
   разность выходит нулевой. Метку надо держать свою.

   Не пробник: порогов нет, эталонов не держит. Смысл имеет только сравнение
   двух сборок (через APEX_INDEX) на одних и тех же зёрнах.

   Запуск: node tools/race-pace.js [--laps=3] [--seeds=7,91,13] [--diffs=easy,normal,hard]
   ========================================================================== */
'use strict';
const H = require('./harness');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const LAPS = +arg('laps', '3');
const SEEDS = arg('seeds', '7,91,13').split(',').map(Number);
const DIFFS = arg('diffs', 'easy,normal,hard').split(',');

const rows = [];
for (const T of H.tracks(true)) {
  for (const diff of DIFFS) {
    const all = [];
    for (const seed of SEEDS) {
      const env = H.loadGame({ seed });
      H.setupWeekend(env, { trackIdx: T.idx, diff, laps: LAPS });
      H.startRaceAt(env, 11);
      H.lightsOut(env);
      H.noRetirements(env);
      env.evalIn(`var __pu={},__pt={},__laps=[];`);
      const dt = 1 / 60, secs = 120 * LAPS;
      env.evalIn(`__drive(${Math.round(secs / dt)},${dt},'auto',function(){
        if(phase!=='race'||!lights.go)return;
        for(var i=0;i<field.length;i++){var c=field[i];
          if(c===player||c.retired)continue;
          var p=__pu[c.num];
          if(p!==undefined&&p>0.6&&c.u<0.4){
            /* время круга считаем СВОЕЙ меткой: игра перезаписывает c.lapStart
               в том же кадре, и разность выходит нулевой */
            if(__pt[c.num]!==undefined)__laps.push(raceTime-__pt[c.num]);
            __pt[c.num]=raceTime;}
          __pu[c.num]=c.u;}
      });`);
      const laps = env.evalIn('__laps');
      for (const l of laps) if (l > 20 && l < 400) all.push(l);
    }
    all.sort((a, b) => a - b);
    const avg = all.reduce((s, x) => s + x, 0) / Math.max(1, all.length);
    rows.push({ track: T.name, diff, n: all.length, best: all[0], avg, med: all[all.length >> 1] });
  }
}
for (const r of rows) {
  console.log(`${r.track.padEnd(12)} ${r.diff.padEnd(7)} кругов ${String(r.n).padStart(4)}`
    + `   лучший ${r.best.toFixed(3)}   медиана ${r.med.toFixed(3)}   средний ${r.avg.toFixed(3)}`);
}
