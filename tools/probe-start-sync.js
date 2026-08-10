/* ============================================================================
   Пробник 5 — СИНХРОННОСТЬ СТАРТА

   Никто не трогается раньше погасания фонарей. Проверяется два условия:
     • пока lights.go === false, у всех 22 болидов скорость и путь неподвижны
       (игрок при этом всё время держит газ — фальстарта быть не должно);
     • после погасания каждый соперник сдвигается не раньше своей реакции
       (0.10…0.75 с, ROSTER-зависимая: react = 0.10+(1-skill)*0.45+rnd*0.20).
   Последовательность фонарей проигрывается штатная, без подмены.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const WATCH = 12;                // секунд наблюдения: 5 фонарей + пауза + разгон

function run(opt) {
  opt = opt || {};
  const diff = opt.diff || 'normal';
  const seeds = opt.seed ? [opt.seed] : [77, 314];
  const r = R.result('Синхронность старта — никто не трогается раньше погасания');

  for (const T of H.tracks(true)) {                    // видимые в меню: гоночные пробники долгие
    const ti = T.idx;
    for (const seed of seeds) {
      const env = H.loadGame({ seed });
      H.setupWeekend(env, { trackIdx: ti, diff, laps: 3 });
      H.startRaceAt(env, 11);
      H.noRetirements(env);
      const res = env.evalIn(`(function(){
        var dt=1/60, t=0, lightsAt=-1, jump=[], early=[];
        var st=field.map(function(c){return {c:c,u:c.u,d:c.dist,first:-1};});
        var p0={x:player.x,z:player.z};
        for(var f=0;f<Math.round(${WATCH}/dt);f++){
          __drive(1,dt,'auto');                       // игрок жмёт газ с первого кадра
          t+=dt;
          if(!lights.go){
            st.forEach(function(s){
              if(s.c.speed!==0||s.c.u!==s.u||s.c.dist!==s.d)
                jump.push(s.c.code+' на '+t.toFixed(2)+' с (фонарь '+lights.seq+')');
            });
            if(player.speed!==0||Math.hypot(player.x-p0.x,player.z-p0.z)>1e-9)
              jump.push('ИГРОК на '+t.toFixed(2)+' с (фонарь '+lights.seq+')');
          } else {
            if(lightsAt<0) lightsAt=t;
            st.forEach(function(s){
              if(s.first<0 && s.c.speed>0){
                s.first=raceTime;
                if(raceTime < s.c.react-1e-9)
                  early.push(s.c.code+': тронулся на '+raceTime.toFixed(3)+' с при реакции '+s.c.react.toFixed(3));
              }
            });
          }
        }
        var lag=st.filter(function(s){return s.first>=0;}).map(function(s){return s.first-s.c.react;});
        return {lightsAt:+lightsAt.toFixed(2), jump:jump.slice(0,6), jumpN:jump.length, early:early,
                moved:st.filter(function(s){return s.first>=0;}).length, total:st.length,
                reacts:[Math.min.apply(null,st.map(function(s){return s.c.react;})),
                        Math.max.apply(null,st.map(function(s){return s.c.react;}))],
                lagMax:lag.length?Math.max.apply(null,lag):0};
      })()`);

      const name = env.evalIn('track.name');
      r.line(`${name.padEnd(12)} зерно ${seed}: фонари погасли на ${res.lightsAt} с · тронулись ${res.moved}/${res.total}`
        + ` · реакции ${res.reacts[0].toFixed(2)}…${res.reacts[1].toFixed(2)} с`);
      if (res.jumpN) r.fail(`${name} / зерно ${seed}: движение до погасания — ${res.jump.join('; ')}`
        + (res.jumpN > 6 ? ` и ещё ${res.jumpN - 6}` : ''));
      for (const e of res.early) r.fail(`${name} / зерно ${seed}: ${e}`);
      if (res.moved !== res.total) r.fail(`${name} / зерно ${seed}: с места не тронулись ${res.total - res.moved} соперников`);
    }
  }
  if (r.ok) r.line('фальстартов нет, каждый ждёт своей реакции');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
