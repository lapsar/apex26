/* Схема Майами вида сверху: номера поворотов и трибуны — то, что стоит В ИГРЕ.
   По образцу montreal-scan/map-plan.py: карта рисуется в ГЕОГРАФИЧЕСКОЙ ориентации
   (север сверху, восток справа), чтобы её можно было положить рядом с официальной
   схемой гонки и сверить.

   ЛОВУШКА №1 ПРОЕКТА (CLAUDE.md §7, §9-bis): мир игры отражён по X
   (makeTrack: V3(-p[0],0,p[1])). Поэтому здесь всё — осевая, нормали, трибуны —
   переводится обратно: East = -x, North = z. Без этого схема выйдет зеркальной,
   и сверка с официальной картой соврёт. Что отражение снято ПРАВИЛЬНО, доказано
   не рассуждением: круг телеметрии F1 ложится на наш контур поворотом и сдвигом
   БЕЗ отражения со средней ошибкой 2.7 м.

   Геометрия берётся ИЗ ИГРЫ, а не пересчитывается своими формулами: посадка трибун
   идёт через scenIndexAt (окно ±60 м вокруг записанного S), как в buildScenery.
   Урок v1.15.34: расчёт по данным разметки врёт, мерить надо построенное.

   ОТКУДА НОМЕРА ПОВОРОТОВ. Официальные данные F1 (circuit-API, 19 поворотов):
   https://api.multiviewer.app/api/v1/circuits/151/2022 — оттуда же взят sfShift
   (f1fit.py). Таблица CORNERS ниже — результат совмещения: S каждого поворота
   по НАШЕЙ осевой и сторона (левый/правый) по телеметрии.

   ТРИ ЛОВУШКИ, каждую нашёл замер:
   1. Официальная дистанция поворота (поле length, дециметры) меряется по гоночной
      ЛИНИИ, а наш S — по осевой. Линия короче: к концу круга набегает 65 м
      (T18 у F1 4998 м, у нас 5061). Поэтому номер сажается ГЕОМЕТРИЧЕСКИ —
      проекцией точки поворота на нашу осевую, а не по дистанции.
   2. Радиус нельзя брать из track.K: она усреднена за 24 м и в шиканах занижает
      поворот. Здесь радиус — окружность через три точки в 20 м друг от друга,
      минимум в окне ±24 м вокруг апекса.
   3. Сторону поворота нельзя считать широким окном: официальные T14 и T15 стоят
      в 19 м друг от друга, и окно ±60 м склеивает их в один левый. Стороны взяты
      из телеметрии, а расчёт по нашей осевой их СВЕРЯЕТ — совпадает 18 из 19,
      и единственное расхождение (T15) как раз этой шиканы: проекция T15 попадает
      в перелом, где осевая ещё доворачивает влево.

   node tools/miami-scan/map-plan.js [--out=файл.svg]
*/
const fs = require('fs'), path = require('path');
const H = require(path.join(__dirname, '..', 'harness.js'));

const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=')[1];
const OUT = arg('out') || path.join(__dirname, 'miami-map.svg');
const MAPONLY = process.argv.includes('--map-only');   // только карта, без заголовка и легенды (для страницы, где текст свой)

// --- Повороты: S по НАШЕЙ осевой (проекция официальной точки поворота на контур)
//     плюс сторона, снятая с той же телеметрии F1 — она и есть эталон для сверки.
const CORNERS = [[1,378,'правый'],[2,496,'левый'],[3,590,'правый'],[4,1157,'левый'],
  [5,1295,'правый'],[6,1440,'левый'],[7,1578,'левый'],[8,1682,'левый'],[9,2209,'правый'],
  [10,2489,'левый'],[11,3129,'левый'],[12,3257,'правый'],[13,3395,'левый'],[14,3477,'левый'],
  [15,3497,'правый'],[16,3596,'левый'],[17,4921,'левый'],[18,5061,'левый'],[19,5275,'правый']];

// --- Hard Rock Stadium, контур из OSM (way 171419981) — ориентир для сверки со схемой.
//     Стоит СНАРУЖИ петли: «ближе к стадиону» и «внутренняя сторона» — разные вещи (§7).
const STADIUM = [[25.958954,-80.238949],[25.959128,-80.238411],[25.959444,-80.238040],[25.959861,-80.237867],
  [25.960284,-80.237906],[25.960650,-80.238140],[25.960892,-80.238536],[25.960975,-80.239020],[25.960975,-80.240300],
  [25.960892,-80.240784],[25.960650,-80.241180],[25.960284,-80.241414],[25.959861,-80.241453],[25.959444,-80.241280],
  [25.959128,-80.240909],[25.958954,-80.240371]];

