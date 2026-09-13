/* ============================================================================
   ГЕНЕРАТОР ОПЫТНОЙ СБОРКИ: «соперник не быстрее предела ТОЙ точки, где он сейчас»
   (§10 п.20, вариант 2 из разбора «почему он поворачивает круче»).

   Что делает правка. Сейчас скорость соперника задаётся целевой (`aiTarget`),
   к которой он подтягивается экспоненциально, и физического предела кривизны
   у него нет вовсе: в мире он не рулит, а ставится как «точка на осевой плюс
   смещение вбок». Там, где кривизна нарастает быстро, он не успевает сбросить
   и едет быстрее СВОЕГО ЖЕ предела, оставаясь на своей линии. Обрезка это
   запрещает: после подтягивания скорость обрезается по `aiCornerV` в текущей точке.
   Обрезка кладётся в ДВА места сразу — в гонку и в `estLapTime`; иначе якорь
   разойдётся с тем, что происходит на трассе.

   Ключи (всё необязательное):
     --cap            сама обрезка (без неё сборка — копия main с прочими ключами)
     --smooth=N       предел берётся как наибольший радиус в окне ±N точек: защита
                      от одиночных всплесков `track.K` (§9, редкий контур)
     --grip=X         множитель к DIFF_GRIP (компенсация)
     --brake=X        AIBRAKE (сейчас 44, у игрока 50)
     --acc=X          разгон ИИ (сейчас 13.5, у игрока 14)
     --out=path       куда писать (умолчание: /tmp/apex-cap.html)

   index.html НЕ трогает — пишет копию, на которую пробники натравливаются
   через APEX_INDEX=<путь>.
   Запуск:  node tools/corner-cap-build.js --cap --grip=1.06 --brake=50
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k)); if (!a) return d;
  const i = a.indexOf('='); return i < 0 ? true : a.slice(i + 1); };

const SRC = path.join(__dirname, '..', 'index.html');
const OUT = arg('out', '/tmp/apex-cap.html');
const CAP = !!arg('cap', false), SMOOTH = +arg('smooth', 0);
const GRIP = +arg('grip', 1), BRAKE = arg('brake', null), ACC = arg('acc', null);

let s = fs.readFileSync(SRC, 'utf8');
const must = (from, to) => {                 // падаем громко: молча не применённая правка — худшее, что может сделать генератор
  const hit = typeof from === 'string' ? s.indexOf(from) >= 0 : from.test(s);
  if (!hit) throw new Error('не найдено в index.html: ' + String(from).slice(0, 70));
  s = s.replace(from, to); };

if (CAP) {
  // общая функция предела: радиус по траектории, как в aiTarget
  const win = SMOOTH > 0
    ? `var R=0;for(var q=-${SMOOTH};q<=${SMOOTH};q++){var jj=(i+q+M)%M,kk=Math.abs(track.K[jj]);
         var rr=kk<0.03?1e9:24/kk+halfAt(jj)*0.8; if(rr>R)R=rr;}
       if(R>=1e8)return 1e9;`                       // в окне есть прямая — не ограничиваем
    : `var kk=Math.abs(track.K[i]); if(kk<0.03)return 1e9; var R=24/kk+halfAt(i)*0.8;`;
  must('function estLapTime(base,cornerK){',
    `function __capV(i,cornerK){var M=track.M;${win}return aiCornerV(R)*cornerK;}\nfunction estLapTime(base,cornerK){`);
  // 1) расчёт поула
  must(`      else v+=(target-v)*Math.min(1,dt*3.0);
      t+=ds/Math.max(v,5);}}`,
    `      else v+=(target-v)*Math.min(1,dt*3.0);
      {var vcap=__capV(i,cornerK); if(v>vcap)v=vcap;}
      t+=ds/Math.max(v,5);}}`);
  // 2) гонка
  must(`    else c.speed+=(target-c.speed)*Math.min(1,dt*3.0);`,
    `    else c.speed+=(target-c.speed)*Math.min(1,dt*3.0);
    {var vcap=__capV(iu,(c.cornerK||34)*em*(1-(tf?DIRTY_LOSS*tf.dirty:0))); if(c.speed>vcap)c.speed=vcap;}`);
}
if (GRIP !== 1) must(/const DIFF_GRIP=\{[^}]*\}/,
  m => m.replace(/([0-9.]+)/g, n => (+n * GRIP).toFixed(4)));
if (BRAKE !== null) must('const AIBRAKE=44;', `const AIBRAKE=${+BRAKE};`);
if (ACC !== null) {
  must('if(v<target)v+=Math.min(target-v,13.5*', `if(v<target)v+=Math.min(target-v,${+ACC}*`);
  must('else if(c.speed<target)c.speed+=Math.min(target-c.speed,13.5*',
    `else if(c.speed<target)c.speed+=Math.min(target-c.speed,${+ACC}*`);
}
fs.writeFileSync(OUT, s);
console.log('сборка: ' + OUT + '  (обрезка ' + (CAP ? 'ВКЛ' + (SMOOTH ? ', окно ±' + SMOOTH : '') : 'выкл') +
  ', grip ×' + GRIP + ', AIBRAKE ' + (BRAKE === null ? 44 : BRAKE) + ', разгон ' + (ACC === null ? 13.5 : ACC) + ')');
