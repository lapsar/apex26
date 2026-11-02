/* ============================================================================
   СПРАВКА — «ДРОЖЬ» СОПЕРНИКОВ ВБОК (02.11.2026, вопрос владельца п.34)

   Владелец: «впереди идущие болиды подрагивают — будто нервно ведут машину,
   микродвижения влево-вправо». Замер: у соперника полоса (lane) скачет
   туда-обратно КАЖДЫЙ кадр на 1.5–3.4 см десятки кадров подряд — зигзаг.
   Источники — пороги без запаса: (1) «кто впереди в моей полосе» — окно
   LANE_SAME / LANE_SAME_P, на его границе передний то есть, то нет; (2) «выхожу
   из-за спины» — c.pace > ahd.speed + 1.0, темп колеблется вокруг порога.

   Что делает: гонка 180 с с решётки (игрок — автопилот с P11), каждый кадр
   полоса каждого соперника; «разворот» — шаг вбок сменил знак (оба шага > 2 мм);
   зигзаг — 3 и больше разворотов подряд. Печатает число зигзагов, долю кадров
   в них и самый длинный. НЕ пробник, порога нет.

     node tools/ai-zigzag-audit.js [индекс трассы=0] [зерно=7] [секунд=180]
     APEX_INDEX=<сборка> node tools/ai-zigzag-audit.js …
   Замер v1.17.30: Монца 123, Сильверстоун 115, Монако 56, Баку 94 (самый длинный 41/74/19/25 кадров).
   ========================================================================== */
'use strict';
const H = require('./harness');
const TR = +(process.argv[2] || 0), SEED = +(process.argv[3] || 7), SECS = +(process.argv[4] || 180);
const env = H.loadGame({ seed: SEED });
H.setupWeekend(env, { trackIdx: TR, view: 'cockpit' }); H.startRaceAt(env, 11); H.lightsOut(env);
const r = env.evalIn(`(function(){var N=${SECS}*60,A=[],run=[],tot=0,inZ=0,zz=0,longest=0;
  for(var f=0;f<N;f++){__AP.drive();update(1/60);
    field.forEach(function(c,ci){if(c.retired)return;var h=A[ci]||(A[ci]=[]);h.push(c.lane);if(h.length>3)h.shift();if(h.length<3)return;tot++;
      var d1=h[1]-h[0],d2=h[2]-h[1],rv=Math.abs(d1)>0.002&&Math.abs(d2)>0.002&&Math.sign(d1)!==Math.sign(d2);
      if(rv){run[ci]=(run[ci]||0)+1;if(run[ci]===3){zz++;inZ+=3;}else if(run[ci]>3)inZ++;if(run[ci]>longest)longest=run[ci];}else run[ci]=0;});}
  return {name:track.spec.name,tot:tot,inZ:inZ,zz:zz,longest:longest};})()`);
console.log(`${r.name.padEnd(12)} зерно ${SEED}, ${SECS} с: зигзагов ${r.zz} · кадров в зигзаге ${(r.inZ / r.tot * 100).toFixed(2)} % · самый длинный ${r.longest} кадров`);
