/* ============================================================================
   Пробник `tilt` — РУЛЬ НАКЛОНОМ (v1.17.24, вариант Б владельца)

   Датчик в обвязке не живой, поэтому вектор тяжести собирается здесь из позы
   iPad и подаётся игре (tiltSample или событием devicemotion). Что сторожит:
     1. знак и величина: «баранка» влево на θ — руль влево на (asin(cosβ·sinθ)−DEAD)/(FULL−DEAD),
        при ЛЮБОЙ ориентации экрана (0/90/180/270), наклоне на себя β = 0/30/60°
        и обоих знаках осей (W3C и обратный, как у iOS исторически);
        мёртвая зона — руль ровно 0, дальше полного наклона — ровно ±1;
     2. iPad плашмя с самого начала — оси нет, руль 0; поднял — ось нашлась, дальше
        и почти плашмя (β = 80°) рулит; перевернули на 180° — ось нашлась заново,
        знак верный; событие orientationchange сбрасывает ось; не-тяжесть (|g| < 4) пропускается;
     3. сглаживание: скачок датчика — за TILT_TAU руль проходит 63 % пути;
     4. в заезде: полный наклон влево — ТОТ ЖЕ путь болида до бита, что кнопка «влево»;
        половина наклона — steerAmt → −0.5; нажатая кнопка главнее наклона;
        режим «Кнопки» с подаваемым датчиком — путь тот же, что без датчика;
        кнопки руля спрятаны, пока датчик жив, и вернулись, когда он смолк;
     5. разрешение: в режиме «Кнопки» слушатель не вешается; «Наклон» без
        requestPermission — слушатель один; iOS «Разрешить» — слушает, «Запретить» —
        строка о кнопках; событие devicemotion доходит до руля;
     6. функции руля не зовут Math.random.
   ========================================================================== */
'use strict';
const H = require('./harness');
const R = require('./report');

const G = 9.81, D2R = Math.PI / 180;
/* Поза → показания датчика в осях УСТРОЙСТВА. Экран: x вправо, y вверх, z на зрителя.
   Стоймя к игроку — «вверх» мира (0,1,0); откинули верх от себя на β — (0,cosβ,sinβ);
   «баранка» против часовой на θ — вектор в осях экрана поворачивается по часовой.
   Экран повёрнут относительно устройства на o (против часовой): ax = sx·cos o + sy·sin o,
   ay = −sx·sin o + sy·cos o. conv = −1 — все оси наоборот (iOS исторически). */
function sensor(theta, beta, o, conv) {
  const t = theta * D2R, b = beta * D2R, oo = o * D2R;
  const sx = Math.cos(b) * Math.sin(t), sy = Math.cos(b) * Math.cos(t), sz = Math.sin(b);
  const ax = sx * Math.cos(oo) + sy * Math.sin(oo), ay = -sx * Math.sin(oo) + sy * Math.cos(oo);
  return [ax * G * conv, ay * G * conv, sz * G * conv];
}

