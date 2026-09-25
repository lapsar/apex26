/* Схема Хунгароринга вида сверху: то, что стоит В ИГРЕ — номера поворотов, СТЕНЫ,
   ЗОНЫ ВЫЛЕТА, ТРИБУНЫ и пит-билдинг (с v1.16.7).
   Всё берётся из ПОСТРОЕННОГО мира (H.setupWorld): стена — track.WL/WR после всех
   правил строителя, зоны — те же индексы и та же обрезка по стене, трибуны —
   с той же поправкой «не ближе 2 м за барьером» (урок §8: мерить построенное).
   По образцу miami-scan/map-plan.js. Карта рисуется в ГЕОГРАФИЧЕСКОЙ ориентации
   (север сверху, восток справа), чтобы её можно было положить рядом с официальной
   схемой гонки и сверить.

   ЛОВУШКА №1 ПРОЕКТА (CLAUDE.md §7, §9-bis): мир игры отражён по X
   (makeTrack: V3(-p[0],0,p[1])). Поэтому здесь всё переводится обратно:
   East = -x, North = z. Что отражение снято ПРАВИЛЬНО, доказано не рассуждением:
   круг телеметрии F1 ложится на наш контур поворотом и сдвигом БЕЗ отражения
   со средней ошибкой 2.4 м.

   ОТКУДА НОМЕРА ПОВОРОТОВ. Официальные данные F1 (circuit-API, ключ трассы 4):
   https://api.multiviewer.app/api/v1/circuits/4/2026 — оттуда же брался sfShift.
   Таблица CORNERS — результат совмещения: S каждого поворота по НАШЕЙ осевой
   (проекцией официальной точки, а не по дистанции: официальная меряется по
   гоночной ЛИНИИ и короче) и сторона по телеметрии.

   node tools/hungaroring-scan/map-plan.js [--out=файл.svg] [--map-only]
*/
const fs = require('fs'), path = require('path');
const H = require(path.join(__dirname, '..', 'harness.js'));

const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=')[1];
const OUT = arg('out') || path.join(__dirname, 'hungaroring-map.svg');
const MAPONLY = process.argv.includes('--map-only');

// S по НАШЕЙ осевой от линии старта + сторона по телеметрии F1.
// 1A и 12A — вторые апексы длинных поворотов, номера у них официальные.
const CORNERS = [[ '1', 619, 'правый'], ['1A', 804, 'правый'], ['2', 1115, 'левый'],
  ['3', 1300, 'правый'], ['4', 1773, 'левый'], ['5', 2015, 'правый'], ['6', 2352, 'правый'],
  ['7', 2399, 'левый'], ['8', 2564, 'левый'], ['9', 2705, 'правый'], ['10', 2898, 'левый'],
  ['11', 3097, 'правый'], ['12', 3491, 'правый'], ['12A', 3622, 'левый'], ['13', 3765, 'левый'],
  ['14', 4061, 'правый']];

const env = H.loadGame();
const idx = H.tracks().findIndex(t => t.key === 'Hungaroring');
if (idx < 0) { console.error('Хунгароринга нет в TRACKS'); process.exit(2); }
H.setupWorld(env, { trackIdx: idx });
const T = JSON.parse(env.evalIn(`(function(){
  var o={M:track.M,len:track.length,half:track.roadHalf,P:[],R:[],S:track.S.slice(),
         HW:Array.from(track.HW),WL:Array.from(track.WL),WR:Array.from(track.WR)};
  for(var i=0;i<track.M;i++){o.P.push([track.P[i].x,track.P[i].z]);o.R.push([track.R[i].x,track.R[i].z]);}
  return JSON.stringify(o);})()`));

