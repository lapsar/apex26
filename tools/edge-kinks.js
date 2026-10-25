/* ============================================================================
   СПРАВКА: ИЗЛОМЫ И ДРОЖАНИЕ КРОМКИ ПОЛОТНА (10.2026, вопрос владельца по Баку:
   «довольно острые углы — можно ли плавнее; пройдись по всей трассе, проверь
   на ненужное дрожание кромки»)

   contour-wobble.js смотрит на осевую. Владелец видит КРОМКУ: белую линию,
   поребрик, край асфальта — «осевая ± полуширина по нормали». Кромка ломается
   и там, где осевая гладкая: полуширина по участкам (ключ widths) меняется
   ступенькой (у Баку на 10 м до 1.2 м), а на внутренней стороне тугого
   поворота излом осевой умножается на R/(R−HW).

   Что печатает на каждую трассу и сторону (по ПОСТРОЕННЫМ track.P/R/HW):
     дрожание — СКО поворота кромки на шаге от среднего по ±3 шагам, °;
     изломы   — шаги, где поворот кромки отличается от среднего по ±3 шагам
                больше чем на LIM° (по умолчанию 4°): это и есть видимый «угол»;
     зигзаг   — шаги, повёрнутые против соседей (поворот кромки по ±4 шагам
                больше 1.5°/шаг, а сам шаг — в обратную сторону).
   С ключом --list печатает изломы списком (S, сторона, градусы, полуширина).

   Запуск:  node tools/edge-kinks.js [Ключ] [--lim=4] [--list]   (APEX_INDEX — другая сборка)
   Игру не меняет.
   ========================================================================== */
'use strict';
const H = require('./harness');
const args = process.argv.slice(2);
const only = args.find(a => !a.startsWith('--'));
const LIM = +((args.find(a => a.startsWith('--lim=')) || '--lim=4').slice(6));
const LIST = args.includes('--list');

for (const t of H.tracks(false)) {
  if (only && t.key !== only) continue;
  const env = H.loadGame({ seed: 1 });
  H.setupWorld(env, { trackIdx: t.idx });
  const r = env.evalIn(`(function(){const M=track.M,P=track.P,Rr=track.R,out={M,S:Array.from(track.S),HW:Array.from(track.HW||[]),L:[],R:[]};
    for(const [sg,key] of [[-1,'L'],[1,'R']]){const E=[];
      for(let i=0;i<M;i++){const h=track.HW?track.HW[i]:track.roadHalf;E.push([P[i].x+Rr[i].x*sg*h,P[i].z+Rr[i].z*sg*h]);}
      const hd=[];for(let i=0;i<M;i++){const a=E[i],b=E[(i+1)%M];hd.push(Math.atan2(b[0]-a[0],b[1]-a[1]));}
      for(let i=0;i<M;i++){let x=hd[i]-hd[(i-1+M)%M];while(x>Math.PI)x-=2*Math.PI;while(x<-Math.PI)x+=2*Math.PI;out[key].push(x*180/Math.PI);}}
    return out;})()`);
  const M = r.M;
  const rows = [];
  let line = `${t.key.padEnd(12)}${t.hidden ? '(скрыта)' : '        '}`;
  for (const side of ['L', 'R']) {
    const d = r[side], a = i => d[((i % M) + M) % M];
    let jit = 0, kinks = 0, zig = 0;
    for (let i = 0; i < M; i++) {
      let s7 = 0; for (let k = -3; k <= 3; k++) s7 += a(i + k); s7 /= 7;
      const dev = d[i] - s7; jit += dev * dev;
      let s9 = 0; for (let k = -4; k <= 4; k++) s9 += a(i + k); s9 /= 9;
      if (Math.abs(dev) > LIM) { kinks++; rows.push([r.S[i], side, dev, r.HW[i]]); }
      if (Math.abs(s9) > 1.5 && Math.sign(d[i]) !== Math.sign(s9) && Math.abs(d[i]) > 0.5) zig++;
    }
    line += `  ${side}: дрожание ${Math.sqrt(jit / M).toFixed(2)}° изломы>${LIM}° ${String(kinks).padStart(3)} зигзаг ${String(zig).padStart(3)}`;
  }
  console.log(line);
  if (LIST) for (const q of rows.sort((x, y) => x[0] - y[0])) console.log(`   S ${q[0].toFixed(0).padStart(5)} ${q[1]} ${q[2] > 0 ? '+' : ''}${q[2].toFixed(1)}°  полуширина ${q[3] ? q[3].toFixed(2) : '-'}`);
}
