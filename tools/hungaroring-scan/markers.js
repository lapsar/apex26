/* Щиты торможения Хунгароринга: считает СТРОКИ РАЗМЕТКИ по нынешней линии барьера
   (v1.16.10, 09.2026). Образец — tools/miami-scan/markers.js.

   Зачем скрипт, а не руки: щит и отбойник заданы РАЗНЫМИ данными, но связаны
   геометрически (CLAUDE.md §8: правишь барьер — пересчитай щиты). Барьер берётся
   ПОСТРОЕННЫЙ игрой (track.WL/WR после wallFromRail), а не из barrier.tsv.

   ПРАВИЛО ПОСАДКИ (Монреаль v1.15.24, Майами): latLon задаёт СТОЙКУ, она стоит
   на 0.30 м ЗА отбойником, полотно свешивается от неё к трассе.

   ОТКУДА ЩИТЫ. С онбоарда поула Леклера 2025 (onboard/, место кадра — kadry.tsv):
   щит виден на кадре, сторона и цифра читаются, место — по тому, на каком кадре
   он крупнее всего и на каком пропал (кадры через 0.5 с, ±15 м). Настоящих
   торможений на круге семь (телеметрия openf1 того же круга): T1, T2, T4 (подъём),
   T5, T6, T12, T13, T14 — щиты стоят у T1, T2, T6, T8, T12, T13, T14; у T4 и T5
   их на кадрах нет. REF — «ноль» отсчёта: щит «50» стоит за 50 м до него.
   Как ноль найден (S кадра + на глаз до щита):
     T1  150 на кадре 13 (S 410), 100 на 14 (454), 50 на 15 (498) — каждый ~30-40 м
         впереди; тормоз с S 498 (312 км/ч), то есть у «100», как и положено в T1.
     T2  цифры на кадрах не читаются (щиты высоко на сетке моста) — ноль взят тем же
         правилом, что вышло у T1, T6 и T13: минимум скорости минус ~32 м.
     T6  150 слева (кадр 73, S 2176), 100 с обеих сторон (74), 50 (75-76).
     T8  100 справа вплотную на кадре 84 (S 2440), 50 впереди (85). «150» нет —
         он пришёлся бы на выход из T7.
     T12 150 с обеих сторон (112, S 3299), 100 (113-114), 50 (115, S 3414).
     T13 100 с обеих сторон (123, S 3587), 50 (124-125). «150» нет — там T12A.
     T14 50 слева на кадрах 136-138 (S 3867-3922, пропал к 3952); «100» синий
         виден на кадрах 133-134 (S 3805-3824) — в жизни он стоит дальше, чем
         через 50 м, у нас ставится по правилу (через 50).

   Сторона: у всех — ВНЕШНЯЯ сторона поворота, как на Монреале и Майами; у T6,
   T12 и T13 щиты на кадрах стоят С ОБЕИХ сторон — так и сделано, кроме левых
   щитов T13: там слева вылет T12A, барьер в 18-22 м от осевой, и щит со стойкой
   «за отбойником» (правило посадки, пробник clear) встал бы в 12-16 м за кромкой,
   посреди площадки. В жизни он стоит на своей стойке у кромки — у нас его нет.

   node tools/hungaroring-scan/markers.js
*/
const path = require('path');
const H = require(path.join(__dirname, '..', 'harness.js'));

const ZONES = [
  { corner: 'Turn 1',  ref: 585,  sides: ['L'],      dist: [150, 100, 50] },
  { corner: 'Turn 2',  ref: 1104, sides: ['R'],      dist: [150, 100, 50] },
  { corner: 'Turn 6',  ref: 2345, sides: ['L', 'R'], dist: [150, 100, 50] },
  { corner: 'Turn 8',  ref: 2555, sides: ['R'],      dist: [100, 50] },
  { corner: 'Turn 12', ref: 3485, sides: ['L', 'R'], dist: [150, 100, 50] },
  { corner: 'Turn 13', ref: 3725, sides: ['R'],      dist: [100, 50] },
  { corner: 'Turn 14', ref: 3990, sides: ['L'],      dist: [100, 50] },
];
const BEHIND = 0.30;                       // на столько стойка уходит за барьер

const env = H.loadGame();
const idx = H.tracks().findIndex(t => t.key === 'Hungaroring');
H.setupWorld(env, { trackIdx: idx });
const D = JSON.parse(env.evalIn(`(function(){
  var o={M:track.M,len:track.length,S:Array.from(track.S),HW:Array.from(track.HW),
         WL:Array.from(track.WL),WR:Array.from(track.WR),P:[],R:[]};
  for(var i=0;i<track.M;i++){o.P.push([track.P[i].x,track.P[i].z]);o.R.push([track.R[i].x,track.R[i].z]);}
  var g=SCEN_ORIGIN['Hungaroring']; o.geo={lat0:g.lat0,lon0:g.lon0,mlon:g.mlon};
  return JSON.stringify(o);})()`));
const { M, len, S, HW, WL, WR, P, R, geo } = D;
const idxAtS = s => { let b = 0, bd = 1e9; const t = ((s % len) + len) % len;
  for (let i = 0; i < M; i++) { const d = Math.abs(S[i] - t); if (d < bd) { bd = d; b = i; } } return b; };
const toDeg = (x, z) => [geo.lat0 + z / 110540, geo.lon0 - x / geo.mlon];

const f = (x, n) => x.toFixed(n);
console.log("  markers: { panelW:1.6, panelH:1.2, baseY:1.15, postW:0.14, postSide:'outer', markers: [");
for (const z of ZONES) for (const side of z.sides) for (const d of z.dist) {
  const i = idxAtS(z.ref - d);
  const wall = (side === 'L' ? WL[i] : WR[i]);
  const off = wall + BEHIND, sgn = (side === 'L') ? -1 : 1;
  const x = P[i][0] + R[i][0] * sgn * off, zz = P[i][1] + R[i][1] * sgn * off;
  const [lat, lon] = toDeg(x, zz);
  console.log(`    {corner:'${z.corner}', dist:${d}, atS:${Math.round(S[i])}, side:'${side}', off:${f(off, 2)}, latLon:[${f(lat, 6)},${f(lon, 6)}]},`
    + `   // барьер ${f(wall, 2)} м, кромка ${f(HW[i], 1)} м`);
}
console.log('  ]},');