// зоны вылета и объекты — посадкой ТЕХ ЖЕ функций, что у строителя мира
const MK = JSON.parse(env.evalIn(`(function(){
  var sc=SCENERY_BY_KEY['Hungaroring'],h=scenHelpers(),M=track.M,zones=[],obj=[];
  (sc.runoff||[]).forEach(function(z){var a=scenIndexAt(h,z.fromLatLon,z.fromS),b=scenIndexAt(h,z.toLatLon,z.toS);
    zones.push({a:a,b:b,side:z.side,type:z.type,width:z.width});});
  (sc.objects||[]).forEach(function(o){
    var r={kind:o.kind,name:o.name,side:o.side,off:o.off,d:o.d,w:o.w,shape:o.shape};
    if(o.fromLatLon&&o.toLatLon){r.a=scenIndexAt(h,o.fromLatLon,o.fromS);r.b=scenIndexAt(h,o.toLatLon,o.toS);
      var span=(r.b-r.a+M)%M,need=0;                      // та же поправка, что в buildMappedScenery
      for(var t=0;t<=span;t++){var i=(r.a+t)%M,w=(o.side==='R')?track.WR[i]:track.WL[i];need=Math.max(need,w+2-r.off);}
      if(need>0)r.off+=need;}
    if(o.latLon){r.at=scenIndexAt(h,o.latLon,o.atS);var q=h.toXZ(o.latLon[0],o.latLon[1]);r.x=q[0];r.z=q[1];}
    obj.push(r);});
  return JSON.stringify({zones:zones,obj:obj});})()`));

const geo = p => [-p[0], p[1]];
const P = T.P.map(geo), R = T.R.map(geo), S = T.S, M = T.M, L = T.len, HW = T.half;
const at = (i, off, side) => { const s = side === 'R' ? 1 : -1;
  return [P[i][0] + R[i][0] * s * off, P[i][1] + R[i][1] * s * off]; };
const idxAtS = s => Math.round((((s % L) + L) % L) / L * M) % M;
const tang = i => { const a = P[(i - 1 + M) % M], b = P[(i + 1) % M];
  const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
const outward = i => { const t = tang(i); return [-t[1], t[0]]; };   // круг ПО часовой: наружу = влево по ходу
const turnDir = i => { let t = 0;
  for (let d = -15; d < 15; d++) { const a = P[((i + d - 1) % M + M) % M], b = P[((i + d) % M + M) % M], c = P[((i + d + 1) % M + M) % M];
    const v1 = [b[0]-a[0], b[1]-a[1]], v2 = [c[0]-b[0], c[1]-b[1]];
    if (Math.hypot(v1[0], v1[1]) < 1e-6 || Math.hypot(v2[0], v2[1]) < 1e-6) continue;
    t += Math.atan2(v1[0]*v2[1] - v1[1]*v2[0], v1[0]*v2[0] + v1[1]*v2[1]); }
  return t > 0 ? 'левый' : 'правый'; };
const radGeo = (i, step) => {
  const a = P[(i - step + M) % M], b = P[i], c = P[(i + step) % M];
  const A = Math.hypot(b[0]-a[0], b[1]-a[1]), B = Math.hypot(c[0]-b[0], c[1]-b[1]), C = Math.hypot(c[0]-a[0], c[1]-a[1]);
  const ar = Math.abs((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])) / 2;
  return ar < 1e-6 ? Infinity : A * B * C / (4 * ar); };
const radius = i => { let r = Infinity;
  for (let d = -6; d <= 6; d++) r = Math.min(r, radGeo(((i + d) % M + M) % M, 5)); return r; };

const pts = [].concat(P, P.map((_, i) => at(i, T.WR[i], 'R')), P.map((_, i) => at(i, T.WL[i], 'L')));
for (const o of MK.obj) if (o.shape === 'arc')                    // трибуны тоже в кадре (задний ряд у T14 — 79 м)
  for (let t = 0, sp = (o.b - o.a + M) % M; t <= sp; t++) pts.push(at((o.a + t) % M, o.off + o.d, o.side));
