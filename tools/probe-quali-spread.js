/* ============================================================================
   Пробник 10 — РАЗБРОС КВАЛИФИКАЦИИ

   Времена соперников в квалификации считаются estLapTime и умножаются на
   случайный множитель. Сам расчёт темпа проверяет пробник pole, а вот множитель
   до 08.2026 не проверял никто: он намеренно вынесен за скобки эталона поулов.
   Ошибиться в нём разрядом можно совершенно незаметно — все 12 клеток поулов
   всё равно сойдутся.

   Проверяется два уровня.

   1. САМ МНОЖИТЕЛЬ: не выходит за ±0.2 % и симметричен (среднее ≈ 0).
      До 08.2026 он был −0.4 % … +0.6 % — вдвое шире и с перекосом в медленную
      сторону, из-за которого время поула на экране систематически оказывалось
      быстрее эталона из CLAUDE.md §4.

   2. ПОСЛЕДСТВИЯ НА РЕШЁТКЕ — то, что видно в игре. Сильверстоун/Профи —
      худший случай: там сила пилота работает только на 57 % длины круга
      (остальное ИИ едет на пределе поворота, где все болиды одинаковы), поле
      сжимается до 1.13 с, и широкий разброс превращал квалификацию в лотерею.
      Со старым множителем слабый пилот (сила ≤0.86) попадал в топ-6 в 32 %
      квалификаций, а кто-нибудь из семёрки лидеров проваливался ниже P11
      в 37 %. Оба события должны стать невозможными: наибольший возможный
      сдвиг пары теперь 0.4 % (~0.41 с) против зазора ~0.6 с между группами.

   Как считается. beginQuali() вызывается НАСТОЯЩИЙ, много раз подряд, и
   читается настоящий qualiField — формула разброса в пробнике не повторяется,
   иначе он проверял бы сам себя. estLapTime на время прогона мемоизируется:
   аргументов всего девять (по числу разных сил пилотов), результат тот же,
   но 4000 квалификаций считаются за секунды, а не за час.

   Игрок — Стролл (Aston Martin, индекс 9 в ROSTER): его пилот из числа
   соперников выбывает, и так в поле остаются и вся семёрка лидеров, и группа
   слабых пилотов, ради которых пробник и написан. Поле поэтому 21 болид,
   а не 22. До 08.2026 Стролл был самым слабым в ростере; после правки
   рейтинга (v1.15.49) самые слабые — пилоты Кадиллака, но на смысл проверки
   это не влияет: важно лишь, что выбывает ровно один болид, а обе группы,
   между которыми меряется зазор, остаются в поле целиком.

   index.html только читается.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const HALF = 0.002;          // ожидаемая полуширина множителя, ±0.2 %
const TOL = 0.05;            // допуск на границы и на симметрию — 5 % от полуширины
const DRAWS = 4000;          // квалификаций на каждую пару трасса+режим
const STROLL = 9;            // индекс в ROSTER — им играет «игрок», см. шапку
const WEAK = 0.86;           // сила, НЕ ВЫШЕ которой пилот считается слабым (сравнение <=)
const TOP = 7;               // размер группы лидеров (силы 0.96…0.98)

const RU = { easy: 'Новичок', normal: 'Норма', hard: 'Профи' };

/** Один замер: DRAWS квалификаций на выбранной трассе и режиме. */
function sample(trackIdx, diff, draws, seed) {
  const env = H.loadGame({ seed });
  H.setupWeekend(env, { trackIdx, diff, rosterIdx: STROLL, laps: 1 });

  env.evalIn(`(function(){
    var real = estLapTime, memo = {};
    estLapTime = function(b, c){                       // тот же результат, только быстрее
      var k = b + '|' + c;
      if (!(k in memo)) memo[k] = real(b, c);
      return memo[k];
    };
  })();`);

  // чистое время каждого соперника — то, во что упирается множитель
  const clean = env.evalIn(`(function(){
    var mul = DIFF_MUL[sel.diff], ck = DIFF_CORNERK[sel.diff], o = {};
    qualiField.forEach(function(r){
      o[r.name] = estLapTime(MAXSPEED*(0.5538 + r.skill*0.32)*mul, ck);
    });
    return o;
  })();`);
  const skill = env.evalIn('(function(){var o={};qualiField.forEach(function(r){o[r.name]=r.skill;});return o;})();');
  const names = Object.keys(clean);
  const strongest = names.slice().sort((a, b) => skill[b] - skill[a]);
  const leaders = new Set(strongest.slice(0, TOP));
  const weak = new Set(names.filter(n => skill[n] <= WEAK));
  const fair = names.slice().sort((a, b) => clean[a] - clean[b]);   // порядок без разброса

  const m = { min: Infinity, max: -Infinity, sum: 0, n: 0 };
  let weakTop6 = 0, leaderBelow11 = 0, poleToBest = 0, weakTop10 = 0;

  for (let k = 0; k < draws; k++) {
    env.evalIn('beginQuali();');
    env.clearRAF();
    const got = env.evalIn('qualiField.map(function(r){return [r.name, r.time];})');
    for (const [name, time] of got) {
      const d = time / clean[name] - 1;
      if (d < m.min) m.min = d;
      if (d > m.max) m.max = d;
      m.sum += d; m.n++;
    }
    // qualiField уже отсортирован игрой по времени — это и есть решётка
    if (got[0][0] === fair[0]) poleToBest++;
    if (got.slice(0, 6).some(g => weak.has(g[0]))) weakTop6++;
    if (got.slice(0, 10).some(g => weak.has(g[0]))) weakTop10++;
    if (got.slice(11).some(g => leaders.has(g[0]))) leaderBelow11++;
  }

  return {
    min: m.min, max: m.max, mean: m.sum / m.n, samples: m.n,
    weakTop6: weakTop6 / draws, weakTop10: weakTop10 / draws,
    leaderBelow11: leaderBelow11 / draws, poleToBest: poleToBest / draws,
    spread: clean[fair[fair.length - 1]] - clean[fair[0]],
    best: fair[0],
  };
}

