/* ============================================================================
   СПРАВКА: «один болид на всех + поправка силы пилота»

   Считает, что стало бы с временами круга, если бы соперник ехал БУКВАЛЬНО ту же
   машину, что игрок (потолок, сцепление, тормоза, разгон), а различались бы
   только два множителя: коэффициент режима D и поправка силы пилота.

   НЕ пробник: порогов нет, ничего не заваливает, index.html не трогает.

   Как считает
     Формулы берутся ИЗ ИГРЫ по имени, а не переписываются: `aiTarget` и
     `estLapTime` вынимаются через toString() и в тексте подменяются только два
     числа — AIBRAKE и разгон 13.5. Это ровно тот урок, что записан в §11
     (v1.15.74): справка, повторяющая физику своей копией формул, устаревает
     молча. Сверка: mk(44,13.5) обязан совпасть со штатной estLapTime до
     последней цифры — скрипт это проверяет и падает, если разошлось.

   Запуск: node tools/unified-car-study.js [--k=0.5] [--tracks=all|visible]
   ========================================================================== */
'use strict';
const H = require('./harness');

const args = process.argv.slice(2);
const argv = k => { const a = args.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
const KS = (argv('k') || '0.35,0.5,0.7').split(',').map(Number);
const ONLY = argv('tracks') === 'visible';
const DIFFS = ['easy', 'normal', 'hard'];
const DNEW = { easy: 0.90, normal: 0.95, hard: 0.975 };   // предложение владельца

const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); };

function measure(trackIdx) {
  const env = H.loadGame();
  H.setupWorld(env, { trackIdx });
  env.evalIn(`
    var __s1 = aiTarget.toString(), __s2 = estLapTime.toString();
    function __mk(BR, ACC){
      var a = __s1.replace(/AIBRAKE/g, '(' + BR + ')');
      var e = __s2.replace(/13\\.5/g, '(' + ACC + ')').replace(/aiTarget\\(/g, '__t(');
      return eval('(function(){var __t=' + a + ';var __e=' + e + ';return __e;})()');
    }
    // сверка инструмента с игрой
    (function(){
      var b = aiBase(0.98, DIFF_MUL.hard), c = aiGrip(0.98, DIFF_GRIP.hard);
      if (Math.abs(__mk(AIBRAKE, 13.5)(b, c) - estLapTime(b, c)) > 1e-9)
        throw new Error('unified-car-study: подмена формул разошлась с игрой');
    })();
    // Времена всего ростера. mode:
    //   'now'  — как сейчас: aiBase/aiGrip, тормоза AIBRAKE, разгон 13.5
    //   'uni'  — один болид: top=corner=D*s, тормоза/разгон игрока (50/14),
    //            scale=1 масштабирует и их тем же множителем
    function __field(mode, D, k, scale){
      var est = mode === 'now' ? estLapTime : null;
      return ROSTER.map(function(r){
        if (mode === 'now') return est(aiBase(r.skill, DIFF_MUL[__d]), aiGrip(r.skill, DIFF_GRIP[__d]));
        var m = D * (1 + (r.skill - 0.98) * k);
        var f = scale ? m : 1;
        return __mk(50 * f, 14 * f)(MAXSPEED * track.grip * m, m);
      }).sort(function(a,b){return a-b;});
    }
    // «эталонная машина» — потолок и сцепление игрока, его тормоза и разгон,
    // по правилам ИИ. Одна линейка для всех вариантов, не идеальный круг.
    function __ref(){ return __mk(50,14)(MAXSPEED*track.grip, 1); }
    var __d = 'normal';
  `);
  const out = { name: env.evalIn('track.name'), grip: env.evalIn('track.grip'), ref: env.evalIn('__ref()'), rows: {} };
  for (const d of DIFFS) {
    env.evalIn(`__d=${JSON.stringify(d)};`);
    const row = { now: env.evalIn(`__field('now')`), uni: {} };
    for (const k of KS) {
      row.uni['k' + k + '-scaled'] = env.evalIn(`__field('uni', ${DNEW[d]}, ${k}, 1)`);
      row.uni['k' + k + '-fixed'] = env.evalIn(`__field('uni', ${DNEW[d]}, ${k}, 0)`);
    }
    out.rows[d] = row;
  }
  return out;
}

const pick = a => ({ p1: a[0], p11: a[10], p22: a[21], spread: a[21] - a[0] });