// ---------------------------------------------------------------- игра
const env = H.loadGame();
const idx = H.tracks().findIndex(t => t.key === 'Miami');
if (idx < 0) { console.error('Майами нет в TRACKS'); process.exit(2); }
env.evalIn(`track=makeTrack(TRACKS[${idx}]);0`);

const T = JSON.parse(env.evalIn(`(function(){
  var o={M:track.M,len:track.length,half:track.roadHalf,P:[],R:[],S:track.S.slice(),K:track.K.slice()};
  for(var i=0;i<track.M;i++){o.P.push([track.P[i].x,track.P[i].z]);o.R.push([track.R[i].x,track.R[i].z]);}
  return JSON.stringify(o);})()`));

// объекты разметки — с посадкой ТОЙ ЖЕ функцией, что у строителя мира
const OBJ = JSON.parse(env.evalIn(`(function(){
  var sc=SCENERY_BY_KEY['Miami'],h=scenHelpers(),S=track.S,out=[];
  (sc.objects||[]).forEach(function(o){
    var r={kind:o.kind,name:o.name,side:o.side,off:o.off,d:o.d,w:o.w,h:o.h,shape:o.shape};
    if(o.fromLatLon&&o.toLatLon){r.a=scenIndexAt(h,o.fromLatLon,o.fromS);r.b=scenIndexAt(h,o.toLatLon,o.toS);}
    if(o.latLon){r.at=scenIndexAt(h,o.latLon,o.atS);var q=h.toXZ(o.latLon[0],o.latLon[1]);r.x=q[0];r.z=q[1];}
    out.push(r);});
  return JSON.stringify(out);})()`));

const ORG = JSON.parse(env.evalIn(`JSON.stringify(SCEN_ORIGIN['Miami'])`));

// ------------------------------------------------- географическая система
const geo = p => [-p[0], p[1]];                       // (x,z) игры -> (East, North)
const P = T.P.map(geo), R = T.R.map(geo), S = T.S, M = T.M, L = T.len, HW = T.half;
const ll2 = (lat, lon) => [(lon - ORG.lon0) * ORG.mlon, (lat - ORG.lat0) * 110540];
const at = (i, off, side) => { const s = side === 'R' ? 1 : -1;
  return [P[i][0] + R[i][0] * s * off, P[i][1] + R[i][1] * s * off]; };
const idxAtS = s => Math.round((((s % L) + L) % L) / L * M) % M;
const tang = i => { const a = P[(i - 1 + M) % M], b = P[(i + 1) % M];
  const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
const outward = i => { const t = tang(i); return [t[1], -t[0]]; };   // круг идёт ПРОТИВ часовой: наружу = вправо по ходу
const turnDir = i => {                                              // левый/правый по геометрии карты: суммарный поворот курса на ±60 м
  let t = 0;
  for (let d = -15; d < 15; d++) { const a = P[((i + d - 1) % M + M) % M], b = P[((i + d) % M + M) % M], c = P[((i + d + 1) % M + M) % M];
    const v1 = [b[0]-a[0], b[1]-a[1]], v2 = [c[0]-b[0], c[1]-b[1]];
    if (Math.hypot(v1[0], v1[1]) < 1e-6 || Math.hypot(v2[0], v2[1]) < 1e-6) continue;
    t += Math.atan2(v1[0]*v2[1] - v1[1]*v2[0], v1[0]*v2[0] + v1[1]*v2[1]); }
  return t > 0 ? 'левый' : 'правый'; };
const radGeo = (i, step) => {                                       // окружность через три точки в 20 м друг от друга
  const a = P[(i - step + M) % M], b = P[i], c = P[(i + step) % M];
  const A = Math.hypot(b[0]-a[0], b[1]-a[1]), B = Math.hypot(c[0]-b[0], c[1]-b[1]), C = Math.hypot(c[0]-a[0], c[1]-a[1]);
  const ar = Math.abs((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])) / 2;
  return ar < 1e-6 ? Infinity : A * B * C / (4 * ar); };
const radius = i => { let r = Infinity;                             // крутизна поворота = самое тесное место у апекса (окно ±24 м)
  for (let d = -6; d <= 6; d++) r = Math.min(r, radGeo(((i + d) % M + M) % M, 5)); return r; };

