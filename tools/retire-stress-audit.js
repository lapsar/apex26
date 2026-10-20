/* ============================================================================
   Справка — СХОДЫ В ГОНКЕ: НИКТО НЕ СТОИТ ЗА ВСТАВШИМ (19.10.2026, проверка v1.16.87; v1.16.88)

   Гонка как в пробнике pass (а), но любая трасса и любые зёрна: Норма, игрок-автопилот с P11, шесть сходов по расписанию
   (retireAt — та же формула), 400 с. Сход идёт своим законом (failStep: отказ техники / вылет / разворот). Печатает строку JSON
   на гонку: дольше всех стоял перед вставшим (ближе 15 м, скорость < 0.5; не в счёт — рядом со стоящим игроком-автопилотом),
   глубже всех соперник в корпусе вставшего (ghostPen), самый большой сдвиг полосы за кадр, виды сходов.
   Замер 19.10.2026 (6 трасс × зёрна 2–5): v1.16.86 — 4 гонки из 24 со стоянием 16–28 с, скачок 2.93 м (Лёвс);
   v1.16.87 и v1.16.88 — 0, не больше 0.9 с, скачок ≤ 0.26 м.
   Запуск: node tools/retire-stress-audit.js <трасса> <зёрна через запятую> [режим]   (сборка — APEX_INDEX)
   ========================================================================== */
'use strict';
const H = require('./harness');
const [tname, seedsArg, diff] = process.argv.slice(2), file = undefined;
const T = H.tracks(true).find(t => t.name === tname);
for (const seed of seedsArg.split(',').map(Number)) {
  const env = H.loadGame({ seed, file });
  H.setupWeekend(env, { trackIdx: T.idx, diff: diff || 'normal', laps: 40 });
  H.startRaceAt(env, 11); H.lightsOut(env);
  env.evalIn(`(function(){var pool=field.slice(0,22);for(var k=0;k<6;k++){var c=pool[(k*7+3)%pool.length];c.retireAt=(0.6+k*0.7+Math.random()*0.3)*track.length;}})()`);
  const o = env.evalIn(`(function(){var dt=1/60,stk=new Map(),worst=0,who='',at='',pen=0,penAt='',jump=0,jumpAt='',kinds={};
    for(var f=0;f<400*60&&phase!=='';f++){var pl=new Map();field.forEach(function(c){pl.set(c,c.lane);});__drive(1,dt,'auto');
      var gs=field.filter(function(o){return o.retired&&o.ghost&&!o.cleared;});
      for(var k=0;k<field.length;k++){var c=field[k];if(c.retired){stk.set(c,0);continue;}if(c.fail&&c.fail.on)continue;
        var dl=Math.abs(c.lane-pl.get(c));if(dl>jump&&dl<50){jump=dl;jumpAt=c.code+' S '+Math.round(track.S[carIdx(c)]);}
        var hit=null;for(var q=0;q<gs.length;q++){var d=Math.hypot(c.x-gs[q].x,c.z-gs[q].z);if(d<14){var p=ghostPen(c,c.lane,0,gs[q]);if(p>pen){pen=p;penAt=c.code+' в '+gs[q].code+' S '+Math.round(track.S[carIdx(c)]);}}
          if(d<15&&!hit)hit=gs[q];}
        if(hit&&c.speed<0.5&&Math.hypot(c.x-player.x,c.z-player.z)<8&&player.speed<0.5){stk.set(c,0);continue;}
        if(hit&&c.speed<0.5){var t=(stk.get(c)||0)+dt;stk.set(c,t);if(t>worst){worst=t;who=c.code+' за '+hit.code;at='S '+Math.round(track.S[carIdx(hit)])+' lane '+hit.lane.toFixed(1)+'/'+halfAt(hit.retiredIdx)+(neutral.mode?', '+neutral.mode:'');}}
        else stk.set(c,0);}}
    field.forEach(function(c){if(c.retired)kinds[c.retKind||'?']=(kinds[c.retKind||'?']||0)+1;});
    return {worst:+worst.toFixed(1),who:who,at:at,pen:+pen.toFixed(2),penAt:penAt,jump:+jump.toFixed(2),jumpAt:jumpAt,kinds:kinds};})()`);
  console.log(JSON.stringify({ track: tname, seed, ...o }));
}
