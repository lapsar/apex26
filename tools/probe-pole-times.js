/* ============================================================================
   Пробник 1 — ВРЕМЕНА ПОУЛА (главный тест проекта)

   Поул = самый быстрый круг из всех 22 пилотов, посчитанный estLapTime по тем
   же константам, что и в игре (MAXSPEED, DIFF_MUL, DIFF_GRIP, CORNER_SKILL,
   сила пилота). Случайный разброс квалификации (±0.2 %) сюда не входит — он
   есть в игре, но эталон в CLAUDE.md §4 записан по чистому расчёту.

   С v1.15.66 якорь проверяет ТРИ клетки на сочетание, а не одну: поул (P1),
   середину поля (P11) и последнего (P22). Причина записана в §10 п.3: раз
   правка меняет РАЗБРОС поля, один только поул смотрит ровно туда, где по
   замыслу ничего не меняется, и разброс уехал бы молча.

   После любой правки, которая не должна менять баланс, все 45 клеток обязаны
   совпасть до тысячной.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

/* Эталон из CLAUDE.md §4. Посчитан ДО правки v1.15.66, на нетронутом
   index.html, подстановкой будущего закона в estLapTime — и код после правки
   выдал ровно эти числа. Значения: [P1, P11, P22] в секундах. */
const TABLE = {
  Monza:       { easy: [94.746, 97.585, 98.893],  normal: [90.877, 93.240, 94.331],  hard: [88.342, 89.964, 90.806] },
  Silverstone: { easy: [113.630, 116.941, 118.440], normal: [108.123, 111.179, 112.558], hard: [105.392, 108.088, 109.286] },
  Suzuka:      { easy: [112.705, 116.158, 117.710], normal: [107.070, 110.202, 111.593], hard: [104.050, 106.769, 108.049] },
  Monaco:      { easy: [81.847, 83.742, 84.601],  normal: [78.456, 80.240, 81.016],  hard: [76.921, 78.648, 79.423] },
  Montreal:    { easy: [83.765, 86.130, 87.193],  normal: [80.151, 82.211, 83.166],  hard: [78.094, 79.748, 80.566] },
};

/* Прежняя таблица, действовавшая до v1.15.66 (закон сцепления ИИ — постоянное
   боковое ускорение 20/22/24 м/с², прямолинейный темп не привязан к потолку
   игрока и не читал track.grip). Оставлена намеренно, как требует §10 п.3:
   старый якорь хранится рядом с пометкой, при какой версии действовал.
   Только поул — разброса поля тогда якорь не сторожил.
     Monza       1:44.036 / 1:36.232 / 1:29.935
     Silverstone 1:52.198 / 1:46.062 / 1:41.666
     Suzuka      1:51.428 / 1:45.286 / 1:40.773
     Monaco      1:15.033 / 1:12.716 / 1:11.184
     Montreal    1:23.678 / 1:18.627 / 1:14.999                                */

const DIFFS = ['easy', 'normal', 'hard'];
const RU = { easy: 'Новичок', normal: 'Норма', hard: 'Профи' };
const SLOT = ['P1', 'P11', 'P22'];

function run() {
  const r = R.result('Времена поула и разброс поля — якорь регрессии (CLAUDE.md §4)');
  const env = H.loadGame();
  const names = env.evalIn('TRACKS.map(function(t){return t.name;})');

  let checked = 0;
  r.line('Трасса        ' + DIFFS.map(d => RU[d].padEnd(18)).join('') + '  (поул)');
  for (let i = 0; i < names.length; i++) {
    env.evalIn(`track=makeTrack(TRACKS[${i}]);`);
    const cells = [];
    for (const d of DIFFS) {
      const got = env.evalIn(`(function(){
        var mul=DIFF_MUL[${JSON.stringify(d)}], gf=DIFF_GRIP[${JSON.stringify(d)}];
        var ts=ROSTER.slice(0,22).map(function(dr){
          return estLapTime(aiBase(dr.skill,mul), aiGrip(dr.skill,gf));
        }).sort(function(a,b){return a-b;});
        return [ts[0],ts[10],ts[21]];
      })()`);
      const want = (TABLE[names[i]] || {})[d];
      if (want === undefined) {
        r.note(`${names[i]} / ${RU[d]}: эталона в таблице нет, измерено ${got.map(R.lap).join(' / ')}`);
        cells.push((R.lap(got[0]) + ' ?').padEnd(18));
        continue;
      }
      let ok = true;
      for (let k = 0; k < 3; k++) {
        checked++;
        if (R.lap(got[k]) !== R.lap(want[k])) {
          ok = false;
          r.fail(`${names[i]} / ${RU[d]} / ${SLOT[k]}: ожидалось ${R.lap(want[k])}, получено ${R.lap(got[k])} (${got[k].toFixed(6)} с)`);
        }
      }
      cells.push((ok ? R.lap(got[0]) : R.lap(got[0]) + ' ≠ ' + R.lap(want[0])).padEnd(18));
    }
    r.line(names[i].padEnd(14) + cells.join(''));
  }
  // разброс поля печатается заметкой: он полезен глазами, а сторожат его клетки P22
  for (let i = 0; i < names.length; i++) {
    const t = TABLE[names[i]]; if (!t) continue;
    r.note(`${names[i]}: разброс P1→P22 ` + DIFFS.map(d => `${RU[d]} ${(t[d][2] - t[d][0]).toFixed(3)} с`).join(', '));
  }
  if (r.ok) r.line(`все ${checked} клеток (P1/P11/P22) совпали до тысячной`);
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
