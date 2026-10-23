/* ============================================================================
   ЛИНИИ СЕКТОРОВ — где на НАШЕЙ трассе стоят настоящие линии S1/S2 (10.2026, v1.16.95)

   Источник — круг квалификации из openf1 (`*_lap.json`, пишет openf1-lap.py):
   у круга есть длительности секторов (duration_sector_1/2 — замер FIA по петлям
   в асфальте) и положения машины (3.7 Гц, ~17 м между точками на скорости).
   Где машина была через S1 секунд от начала круга — там и линия.

   Как: координаты F1 (дециметры, свой поворот, бывает зеркало) совмещаются с
   нашей осевой подобием (поворот + сдвиг + масштаб) — перебор углов и ICP, как
   monaco-scan/f1fit.py; каждая точка круга проецируется на осевую (метры S от
   НАШЕЙ линии старта), между точками S интерполируется по времени.

   Начало круга в openf1 (date_start) неточно на десятые доли секунды, а наша
   линия старта не обязательно совпадает с линией хронометража. Поэтому время
   отсчитывается двумя способами и печатаются оба:
     (а) от date_start круга;
     (б) от момента, когда машина пересекла НАШУ линию старта (S=0).
   (а) у всех кругов трассы стоит в одном месте (±5 м), но не на нашей линии:
   от −98 (Сузука) до +49 м (Монца). В игру берётся (а) — физическое место
   линии; (б) сдвинул бы её на те же десятки метров (sources.md).
   Без аргументов — круги *_lap.json; сверка на 6–8 кругах сессии —
   файлы openf1-sector-laps.py, в игру — медиана (а).

   Запуск:  node tools/sector-lines.js                    # все трассы с *_lap.json
            node tools/sector-lines.js Monaco=путь/к/кругу.json …   # свои круги (сверка)
   index.html только читается.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./harness');

const FILES = { Monza: 'monza_lap.json', Silverstone: 'silverstone_lap.json', Suzuka: 'suzuka_lap.json',
  Monaco: 'monte carlo_lap.json', Montreal: 'montreal_lap.json', Miami: 'miami_lap.json', Hungaroring: 'hungaroring_lap.json', Baku: 'baku_lap.json' };
const extra = process.argv.slice(2).map(a => a.split('='));
const jobs = extra.length ? extra : Object.entries(FILES).map(([k, f]) => [k, path.join(__dirname, f)]);

const env = H.loadGame();
const names = env.evalIn('TRACKS.map(function(t){return t.key;})');

function nearestOnPoly(R, px, py) {      // ближайшая точка замкнутой ломаной: [x, y, индекс отрезка, доля]
  let best = Infinity, out = null;
  for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length], vx = b[0] - a[0], vy = b[1] - a[1];
    const l2 = vx * vx + vy * vy || 1e-9;
    let t = ((px - a[0]) * vx + (py - a[1]) * vy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = a[0] + vx * t, qy = a[1] + vy * t, d = (qx - px) ** 2 + (qy - py) ** 2;
    if (d < best) { best = d; out = [qx, qy, i, t]; }
  }
  return out;
}
function umeyama(P, Q) {                 // подобие P->Q (2D): [cos, sin, s, tx, ty] без зеркала (зеркало — снаружи)
  const n = P.length; let mpx = 0, mpy = 0, mqx = 0, mqy = 0;
  for (let k = 0; k < n; k++) { mpx += P[k][0]; mpy += P[k][1]; mqx += Q[k][0]; mqy += Q[k][1]; }
  mpx /= n; mpy /= n; mqx /= n; mqy /= n;
  let sxx = 0, sxy = 0, var2 = 0;
  for (let k = 0; k < n; k++) {
    const x = P[k][0] - mpx, y = P[k][1] - mpy, u = Q[k][0] - mqx, v = Q[k][1] - mqy;
    sxx += x * u + y * v; sxy += x * v - y * u; var2 += x * x + y * y;
  }
  const r = Math.hypot(sxx, sxy), c = sxx / r, s = sxy / r, sc = r / var2;
  return [c, s, sc, mqx - sc * (c * mpx - s * mpy), mqy - sc * (s * mpx + c * mpy)];
}
const apply = (T, p) => [T[2] * (T[0] * p[0] - T[1] * p[1]) + T[3], T[2] * (T[1] * p[0] + T[0] * p[1]) + T[4]];

function fitLap(R, G) {
  let best = null;
  const sub = G.filter((_, k) => k % 3 === 0);
  let cx = 0, cy = 0; R.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= R.length; cy /= R.length;
  for (const mir of [1, -1]) {
    const Gm = sub.map(p => [p[0], p[1] * mir]);
    let gx = 0, gy = 0; Gm.forEach(p => { gx += p[0]; gy += p[1]; }); gx /= Gm.length; gy /= Gm.length;
    for (let ang = 0; ang < 360; ang += 15) {
      const a = ang * Math.PI / 180;
      let T = [Math.cos(a), Math.sin(a), 1, 0, 0];
      const g = apply(T, [gx, gy]); T[3] = cx - g[0]; T[4] = cy - g[1];
      for (let it = 0; it < 12; it++) T = umeyama(Gm, Gm.map(p => { const q = apply(T, p); return nearestOnPoly(R, q[0], q[1]); }));
      const errs = Gm.map(p => { const q = apply(T, p), n = nearestOnPoly(R, q[0], q[1]); return Math.hypot(n[0] - q[0], n[1] - q[1]); }).sort((a, b) => a - b);
      const med = errs[errs.length >> 1];
      if (!best || med < best.med) best = { med, mir, T };
    }
  }
  const Gm = G.map(p => [p[0], p[1] * best.mir]);
  for (let it = 0; it < 8; it++) best.T = umeyama(Gm, Gm.map(p => { const q = apply(best.T, p); return nearestOnPoly(R, q[0], q[1]); }));
  return best;
}

function lapLines(geo, lap, location) {
  const t00 = Date.parse(lap.date_start);
  const pts = location.map(p => ({ t: (Date.parse(p.date) - t00) / 1000, x: p.x * 0.1, y: p.y * 0.1 }))
    .filter(p => p.t > -3 && p.t < lap.lap_duration + 3).sort((a, b) => a.t - b.t);
  const fit = fitLap(geo.R, pts.map(p => [p.x, p.y]));
  // S каждой точки, развёрнутое в монотонное (круг начинается до нашей линии и кончается за ней)
  let prev = null, wrap = 0;
  const ser = pts.map(p => {
    const q = apply(fit.T, [p.x, p.y * fit.mir]), n = nearestOnPoly(geo.R, q[0], q[1]);
    const s0 = geo.S[n[2]], s1 = n[2] + 1 < geo.R.length ? geo.S[n[2] + 1] : geo.L;
    let s = s0 + (s1 - s0) * n[3];
    if (prev !== null && s + wrap < prev - geo.L * 0.5) wrap += geo.L;
    s += wrap; prev = s;
    return { t: p.t, s, off: Math.hypot(n[0] - q[0], n[1] - q[1]) };
  });
  // к линейке «с начала круга»: S вблизи t=0 должна быть около 0 или около L
  const s0 = ser.reduce((b, p) => Math.abs(p.t) < Math.abs(b.t) ? p : b).s;
  const base = Math.round(s0 / geo.L) * geo.L;
  ser.forEach(p => { p.s -= base; });
  const sAt = t => { for (let k = 1; k < ser.length; k++) if (ser[k].t >= t) { const a = ser[k - 1], b = ser[k], f = (t - a.t) / (b.t - a.t); return a.s + f * (b.s - a.s); } return NaN; };
  const tAt = s => { for (let k = 1; k < ser.length; k++) if (ser[k].s >= s) { const a = ser[k - 1], b = ser[k], f = (s - a.s) / (b.s - a.s); return a.t + f * (b.t - a.t); } return NaN; };
  const d1 = lap.duration_sector_1, d2 = lap.duration_sector_2, tc = tAt(0);
  const offs = ser.map(p => p.off).sort((a, b) => a - b);
  return { med: offs[offs.length >> 1], p90: offs[Math.floor(offs.length * 0.9)], mir: fit.mir, s0: sAt(0), tc,
    sEnd: sAt(lap.lap_duration) - geo.L, a: [sAt(d1), sAt(d1 + d2)], b: [sAt(tc + d1), sAt(tc + d1 + d2)] };
}

const out = {};
for (const [key, file] of jobs) {
  const ti = names.indexOf(key);
  if (ti < 0 || !fs.existsSync(file)) { console.log(`${key}: нет трассы или файла ${file}`); continue; }
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const geo = env.evalIn(`(function(){track=makeTrack(TRACKS[${ti}]);
    return {R:track.P.map(function(p){return [p.x,p.z];}),S:track.S.slice(),L:track.length};})()`);
  const laps = d.laps ? d.laps : [{ lap: d.lap, location: d.location }];
  console.log(`${key} ${d.session.year}, круг ${geo.L.toFixed(0)} м:`);
  const res = laps.map(l => {
    const r = lapLines(geo, l.lap, l.location);
    console.log(`   №${String(l.lap.driver_number).padEnd(3)}${l.lap.lap_duration.toFixed(3)} с  совмещение ${r.med.toFixed(1)}/${r.p90.toFixed(1)} м` +
      `  S(начало) ${r.s0.toFixed(0).padStart(4)} S(конец) ${r.sEnd.toFixed(0).padStart(4)} м  нашу линию — ${r.tc.toFixed(2)} с` +
      `  │ (а) ${r.a.map(v => v.toFixed(0)).join(' / ')}  (б) ${r.b.map(v => v.toFixed(0)).join(' / ')}`);
    return r;
  });
  const med = arr => arr.slice().sort((x, y) => x - y)[arr.length >> 1];
  out[key] = [Math.round(med(res.map(r => r.a[0]))), Math.round(med(res.map(r => r.a[1])))];
}
console.log('\nв игру (ключ sectors, медиана (а)): ' + JSON.stringify(out));
