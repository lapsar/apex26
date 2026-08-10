/* ============================================================================
   Пробник 9 — НАГРУЗКА СЦЕНЫ

   Узкое место целевых устройств — число вызовов отрисовки (CLAUDE.md §3).
   Меряется четыре величины и сверяется с записанными ориентирами:

     • меши сцены трассы (без болидов): Монца 43, Сильверстоун 46;
     • болид игрока:            32 меша / 3000 тр.;
     • болид ИИ (упрощённый):   17 мешей / 1332 тр.;
     • видимых мешей в гонке (22 болида, LOD_NEAR=4): не больше 495.

   Превышение — провал. Уменьшение печатается, но провалом не считается.
   Скрытые трассы меряются справочно.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

// Montreal 42 -> 43 (v1.15.23): у щитов торможения появились стойки, а стойка
// рисуется своим материалом и потому даёт отдельный меш. Плата — один вызов
// отрисовки: в гонке 491 -> 492 при потолке 495 (§3 CLAUDE.md).
const SCENE_BUDGET = { Monza: 43, Silverstone: 46, Montreal: 43 };
const CAR_BUDGET = { player: { m: 32, t: 3000 }, ai: { m: 17, t: 1332 } };
const DRAW_BUDGET = 495;

const COUNT = `function(root){
  var m=0,t=0;
  root.traverse(function(o){ if(o.isMesh&&o.geometry){ m++;
    var g=o.geometry; t += g.index ? g.index.count/3 : (g.attributes.position?g.attributes.position.count/3:0); } });
  return {m:m, t:Math.round(t)};
}`;

function run(opt) {
  opt = opt || {};
  const r = R.result('Нагрузка сцены — число мешей не выросло');

  // 1. мир трассы, без болидов
  for (const T of H.tracks()) {                        // все трассы, сколько бы их ни было
    const ti = T.idx;
    const env = H.loadGame({ seed: opt.seed || 3 });
    H.setupWorld(env, { trackIdx: ti });
    const s = env.evalIn(`(${COUNT})(scene)`);
    const name = env.evalIn('track.name');
    const want = SCENE_BUDGET[name];
    if (want === undefined) {
      r.note(`${name}: ${s.m} мешей сцены, ${s.t} тр. — ориентира нет`
        + (T.hidden ? ' (трасса скрыта)' : '; трасса открыта в меню — запиши бюджет сюда и в CLAUDE.md §3'));
      continue;
    }
    r.line(`${name.padEnd(12)} сцена ${s.m} мешей (ориентир ${want}) · ${s.t} тр.`);
    if (s.m > want) r.fail(`${name}: ${s.m} мешей сцены вместо ${want}`);
    else if (s.m < want) r.note(`${name}: мешей стало меньше — ${s.m} вместо ${want}; если это правка, обнови CLAUDE.md §3`);
  }

  // 2. болиды и вызовы отрисовки в гонке
  for (const T of H.tracks(true)) {                    // видимые в меню: бюджет вызовов меряется там, где играют
    const ti = T.idx;
    const env = H.loadGame({ seed: opt.seed || 3 });
    H.setupWeekend(env, { trackIdx: ti, diff: 'normal', laps: 1 });
    H.startRaceAt(env, 11);
    const s = env.evalIn(`(function(){
      __drive(1,1/60,'idle');                                  // кадр, чтобы отработал updateCarLOD
      var cnt=(${COUNT});
      var u=field[0].mesh.userData;
      var vis=0;
      (function walk(o,on){                                     // скрытая группа целиком не рисуется
        var v=on&&o.visible;
        if(o.isMesh&&v) vis++;
        for(var i=0;i<o.children.length;i++) walk(o.children[i],v);
      })(scene,true);
      return {player:cnt(player.mesh), ai:cnt(u.lodLow), aiHi:cnt(u.lodHigh),
              vis:vis, cars:cars.length, near:LOD_NEAR};
    })()`);
    const name = env.evalIn('track.name');
    r.line(`${name.padEnd(12)} игрок ${s.player.m}/${s.player.t} · ИИ упрощ. ${s.ai.m}/${s.ai.t}`
      + ` · ИИ полный ${s.aiHi.m}/${s.aiHi.t} · видимых в гонке ${s.vis} (${s.cars} болида, LOD_NEAR=${s.near})`);
    if (s.player.m > CAR_BUDGET.player.m || s.player.t > CAR_BUDGET.player.t)
      r.fail(`${name}: болид игрока ${s.player.m} мешей / ${s.player.t} тр. вместо ${CAR_BUDGET.player.m} / ${CAR_BUDGET.player.t}`);
    if (s.ai.m > CAR_BUDGET.ai.m || s.ai.t > CAR_BUDGET.ai.t)
      r.fail(`${name}: упрощённый болид ${s.ai.m} мешей / ${s.ai.t} тр. вместо ${CAR_BUDGET.ai.m} / ${CAR_BUDGET.ai.t}`);
    if (s.vis > DRAW_BUDGET)
      r.fail(`${name}: ${s.vis} видимых мешей в гонке при потолке ${DRAW_BUDGET}`);
  }
  if (r.ok) r.line('все бюджеты в пределах записанных ориентиров');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