const minE = Math.min(...pts.map(p => p[0])), maxE = Math.max(...pts.map(p => p[0]));
const minN = Math.min(...pts.map(p => p[1])), maxN = Math.max(...pts.map(p => p[1]));
const PAD = 110, SC = 1.6;
const W = Math.round((maxE - minE) * SC) + PAD * 2;
const HMAP = Math.round((maxN - minN) * SC) + PAD * 2;
const LEG = MAPONLY ? 0 : 440;
const px = p => [(p[0] - minE) * SC + PAD, (maxN - p[1]) * SC + PAD];
const fmtP = p => { const q = px(p); return q[0].toFixed(1) + ',' + q[1].toFixed(1); };

const out = [];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HMAP + LEG}" viewBox="0 0 ${W} ${HMAP + LEG}" font-family="Helvetica, Arial, sans-serif">`);
out.push(`<rect width="${W}" height="${HMAP + LEG}" fill="#f7f6f3"/>`);

const ZCOL = { asphalt: '#b9bcc2', gravel: '#e0c98f', paint: '#7fd0da', grass: '#a8cf8e' };
// трава — фон круга (в игре это основание мира)
{ const wl = [], wr = [];
  for (let i = 0; i < M; i++) { wl.push(at(i, T.WL[i], 'L')); wr.push(at(i, T.WR[i], 'R')); }
  out.push(`<path d="M ${wr.map(fmtP).join(' L ')} Z M ${wl.slice().reverse().map(fmtP).join(' L ')} Z" fill="#cfe3bf" fill-rule="evenodd"/>`); }
// зоны вылета: от кромки до min(ширина, стена) — как строитель
for (const z of MK.zones) {
  const span = (z.b - z.a + M) % M; if (span > M / 2) continue;
  const W = z.side === 'R' ? T.WR : T.WL, inn = [], outp = [];
  for (let t = 0; t <= span; t++) { const i = (z.a + t) % M;
    inn.push(at(i, T.HW[i], z.side)); outp.push(at(i, Math.min(T.HW[i] + z.width, W[i]), z.side)); }
  out.push(`<polygon points="${inn.concat(outp.reverse()).map(fmtP).join(' ')}" fill="${ZCOL[z.type] || '#ccc'}" stroke="none"/>`); }
// стены — построенный барьер
for (const [key, side] of [['WL', 'L'], ['WR', 'R']]) {
  const q = []; for (let i = 0; i < M; i++) q.push(at(i, T[key][i], side));
  out.push(`<polyline points="${q.map(fmtP).join(' ')} ${fmtP(q[0])}" fill="none" stroke="#1f4e9c" stroke-width="2.4" stroke-linejoin="round"/>`); }
// трибуны и пит-билдинг
const STANDS = [];
for (const o of MK.obj) {
  if (o.shape === 'arc') {
    const span = (o.b - o.a + M) % M, near = [], far = [];
    for (let t = 0; t <= span; t++) { const i = (o.a + t) % M; near.push(at(i, o.off, o.side)); far.push(at(i, o.off + o.d, o.side)); }
    out.push(`<polygon points="${near.concat(far.slice().reverse()).map(fmtP).join(' ')}" fill="#e8a33d" stroke="#a9701d" stroke-width="1.5" opacity="0.95"/>`);
    STANDS.push({ o, mid: (o.a + (span >> 1)) % M, fromS: S[o.a], toS: S[o.b % M], far });
  } else {
    const i = o.at, t = tang(i), n = outward(i), sg = o.side === 'L' ? 1 : -1, c0 = at(i, o.off, o.side);
    const hw2 = o.w / 2, q = [[c0[0] - t[0]*hw2, c0[1] - t[1]*hw2], [c0[0] + t[0]*hw2, c0[1] + t[1]*hw2]];
    q.push([q[1][0] + n[0]*sg*o.d, q[1][1] + n[1]*sg*o.d], [q[0][0] + n[0]*sg*o.d, q[0][1] + n[1]*sg*o.d]);
    out.push(`<polygon points="${q.map(fmtP).join(' ')}" fill="#9aa0a6" stroke="#6b7076" stroke-width="1.5"/>`);
    STANDS.push({ o, pit: true, mid: i, far: [q[2], q[3]], center: [(q[0][0]+q[2][0])/2, (q[0][1]+q[2][1])/2] });
  } }