// -------------------------------------------------------------- масштаб
const pts = [].concat(P, P.map((_, i) => at(i, HW, 'R')), P.map((_, i) => at(i, HW, 'L')),
                      STADIUM.map(q => ll2(q[0], q[1])));
const minE = Math.min(...pts.map(p => p[0])), maxE = Math.max(...pts.map(p => p[0]));
const minN = Math.min(...pts.map(p => p[1])), maxN = Math.max(...pts.map(p => p[1]));
const PAD = 130, SC = 1.18;                                        // 1 м -> SC px, PAD — поле под метки
const W = Math.round((maxE - minE) * SC) + PAD * 2;
const HMAP = Math.round((maxN - minN) * SC) + PAD * 2;
const LEG = MAPONLY ? 0 : 330;                                                   // полоса легенды снизу
const px = p => [(p[0] - minE) * SC + PAD, (maxN - p[1]) * SC + PAD];
const fmtP = p => { const q = px(p); return q[0].toFixed(1) + ',' + q[1].toFixed(1); };

// ------------------------------------------------------------ содержимое
const out = [];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HMAP + LEG}" viewBox="0 0 ${W} ${HMAP + LEG}" font-family="Helvetica, Arial, sans-serif">`);
out.push(`<rect width="${W}" height="${HMAP + LEG}" fill="#f7f6f3"/>`);

// стадион
out.push(`<polygon points="${STADIUM.map(q => fmtP(ll2(q[0], q[1]))).join(' ')}" fill="#e2ded6" stroke="#c9c3b8" stroke-width="1.5"/>`);
// полотно
const edgeR = [], edgeL = [];
for (let i = 0; i < M; i++) { edgeR.push(at(i, HW, 'R')); edgeL.push(at(i, HW, 'L')); }
out.push(`<path d="M ${edgeR.map(fmtP).join(' L ')} Z M ${edgeL.slice().reverse().map(fmtP).join(' L ')} Z" fill="#4a4a4a" fill-rule="evenodd"/>`);
out.push(`<polyline points="${P.map(fmtP).join(' ')} ${fmtP(P[0])}" fill="none" stroke="#ffffff" stroke-width="0.8" stroke-dasharray="6 10" opacity="0.5"/>`);

// ------------------------------------------- размещение подписей без наложений
// Всё держится на списке занятых мест (метры): полотно, построенные объекты и уже
// поставленные подписи. Метка отходит от своего якоря наружу, пока не встанет чисто.
const busy = [];
for (let i = 0; i < M; i += 2) busy.push([P[i][0], P[i][1], HW + 7]);
const addBusy = (pts, r) => pts.forEach(q => busy.push([q[0], q[1], r]));
const M2PX = SC, PX2M = 1 / SC;
function fits(c, hw, hh) {                                          // прямоугольник метки против занятых кругов
  for (const [bx, by, br] of busy) {
    const dx = Math.max(Math.abs(bx - c[0]) - hw, 0), dy = Math.max(Math.abs(by - c[1]) - hh, 0);
    if (dx * dx + dy * dy < br * br) return false; }
  return true; }
function place(anchor, dir, hw, hh, from, step, tries) {
  let last = null;
  for (let k = 0; k < tries; k++) { const d = from + k * step;
    const c = [anchor[0] + dir[0] * d, anchor[1] + dir[1] * d];
    last = last || c;
    if (fits(c, hw, hh)) return c; }
  return [anchor[0] + dir[0] * (from + tries * step), anchor[1] + dir[1] * (from + tries * step)]; }
const label = (c, text, size, color, weight) => {                   // текст с белой подложкой — иначе тонет в асфальте
  const q = px(c), w = text.length * size * 0.55, h = size * 1.25;
  return `<rect x="${(q[0] - w / 2 - 4).toFixed(1)}" y="${(q[1] - h + 2).toFixed(1)}" width="${(w + 8).toFixed(1)}" height="${(h + 4).toFixed(1)}" rx="3" fill="#f7f6f3" opacity="0.82"/>`
       + `<text x="${q[0].toFixed(1)}" y="${q[1].toFixed(1)}" font-size="${size}" font-weight="${weight || 'normal'}" fill="${color}" text-anchor="middle">${esc(text)}</text>`; };