const pc = x => (x * 100).toFixed(2) + ' %';
const pc1 = x => (x * 100).toFixed(1) + ' %';

function run(opt) {
  opt = opt || {};
  const draws = opt.draws || DRAWS;
  const seed = opt.seed || 4242;
  const r = R.result('Разброс квалификации — ширина, симметрия и решётка');

  // Сильверстоун/Профи — тот самый худший случай, по нему и судим
  const key = sample(1, 'hard', draws, seed);
  // Монца/Профи — для сравнения: там поле втрое шире разброса, беды нет и не было
  const ref = sample(0, 'hard', Math.round(draws / 2), seed + 1);

  r.line(`множитель по ${key.samples + ref.samples} замерам: от ${pc(Math.min(key.min, ref.min))}`
    + ` до ${pc(Math.max(key.max, ref.max))}, среднее ${pc((key.mean + ref.mean) / 2)}`);
  r.line('');
  r.line('трасса        режим    поле P1→P21  слабый в топ-6  слабый в топ-10  лидер ниже P11  поул сильнейшему');
  for (const [nm, d, s] of [['Silverstone', 'hard', key], ['Monza', 'hard', ref]]) {
    r.line(nm.padEnd(14) + RU[d].padEnd(9) + (s.spread.toFixed(3) + ' с').padStart(11)
      + pc1(s.weakTop6).padStart(16) + pc1(s.weakTop10).padStart(17)
      + pc1(s.leaderBelow11).padStart(16) + pc1(s.poleToBest).padStart(18));
  }

  // --- 1. границы и симметрия ---
  const lo = Math.min(key.min, ref.min), hi = Math.max(key.max, ref.max);
  const mean = (key.mean + ref.mean) / 2;
  if (Math.abs(lo + HALF) > HALF * TOL)
    r.fail(`нижняя граница множителя ${pc(lo)}, ожидалось ${pc(-HALF)} (допуск ${pc(HALF * TOL)})`);
  if (Math.abs(hi - HALF) > HALF * TOL)
    r.fail(`верхняя граница множителя ${pc(hi)}, ожидалось ${pc(HALF)} (допуск ${pc(HALF * TOL)})`);
  if (Math.abs(mean) > HALF * TOL)
    r.fail(`разброс несимметричен: среднее ${pc(mean)}, ожидался ноль (допуск ${pc(HALF * TOL)})`);

  // --- 2. последствия на решётке, Сильверстоун/Профи ---
  if (key.weakTop6 > 0)
    r.fail(`Silverstone/Профи: слабый пилот (сила ≤${WEAK}) попал в топ-6 в ${pc1(key.weakTop6)} квалификаций, должно быть 0`);
  if (key.leaderBelow11 > 0)
    r.fail(`Silverstone/Профи: пилот из семёрки лидеров оказался ниже P11 в ${pc1(key.leaderBelow11)} квалификаций, должно быть 0`);
  if (key.poleToBest < 0.25 || key.poleToBest > 0.45)
    r.fail(`Silverstone/Профи: сильнейший берёт поул в ${pc1(key.poleToBest)} квалификаций, ожидалось 25…45 %`
      + ' (ниже — решётка снова лотерея, выше — разброс почти исчез)');

  r.note('поле 21 болид: пилота игрока (Стролл) в числе соперников нет — так устроена игра');
  r.note('перетасовка внутри группы лидеров сохраняется намеренно: поул не должен доставаться одному и тому же');
  if (r.ok) r.line('ширина, симметрия и решётка сошлись');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
