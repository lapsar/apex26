/* ============================================================================
   СПРАВКА — ПОПЕРЕЧНАЯ ТЕЛЕПОРТАЦИЯ СОПЕРНИКОВ

   Вопрос владельца (09.2026): свалки с остановкой в первом повороте Канады
   больше нет — не вылезла ли вместо неё поперечная телепортация, то есть
   мгновенный сдвиг болида вбок вместо руления.

   ЗАЧЕМ ИМЕННО ЭТО. В v1.13.3 расталкивание по ширине было ПРИСВАИВАНИЕМ
   (`nl=o.lane+side*2.4` — 2.4 м за кадр, то есть 144 м/с поперёк). Его заменили
   плавным разведением, в v1.15.38 добавили потолок 8 м/с и доворот кузова.
   v1.15.61 убрала ПРОДОЛЬНЫЙ телепорт (предел сближения перестал ПРИСВАИВАТЬ
   скорость), и вопрос законный: конфликт, который раньше гасился обвалом
   скорости, мог перетечь в поперечное движение.

   ЧТО МЕРИТСЯ, покадрово, по каждому болиду ИИ:
     • поперечная скорость |Δlane|/dt (м/с) — как быстро болид переходит поперёк
       дороги. В коде она ограничена потолком `mlat` = 8 м/с;
     • сколько кадров потолок УПИРАЕТСЯ — то есть код хотел сдвинуть сильнее
       и его удержали. Это и есть «просился телепорт»;
     • «немой снос»: поперечный ход, не объяснённый доворотом кузова. Доворот
       (`crab`) ограничен 5.7° и сглажен постоянной 0.125 с, поэтому короткий
       рывок в 8 м/с кузов показать не успевает и читается как скольжение;
     • МИРОВОЙ ТЕЛЕПОРТ — сторож, не зависящий от механизма: сдвиг позиции
       за кадр против того, что объясняют собственная скорость болида и потолок
       8 м/с поперёк. Ловит скачок откуда угодно, а не только из полосы.

   ДВЕ ЛОВУШКИ СТОРОЖА, обе нашёл первый же прогон:
     (1) болид, смещённый вбок В ПОВОРОТЕ, проходит по земле БОЛЬШЕ своей
         скорости — его дуга длиннее осевой. Без поправки на это сторож давал
         4.8 % ложных срабатываний, все на поворотах;
     (2) до первого кадра x/z болидов ещё не расставлены, поэтому первый замер
         брался от нуля и давал «телепорт» в 33 тыс. м/с. Нужен прогревочный кадр.

   НЕ ПРОБНИК: порога нет. Числа сравниваются со сборкой-предшественницей:
     node tools/lateral-audit.js
     APEX_INDEX=archive/v1.15.60.html node tools/lateral-audit.js

   Ключи: --secs --fps --diff --seeds --only=Monza --zone=150,500 (окно по метрам
   от линии старта; у Канады первый поворот это 150..500).
   ========================================================================== */
'use strict';

const H = require('./harness');

const arg = (n, d) => {
  const p = process.argv.find(a => a.startsWith('--' + n + '='));
  return p === undefined ? d : p.slice(n.length + 3);
};

const MLAT = 8;                     // потолок поперечной скорости в коде, м/с
const CRAB_MAX = 5.7;               // потолок доворота кузова, градусы

