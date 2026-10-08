/* ============================================================================
   Пробник — БОЛИД НЕ ДЁРГАЕТСЯ В КАМЕРЕ «ЗА БОЛИДОМ» ПРИ НЕРОВНЫХ КАДРАХ

   Владелец (08.10.2026, iPad, v1.16.53–54, вид «за болидом»): «болид немного подёргивается
   взад-вперёд, мир кругом не дёргается». Причина: камера догоняла точку за болидом долей
   dt*10 за кадр — отставание v·(0.1−dt) зависело от длины кадра, а iPad рисует по сетке
   60 Гц: не успел — кадр сразу 33 мс. На пропущенном кадре болид прыгал относительно
   камеры на 30–50 см (Монца, 315 км/ч). Кокпита это не касается: там камера в болиде.

   Проверка: на Монце (самая быстрая) и Монако автопилот едет квалификацию в виде «за
   болидом» с 12 % двойных кадров (1/30 вместо 1/60, зерно). Каждый кадр на скорости
   > 40 м/с меряется расстояние камера–болид; скачок за кадр — наибольший и средний.
   Эталон — та же езда ровными 1/60: двойные кадры не вправе раскачать картинку сильнее
   (v1.16.54: средний 7.0 см против 1.0, наибольший 50 см; v1.16.55: 1.1 и 10 см).
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const FRAMES = 2400;
const MISS = 0.12;            // доля двойных кадров (~53 к/с на iPad mini 5)
const MEAN_X = 1.5;           // средний скачок с двойными кадрами — не больше, чем ×1.5 от ровных
const MAX_CM = 20;            // наибольший скачок за кадр, см

function drive(T, miss, seed) {
  const env = H.loadGame({ seed: seed || 11 });
  H.setupWeekend(env, { trackIdx: T.idx, view: 'chase' });
  return env.evalIn(`(function(){
    qualiLapsLeft=99; camMode='chase'; var q=12345, rnd=function(){q=q*16807%2147483647;return q/2147483647;};
    var prev=null, sum=0, n=0, mx=0;
    for(var f=0;f<${FRAMES};f++){ __AP.drive(); update(rnd()<${miss}?1/30:1/60);
      var m=player.mesh.position, dx=m.x-cam.position.x, dy=m.y-cam.position.y, dz=m.z-cam.position.z;
      var g=Math.sqrt(dx*dx+dy*dy+dz*dz), v=Math.abs(player.speed);
      if(f>300&&prev!==null&&v>40){ var d=Math.abs(g-prev); sum+=d; n++; if(d>mx)mx=d; }
      prev=g; }
    return {n:n, mean:+(sum/Math.max(1,n)*100).toFixed(1), max:+(mx*100).toFixed(1)};
  })()`);
}

function run(opt) {
  opt = opt || {};
  const r = R.result('Камера «за болидом»: болид не дёргается при неровных кадрах');
  for (const key of ['Monza', 'Monaco']) {
    const T = H.tracks(true).find(t => t.key === key);
    const flat = drive(T, 0, opt.seed), miss = drive(T, MISS, opt.seed);
    r.line(`${T.name.padEnd(12)} ровные 1/60: скачок за кадр средний ${flat.mean} см, наибольший ${flat.max} · `
      + `${MISS * 100} % двойных: ${miss.mean} / ${miss.max} см (кадров на скорости ${miss.n})`);
    if (miss.mean > flat.mean * MEAN_X + 0.2)
      r.fail(`${T.name}: при двойных кадрах болид раскачивается — средний скачок ${miss.mean} см против ${flat.mean} на ровных`);
    if (miss.max > MAX_CM)
      r.fail(`${T.name}: болид прыгает относительно камеры на ${miss.max} см за кадр (порог ${MAX_CM})`);
  }
  r.note('ловит камеру, чьё отставание зависит от длины кадра (до v1.16.55 — lerp dt*10)');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
