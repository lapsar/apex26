/* ============================================================================
   ГЕНЕРАТОР ОПЫТНОЙ СБОРКИ «соперники едут по НАСТОЯЩЕЙ гоночной линии».

   index.html не трогает: пишет копию, на которую натравливаются пробники через
   APEX_INDEX.

   ЧТО СЕЙЧАС. Полоса соперника задана грубым приближением:
       line = -sign(kA) * min(1,|kA|/0.06) * hw*0.42
   то есть «сместись к внутренней стороне на 42 % полуширины, тем сильнее, чем круче
   поворот». Настоящей траектории это не описывает: апекс и точки входа-выхода
   формула не знает вовсе, а знак у неё до v1.15.71 был и вовсе перевёрнут.

   ЧТО СТАНОВИТСЯ. Полоса берётся из БЫСТРЕЙШЕЙ линии (`raceline.js`), посчитанной
   заранее и вшитой таблицей на трассу. Единицы и знак совпадают с игровым `lane`
   по построению: мир строится как P[i]+R[i]*lane, а оптимизатор как P[i]+R[i]*(b+off).

   ТЕМП ЭТО НЕ МЕНЯЕТ, и это структурно: `aiTarget`/`estLapTime` считают скорость
   по кривизне ОСЕВОЙ и о полосе не знают. Якорь обязан совпасть до тысячной —
   если не совпал, правка залезла не туда.
   А вот ГОНОЧНЫЙ темп сдвинуться может: `OFFLINE_COST` штрафует за отход от линии,
   и опорная линия теперь другая.

   Ключи:
     --lines=<json>   таблица линий (готовит export-lines)
     --scale=1.0      доля настоящей линии; 0 — прежняя формула
     --lim=0.62       потолок полосы в долях полуширины (в игре 0.62): настоящая линия
                      уходит дальше, и без подъёма потолка она обрезается
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const OUT = arg('out', null); if (!OUT) throw new Error('нужен --out=<файл>');
const LINES = arg('lines', null); if (!LINES) throw new Error('нужен --lines=<json>');
const SCALE = +arg('scale', '1.0');
const LIM = +arg('lim', '0.62');

const tbl = JSON.parse(fs.readFileSync(LINES, 'utf8'));
const lanes = {};
for (const k of Object.keys(tbl)) lanes[k] = tbl[k].lane;

let src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function sub(re, to) { if (!re.test(src)) throw new Error('не найдено: ' + re); src = src.replace(re, to); }

/* таблица линий + выбор по ключу трассы */
sub(/const AIBRAKE=44;/,
  `const AIBRAKE=44;\nconst AI_LANE_TBL=${JSON.stringify(lanes)};\nconst AI_LANE_SCALE=${SCALE};\n` +
  `function aiLaneAt(i){const t=AI_LANE_TBL[track.spec.key];return t?t[i%t.length]*AI_LANE_SCALE:null;}`);

/* сама полоса */
sub(/const line=-Math\.sign\(kA\)\*Math\.min\(1,Math\.abs\(kA\)\/0\.06\)\*hw\*0\.42;/,
  `const __rl=aiLaneAt(iu);\n    const line=__rl!==null?__rl:-Math.sign(kA)*Math.min(1,Math.abs(kA)/0.06)*hw*0.42;`);

/* потолок полосы */
if (LIM !== 0.62) sub(/const lim=hw\*0\.62;/, `const lim=hw*${LIM};`);

fs.writeFileSync(OUT, src);
console.error(`опытная сборка: ${OUT}  (scale=${SCALE}, lim=${LIM}, трасс в таблице ${Object.keys(lanes).length})`);
