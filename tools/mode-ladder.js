/* ============================================================================
   ЛЕСТНИЦА РЕЖИМОВ — почему на Новичке и Норме игрок выигрывает с большим
   отрывом, и во что обойдётся подъём долей.

   ЗАЧЕМ. Владелец погонял сборки v1.15.8x-99 и сказал: соперник в поворотах
   стал слабее, игрок легко догоняет; на Новичке и Норме выигрывает с большим
   преимуществом, на Профи заметно меньше. Готовые справки на этот вопрос
   не отвечают: `lap-potential` меряет запас, но не говорит, ЧЕМ соперник
   связан, а `raceline --widen` смотрит только повороты круче R=80 м — то есть
   мимо быстрых дуг, о которых шла речь.

   ТРИ РЕЖИМА:
     --bands   чем связан соперник по полосам радиуса (сцеплением или своим
               потолком) и насколько шире радиус у линии игрока. Нужен solve.
     --gap     запас идеального круга игрока над поулом по трём режимам плюс
               доля круга, где соперник упёрт в потолок. Нужен solve.
     --ladder  перебор долей режима: что дал бы каждый вариант. Секунды,
               solve не нужен — идеальный круг от режима НЕ зависит.

   ТРИ ЛОВУШКИ МЕРКИ, каждую нашёл замер:
     1) ПОТОЛОК У СОПЕРНИКА СВОЙ. Первая версия брала для обоих потолок игрока,
        и на Норме разница в 32 км/ч пропадала из ответа. В быстрой дуге болид
        стоит именно на потолке, значит там решает DIFF_MUL, а не DIFF_GRIP.
     2) НА ПОЛОГОЙ ДУГЕ ПРЕДЕЛ В ТОЧКЕ У ИГРОКА БЫВАЕТ НИЖЕ, и это не значит,
        что он медленнее: линия идёт от кромки к кромке, и в перекладке местный
        радиус мал. Читать надо колонку «чем связан», а не одну медиану скорости.
     3) ВРЕМЯ ПОЛОСЫ считается на локальном пределе, без огибающей торможения.
        У пологих дуг игрок выходит «в убытке»: его линия длиннее, а выигрыш
        от неё реализуется уже на выходе, в следующей полосе.

   САМОПРОВЕРКА: печатаемые поулы обязаны совпасть с якорем §4, а идеальный круг
   Монреаля — с таблицей §10 п.13 (1:16.059). Сошлось при написании (09.2026).

   ЧЕГО НЕ УМЕЕТ. Это потолок машины на одиночном круге: ни трафика, ни струи,
   ни того, что живой игрок рулит неточно. Полоса между идеальным кругом
   и человеком НЕ измерена (§10 п.13).

   Не пробник: порогов нет, index.html не трогает.
   Запуск:  node tools/mode-ladder.js --ladder
            node tools/mode-ladder.js --gap   [--track=Miami]
            node tools/mode-ladder.js --bands [--track=Silverstone] [--diff=normal]
   ========================================================================== */
'use strict';

const H = require('./harness');
const { solve, SRC } = require('./raceline');

const BANDS = [[0, 30], [30, 80], [80, 150], [150, 300], [300, 1e9]];

/* Идеальный круг игрока по быстрейшей линии (`raceline`). От режима не зависит:
   физика игрока долей режима не содержит вовсе. Майами и Монреаль сняты этой
   справкой 09.2026, остальные — таблица §10 п.13. */
const IDEAL = { Monza: 82.141, Silverstone: 93.142, Suzuka: 95.424, Monaco: 78.139, Montreal: 76.059, Miami: 91.478 };

/* Варианты долей для --ladder: [доля мотора DIFF_MUL, доля сцепления DIFF_GRIP].
   Первая строка каждого режима — нынешняя, она и служит сверкой с якорем. */
const VAR = {
  easy:   [[0.85, 0.90], [0.88, 0.93], [0.90, 0.95], [0.92, 0.97]],
  normal: [[0.90, 0.98], [0.93, 0.99], [0.95, 1.00]],
  hard:   [[1.00, 1.00]] };

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const only = arg('track', ''), passes = +arg('passes', 150);
const fmt = t => { const m = Math.floor(t / 60); return m + ':' + (t - m * 60).toFixed(3).padStart(6, '0'); };
const NAME = { easy: 'Новичок', normal: 'Норма', hard: 'Профи' };

function withLine(T, diff, fn) {
  const env = H.loadGame();
  H.setupWorld(env, { trackIdx: T.idx, diff });
  env.evalIn(SRC, 'raceline(fns)');
  return fn(env, solve(env, { passes }));
}