const edgeR = [], edgeL = [];
for (let i = 0; i < M; i++) { edgeR.push(at(i, HW, 'R')); edgeL.push(at(i, HW, 'L')); }
out.push(`<path d="M ${edgeR.map(fmtP).join(' L ')} Z M ${edgeL.slice().reverse().map(fmtP).join(' L ')} Z" fill="#4a4a4a" fill-rule="evenodd"/>`);
out.push(`<polyline points="${P.map(fmtP).join(' ')} ${fmtP(P[0])}" fill="none" stroke="#ffffff" stroke-width="0.8" stroke-dasharray="6 10" opacity="0.5"/>`);

const busy = [];
for (let i = 0; i < M; i += 2) busy.push([P[i][0], P[i][1], HW + 7]);
for (const st of STANDS) for (const q of st.far) busy.push([q[0], q[1], 4]);
function fits(c, hw, hh) {
  for (const [bx, by, br] of busy) {
    const dx = Math.max(Math.abs(bx - c[0]) - hw, 0), dy = Math.max(Math.abs(by - c[1]) - hh, 0);
    if (dx * dx + dy * dy < br * br) return false; }
  return true; }
function place(anchor, dir, hw, hh, from, step, tries) {
  for (let k = 0; k < tries; k++) { const d = from + k * step;
    const c = [anchor[0] + dir[0] * d, anchor[1] + dir[1] * d];
    if (fits(c, hw, hh)) return c; }
  return [anchor[0] + dir[0] * (from + tries * step), anchor[1] + dir[1] * (from + tries * step)]; }
const label = (c, text, size, color, weight) => {
  const q = px(c), w = text.length * size * 0.55, h = size * 1.25;
  return `<rect x="${(q[0] - w / 2 - 4).toFixed(1)}" y="${(q[1] - h + 2).toFixed(1)}" width="${(w + 8).toFixed(1)}" height="${(h + 4).toFixed(1)}" rx="3" fill="#f7f6f3" opacity="0.82"/>`
       + `<text x="${q[0].toFixed(1)}" y="${q[1].toFixed(1)}" font-size="${size}" font-weight="${weight || 'normal'}" fill="${color}" text-anchor="middle">${esc(text)}</text>`; };

{ const i = 0, a = at(i, HW + 3, 'L'), b = at(i, HW + 3, 'R');
  out.push(`<line x1="${px(a)[0].toFixed(1)}" y1="${px(a)[1].toFixed(1)}" x2="${px(b)[0].toFixed(1)}" y2="${px(b)[1].toFixed(1)}" stroke="#ffffff" stroke-width="5"/>`); }
for (let s = 0; s < L; s += 300) { const i = idxAtS(s), t = tang(i), p = P[i];
  const tip = [p[0] + t[0] * 15, p[1] + t[1] * 15], n = [t[1], -t[0]];
  const w1 = [p[0] - t[0] * 5 + n[0] * 5.5, p[1] - t[1] * 5 + n[1] * 5.5];
  const w2 = [p[0] - t[0] * 5 - n[0] * 5.5, p[1] - t[1] * 5 - n[1] * 5.5];
  out.push(`<polygon points="${[tip, w1, w2].map(fmtP).join(' ')}" fill="#ffffff" opacity="0.8"/>`); }

