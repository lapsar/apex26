/* ============================================================================
   Пробник 15 — ТЕМП ОБЯЗАН ПРЕВРАЩАТЬСЯ В МЕСТА

   Сажает в хвост поля ЗАВЕДОМО быстрый болид и смотрит, отыграет ли он места.
   Это прямая проверка того, ради чего писалась защёлка обгона: болид, реально
   более быстрый, чем те, кто впереди, должен уметь их проехать.

   ЗАЧЕМ. Замер 08.2026 показал, что не умеет. Болид с темпом +20 % — вчетверо
   больше, чем размах всего поля (4 %), то есть круг 1:20 против 1:37 у прочих, —
   за гонку отыгрывал ПЯТЬ мест из двадцати и 80 % времени ехал упёртым в чужой
   затылок. Добавочная скорость не покупала позиций вообще: она лишь быстрее
   приводила в хвост поезда. Отыгранное упиралось в потолок ~5 мест и от темпа
   почти не зависело.

   Причина была в том, что решение «иду в объезд» принималось, только пока цель
   в окне «моя полоса» (2.3 м). Стоило отойти вбок на 2.6 м, цель уходила из окна,
   решение отменялось, руль тянул обратно на гоночную линию — и цель возвращалась
   в окно. Предельный цикл: 1438–1926 выходов в объезд за гонку и ОДИН доведённый
   обгон на три гонки. Тот же дефект уже ловили в v1.15.26 для СТОЯЩЕГО болида и
   лечили защёлкой; на обычные обгоны лечение тогда не распространили.

   ТРИ ПРОВЕРКИ:
     1) быстрый отыгрывает места — не меньше порога;
     2) больше темпа — не меньше мест (потолок «~5 мест независимо от темпа»
        ловится именно здесь);
     3) нет дребезга: болид не выскакивает в объезд и обратно сотни раз за круг.

   Пороги не «красивые числа», а арифметика: за круг Монцы болид с +20 % выигрывает
   у поля около 19 с, тогда как ВСЁ поле от первого до последнего укладывается
   в 4 с круга. Значит доехать до головы он обязан с многократным запасом, даже
   если каждый обгон стоит ему секунды в трафике.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const CAR_LEN = 6.04;            // обгон = сменил «на корпус позади» на «на корпус впереди»
const GAIN_FAST = 14;            // мест из 20 при +20 % (замер до правки: 5.0 и 5.7)
const GAIN_SLACK = 1;            // допуск на шум при сравнении «больше темпа — не меньше мест»
/* Порог дребезга. Сперва стоял 300 — снят с ТРЁХ зёрен, где худшее наблюдение было 124,
   и оказался слишком тесным: на десяти зёрнах Монца дала 362 при совершенно исправном
   поведении (тот же заезд отыграл 17.6 мест из 20). Расширен до 600, и это не поблажка:
   до правки те же заезды давали 456–1334, то есть четыре строки из шести по-прежнему
   валят пробник — проверено прогоном по архивной v1.15.44, а не рассуждением. */
const FLICKER = 600;

/** Один заезд: hero с добавкой boost сажается последним. */
function charge(env, opt, boost) {
  return env.evalIn(`(function(){
    var dt=1/60;
    var ord=field.slice().sort(function(a,b){return b.dist-a.dist;});
    var hero=ord[ord.length-1];
    hero.base*=${1 + boost / 100}; hero.cornerK*=${1 + boost / 100};
    var startPos=ord.length;                       // среди соперников, игрок не в счёт
    // состояние «этот впереди меня» по каждой паре с hero — для счёта настоящих обгонов
    var sign={}, i, o;
    for(i=0;i<field.length;i++){ o=field[i];
      if(o!==hero) sign[i] = o.dist-hero.dist>0 ? 1 : -1; }
    var passes=0, flicker=0, wasOut=false, stuck=0, frames=0;
    __drive(Math.round(900/dt),dt,'auto',function(){
      frames++;
      for(var i=0;i<field.length;i++){ var o=field[i]; if(o===hero) continue;
        var d=o.dist-hero.dist;
        if(sign[i]>0 && d<-${CAR_LEN}){ sign[i]=-1; passes++; }
        else if(sign[i]<0 && d>${CAR_LEN}){ sign[i]=1; }}
      var a=hero.ahd;
      var pulling = !!a && hero.gp<20 && hero.pace>a.speed+1.0;
      if(pulling!==wasOut) flicker++;
      if(pulling) stuck++;
      wasOut=pulling;
      return !(phase===''||raceOver);});
    var fin=field.slice().sort(function(a,b){return b.dist-a.dist;});
    return {start:startPos, fin:fin.indexOf(hero)+1, passes:passes,
            flicker:flicker, stuckPct:100*stuck/Math.max(1,frames), name:hero.code};})()`);
}

function run(opt) {
  opt = opt || {};
  const diff = opt.diff || 'normal';
  const laps = opt.laps === undefined ? 1 : +opt.laps;
  const seeds = opt.seeds ? String(opt.seeds).split(',').map(Number) : [7, 91, 13];
  const r = R.result('Темп превращается в места — быстрый болид проезжает поле');

  for (const T of H.tracks(true)) {
    const avg = {};
    for (const boost of [2, 20]) {
      const rows = [];
      for (const seed of seeds) {
        const env = H.loadGame({ seed });
        H.setupWeekend(env, { trackIdx: T.idx, diff, laps });
        H.startRaceAt(env, 11);
        H.lightsOut(env);
        H.noRetirements(env);          // сход убрал бы машину из потока и испортил счёт мест
        rows.push(charge(env, opt, boost));
      }
      const n = rows.length;
      const gain = rows.reduce((a, x) => a + (x.start - x.fin), 0) / n;
      const passes = rows.reduce((a, x) => a + x.passes, 0) / n;
      const flick = Math.max(...rows.map(x => x.flicker));
      const stuck = rows.reduce((a, x) => a + x.stuckPct, 0) / n;
      avg[boost] = gain;

      r.line(`${T.name.padEnd(12)} +${String(boost).padStart(2)} %: отыграл ${gain.toFixed(1)} мест из ${rows[0].start - 1}`
        + ` (${rows.map(x => `P${x.start}→P${x.fin}`).join(', ')})`
        + ` · обгонов ${passes.toFixed(1)} · упёрт ${stuck.toFixed(0)} % · дребезг до ${flick}`);

      if (boost === 20 && gain < GAIN_FAST)
        r.fail(`${T.name}: болид с темпом +20 % отыграл всего ${gain.toFixed(1)} мест из ${rows[0].start - 1}`
          + ` при пороге ${GAIN_FAST} — темп не превращается в места`);
      if (flick > FLICKER)
        r.fail(`${T.name} / +${boost} %: ${flick} смен состояния «иду в объезд» за круг при пороге ${FLICKER}`
          + ` — болид дребезжит на границе полосы вместо того, чтобы обгонять`);
    }
    if (avg[20] < avg[2] - GAIN_SLACK)
      r.fail(`${T.name}: +20 % отыграл ${avg[20].toFixed(1)} мест, а +2 % — ${avg[2].toFixed(1)};`
        + ` больше темпа обязано давать не меньше мест`);
  }

  r.note('сходы отключены: они убирают машины из потока и портят счёт мест');
  r.note('порог +20 % → 14 мест взят с запасом: за круг такой болид выигрывает у поля ~19 с при размахе поля 4 с');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