/* --bands: чем связан соперник и насколько радиус его формулы уже радиуса линии игрока */
function bands() {
  const diff = arg('diff', 'hard');
  for (const T of H.tracks()) {
    if (only && T.name.toLowerCase().indexOf(only.toLowerCase()) < 0) continue;
    const d = withLine(T, diff, (env, r) => env.evalIn(`(function(){
      var off=${JSON.stringify(r.off)}, g=__RL.geom(off), M=__RL.M, out=[];
      var topP=MAXSPEED*track.grip;
      var baseA=aiBase(0.98,DIFF_MUL['${diff}']), ck=aiGrip(0.98,DIFF_GRIP['${diff}']);
      var B=${JSON.stringify(BANDS)};
      for(var b=0;b<B.length;b++){ var lo=B[b][0], hi=B[b][1], n=0, cap=0, rat=[], rA=[], rP=[];
        for(var i=0;i<M;i++){ var K=Math.abs(track.K[i]); if(K<0.03) continue;
          var Rc=24/K; if(Rc<lo||Rc>=hi) continue; n++;
          var Rai=Rc+halfAt(i)*0.8, vC=aiCornerV(Rai)*ck, vAi=Math.min(vC,baseA);
          if(vC>=baseA) cap++;
          var Rpl=Math.min(g.R[i],4*Rc);
          rat.push(Math.min(__RL.vLim(Rpl),topP)/vAi); rA.push(Rai); rP.push(Rpl); }
        if(!n) continue;
        var med=function(a){a=a.slice().sort(function(x,y){return x-y;});return a[Math.floor(a.length/2)];};
        out.push({lo:lo,hi:hi,n:n,tot:M,cap:cap,r:med(rat),ai:med(rA),pl:med(rP)}); }
      return {bands:out, baseA:baseA*3.6, topP:topP*3.6};})()`));
    console.log('\n=== ' + T.name + ' · ' + NAME[diff] + ' · потолок игрока ' + d.topP.toFixed(0)
      + ' км/ч, соперника ' + d.baseA.toFixed(0) + ' км/ч ===');
    console.log('  полоса         круга   связан потолком   v игрок/соперник   R сопернику / R линии');
    for (const b of d.bands) {
      const nm = b.hi > 1e8 ? 'R > 300 м' : ('R ' + b.lo + '–' + b.hi + ' м');
      console.log('  ' + nm.padEnd(14) + (100 * b.n / b.tot).toFixed(1).padStart(6) + ' %'
        + ((100 * b.cap / b.n).toFixed(0) + ' %').padStart(15)
        + ('x' + b.r.toFixed(3)).padStart(18)
        + (b.ai.toFixed(0) + ' / ' + b.pl.toFixed(0) + ' м').padStart(20));
    }
  }
}

/* --gap: запас идеального круга над поулом и доля круга на потолке */
function gap() {
  for (const T of H.tracks()) {
    if (only && T.name.toLowerCase().indexOf(only.toLowerCase()) < 0) continue;
    const d = withLine(T, 'hard', (env, r) => {
      const o = env.evalIn(`(function(){ var poles={}, cap={}, M=track.M;
        ['easy','normal','hard'].forEach(function(df){
          poles[df]=qualiLapTime(0.98,df);
          var baseA=aiBase(0.98,DIFF_MUL[df]), ck=aiGrip(0.98,DIFF_GRIP[df]), on=0;
          for(var i=0;i<M;i++){ var K=Math.abs(track.K[i]);
            var vC = K<0.03 ? 1e9 : aiCornerV(24/K+halfAt(i)*0.8)*ck;
            if(vC>=baseA) on++; }
          cap[df]={on:100*on/M, top:baseA*3.6}; });
        return {poles:poles, cap:cap, topP:MAXSPEED*track.grip*3.6};})()`);
      o.lap = r.raw; return o; });
    console.log('\n=== ' + T.name + ' · идеальный круг игрока ' + fmt(d.lap)
      + ' · его потолок ' + d.topP.toFixed(0) + ' км/ч ===');
    console.log('  режим      поул       запас игрока   потолок соперника   круга на потолке');
    for (const df of ['easy', 'normal', 'hard'])
      console.log('  ' + NAME[df].padEnd(10) + fmt(d.poles[df]).padStart(9)
        + ('-' + (d.poles[df] - d.lap).toFixed(2) + ' с').padStart(15)
        + (d.cap[df].top.toFixed(0) + ' км/ч').padStart(18)
        + (d.cap[df].on.toFixed(1) + ' %').padStart(18));
  }
}

/* --ladder: что дал бы каждый вариант долей. Поулы считает штатная qualiLapTime —
   зовём её по имени, а не повторяем формулу: справка, копирующая физику, устаревает
   молча (на этом семь сборок врала `lap-potential`, §11 v1.15.69). */
function ladder() {
  const tracks = H.tracks(true).filter(T => IDEAL[T.name] && (!only || T.name.toLowerCase().indexOf(only.toLowerCase()) >= 0));
  for (const df of ['easy', 'normal', 'hard']) {
    console.log('\n=== ' + NAME[df].toUpperCase() + ': запас идеального круга игрока над поулом ===');
    console.log('  мотор/поворот ' + tracks.map(T => T.name.padStart(13)).join(''));
    for (const [mul, gr] of VAR[df]) {
      const row = tracks.map(T => {
        const env = H.loadGame();
        H.setupWorld(env, { trackIdx: T.idx, diff: df });
        const pole = env.evalIn(`estLapTime(aiBase(0.98,${mul}),aiGrip(0.98,${gr}))/QUALI_PACE`);
        return { gap: pole - IDEAL[T.name], pole };
      });
      const cur = (mul === VAR[df][0][0] && gr === VAR[df][0][1]) ? '   (сейчас)' : '';
      console.log('  ' + (mul.toFixed(2) + ' / ' + gr.toFixed(2)).padEnd(14)
        + row.map(r => ('-' + r.gap.toFixed(2) + ' с').padStart(13)).join('') + cur);
      console.log('    поул         ' + row.map(r => fmt(r.pole).padStart(13)).join(''));
    }
  }
}

if (process.argv.includes('--bands')) bands();
else if (process.argv.includes('--gap')) gap();
else if (process.argv.includes('--ladder')) ladder();
else console.log('Укажи режим: --ladder (быстро) | --gap | --bands. Подробности — в шапке файла.');