async function run() {
  const r = R.result('Руль наклоном — знак, величина, ось экрана, путь как у кнопок, разрешение iOS');
  const env = H.loadGame({ seed: 7 });
  if (env.evalIn(`typeof tiltSample!=='function'`)) { r.fail('руля наклоном нет (сборка до v1.17.24)'); return r; }
  const C = env.evalIn(`({dead:TILT_DEAD,full:TILT_FULL,tau:TILT_TAU,lost:TILT_LOST})`);
  const expect = (theta, beta) => {
    const deg = Math.asin(Math.cos(beta * D2R) * Math.sin(theta * D2R)) / D2R;
    return -Math.sign(deg) * Math.max(0, Math.min(1, (Math.abs(deg) - C.dead) / (C.full - C.dead)));
  };
  const reset = `TILT.g=null;TILT.up=null;TILT.t=-1;TILT.steer=0;TILT.deg=0;`;
  const feed = (v, t) => env.evalIn(`tiltSample(${v[0]},${v[1]},${v[2]},${t});TILT.steer`);
  /* счётчик жребия — до любых вызовов руля */
  env.evalIn(`var __rnd0=Math.random;var __rndN=0;Math.random=function(){__rndN++;return __rnd0();};`);

  /* 1. знак и величина */
  let n1 = 0, worst = 0;
  for (const o of [0, 90, 180, 270]) for (const conv of [1, -1]) for (const beta of [0, 30, 60])
    for (const theta of [-40, -25, -12, -3, -1, 0, 1, 3, 12, 25, 40]) {
      env.evalIn(reset);
      const got = feed(sensor(theta, beta, o, conv), 1);
      const want = expect(theta, beta), err = Math.abs(got - want);
      worst = Math.max(worst, err); n1++;
      if (err > 1e-9) r.fail(`o=${o}° ${conv > 0 ? 'W3C' : 'iOS'} β=${beta}° θ=${theta}°: руль ${got.toFixed(4)} вместо ${want.toFixed(4)}`);
    }
  for (const [theta, want] of [[C.dead * 0.9, 0], [-C.dead * 0.9, 0], [C.full + 5, -1], [-(C.full + 5), 1]]) {
    env.evalIn(reset);
    const got = feed(sensor(theta, 0, 90, -1), 1);
    if (got !== want) r.fail(`θ=${theta.toFixed(1)}°: руль ${got} вместо ровно ${want} (мёртвая зона / упор)`);
  }
  r.line(`знак и величина: ${n1} поз (4 ориентации × 2 знака осей × β 0/30/60 × 11 углов), худшая ошибка ${worst.toExponential(1)}; влево — руль < 0`);

  /* 2. плашмя, подъём, переворот, orientationchange, не-тяжесть */
  {
    env.evalIn(reset);
    const flat = feed(sensor(10, 85, 90, -1), 1);
    const upNull = env.evalIn(`TILT.up===null`);
    if (flat !== 0 || !upNull) r.fail(`iPad плашмя с начала: руль ${flat}, ось ${upNull ? 'нет' : 'есть'} — ожидалось 0 и нет оси`);
    feed(sensor(0, 20, 90, -1), 2);
    if (env.evalIn(`TILT.up===null`)) r.fail('поднял iPad — ось экрана не нашлась');
    const f80 = feed(sensor(30, 80, 90, -1), 3), w80 = expect(30, 80);
    if (Math.abs(f80 - w80) > 1e-9) r.fail(`почти плашмя (β=80°) после подъёма: руль ${f80.toFixed(4)} вместо ${w80.toFixed(4)}`);
    const flip = feed(sensor(12, 20, 270, -1), 4), wf = expect(12, 20);
    if (Math.abs(flip - wf) > 1e-9) r.fail(`перевернули на 180°: руль ${flip.toFixed(4)} вместо ${wf.toFixed(4)} — ось не нашлась заново`);
    const lsn0 = env.evalIn(`(_listeners.orientationchange||[]).length`);
    env.evalIn(`sel.steer='tilt';tiltAsk();`);       // без DeviceMotionEvent — просто слушаем
    env.evalIn(`(_listeners.orientationchange||[]).slice(${lsn0}).forEach(function(f){f({});});`);
    if (!env.evalIn(`TILT.up===null`)) r.fail('orientationchange не сбросил ось экрана');
    env.evalIn(`sel.steer='keys';`);
    env.evalIn(reset);
    const a = feed(sensor(-12, 0, 0, 1), 5);
    const b = feed([0.5, 1, 0.3], 5.01);
    if (b !== a) r.fail(`не-тяжесть |g| < 4 сдвинула руль: ${a.toFixed(4)} → ${b.toFixed(4)}`);
    r.line(`плашмя — руль 0 без оси; β=80° после подъёма ${f80.toFixed(3)}; переворот ${flip.toFixed(3)}; orientationchange сбрасывает ось`);
  }

  /* 3. сглаживание */
  {
    env.evalIn(reset);
    feed(sensor(0, 0, 90, -1), 10);
    const g = env.evalIn(`(function(){tiltSample(${sensor(40, 0, 90, -1)},${10 + C.tau});return TILT.g[1];})()`);
    const g0 = sensor(0, 0, 90, -1)[1], g1 = sensor(40, 0, 90, -1)[1];
    const part = (g - g0) / (g1 - g0);
    if (Math.abs(part - (1 - Math.exp(-1))) > 1e-6) r.fail(`за TILT_TAU пройдено ${(part * 100).toFixed(1)} % вместо 63.2 %`);
    r.line(`сглаживание датчика: за ${C.tau} с — ${(part * 100).toFixed(1)} % скачка`);
  }

  /* 4. в заезде (Монца, квала с места): 3 с газа, руль — кнопкой или наклоном */
  const T = H.tracks(true)[0];
  const drive = (mode, tiltTheta, btn) => {
    const e = H.setupWeekend(H.loadGame({ seed: 7 }), { trackIdx: T.idx });
    return e.evalIn(`(function(){sel.steer=${JSON.stringify(mode)};var hid=[];
      for(var f=0;f<180;f++){controls.gas=1;controls.brake=0;controls.left=${btn === 'left' ? 1 : 0};controls.right=${btn === 'right' ? 1 : 0};
        ${tiltTheta === null ? '' : `if(f<120)tiltSample(${sensor(tiltTheta, 30, 90, -1)},performance.now()/1000);`}
        update(1/60);hid.push(document.getElementById('game').classList.contains('tilt'));}
      return {x:player.x,z:player.z,h:player.hdg,s:player.steerAmt,v:player.speed,hid:hid};})()`);
  };
  {
    const thFull = C.full + 8, thHalf = Math.asin(Math.sin((C.dead + 0.5 * (C.full - C.dead)) * D2R) / Math.cos(30 * D2R)) / D2R;
    const base = drive('keys', null, null), keysL = drive('keys', null, 'left'), keysR = drive('keys', null, 'right');
    const tiltL = drive('tilt', thFull, null);
    const same = (a, b) => a.x === b.x && a.z === b.z && a.h === b.h && a.v === b.v;
    if (!(base.v > 5)) r.fail(`болид не поехал (скорость ${base.v.toFixed(1)} м/с) — заезд пробника не годится`);
    if (!same(tiltL, keysL)) r.fail(`полный наклон влево ≠ кнопка «влево»: Δx ${(tiltL.x - keysL.x).toExponential(2)}, Δкурс ${(tiltL.h - keysL.h).toExponential(2)}`);
    if (!(keysL.s < -0.9 && keysR.s > 0.9)) r.fail(`кнопки: steerAmt влево ${keysL.s.toFixed(3)}, вправо ${keysR.s.toFixed(3)}`);
    const half = drive('tilt', thHalf, null);
    /* к кадру 120 руль сошёлся к −0.5, дальше датчик смолк (время стоит — он «жив»), руль держится */
    if (Math.abs(half.s + 0.5) > 0.01) r.fail(`половина наклона: steerAmt ${half.s.toFixed(4)} вместо −0.5`);
    const over = drive('tilt', thFull, 'right');
    if (!same(over, keysR)) r.fail('кнопка «вправо» при наклоне влево не главнее наклона');
    const inert = drive('keys', thFull, null);
    if (!same(inert, base)) r.fail('режим «Кнопки»: подаваемый датчик сдвинул путь болида');
    if (inert.hid.some(Boolean)) r.fail('режим «Кнопки»: кнопки руля спрятаны');
    if (!tiltL.hid[5]) r.fail('наклон жив — кнопки руля не спрятаны');
    /* смолк: двигаем часы дальше TILT_LOST — руль на кнопках, кнопки вернулись */
    const e = H.setupWeekend(H.loadGame({ seed: 7 }), { trackIdx: T.idx });
    e.evalIn(`sel.steer='tilt';tiltSample(${sensor(thFull, 30, 90, -1)},performance.now()/1000);controls.gas=1;update(1/60);`);
    const on = e.evalIn(`document.getElementById('game').classList.contains('tilt')`);
    e.advance((C.lost + 0.1) * 1000);
    const off = e.evalIn(`(function(){update(1/60);return {cls:document.getElementById('game').classList.contains('tilt'),st:tiltSteer()};})()`);
    if (!on || off.cls || off.st !== null) r.fail(`датчик смолк: кнопки ${off.cls ? 'спрятаны' : 'видны'}, руль ${off.st === null ? 'на кнопках' : 'всё ещё наклоном'}`);
    r.line(`${T.name}: полный наклон влево = кнопка «влево» до бита (курс ${keysL.h.toFixed(4)}); половина — ${half.s.toFixed(3)}; кнопка главнее; «Кнопки» с датчиком — путь прежний; смолк — кнопки вернулись`);
  }

  /* 5. разрешение */
  {
    const e1 = H.loadGame({ seed: 7 });
    e1.evalIn(`sel.steer='keys';tiltAsk();`);
    if (e1.evalIn(`(_listeners.devicemotion||[]).length`)) r.fail('режим «Кнопки»: слушатель датчика повешен');
    e1.evalIn(`sel.steer='tilt';tiltAsk();tiltAsk();`);
    if (e1.evalIn(`(_listeners.devicemotion||[]).length`) !== 1) r.fail('«Наклон» без requestPermission: слушателей датчика не один');
    const viaEvent = e1.evalIn(`(function(){TILT.g=null;TILT.up=null;var v=${JSON.stringify(sensor(-20, 0, 90, -1))};
      _listeners.devicemotion[0]({accelerationIncludingGravity:{x:v[0],y:v[1],z:v[2]}});return TILT.steer;})()`);
    if (Math.abs(viaEvent - expect(-20, 0)) > 1e-9) r.fail(`событие devicemotion: руль ${viaEvent} вместо ${expect(-20, 0).toFixed(4)}`);
    for (const ans of ['granted', 'denied']) {
      const e2 = H.loadGame({ seed: 7 });
      e2.evalIn(`var __asked=0;DeviceMotionEvent={requestPermission:function(){__asked++;return Promise.resolve(${JSON.stringify(ans)});}};sel.steer='tilt';tiltAsk();`);
      await new Promise(res => setImmediate(res));
      const s = e2.evalIn(`({n:(_listeners.devicemotion||[]).length,asked:__asked,denied:TILT.denied,note:document.getElementById('tiltNote').textContent})`);
      if (s.asked !== 1) r.fail(`iOS «${ans}»: requestPermission вызван ${s.asked} раз`);
      if (ans === 'granted' && (s.n !== 1 || s.denied)) r.fail(`iOS «Разрешить»: слушателей ${s.n}, отказ ${s.denied}`);
      if (ans === 'denied' && (!s.denied || !/кнопках/.test(s.note))) r.fail(`iOS «Запретить»: отказ ${s.denied}, строка «${s.note}»`);
    }
    r.line('разрешение: «Кнопки» — без слушателя; без iOS-вопроса — один слушатель; «Разрешить» — слушает; «Запретить» — строка о кнопках, руль на кнопках');
  }

  /* 6. жребий */
  const nr = env.evalIn(`__rndN`);
  if (nr) r.fail(`функции руля позвали Math.random ${nr} раз`);
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
