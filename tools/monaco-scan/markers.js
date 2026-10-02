/* Монако: строки разметки SCENERY_MONACO (v1.16.24, 10.2026) — щиты торможения
   и отодвинутая стена шпильки. Образец — tools/hungaroring-scan/markers.js.

   ЩИТЫ. С онбоарда поула Норриса 2025 (onboard/, место кадра — kadry.tsv):
     «150» — кадр 77 (S 1012): высокий узкий белый щит СЛЕВА, сразу за воротами
             Aramco; на кадре 78 (S 1024) уже не виден — стоит у S≈1028.
     «100» — кадр 80 (S 1063): синий щит слева; на кадре 81 (S 1073) пропал —
             стоит у S≈1078. Тормоз Норриса начинается здесь же (225 → 213 км/ч).
     «50»  — на кадрах не читается; ставится по правилу (через 50 м, S≈1128).
             На кадре 82 справа за сеткой виден белый щит — возможно, это он,
             но цифры нет, и сторона по правилу — внешняя (левая).
   Это щиты МИРАБО (правый поворот, внешняя сторона — левая). Перед ШПИЛЬКОЙ
   (кадры 93-103) щитов в жизни нет. Посадка — стойка на 0.30 м ЗА отбойником,
   полотно свешивается к трассе (как Монреаль, Майами, T2 Венгрии): в Монако
   стена у самого полотна, ставить щит на землю негде.

   СТЕНА ШПИЛЬКИ. Внешняя (правая) стена S 1225..1300 отодвинута на 3 м, въезд
   и выезд по 12 м (замер tools/monaco-scan/hairpin-trials.js 3: 50 км/ч чисто
   69 → 97 % вариантов). Точки — на осевой, по ним строитель находит участок.

   ВЫЕЗДЫ-ЛОВУШКИ (этап 1, v1.16.25). По онбоарду 2025 и снимку сверху (plan.py, листы sheet.py):
   почти по всему кругу стена в жизни у самой дороги — наш зазор 1 м за кромкой это и есть;
   настоящих выездов три, все — прямо по ходу из торможения:
     Сент-Девот — слева (снаружи правого), кадры 19-22 и 300-304: асфальт до чёрных щитов F1;
     Мирабо     — слева (снаружи правого), кадры 84-88: прямо вверх по улице, щиты Aramco вдали;
     шикана     — справа, кадры 176-188: прямо мимо шиканы по набережной; это ВНУТРИ второго
                  (правого) поворота шиканы — стена прямым куском поперёк (chord), как в жизни.
   Покрытие выездов — асфальт; type:'tint' (шум своим зерном), а не 'asphalt': текстура асфальта
   вылетов тянет Math.random, и гонка Монако сдвинулась бы целиком (§8).
   Щит «50» Мирабо (по правилу, S 1128) пришёлся бы в устье выезда, в 10 м от полотна, —
   поставлен перед устьем, S 1100 (выезд начинается с 1105).

   node tools/monaco-scan/markers.js
*/
const path = require('path');
const H = require(path.join(__dirname, '..', 'harness.js'));

const BOARDS = [ { corner: 'Mirabeau', side: 'L', at: { 150: 1028, 100: 1078, 50: 1100 } } ];
const WALLS = [
  { corner: 'Hairpin', side: 'R', from: 1225, to: 1300, by: 3, ramp: 12, why: 'шпилька: внешняя стена +3 м (вопрос владельца 10.2026)' },
  { corner: 'Sainte-Devote', side: 'L', from: 176, to: 240, by: 11, ramp: 22, why: 'выезд прямо, кадры 19-22, 300-304' },
  { corner: 'Mirabeau', side: 'L', from: 1106, to: 1152, by: 10, ramp: 18, why: 'выезд прямо вверх по улице, кадры 84-88' },
  { corner: 'Chicane', side: 'R', from: 2060, to: 2160, chord: true, why: 'выезд прямо мимо шиканы, кадры 176-188' },
];
const ESCAPE = { color: '#80838a' };   // асфальт выезда — чуть светлее полотна
const BEHIND = 0.30, PANEL_W = 1.2;

const env = H.loadGame();
const idx = H.tracks().findIndex(t => t.key === 'Monaco');
H.setupWorld(env, { trackIdx: idx });
const D = JSON.parse(env.evalIn(`(function(){
  var o={M:track.M,len:track.length,S:Array.from(track.S),HW:Array.from(track.HW),
         WL:Array.from(track.WL),WR:Array.from(track.WR),P:[],R:[]};
  for(var i=0;i<track.M;i++){o.P.push([track.P[i].x,track.P[i].z]);o.R.push([track.R[i].x,track.R[i].z]);}
  var g=SCEN_ORIGIN['Monaco']; o.geo={lat0:g.lat0,lon0:g.lon0,mlon:g.mlon};
  return JSON.stringify(o);})()`));
const { M, len, S, HW, WL, WR, P, R, geo } = D;
const idxAtS = s => { let b = 0, bd = 1e9; const t = ((s % len) + len) % len;
  for (let i = 0; i < M; i++) { const d = Math.abs(S[i] - t); if (d < bd) { bd = d; b = i; } } return b; };
const toDeg = (x, z) => [geo.lat0 + z / 110540, geo.lon0 - x / geo.mlon];
const f = (x, n) => x.toFixed(n);

console.log(`  markers: { panelW:${PANEL_W}, panelH:1.0, baseY:1.15, postW:0.14, postSide:'outer', markers: [`);
for (const b of BOARDS) for (const d of [150, 100, 50]) {
  const i = idxAtS(b.at[d]), wall = (b.side === 'L' ? WL[i] : WR[i]), off = wall + BEHIND;
  const sgn = (b.side === 'L') ? -1 : 1;
  const [lat, lon] = toDeg(P[i][0] + R[i][0] * sgn * off, P[i][1] + R[i][1] * sgn * off);
  console.log(`    {corner:'${b.corner}', dist:${d}, atS:${Math.round(S[i])}, side:'${b.side}', off:${f(off, 2)}, latLon:[${f(lat, 6)},${f(lon, 6)}]},`
    + `   // барьер ${f(wall, 2)} м, кромка ${f(HW[i], 1)} м, полотно ${f(off - PANEL_W - HW[i], 2)}..${f(off - HW[i], 2)} м за кромкой`);
}
console.log('  ]},');
const ll = s => { const i = idxAtS(s); return [toDeg(P[i][0], P[i][1]), Math.round(S[i])]; };
const LL = x => `[${f(x[0], 6)},${f(x[1], 6)}]`;
console.log('  wallOut: [');
for (const w of WALLS) {
  const [a, sa] = ll(w.from), [b, sb] = ll(w.to);
  const body = w.chord ? 'chord:true' : `by:${w.by}, ramp:${w.ramp}`;
  console.log(`    {corner:'${w.corner}', side:'${w.side}', ${body}, fromS:${sa}, toS:${sb}, fromLatLon:${LL(a)}, toLatLon:${LL(b)}},   // ${w.why}`);
}
console.log('  ],');
console.log('  runoff: [   // покрытие выездов: асфальт до стены');
for (const w of WALLS.filter(w => w.corner !== 'Hairpin')) {
  const [a, sa] = ll(w.from), [b, sb] = ll(w.to);
  console.log(`    {corner:'${w.corner}', fromS:${sa}, toS:${sb}, side:'${w.side}', type:'tint', width:60, color:'${ESCAPE.color}', fromLatLon:${LL(a)}, toLatLon:${LL(b)}},`);
}
console.log('  ],');