// объекты разметки: трибуны и пит-билдинг
const stands = [], later = [];
for (const o of OBJ) {
  if (o.shape === 'arc') {
    const span = ((o.b - o.a + M) % M), near = [], far = [];
    for (let t = 0; t <= span; t++) { const i = (o.a + t) % M;
      near.push(at(i, o.off, o.side)); far.push(at(i, o.off + o.d, o.side)); }
    out.push(`<polygon points="${near.concat(far.slice().reverse()).map(fmtP).join(' ')}" fill="#e8a33d" stroke="#a9701d" stroke-width="1.5" opacity="0.92"/>`);
    addBusy(near.concat(far), 5);
    const mid = (o.a + (span >> 1)) % M;
    stands.push({ o, mid, anchor: at(mid, o.off + o.d, o.side), fromS: S[o.a], toS: S[o.b % M], inside: (o.side === 'L') });
  } else {                                                          // прямой объект: коробка w x d вдоль трассы
    const t = tang(o.at), n = [t[1], -t[0]], sg = o.side === 'R' ? 1 : -1;
    const c = [-o.x, o.z], hw2 = o.w / 2, hd = o.d / 2;
    const q = [[c[0] - t[0]*hw2 - n[0]*sg*hd, c[1] - t[1]*hw2 - n[1]*sg*hd],
               [c[0] + t[0]*hw2 - n[0]*sg*hd, c[1] + t[1]*hw2 - n[1]*sg*hd],
               [c[0] + t[0]*hw2 + n[0]*sg*hd, c[1] + t[1]*hw2 + n[1]*sg*hd],
               [c[0] - t[0]*hw2 + n[0]*sg*hd, c[1] - t[1]*hw2 + n[1]*sg*hd]];
    out.push(`<polygon points="${q.map(fmtP).join(' ')}" fill="#9aa0a6" stroke="#6b7076" stroke-width="1.5"/>`);
    for (let f = 0; f <= 1.0001; f += 0.05)                         // занятое место вдоль всей коробки
      busy.push([c[0] + t[0] * (f - 0.5) * o.w, c[1] + t[1] * (f - 0.5) * o.w, o.d / 2]);
    later.push(() => { const dir = [n[0] * sg, n[1] * sg];
      const cc = place([c[0] + dir[0] * hd, c[1] + dir[1] * hd], dir, 42, 9, 14, 8, 14);
      out.push(label(cc, 'боксы и паддок', 15, '#5f6368')); });
  }
}

// линия старта и стрелки направления
{ const i = 0, a = at(i, HW + 3, 'L'), b = at(i, HW + 3, 'R');
  out.push(`<line x1="${px(a)[0].toFixed(1)}" y1="${px(a)[1].toFixed(1)}" x2="${px(b)[0].toFixed(1)}" y2="${px(b)[1].toFixed(1)}" stroke="#ffffff" stroke-width="5"/>`); }
for (let s = 0; s < L; s += 400) { const i = idxAtS(s), t = tang(i), p = P[i];
  const tip = [p[0] + t[0] * 15, p[1] + t[1] * 15], n = [t[1], -t[0]];
  const w1 = [p[0] - t[0] * 5 + n[0] * 5.5, p[1] - t[1] * 5 + n[1] * 5.5];
  const w2 = [p[0] - t[0] * 5 - n[0] * 5.5, p[1] - t[1] * 5 - n[1] * 5.5];
  out.push(`<polygon points="${[tip, w1, w2].map(fmtP).join(' ')}" fill="#ffffff" opacity="0.8"/>`); }

// номера поворотов: кружок наружу от трассы, с выноской
const CORN = CORNERS.map(([n, s, dir]) => { const i = idxAtS(s); return { n, s, i, dir, ours: turnDir(i), r: radius(i) }; });
for (const c of CORN) {
  const base = P[c.i], dir = outward(c.i);
  const cc = place([base[0] + dir[0] * (HW + 4), base[1] + dir[1] * (HW + 4)], dir, 13, 13, 16, 9, 16);
  busy.push([cc[0], cc[1], 15]);
  const a = px([base[0] + dir[0] * (HW + 1), base[1] + dir[1] * (HW + 1)]), b = px(cc);
  out.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#1a1a1a" stroke-width="1.2" opacity="0.5"/>`);
  out.push(`<circle cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" r="14" fill="#ffffff" stroke="#1a1a1a" stroke-width="1.8"/>`);
  out.push(`<text x="${b[0].toFixed(1)}" y="${(b[1] + 5).toFixed(1)}" font-size="15" font-weight="bold" fill="#1a1a1a" text-anchor="middle">${c.n}</text>`);
}

