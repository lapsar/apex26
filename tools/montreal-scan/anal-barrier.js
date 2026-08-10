/* Разбор данных OSM по барьеру Монреаля в координатах игры. */
const fs = require('fs');
const path = require('path');
const H = require(require('path').join(__dirname,'..','harness.js'));

const env = H.loadGame();
const idx = H.tracks().findIndex(t => t.key === 'Montreal');
env.evalIn(`track=makeTrack(TRACKS[${idx}]);0`);
const T = env.evalIn(`(function(){var o={M:track.M,len:track.length,half:track.roadHalf,P:[],S:track.S.slice(),R:[]};
  for(var i=0;i<track.M;i++){o.P.push([track.P[i].x,track.P[i].z]);o.R.push([track.R[i].x,track.R[i].z]);}
  return JSON.stringify(o);})()`);
const trk = JSON.parse(T);

const O = { lat0: 45.504410238, lon0: -73.526453475, mlon: 78019.107475 };
const g = (lat, lon) => [-(lon - O.lon0) * O.mlon, (lat - O.lat0) * 110540];

function project(x, z) {
  let best = 1e18, bi = 0;
  for (let i = 0; i < trk.M; i++) {
    const dx = x - trk.P[i][0], dz = z - trk.P[i][1], dd = dx * dx + dz * dz;
    if (dd < best) { best = dd; bi = i; }
  }
  const R = trk.R[bi];
  const off = (x - trk.P[bi][0]) * R[0] + (z - trk.P[bi][1]) * R[1];
  return { i: bi, S: trk.S[bi], off, d: Math.sqrt(best) };
}

const file = process.argv[2];
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const ways = j.elements.filter(e => e.type === 'way' && e.geometry);
console.log(`круг ${trk.len.toFixed(0)} м, точек ${trk.M}, полуширина ${trk.half}`);
console.log(`объектов в выгрузке: ${ways.length}`);

const tags = {};
for (const w of ways) { const k = JSON.stringify(w.tags); tags[k] = (tags[k] || 0) + 1; }
const near = [];
for (const w of ways) {
  const pts = w.geometry.map(n => { const [x, z] = g(n.lat, n.lon); return project(x, z); });
  const inside = pts.filter(p => p.d < 40);
  if (!inside.length) continue;
  near.push({ id: w.id, tags: w.tags, n: w.geometry.length, hit: inside.length, pts });
}
console.log(`объектов с точками ближе 40 м к осевой: ${near.length}`);
const byTag = {};
for (const w of near) {
  const k = w.tags.barrier ? 'barrier=' + w.tags.barrier : JSON.stringify(w.tags);
  byTag[k] = byTag[k] || { ways: 0, pts: 0 };
  byTag[k].ways++; byTag[k].pts += w.hit;
}
for (const k of Object.keys(byTag).sort()) console.log(`  ${k}: ${byTag[k].ways} объ., ${byTag[k].pts} точек у трассы`);

// покрытие круга: помечаем 4-метровые ячейки, где есть точка барьера в 40 м
const covL = new Array(trk.M).fill(false), covR = new Array(trk.M).fill(false);
for (const w of near) for (const p of w.pts) {
  if (p.d >= 40) continue;
  (p.off < 0 ? covL : covR)[p.i] = true;
}
const pct = a => (100 * a.filter(Boolean).length / trk.M).toFixed(1);
console.log(`покрытие: слева ${pct(covL)} %, справа ${pct(covR)} %`);
function holes(a, name) {
  let worst = 0, ws = 0, run = 0, start = 0;
  for (let k = 0; k < trk.M * 2; k++) {
    const i = k % trk.M;
    if (!a[i]) { if (run === 0) start = i; run++; if (run > worst) { worst = run; ws = start; } }
    else run = 0;
  }
  console.log(`  ${name}: худшая дыра ${(Math.min(worst, trk.M) * trk.len / trk.M).toFixed(0)} м от S=${trk.S[ws].toFixed(0)}`);
}
holes(covL, 'слева'); holes(covR, 'справа');

// распределение отступов
const offs = [];
for (const w of near) for (const p of w.pts) if (p.d < 40) offs.push(Math.abs(p.off));
offs.sort((a, b) => a - b);
if (offs.length) {
  const q = f => offs[Math.floor(f * (offs.length - 1))].toFixed(1);
  console.log(`отступ от осевой: мин ${q(0)}, 25% ${q(.25)}, медиана ${q(.5)}, 75% ${q(.75)}, макс ${q(1)}`);
}
fs.writeFileSync(path.join(__dirname,'near.json'), JSON.stringify(near.map(w => ({ id: w.id, tags: w.tags, pts: w.pts.filter(p => p.d < 60).map(p => [+p.S.toFixed(1), +p.off.toFixed(2)]) })), null, 1));