const CORN = CORNERS.map(([n, s, dir]) => { const i = idxAtS(s); return { n, s, i, dir, ours: turnDir(i), r: radius(i) }; });
for (const c of CORN) {
  const base = P[c.i], dir = outward(c.i);
  const cc = place([base[0] + dir[0] * (HW + 4), base[1] + dir[1] * (HW + 4)], dir, 13, 13, 16, 9, 16);
  busy.push([cc[0], cc[1], 15]);
  const a = px([base[0] + dir[0] * (HW + 1), base[1] + dir[1] * (HW + 1)]), b = px(cc);
  out.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#1a1a1a" stroke-width="1.2" opacity="0.5"/>`);
  out.push(`<circle cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" r="15" fill="#ffffff" stroke="#1a1a1a" stroke-width="1.8"/>`);
  out.push(`<text x="${b[0].toFixed(1)}" y="${(b[1] + 5).toFixed(1)}" font-size="${c.n.length > 2 ? 12 : 15}" font-weight="bold" fill="#1a1a1a" text-anchor="middle">${c.n}</text>`);
}
{ const i = 0, dir = outward(i);
  const cc = place([P[i][0] + dir[0] * (HW + 4), P[i][1] + dir[1] * (HW + 4)], dir, 58, 10, 16, 8, 16);
  busy.push([cc[0], cc[1], 24]);
  const a = px([P[i][0] + dir[0] * (HW + 1), P[i][1] + dir[1] * (HW + 1)]), b = px(cc);
  out.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#1a1a1a" stroke-width="1.2" opacity="0.5"/>`);
  out.push(label(cc, 'СТАРТ / ФИНИШ', 16, '#1a1a1a', 'bold')); }

STANDS.forEach((st, k) => {
  const i = st.mid, sg = st.o.side === 'L' ? 1 : -1, n = outward(i), dir = [n[0] * sg, n[1] * sg];
  const cap = st.pit ? 'Пит-билдинг' : st.o.name;
  const anchor = st.pit ? st.center : at(i, st.o.off + st.o.d, st.o.side);
  const cc = place(anchor, dir, cap.length * 4.3, 9, 10, 8, 20);
  busy.push([cc[0], cc[1], Math.max(cap.length * 4.3, 12)]);
  const a = px(anchor), b = px(cc);
  out.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#a9701d" stroke-width="1" opacity="0.6"/>`);
  out.push(label(cc, cap, 14, st.pit ? '#4a5056' : '#8a5410', 'bold')); });
out.push(`<g transform="translate(${W - 70},80)"><line x1="0" y1="26" x2="0" y2="-20" stroke="#1a1a1a" stroke-width="2"/><polygon points="0,-28 -7,-12 7,-12" fill="#1a1a1a"/><text x="0" y="46" font-size="15" text-anchor="middle" fill="#1a1a1a">С</text></g>`);
{ const x0 = PAD, y0 = HMAP - 40, len = 200 * SC;
  out.push(`<line x1="${x0}" y1="${y0}" x2="${x0 + len}" y2="${y0}" stroke="#1a1a1a" stroke-width="2"/>`);
  out.push(`<line x1="${x0}" y1="${y0 - 6}" x2="${x0}" y2="${y0 + 6}" stroke="#1a1a1a" stroke-width="2"/>`);
  out.push(`<line x1="${x0 + len}" y1="${y0 - 6}" x2="${x0 + len}" y2="${y0 + 6}" stroke="#1a1a1a" stroke-width="2"/>`);
  out.push(`<text x="${x0 + len / 2}" y="${y0 - 10}" font-size="14" text-anchor="middle" fill="#1a1a1a">200 м</text>`); }