// подпись старта — наружу от линии старта
{ const i = 0, dir = outward(i);
  const cc = place([P[i][0] + dir[0] * (HW + 4), P[i][1] + dir[1] * (HW + 4)], dir, 52, 10, 14, 8, 16);
  busy.push([cc[0], cc[1], 22]);
  const a = px([P[i][0] + dir[0] * (HW + 1), P[i][1] + dir[1] * (HW + 1)]), b = px(cc);
  out.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#1a1a1a" stroke-width="1.2" opacity="0.5"/>`);
  out.push(label(cc, 'СТАРТ / ФИНИШ', 16, '#1a1a1a', 'bold')); }

// подписи трибун
for (const st of stands) {
  const t = tang(st.mid), sgn = st.o.side === 'L' ? -1 : 1, away = [t[1] * sgn, -t[0] * sgn];
  const hw = st.o.name.length * 4.6, cc = place(st.anchor, away, hw, 10, 16, 8, 16);
  busy.push([cc[0], cc[1], Math.max(hw, 14)]);
  const a = px(st.anchor), b = px(cc);
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 30)
    out.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#a9701d" stroke-width="1.2" opacity="0.55"/>`);
  out.push(label(cc, st.o.name, 16, '#8a5a10', 'bold'));
}

// подпись боксов — после всего, чтобы знать занятые места
later.forEach(f => f());

// подпись стадиона — в самой свободной точке его контура
{ const poly = STADIUM.map(q => ll2(q[0], q[1]));
  const bx = [Math.min(...poly.map(p => p[0])), Math.max(...poly.map(p => p[0]))];
  const by = [Math.min(...poly.map(p => p[1])), Math.max(...poly.map(p => p[1]))];
  const LW = 78, LH = 24;                                           // полуразмеры двухстрочной подписи, метры
  let best = null, bd = -1;
  for (let x = bx[0]; x < bx[1]; x += 6) for (let y = by[0]; y < by[1]; y += 6) {
    let d = 1e9; for (const [ox, oy, orad] of busy) {
      const dx = Math.max(Math.abs(ox - x) - LW, 0), dy = Math.max(Math.abs(oy - y) - LH, 0);
      d = Math.min(d, Math.hypot(dx, dy) - orad); }
    if (d > bd) { bd = d; best = [x, y]; } }
  if (bd < 0) best = [(bx[0] + bx[1]) / 2, by[0] - 40];             // внутри не влезло — кладём под стадион
  out.push(label(best, 'Hard Rock Stadium', 15, '#8d8579'));
  out.push(label([best[0], best[1] - 18], '(ориентир, в игре не построен)', 12, '#a39b8f')); }

// север
out.push(`<g transform="translate(${W - 70},80)"><line x1="0" y1="26" x2="0" y2="-20" stroke="#1a1a1a" stroke-width="2"/><polygon points="0,-28 -7,-12 7,-12" fill="#1a1a1a"/><text x="0" y="46" font-size="15" text-anchor="middle" fill="#1a1a1a">С</text></g>`);

// масштабная линейка 200 м
{ const x0 = PAD, y0 = HMAP - 40, len = 200 * SC;
  out.push(`<line x1="${x0}" y1="${y0}" x2="${x0 + len}" y2="${y0}" stroke="#1a1a1a" stroke-width="2"/>`);
  out.push(`<line x1="${x0}" y1="${y0 - 6}" x2="${x0}" y2="${y0 + 6}" stroke="#1a1a1a" stroke-width="2"/>`);
  out.push(`<line x1="${x0 + len}" y1="${y0 - 6}" x2="${x0 + len}" y2="${y0 + 6}" stroke="#1a1a1a" stroke-width="2"/>`);
  out.push(`<text x="${x0 + len / 2}" y="${y0 - 10}" font-size="14" text-anchor="middle" fill="#1a1a1a">200 м</text>`); }

// заголовок
if (!MAPONLY) out.push(`<text x="${PAD}" y="48" font-size="28" font-weight="bold" fill="#1a1a1a">Майами — схема трассы в APEX '26</text>`);
if (!MAPONLY) out.push(`<text x="${PAD}" y="74" font-size="15" fill="#5f6368">север сверху · круг ${L.toFixed(0)} м · полотно ${(HW * 2).toFixed(0)} м · направление ПРОТИВ часовой стрелки · номера поворотов по официальным данным F1</text>`);