function measure(trackIdx, seed, diff, secs, dt, zA, zB) {
  const env = H.loadGame({ seed });
  H.setupWeekend(env, { trackIdx, diff, laps: 3 });
  H.startRaceAt(env, 11);
  H.lightsOut(env);
  H.noRetirements(env);              // сход переставляет болид к стене мгновенно — это своя, законная перестановка
  return env.evalIn(`(function(){
    var dt=${dt}, zA=${zA}, zB=${zB}, pl=[], px=[], pz=[];
    var o={n:0,sum:0,worst:0,worstAt:null,cap:0,f6:0,f4:0,hist:[0,0,0,0,0,0,0,0],
           mute:0,muteWorst:0,crabMax:0,tp:0,tpWorst:0,tpAt:null,ev:[]};
    __drive(1,dt,'auto');            // прогревочный кадр: до него x/z болидов ещё не расставлены
    for(var i=0;i<field.length;i++){pl[i]=field[i].lane;px[i]=field[i].x;pz[i]=field[i].z;}
    __drive(${Math.round(secs / dt)},dt,'auto',function(){
      for(var i=0;i<field.length;i++){
        var c=field[i];
        if(c.retired){pl[i]=c.lane;px[i]=c.x;pz[i]=c.z;continue;}
        var dx=c.x-px[i], dz=c.z-pz[i]; px[i]=c.x; pz[i]=c.z;
        var moved=Math.sqrt(dx*dx+dz*dz)/dt;
        // поправка на дугу: K[i] — перепад курса за 24 м, значит кривизна = K/24,
        // и болид на полосе lane проходит в (1 + lane*K/24) раз больше осевой
        var ii=Math.floor((((c.u%1)+1)%1)*track.M)%track.M;
        var arc=Math.abs(1+c.lane*track.K[ii]/24);
        var allow=Math.sqrt(c.speed*c.speed*arc*arc+${MLAT * MLAT})+2;
        if(moved>allow){o.tp++; if(moved-allow>o.tpWorst){o.tpWorst=moved-allow;
          o.tpAt={car:c.name,t:+raceTime.toFixed(2),s:+c.dist.toFixed(0),
                  moved:+moved.toFixed(1),spd:+c.speed.toFixed(1)};}}

        var v=Math.abs(c.lane-pl[i])/dt; pl[i]=c.lane;
        var s=((c.dist%track.length)+track.length)%track.length;
        if(zA>=0&&(s<zA||s>zB))continue;
        o.n++; o.sum+=v;
        if(v>o.worst){o.worst=v;o.worstAt={car:c.name,t:+raceTime.toFixed(2),s:+s.toFixed(0),
          spd:+c.speed.toFixed(1),crab:+(c.crab*180/Math.PI).toFixed(1)};}
        if(v>=${MLAT}*0.999){o.cap++;
          if(o.ev.length<8)o.ev.push({car:c.name,t:+raceTime.toFixed(2),s:+s.toFixed(0),
            spd:+c.speed.toFixed(1),lane:+c.lane.toFixed(2),crab:+(c.crab*180/Math.PI).toFixed(1)});}
        if(v>6)o.f6++; if(v>4)o.f4++;
        o.hist[Math.min(7,Math.floor(v))]++;
        var cr=Math.abs(c.crab*180/Math.PI); if(cr>o.crabMax)o.crabMax=cr;
        // сколько поперечного хода доворот кузова НЕ объясняет
        var mute=v-Math.max(c.speed,1)*Math.tan(Math.abs(c.crab));
        if(mute>1){o.mute++; if(mute>o.muteWorst)o.muteWorst=mute;}
      }
      return !(phase===''||raceOver);});
    return o;})()`);
}