if (!MAPONLY) {
out.push(`<text x="${PAD}" y="48" font-size="28" font-weight="bold" fill="#1a1a1a">Хунгароринг — схема трассы в APEX '26</text>`);
out.push(`<text x="${PAD}" y="74" font-size="15" fill="#5f6368">север сверху · круг ${L.toFixed(0)} м · полотно ${(HW * 2).toFixed(0)} м · направление ПО часовой стрелке · номера поворотов по официальным данным F1</text>`);
const y0 = HMAP + 10;
out.push(`<line x1="${PAD}" y1="${y0}" x2="${W - PAD}" y2="${y0}" stroke="#d6d1c7" stroke-width="1"/>`);
let col = PAD;
out.push(`<text x="${col}" y="${y0 + 30}" font-size="17" font-weight="bold" fill="#1a1a1a">Повороты — S по нашей осевой, от линии старта</text>`);
CORN.forEach((c, k) => { const x = col + (k % 2) * 270, y = y0 + 56 + Math.floor(k / 2) * 20;
  out.push(`<text x="${x}" y="${y}" font-size="14" fill="#3c4043">T${c.n} · ${Math.round(c.s)} м · ${c.dir} · R ${isFinite(c.r) ? Math.round(c.r) + ' м' : '—'}</text>`); });
out.push(`<text x="${col}" y="${y0 + 56 + 8 * 20 + 14}" font-size="13" fill="#5f6368">1A и 12A — вторые апексы длинных поворотов, номера официальные.</text>`);
out.push(`<text x="${col}" y="${y0 + 56 + 8 * 20 + 32}" font-size="13" fill="#5f6368">Официальные дистанции F1 меряются по гоночной ЛИНИИ и потому</text>`);
out.push(`<text x="${col}" y="${y0 + 56 + 8 * 20 + 50}" font-size="13" fill="#5f6368">короче наших: у нас S идёт по осевой.</text>`);
col = PAD + 580;
const sw = (y, c, t, line) => { out.push(line
    ? `<line x1="${col}" y1="${y - 5}" x2="${col + 26}" y2="${y - 5}" stroke="${c}" stroke-width="3"/>`
    : `<rect x="${col}" y="${y - 13}" width="26" height="14" fill="${c}" stroke="#6b7076" stroke-width="0.6"/>`);
  out.push(`<text x="${col + 36}" y="${y}" font-size="14" fill="#3c4043">${esc(t)}</text>`); };
const LY = y0 + 56;
sw(LY, '#4a4a4a', 'полотно (12 м)'); sw(LY + 22, '#1f4e9c', 'стена / отбойник / шины — как построено в игре', true);
sw(LY + 44, ZCOL.asphalt, 'зона вылета: асфальт / бетон'); sw(LY + 66, ZCOL.gravel, 'зона вылета: гравий');
sw(LY + 88, '#cfe3bf', 'трава между кромкой и стеной'); sw(LY + 110, '#e8a33d', 'трибуны (9)'); sw(LY + 132, '#9aa0a6', 'пит-билдинг');
const notes = ['',
  'v1.16.7: стены и зоны сняты со снимка Google z20 и сверены',
  'с онбоардом 2025. Слева по ходу (сторона трибун) армко в 4-5 м',
  'за кромкой, справа синяя стена в 2-4 м; снаружи поворотов',
  'асфальт до шин. Трибуны — v1.16.6.',
  'Север сверху, отражение мира игры снято — можно класть',
  'рядом с официальной схемой гонки.'];
notes.forEach((t, k) => out.push(`<text x="${col}" y="${LY + 150 + k * 19}" font-size="13" fill="#3c4043">${esc(t)}</text>`));
out.push(`<text x="${col}" y="${y0 + 30}" font-size="17" font-weight="bold" fill="#1a1a1a">Условные знаки</text>`);
}
out.push('</svg>');
fs.writeFileSync(OUT, out.join('\n'));
console.log('%s: %d x %d px, %d поворотов, круг %s м', path.relative(process.cwd(), OUT), W, HMAP + LEG, CORNERS.length, L.toFixed(1));

// сверка сторон: наша геометрия против телеметрии F1
const bad = CORN.filter(c => c.dir !== c.ours);
console.log('сверка сторон с телеметрией F1: %d из %d%s', CORN.length - bad.length, CORN.length,
  bad.length ? ' — расходятся: ' + bad.map(c => 'T' + c.n).join(', ') : '');