// ------------------------------------------------------------- легенда
if (!MAPONLY) {
const y0 = HMAP + 10;
out.push(`<line x1="${PAD}" y1="${y0}" x2="${W - PAD}" y2="${y0}" stroke="#d6d1c7" stroke-width="1"/>`);
let col = PAD;
out.push(`<text x="${col}" y="${y0 + 30}" font-size="17" font-weight="bold" fill="#1a1a1a">Повороты — S по нашей осевой, от линии старта</text>`);
CORN.forEach((c, k) => { const x = col + (k % 2) * 260, y = y0 + 56 + Math.floor(k / 2) * 20;
  out.push(`<text x="${x}" y="${y}" font-size="14" fill="#3c4043">T${c.n} · ${Math.round(c.s)} м · ${c.dir} · R ${isFinite(c.r) ? Math.round(c.r) + ' м' : '—'}</text>`); });
out.push(`<text x="${col}" y="${y0 + 56 + 10 * 20 + 10}" font-size="13" fill="#5f6368">Официальные дистанции F1 меряются по гоночной ЛИНИИ и потому</text>`);
out.push(`<text x="${col}" y="${y0 + 56 + 10 * 20 + 28}" font-size="13" fill="#5f6368">к концу круга на ~65 м меньше наших (у нас S идёт по осевой).</text>`);

col = PAD + 570;
out.push(`<text x="${col}" y="${y0 + 30}" font-size="17" font-weight="bold" fill="#1a1a1a">Трибуны (6) — оранжевым</text>`);
stands.forEach((st, k) => { const y = y0 + 56 + k * 20;
  out.push(`<text x="${col}" y="${y}" font-size="14" fill="#3c4043">${esc(st.o.name)} · ${st.inside ? 'слева по ходу, внутри круга' : 'справа по ходу, снаружи'} · S ${Math.round(st.fromS)}–${Math.round(st.toS)} м</text>`); });
{ const y = y0 + 56 + stands.length * 20;
  out.push(`<text x="${col}" y="${y + 18}" font-size="13" fill="#5f6368">Start/Finish и Turn 18 обмерены по снимку (они единственные, что</text>`);
  out.push(`<text x="${col}" y="${y + 36}" font-size="13" fill="#5f6368">стояли в момент съёмки). Turn 1, Marina, Beach North и Beach South</text>`);
  out.push(`<text x="${col}" y="${y + 54}" font-size="13" fill="#5f6368">посажены по официальной схеме и описаниям вида — это ОЦЕНКА,</text>`);
  out.push(`<text x="${col}" y="${y + 72}" font-size="13" fill="#5f6368">проверить её может только заезд на устройстве.</text>`); }

col = PAD + 1180;
const notes = ['Серая коробка через линию старта — боксы и паддок',
  '(контур из OSM, 284 × 27 м, справа по ходу).',
  '',
  'Светло-серый контур — Hard Rock Stadium: он стоит СНАРУЖИ',
  'петли, в игре его нет. На главной прямой внутренняя сторона —',
  'ЛЕВАЯ, а паддок, боксы и стадион остаются снаружи.',
  '',
  'Барьер и зоны вылета у Майами пока ОБОБЩЁННЫЕ: снимков трассы',
  'в гоночной конфигурации не существует, мерить их нечем.',
  '',
  'Карта в географической ориентации — мир игры отражён по X,',
  'здесь отражение снято, поэтому её можно класть рядом',
  'с официальной схемой гонки.'];
out.push(`<text x="${col}" y="${y0 + 30}" font-size="17" font-weight="bold" fill="#1a1a1a">Что ещё на схеме</text>`);
notes.forEach((t, k) => out.push(`<text x="${col}" y="${y0 + 56 + k * 19}" font-size="13" fill="#3c4043">${esc(t)}</text>`));

}

out.push('</svg>');
fs.writeFileSync(OUT, out.join('\n'));
console.log('%s: %d x %d px, %d поворотов, %d трибун, круг %s м',
  path.relative(process.cwd(), OUT), W, HMAP + LEG, CORNERS.length, stands.length, L.toFixed(1));

// --- сверка: сторона каждого поворота по НАШЕЙ геометрии против телеметрии F1.
// Расхождение допустимо ровно одно и оно известное — шикана T14/T15: официальные
// точки стоят в 19 м друг от друга, и проекция T15 попадает в самый перелом,
// где наша осевая ещё доворачивает влево. Всё остальное обязано совпасть.
const bad = CORN.filter(c => c.dir !== c.ours);
console.log('сверка сторон с телеметрией F1: %d из %d%s', CORN.length - bad.length, CORN.length,
  bad.length ? ' — расходятся: ' + bad.map(c => 'T' + c.n).join(', ') : '');
