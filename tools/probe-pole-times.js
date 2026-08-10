/* ============================================================================
   Пробник 1 — ВРЕМЕНА ПОУЛА (главный тест проекта)

   Поул = самый быстрый круг из всех 22 пилотов, посчитанный estLapTime по тем
   же константам, что и в игре (MAXSPEED, DIFF_MUL, DIFF_CORNERK, сила пилота).
   Случайный разброс квалификации (±0.4…0.6%) сюда не входит — он есть в игре,
   но эталон в CLAUDE.md §4 записан по чистому расчёту.

   После любой правки, которая не должна менять баланс, все 12 клеток обязаны
   совпасть до тысячной.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

// эталон из CLAUDE.md §4
const TABLE = {
  Monza:       { easy: '1:44.036', normal: '1:36.232', hard: '1:29.935' },
  Silverstone: { easy: '1:52.198', normal: '1:46.062', hard: '1:41.666' },
  Suzuka:      { easy: '1:51.428', normal: '1:45.286', hard: '1:40.773' },
  Monaco:      { easy: '1:15.033', normal: '1:12.716', hard: '1:11.184' },
};
const DIFFS = ['easy', 'normal', 'hard'];
const RU = { easy: 'Новичок', normal: 'Норма', hard: 'Профи' };

function run() {
  const r = R.result('Времена поула — якорь регрессии (CLAUDE.md §4)');
  const env = H.loadGame();
  const names = env.evalIn('TRACKS.map(function(t){return t.name;})');

  r.line('Трасса        ' + DIFFS.map(d => RU[d].padEnd(18)).join(''));
  for (let i = 0; i < names.length; i++) {
    env.evalIn(`track=makeTrack(TRACKS[${i}]);`);
    const cells = [];
    for (const d of DIFFS) {
      const t = env.evalIn(`(function(){
        var mul=DIFF_MUL[${JSON.stringify(d)}], ck=DIFF_CORNERK[${JSON.stringify(d)}], best=Infinity;
        ROSTER.forEach(function(dr){
          var base=MAXSPEED*(0.5538+dr.skill*0.32)*mul;
          var t=estLapTime(base,ck); if(t<best)best=t;
        });
        return best;
      })()`);
      const got = R.lap(t);
      const want = (TABLE[names[i]] || {})[d];
      const ok = want !== undefined && got === want;
      if (want === undefined) r.note(`${names[i]} / ${RU[d]}: эталона в таблице нет, измерено ${got}`);
      else if (!ok) r.fail(`${names[i]} / ${RU[d]}: ожидалось ${want}, получено ${got} (${t.toFixed(6)} с)`);
      cells.push((want === undefined ? got + ' ?' : ok ? got : got + ' ≠ ' + want).padEnd(18));
    }
    r.line(names[i].padEnd(14) + cells.join(''));
  }
  if (r.ok) r.line('все 12 клеток совпали до тысячной');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
