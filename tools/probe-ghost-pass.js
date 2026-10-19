/* ============================================================================
   Пробник — ОБЪЕЗД ВСТАВШЕГО: СОПЕРНИК НЕ СТОИТ ПЕРЕД НИМ (v1.16.87)

   Стресс-прогон 19.10.2026 (журнал v1.16.86): в шикане после тоннеля Монако разбитый болид встал частью на полотне
   (полоса 4.4 при hw 6, кузов под 66°), и подъехавший под VSC выбрал объезд со стороны стены, ушёл колёсами за линию и
   упёрся — простоял ~24 с, пока маршалы не убрали вставшего в конце VSC. Причина: сторона объезда (ghostSide) мерилась по
   полосе вставшего в мерке подъезжающего и по стенам у подъезжающего, а в шикане дорога у них смотрит по-разному; выбранная
   сторона дальше не пересматривалась. С v1.16.87 сторона — по сечению самого вставшего, а запертый дольше GHOST_FLIP
   пробует другую сторону.

   (а) Та самая гонка: Монако, Норма, зерно 1, игрок-автопилот с P11, шесть сходов по расписанию стресс-прогона (те же
       retireAt, что в нём): ни один соперник не стоит ближе 15 м от вставшего дольше STUCK_MAX. Зуб: v1.16.86 — BEA 24 с.
       Расклад держится на ходе гонки: правка, меняющая поток Math.random, может увести гонку от этой ситуации — тогда
       пробник зелёный без проверки сути, поэтому печатается, у скольких вставших побывали соседи и сколько объехали.
   (б) Все видимые трассы: у каждого поворота тяжёлого торможения (errCorners — там и вылеты) разбитый ставится частью на
       полотне у внешней стены (5 точек за апексом, полоса hw−1.56, кузов под 66° — поза из (а)); за 100 с соседи не стоят
       перед ним дольше STUCK_MAX и проезжают его. На v1.16.86 (б) зелёная — это сторож «объезд вообще работает», а не зуб.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const STUCK_MAX = 8, NEAR = 15;

function watch(env, secs) {
  return env.evalIn(`(function(){var dt=1/60,stk=new Map(),worst=0,who='',at='',near=new Set();
    for(var f=0;f<${secs}*60&&phase!=='';f++){__drive(1,dt,'auto');
      var gs=field.filter(function(o){return o.retired&&o.ghost&&!o.cleared;});
      for(var k=0;k<field.length;k++){var c=field[k];if(c.retired){stk.set(c,0);continue;}var hit=null;
        for(var q=0;q<gs.length;q++)if(Math.hypot(c.x-gs[q].x,c.z-gs[q].z)<${NEAR}){hit=gs[q];near.add(gs[q]);break;}
        if(hit&&c.speed<0.5){var t=(stk.get(c)||0)+dt;stk.set(c,t);if(t>worst){worst=t;who=c.code+' за '+hit.code;at='S '+Math.round(track.S[carIdx(hit)])+(neutral.mode?', '+neutral.mode:'');}}
        else stk.set(c,0);}}
    return {worst:+worst.toFixed(1),who:who,at:at,ghosts:field.filter(function(o){return o.retired;}).length,near:near.size};})()`);
}

function run(opt) {
  const r = R.result('Объезд вставшего: соперник не стоит перед ним дольше ' + STUCK_MAX + ' с');
  /* (а) — гонка стресс-прогона 19.10.2026 */
  {
    const T = H.tracks(true).find(t => t.name === 'Monaco');
    const env = H.loadGame({ seed: 1, file: opt.file });
    H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 40 });
    H.startRaceAt(env, 11);
    H.lightsOut(env);
    env.evalIn(`(function(){var pool=field.slice(0,22);for(var k=0;k<6;k++){var c=pool[(k*7+3)%pool.length];c.retireAt=(0.6+k*0.7+Math.random()*0.3)*track.length;}})()`);
    const o = watch(env, 400);
    r.line(`Монако, гонка стресс-прогона (зерно 1, 400 с): вставших ${o.ghosts}, у ${o.near} побывали соседи; дольше всех стоял перед вставшим ${o.who || '—'} ${o.worst} с${o.at ? ' (' + o.at + ')' : ''}`);
    if (o.worst > STUCK_MAX) r.fail(`Монако (гонка стресс-прогона): ${o.who} стоял перед вставшим ${o.worst} с (${o.at}) — предел ${STUCK_MAX}`);
  }
  /* (б) — все видимые трассы, разбитый у внешней стены каждого поворота тяжёлого торможения */
  for (const T of H.tracks(true)) {
    const env0 = H.loadGame({ seed: 3, file: opt.file });
    H.setupWeekend(env0, { trackIdx: T.idx, laps: 3 });
    const nC = env0.evalIn('errCorners().list.length');
    const rows = [];
    for (let ci = 0; ci < nC; ci++) {
      const env = H.loadGame({ seed: 3, file: opt.file });
      H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 3 });
      H.startRaceAt(env, 11);
      H.lightsOut(env);
      H.noRetirements(env);
      const S = env.evalIn(`(function(){var dt=1/60,M=track.M,C=errCorners().list[${ci}];__drive(25*60,dt,'auto');
        var iA=(C.ap+5)%M,v=field.slice().sort(function(a,b){return a.dist-b.dist;})[0];   // последний по ходу — переставляется туда
        v.u=(iA+0.5)/M;v.lane=C.side*(halfAt(iA)-1.56);v.crab=-C.side*1.16;v.speed=0;v.fail={kind:'crash'};v.err=null;v.spinPend=null;
        placeAI(v,0);retireCar(v,true);return Math.round(track.S[iA]);})()`);
      const o = watch(env, 100);
      rows.push({ S, ...o });
      if (o.worst > STUCK_MAX) r.fail(`${T.name} S ${S}: ${o.who} стоял перед вставшим ${o.worst} с — предел ${STUCK_MAX}`);
      if (!o.near) r.fail(`${T.name} S ${S}: за 100 с к вставшему никто не подъехал — сценарий не проверяет ничего`);
    }
    r.line(`${T.name.padEnd(12)} поворотов ${rows.length}: дольше всех стоял перед вставшим ${Math.max(...rows.map(x => x.worst)).toFixed(1)} с`);
  }
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