function main() {
  const tr = H.tracks(ONLY);
  const all = [];
  for (const T of tr) all.push({ T, m: measure(T.idx) });

  for (const { T, m } of all) {
    console.log('\n=== ' + m.name + '  (grip ' + m.grip.toFixed(3) + ', эталонная машина ' + fmt(m.ref) + ') ===');
    for (const d of DIFFS) {
      const now = pick(m.rows[d].now);
      console.log('  ' + d.padEnd(7) + ' сейчас     P1 ' + fmt(now.p1) + '  P11 ' + fmt(now.p11) +
        '  P22 ' + fmt(now.p22) + '  разброс ' + now.spread.toFixed(3) +
        '  запас эталона ' + (m.ref - now.p1).toFixed(2));
      for (const key of Object.keys(m.rows[d].uni)) {
        const u = pick(m.rows[d].uni[key]);
        console.log('          ' + key.padEnd(14) + ' P1 ' + fmt(u.p1) + '  P11 ' + fmt(u.p11) +
          '  P22 ' + fmt(u.p22) + '  разброс ' + u.spread.toFixed(3) +
          '  запас ' + (m.ref - u.p1).toFixed(2) +
          '  дP1 ' + (u.p1 - now.p1 >= 0 ? '+' : '') + (u.p1 - now.p1).toFixed(2));
      }
    }
  }
}
main();

/* ---------- характер: где соперник быстр, а где медленен ----------
   Круг делится на «прямые» (|K| < 0.03 — тот же порог, что в aiTarget) и
   повороты. Печатается потолок на прямой и скорость в самом медленном апексе
   у лидера поля (skill 0.98) против ПРЕДЕЛА ИГРОКА в той же точке
   (playerCornerV — закон руля §5). Ровно это и есть «на чём отыгрываться». */
function character() {
  console.log('\n\n########  ХАРАКТЕР: прямая против апекса (лидер поля, skill 0.98)  ########');
  for (const T of H.tracks(ONLY)) {
    const env = H.loadGame();
    H.setupWorld(env, { trackIdx: T.idx });
    const g = env.evalIn(`(function(){
      var M=track.M, kmin=0, Kmax=0;
      for(var i=0;i<M;i++){var K=Math.abs(track.K[i]); if(K>Kmax){Kmax=K;kmin=i;}}
      return {name:track.name, top:MAXSPEED*track.grip, apexIdx:kmin,
              apexPlayer:playerCornerV(kmin), apexRaw:aiCornerV(24/Kmax+halfAt(kmin)*0.8)};
    })()`);
    console.log('\n' + g.name + '   потолок игрока ' + (g.top * 3.6).toFixed(0) +
      ' км/ч,  худший апекс: игрок ' + (g.apexPlayer * 3.6).toFixed(1) + ' км/ч');
    for (const d of DIFFS) {
      const now = env.evalIn(`({top: MAXSPEED*track.grip*DIFF_MUL[${JSON.stringify(d)}]*(0.5538+0.98*0.32)/AI_REF,
        ap: aiCornerV(${g.apexRaw ? '24/Math.abs(track.K[' + g.apexIdx + '])+halfAt(' + g.apexIdx + ')*0.8' : 0})*aiGrip(0.98,DIFF_GRIP[${JSON.stringify(d)}])})`);
      const m = DNEW[d];
      const uni = env.evalIn(`({top: MAXSPEED*track.grip*${m},
        ap: aiCornerV(24/Math.abs(track.K[${g.apexIdx}])+halfAt(${g.apexIdx})*0.8)*${m}})`);
      console.log('  ' + d.padEnd(7) +
        ' сейчас: прямая ' + (now.top * 3.6).toFixed(0) + ' (' + (100 * now.top / g.top).toFixed(1) + '% игрока)' +
        ', апекс ' + (now.ap * 3.6).toFixed(1) + ' (' + (100 * now.ap / g.apexPlayer).toFixed(1) + '%)' +
        '   ->  единый: прямая ' + (uni.top * 3.6).toFixed(0) + ' (' + (100 * uni.top / g.top).toFixed(1) + '%)' +
        ', апекс ' + (uni.ap * 3.6).toFixed(1) + ' (' + (100 * uni.ap / g.apexPlayer).toFixed(1) + '%)');
    }
  }
}
if (args.includes('--character')) character();

