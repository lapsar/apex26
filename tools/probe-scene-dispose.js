/* ============================================================================
   Пробник 21 — МИР ПРОШЛОГО УИК-ЭНДА ОСВОБОЖДАЕТСЯ

   Найдено при разборе жалобы на кнопки (09.2026): `clearScene` вынимал объекты
   из сцены, но `dispose()` не делал никто, а `initThree` при повторном заходе
   выходит сразу — значит буферы и текстуры прошлой трассы оставались в
   отрисовщике навсегда. Замер в браузере, шесть уик-эндов подряд: геометрий
   43 -> 1106, текстур 13 -> 114 при одной и той же живой сцене. На iPad mini 5
   это прямой путь к «после нескольких гонок всё тормозит».

   Проверяется ОБЕ крайности сразу, и вторая не менее важна первой:
     • всё, что построено для мира, обязано освободиться при следующем уик-энде;
     • общее, что живёт дольше мира, освобождать НЕЛЬЗЯ — `ENVSHADOW` лежит
       в материале тени КАЖДОГО болида, а `scene.environment` собран один раз
       в `initThree`. Жадный dispose ломает следующий заезд, и поймать это
       глазами почти нельзя.

   Как меряется: three сам шлёт событие 'dispose' на геометрии и текстуре,
   поэтому пробник ничего не подменяет — он подписывается на ресурсы мира
   и смотрит, кого освободили, а кого нет.

   Пробник проверен на настоящей поломке: на v1.15.64 валится тем, что
   не освобождено ничего.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

/* Ресурсы мира, лежащие в сцене, и подписка на их освобождение. */
const COLLECT = `(function(){
  var res=[], seen=new Set();
  var keep=new Set(); if(ENVSHADOW)keep.add(ENVSHADOW); if(scene.environment)keep.add(scene.environment);
  scene.traverse(function(o){
    var add=function(x,kind){ if(!x||seen.has(x))return; seen.add(x);
      var rec={kind:kind, shared:keep.has(x), gone:false};
      if(x.addEventListener)x.addEventListener('dispose',function(){rec.gone=true;});
      res.push(rec); };
    add(o.geometry,'геометрия');
    var ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];
    ms.forEach(function(m){ add(m,'материал');
      for(var k in m){var t=m[k]; if(t&&t.isTexture)add(t,'текстура');} });
  });
  return res;
})()`;

function run(opts) {
  const file = opts && opts.file;
  const r = R.result('Мир прошлого уик-энда освобождается, общее — нет');
  const env = H.loadGame(file ? { file } : {});

  H.setupWeekend(env, { trackIdx: 0 });                 // уик-энд 1: Монца
  const res = env.evalIn(COLLECT);
  const total = res.length, shared = res.filter(x => x.shared).length;
  if (!total) { r.fail('в сцене не нашлось ни одного ресурса — стенд не видит мир'); return r; }
  if (!shared) r.note('общих ресурсов в сцене не нашлось — проверка «не освобождать общее» вхолостую');

  H.setupWeekend(env, { trackIdx: 1 });                 // уик-энд 2: Сильверстоун, мир пересобран

  const own = res.filter(x => !x.shared);
  const leaked = own.filter(x => !x.gone);
  const killed = res.filter(x => x.shared && x.gone);
  const byKind = k => `${k}: ${own.filter(x => x.kind === k && !x.gone).length} из ${own.filter(x => x.kind === k).length}`;

  r.line(`мир Монцы: ресурсов ${total} (из них общих ${shared})`);
  r.line(`после следующего уик-энда НЕ освобождено — ${byKind('геометрия')}, ${byKind('материал')}, ${byKind('текстура')}`);
  r.line(`общее (ENVSHADOW, окружение сцены) освобождено: ${killed.length} — должно быть 0`);

  if (leaked.length) r.fail(`мир прошлого уик-энда остался в видеопамяти: не освобождено ${leaked.length} ресурсов из ${own.length}`);
  if (killed.length) r.fail(`освобождено общее (${killed.length}) — тень болида и отражения сломаются на следующем заезде`);

  /* третий уик-энд: счёт не должен зависеть от того, сколько их уже было */
  const res3 = env.evalIn(COLLECT);
  H.setupWeekend(env, { trackIdx: 0 });
  const leaked3 = res3.filter(x => !x.shared && !x.gone).length;
  r.line(`третий уик-энд подряд: не освобождено ${leaked3} ресурсов`);
  if (leaked3) r.fail(`на третьем уик-энде осталось ${leaked3} ресурсов — освобождение работает не всегда`);

  return r;
}

if (require.main === module) R.main(run);
module.exports = { run };
