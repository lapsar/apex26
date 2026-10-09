/* ============================================================================
   Пробник — ОТСТАВАНИЕ В БАШНЕ ПО СЕКУНДОМЕРУ ТОЧЕК ТРАССЫ (v1.16.63)

   Владелец (09.10.2026): «+5 с» штрафа опустили в протоколе слабее, чем 5 секунд. Причина — мерка
   «метры ÷ средняя скорость круга»: на финише Монако 5 настоящих секунд она называла 6.4. Решение
   владельца — А+Б: и штраф на финише, и «+x.xxx» башни считать по времени, как датчики Ф-1 —
   B отстаёт от A на столько секунд, сколько назад A был там, где сейчас B (gapSec, tmRecord).

   Проверка:
     • устройство секундомера на подставном болиде: прыжок дистанции (срезка) заполнен промежуточным
       временем, задний ход — последний проезд, отметка старше кольца не читается, сосед впереди
       по дистанции — 0;
     • гонка на каждой видимой трассе: каждые 0.5 с у каждой пары соседей башни (кроме отставших на
       круг) отставание игры сверяется с независимым секундомером пробника (журнал «время, дистанция»
       каждого болида каждый кадр) — расхождение не больше 0.02 с; прежняя мерка (paceSpeed) нужна
       только в первые секунды после старта; заодно — насколько врала прежняя мерка (справочно).
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const RACE_SECS = 150, TOL = 0.02, FALLBACK_SECS = 20;

/* устройство: подставной болид, ручной raceTime */
const UNIT = `(function(){var keep=raceTime,o={},c={dist:0};raceTime=0;tmInit(c);
  function go(d,t){raceTime=t;c.dist=d;tmRecord(c);}
  for(var t=1;t<=10;t++)go(t*10,t);            // 10 м/с: дистанция 100 к 10 с
  go(140,11);                                   // прыжок 40 м за кадр (срезка)
  o.jump=tmAt(c,120);                           // ждём 10.5
  go(130,12);go(150,13);                        // задний ход и снова вперёд: 140 проезжали в 11 и 12.5
  o.rev=tmAt(c,140);                            // ждём 12.5 (последний проезд)
  o.ahead=gapSec(c,{dist:200});                 // «позади» стоит впереди — 0
  raceTime=13.5;c.dist=155;o.now=tmAt(c,152);   // между последней записью (150 в 13) и «сейчас» (155 в 13.5) — 13.2
  raceTime=13;c.dist=150;
  var L=track.length*${3};go(L,100);            // уехали за кольцо: отметка 50 м перезаписана чужим кругом
  o.stale=tmAt(c,50);
  raceTime=keep;return o;})()`;

function run() {
  const r = R.result('Отставание в башне и штраф — по секундомеру точек трассы');
  // устройство
  {
    const env = H.loadGame({ seed: 3 });
    H.setupWeekend(env, { trackIdx: 0, diff: 'normal' });
    const u = env.evalIn(UNIT);
    const ok = (a, b) => Math.abs(a - b) < 1e-6;
    if (!ok(u.jump, 10.5)) r.fail(`секундомер: прыжок дистанции не заполнен — на середине прыжка ${u.jump}, ждали 10.5`);
    if (!ok(u.rev, 12.5)) r.fail(`секундомер: после заднего хода ждали последний проезд 12.5, вышло ${u.rev}`);
    if (u.ahead !== 0) r.fail(`секундомер: болид впереди по дистанции получил отставание ${u.ahead}, ждали 0`);
    if (!ok(u.now, 13.2)) r.fail(`секундомер: между записью и «сейчас» ждали 13.2, вышло ${u.now}`);
    if (u.stale === u.stale) r.fail(`секундомер: отметка старше кольца прочитана (${u.stale}) — чужой круг`);
    r.line(`устройство: срезка ${u.jump}, задний ход ${u.rev}, впереди ${u.ahead}, «сейчас» ${+u.now.toFixed(3)}, чужой круг — ${u.stale === u.stale ? 'прочитан' : 'нет'}`);
  }
  for (const T of H.tracks(true)) {
    const env = H.loadGame({ seed: 7 });
    H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 99 });
    H.startRaceAt(env, 11);
    H.lightsOut(env);
    const o = env.evalIn(`(function(){var log=cars.map(function(){return {t:[],d:[]};}),f,n=0,bad=0,worst=0,fb=0,fbLate=0,oldWorst=0,zero=0,pace=track.paceSpeed;
      function push(){cars.forEach(function(c,i){log[i].t.push(raceTime);log[i].d.push(c.dist);});}
      function real(a,x){var L=log[cars.indexOf(a)];for(var j=L.d.length-1;j>0;j--){var d0=L.d[j-1],d1=L.d[j];
        if(d1>d0&&x>=d0&&x<=d1)return L.t[j-1]+(L.t[j]-L.t[j-1])*(x-d0)/(d1-d0);}return NaN;}
      push();
      for(f=0;f<${RACE_SECS}*60&&phase!=='';f++){__AP.drive();update(1/60);push();
        if(f%30)continue;
        var ord=towerOrder(),lead=ord[0].dist;
        for(var i=1;i<ord.length;i++){var a=ord[i-1],b=ord[i];
          if(a.retired||b.retired||lead-b.dist>=track.length)continue;
          var g=gapSec(a,b);if(b.dist>=a.dist){zero++;if(g!==0)bad++;continue;}
          var rt=raceTime-real(a,b.dist);n++;
          if(!isFinite(tmAt(a,b.dist))){fb++;if(raceTime>${FALLBACK_SECS})fbLate++;continue;}
          var e=Math.abs(g-rt);if(e>worst)worst=e;if(e>${TOL})bad++;
          var eo=Math.abs((a.dist-b.dist)/pace-rt);if(eo>oldWorst)oldWorst=eo;}}
      return {n:n,bad:bad,worst:worst,fb:fb,fbLate:fbLate,oldWorst:oldWorst,zero:zero,t:raceTime};})()`);
    const tag = T.name;
    r.line(`${tag}: ${o.n} пар за ${o.t.toFixed(0)} с — расхождение с секундомером пробника до ${o.worst.toFixed(4)} с; прежняя мерка врала до ${o.oldWorst.toFixed(2)} с; прежняя мерка на старте ${o.fb} раз; вровень (0) ${o.zero}`);
    if (o.n < 200) r.fail(`${tag}: проверено лишь ${o.n} пар — гонка не поехала`);
    if (o.bad) r.fail(`${tag}: ${o.bad} отставаний разошлись с секундомером пробника больше ${TOL} с (худшее ${o.worst.toFixed(3)} с)`);
    if (o.fbLate) r.fail(`${tag}: прежняя мерка понадобилась ${o.fbLate} раз позже ${FALLBACK_SECS} с от старта — у секундомера дыра`);
  }
  r.note('решение владельца 09.10.2026 (А+Б); прежняя мерка на финише Монако: 5 настоящих секунд называла 6.4');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
