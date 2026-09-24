/* ============================================================================
   СПРАВКА: ВИЛЯЕТ ЛИ КРОМКА В ПОВОРОТАХ (09.2026, вопрос владельца про
   поребрики Хунгароринга в T2 и T8-9)

   Кромка полотна и поребрик строятся как «осевая + полуширина вбок по нормали».
   Если осевая посреди поворота на один шаг (4 м) поворачивает слабее соседей
   или даже в обратную сторону, нормаль дёргается и кромка вместе с ней
   «прыгает». Справка ищет такие места по ПОСТРОЕННОЙ осевой (track.P), а не
   по данным контура.

   Что печатает на каждую трассу:
     дрожание    — СКО отличия поворота на шаге от среднего по ±3 шагам, градусы
                   (Сильверстоун 0.61 — эталон гладкой трассы);
     развороты   — шаги, повёрнутые ПРОТИВ поворота, в котором стоят
                   (сглаженный поворот по ±4 шагам больше 2°/шаг);
     провалы     — шаг, повёрнутый меньше 45 % от среднего соседей того же знака.
   Настоящая шикана тоже даёт отметки на стыке сторон — смотреть S глазами.

   Запуск:  node tools/contour-wobble.js [Ключ]      (APEX_INDEX — другая сборка)
   Игру не меняет.
   ========================================================================== */
'use strict';
const H = require('./harness');
const only = process.argv[2];

for (const t of H.tracks(false)) {
  if (only && t.key !== only) continue;
  const env = H.loadGame({ seed: 1 });
  H.setupWorld(env, { trackIdx: t.idx });
  const r = env.evalIn(`(function(){const M=track.M,P=track.P,hd=[],d=[];
    for(let i=0;i<M;i++){const a=P[i],b=P[(i+1)%M];hd.push(Math.atan2(b.x-a.x,b.z-a.z));}
    for(let i=0;i<M;i++){let x=hd[(i+1)%M]-hd[i];while(x>Math.PI)x-=2*Math.PI;while(x<-Math.PI)x+=2*Math.PI;d.push(x*180/Math.PI);}
    return {M,S:Array.from(track.S),d};})()`);
  const M = r.M, d = r.d, a = i => d[((i % M) + M) % M];
  const rev = [], dip = [];
  let jit = 0;
  for (let i = 0; i < M; i++) {
    let s7 = 0; for (let k = -3; k <= 3; k++) s7 += a(i + k); jit += (d[i] - s7 / 7) ** 2;
    let s9 = 0; for (let k = -4; k <= 4; k++) s9 += a(i + k); s9 /= 9;
    if (Math.abs(s9) > 2 && Math.sign(d[i]) !== Math.sign(s9) && Math.abs(d[i]) > 0.5) rev.push(r.S[i].toFixed(0));
    const nb = (a(i - 1) + a(i + 1)) / 2;
    if (Math.abs(nb) > 4 && Math.sign(a(i - 1)) === Math.sign(a(i + 1)) && Math.abs(d[i]) < 0.45 * Math.abs(nb)) dip.push(r.S[i].toFixed(0));
  }
  console.log(`${t.key.padEnd(12)}${t.hidden ? '(скрыта)' : '        '} дрожание ${Math.sqrt(jit / M).toFixed(2)}°` +
    `  развороты ${String(rev.length).padStart(2)} [${rev.join(' ')}]  провалы ${String(dip.length).padStart(2)} [${dip.join(' ')}]`);
}
