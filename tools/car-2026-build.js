/* ============================================================================
   car-2026-build.js — ОПЫТНАЯ сборка «болид настоящих размеров 2026» (v1.17.24, замер для владельца).
   Берёт index.html и меняет только блок РАЗМЕРЫ БОЛИДА (одно место, v1.17.24) и TURN_RMIN; модель
   на время замера не перерисована, а сжата до настоящего габарита (group.scale) — картинка грубая,
   физика, касание, стена и объезд — уже по новым размерам. Трассы НЕ тронуты.
     node tools/car-2026-build.js [out.html]       → по умолчанию /tmp/apex-car2026.html
     APEX_INDEX=/tmp/apex-car2026.html node tools/run-all.js
   Числа — регламент FIA 2026 (docs/notes/game.md, «Наш болид и настоящий 2026»):
     ширина 1.90, база 3.40, длина ≈5.45 (нос 1.30 перед передней осью, хвост 0.75 за задней),
     колесо ⌀ 0.71, крыло спереди ±0.68 между колёс, сзади ±0.575.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'index.html');
const out = process.argv[2] || '/tmp/apex-car2026.html';
let s = fs.readFileSync(src, 'utf8');

function rep(o, n) {
  const k = s.split(o).length - 1;
  if (k !== 1) throw new Error(`ожидалось 1 вхождение, найдено ${k}: ${o.slice(0, 80)}`);
  s = s.replace(o, n);
}
const line = (re, n) => { const m = s.match(re); if (!m) throw new Error('нет строки ' + re); rep(m[0], n); };

// оси: передняя z=+1.80, задняя −1.60 (база 3.40; середина осей на +0.10, как и прежде близко к центру)
// нос +3.10, корма −2.35 (длина 5.45), колёса снаружи ±0.95, середины колёс ±0.76
line(/^const CAR_LEN=6\.04, CAR_WID=2\.57;.*$/m, 'const CAR_LEN=5.45, CAR_WID=1.90;                       // ОПЫТ 2026: регламент FIA');
line(/^const CAR_AXF=2\.0, CAR_AXR=-1\.7, CAR_TRK=1\.05;.*$/m, 'const CAR_AXF=1.80, CAR_AXR=-1.60, CAR_TRK=0.76;       // ОПЫТ 2026: база 3.40');
line(/^const CAR_TAIL=2\.68;.*$/m, 'const CAR_TAIL=2.35;                                    // ОПЫТ 2026');
line(/^const CAR_PTS=\[.*$/m, 'const CAR_PTS=[[CAR_TRK,CAR_AXF],[-CAR_TRK,CAR_AXF],[CAR_TRK,CAR_AXR],[-CAR_TRK,CAR_AXR],[0.66,2.95],[-0.66,2.95],[0.55,-2.25],[-0.55,-2.25]];');
line(/^const CAR_HULL=\[.*$/m, 'const CAR_HULL=[[CAR_HW,-1.955],[CAR_HW,2.155],[0.68,3.0],[0.3,3.10],[-0.3,3.10],[-0.68,3.0],[-CAR_HW,2.155],[-CAR_HW,-1.955],[-0.575,-CAR_TAIL],[0.575,-CAR_TAIL]];');
line(/^const TURN_RMIN=10\.1;$/m, 'const TURN_RMIN=9.3;                                    // ОПЫТ 2026: база 3.40 при выкруте 20°');
// модель — сжать до габарита (замена картинки на время замера)
rep('function makeCar(colorHex,num,simple){return mergeCar(buildCar(colorHex,num,simple));}',
    'function makeCar(colorHex,num,simple){const g=mergeCar(buildCar(colorHex,num,simple));g.scale.set(1.90/2.57,0.86,5.45/6.04);return g;}');
fs.writeFileSync(out, s);
console.log('опытная сборка:', out);
