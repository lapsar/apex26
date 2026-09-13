/* ============================================================================
   ПОДБОР коэффициентов для схемы «один болид на всех + поправка силы пилота»:
   какими должны быть коэффициент режима D и наклон поправки k, чтобы якорь §4
   сдвинулся как можно меньше.

   Не пробник: порогов нет, ничего не заваливает, index.html не трогает.
   Формулы берутся из игры через toString (см. unified-car-study.js) — справка,
   повторяющая физику своей копией формул, устаревает молча (§11, v1.15.74).

   Ход подбора: для каждого наклона k коэффициент D подбирается бисекцией так,
   чтобы СРЕДНИЙ по трассам поул совпал с нынешним. Поул — это минимум по
   ростеру, то есть время сильнейшего пилота, поэтому в бисекции считается один
   болид, а весь ростер — только в отчёте.

   Запуск: node tools/unified-car-fit.js [--scale=1|0] [--k=0.3,0.35,0.4]
           [--tracks=visible|all]
   ========================================================================== */
'use strict';
const H = require('./harness');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const SCALE = arg('scale', '1') === '1';
const KS = arg('k', '0.30,0.35,0.40').split(',').map(Number);
const OPEN = arg('tracks', 'visible') === 'visible';
const DIFFS = ['easy', 'normal', 'hard'];
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); };

const envs = H.tracks(OPEN).map(T => {
  const env = H.loadGame();
  H.setupWorld(env, { trackIdx: T.idx });
  env.evalIn(`
    var __s1 = aiTarget.toString(), __s2 = estLapTime.toString();
    function __mk(BR, ACC){
      var a = __s1.replace(/AIBRAKE/g,'('+BR+')');
      var e = __s2.replace(/13\\.5/g,'('+ACC+')').replace(/aiTarget\\(/g,'__t(');
      return eval('(function(){var __t='+a+';var __e='+e+';return __e;})()');
    }
    (function(){ var b=aiBase(0.98,DIFF_MUL.hard), c=aiGrip(0.98,DIFF_GRIP.hard);
      if (Math.abs(__mk(AIBRAKE,13.5)(b,c)-estLapTime(b,c))>1e-9)
        throw new Error('unified-car-fit: подмена формул разошлась с игрой'); })();
    function __now(d){ return ROSTER.map(function(r){
      return estLapTime(aiBase(r.skill,DIFF_MUL[d]), aiGrip(r.skill,DIFF_GRIP[d]));
    }).sort(function(a,b){return a-b;}); }
    function __uni(D,k,scale){ return ROSTER.map(function(r){
      var m = D*(1+(r.skill-0.98)*k), f = scale?m:1;
      return __mk(50*f,14*f)(MAXSPEED*track.grip*m, m); }).sort(function(a,b){return a-b;}); }
    function __pole(D,scale){ var f = scale?D:1;         // сильнейший: поправка силы у него ровно 1
      return __mk(50*f,14*f)(MAXSPEED*track.grip*D, D); }
  `);
  return { T, env };
});

const now = {};
for (const d of DIFFS) now[d] = envs.map(e => e.env.evalIn(`__now(${JSON.stringify(d)})`));

console.log('Тормоза и разгон ' + (SCALE ? 'МАСШТАБИРУЮТСЯ вместе с машиной (50*m / 14*m)' : 'ОБЩИЕ 50 / 14 у всех') +
  '\nТрассы: ' + envs.map(e => e.T.name).join(', ') + '\n');

for (const d of DIFFS) {
  // D зависит только от того, масштабируются ли тормоза, — поправка силы у лидера равна 1
  let lo = 0.80, hi = 1.05;
  for (let it = 0; it < 16; it++) {
    const D = (lo + hi) / 2;
    let s = 0;
    for (let i = 0; i < envs.length; i++) s += envs[i].env.evalIn(`__pole(${D},${SCALE ? 1 : 0})`) - now[d][i][0];
    if (s > 0) lo = D; else hi = D;                     // время круга убывает с ростом D
  }
  const D = (lo + hi) / 2;
  console.log('=== ' + d + ':  D = ' + D.toFixed(4) + ' (подобран под нынешний поул) ===');
  for (const k of KS) {
    const rows = envs.map((e, i) => ({ n: now[d][i], u: e.env.evalIn(`__uni(${D},${k},${SCALE ? 1 : 0})`), T: e.T }));
    for (const r of rows)
      console.log('   k=' + k.toFixed(2) + '  ' + r.T.name.padEnd(12) +
        ' P1 ' + fmt(r.u[0]) + ' (' + (r.u[0] - r.n[0] >= 0 ? '+' : '') + (r.u[0] - r.n[0]).toFixed(2) + ')' +
        '  P11 ' + fmt(r.u[10]) + ' (' + (r.u[10] - r.n[10] >= 0 ? '+' : '') + (r.u[10] - r.n[10]).toFixed(2) + ')' +
        '  P22 ' + fmt(r.u[21]) + ' (' + (r.u[21] - r.n[21] >= 0 ? '+' : '') + (r.u[21] - r.n[21]).toFixed(2) + ')' +
        '  разброс ' + (r.n[21] - r.n[0]).toFixed(2) + ' -> ' + (r.u[21] - r.u[0]).toFixed(2));
  }
}