function main() {
  const fps = +arg('fps', 60), dt = 1 / fps;
  const secs = +arg('secs', 25);
  const diff = arg('diff', 'normal');
  const seeds = String(arg('seeds', '7,91,3,42')).split(',').map(Number);
  const only = arg('only', '');
  const zone = arg('zone', '');
  const [zA, zB] = zone ? zone.split(',').map(Number) : [-1, -1];

  console.log('СБОРКА: ' + (process.env.APEX_INDEX || 'index.html (текущая)'));
  console.log(`окно: первые ${secs} с гонки · ${fps} кадров/с · режим ${diff} · зёрна ${seeds.join(',')}`
    + (zone ? ` · зона s=${zA}..${zB} м` : ' · весь круг'));
  console.log(`потолок поперечной скорости в коде ${MLAT} м/с, потолок доворота кузова ${CRAB_MAX}°\n`);

  for (const T of H.tracks(true)) {
    if (only && T.name !== only) continue;
    const A = { n: 0, sum: 0, worst: 0, worstAt: null, cap: 0, f6: 0, f4: 0,
                hist: [0, 0, 0, 0, 0, 0, 0, 0], mute: 0, muteWorst: 0, crabMax: 0,
                tp: 0, tpWorst: 0, tpAt: null, ev: [] };
    for (const seed of seeds) {
      const r = measure(T.idx, seed, diff, secs, dt, zA, zB);
      A.n += r.n; A.sum += r.sum; A.cap += r.cap; A.f6 += r.f6; A.f4 += r.f4;
      A.mute += r.mute; A.tp += r.tp;
      if (r.worst > A.worst) { A.worst = r.worst; A.worstAt = Object.assign({ seed }, r.worstAt); }
      if (r.muteWorst > A.muteWorst) A.muteWorst = r.muteWorst;
      if (r.crabMax > A.crabMax) A.crabMax = r.crabMax;
      if (r.tpWorst > A.tpWorst) { A.tpWorst = r.tpWorst; A.tpAt = Object.assign({ seed }, r.tpAt); }
      for (let b = 0; b < 8; b++) A.hist[b] += r.hist[b];
      for (const e of r.ev) if (A.ev.length < 8) A.ev.push(Object.assign({ seed }, e));
    }
    if (!A.n) { console.log(`${T.name}: в зоне не оказалось ни одного кадра\n`); continue; }
    const pc = x => (100 * x / A.n).toFixed(3) + ' %';
    console.log(`${T.name}: кадров-болидов ${A.n}`);
    console.log(`  поперечная скорость: худшая ${A.worst.toFixed(2)} м/с · средняя ${(A.sum / A.n).toFixed(3)}`);
    console.log(`  у потолка ${MLAT} м/с: ${A.cap} (${pc(A.cap)}) · >6 м/с: ${A.f6} (${pc(A.f6)}) · >4 м/с: ${A.f4} (${pc(A.f4)})`);
    console.log(`  «немой снос» >1 м/с: ${A.mute} (${pc(A.mute)}), худший ${A.muteWorst.toFixed(2)} м/с · доворот кузова не больше ${A.crabMax.toFixed(1)}°`);
    console.log(`  гистограмма по м/с [0-1..7+]: ${A.hist.join(' ')}`);
    console.log(`  МИРОВОЙ ТЕЛЕПОРТ: ${A.tp} кадров-болидов сверх допустимого`
      + (A.tpAt ? ` · худший +${A.tpWorst.toFixed(1)} м/с (${(A.tpWorst * dt * 100).toFixed(1)} см за кадр): `
        + `${A.tpAt.car}, зерно ${A.tpAt.seed}, ${A.tpAt.t} с, s=${A.tpAt.s} м, прошёл ${A.tpAt.moved} м/с при скорости ${A.tpAt.spd}` : ''));
    if (A.worstAt) console.log(`  худший поперечный: ${A.worstAt.car}, зерно ${A.worstAt.seed}, ${A.worstAt.t} с, s=${A.worstAt.s} м, скорость ${A.worstAt.spd} м/с, доворот ${A.worstAt.crab}°`);
    if (A.ev.length) {
      console.log('  примеры кадров у потолка:');
      for (const e of A.ev) console.log(`    ${String(e.car).padEnd(11)} зерно ${e.seed} · ${e.t} с · s=${e.s} м · ${e.spd} м/с · полоса ${e.lane} м · доворот ${e.crab}°`);
    }
    console.log('');
  }
  console.log('НАПОМИНАНИЕ: порога здесь нет. Смысл имеет только сравнение с прошлой сборкой');
  console.log('через APEX_INDEX, а «мировой телепорт» в единицы м/с — это грубость поправки');
  console.log('на дугу, а не скачок: переводи его в сантиметры за кадр, они и напечатаны.');
}

main();
