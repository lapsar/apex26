/* ============================================================================
   Пробник — ВСТАВШИЙ НЕ ЗАПИРАЕТ УЗКУЮ УЛИЦУ (v1.17.2, ключ трассы failRoom)

   Владелец (23.10.2026): «сходы и ошибки не должны случаться в местах, где невозможно будет проехать — например, в Старом
   городе; пусть игра выбирает другие места». Вариант (б): мимо вставшего — не меньше failRoom (Баку — 8 м). До v1.17.2
   стена Баку почти везде в 1 м за линией, и отказ техники вставал у неё частью на полотне где придётся: в замке (7.6 м)
   мимо оставалось ~4 м, между T15 и T16 — ~4.5 м, вылет в T7 запирал 10-метровую улицу у стены Старого города.

   На каждой видимой трассе с ключом failRoom, зёрна SEEDS, Норма, игрок-автопилот: у всех 21 соперника отказ по расписанию
   (через 150 м … круг, вразброс), отдельно отказ техники и вылет (сход-разворот там становится вылетом — мест разворота нет):
     • все сошли за RACE_SECS (отложенный отказ находит место, придержанный соседом не ползёт);
     • мимо каждого вставшего — не меньше failRoom: корпус (4 угла, свой поворот) против кромок полотна в его точке.
   Зуб: v1.17.1 (--room=8 --track=Baku, ключа там нет) — на зёрнах 3, 7 меньше 8 м оставляли 14 из 84 вставших (отказ техники 10,
   вылет 4), худший — 3.0 м (вылет T15 докатился до конца выезда), в замке — 4.4 м; на зёрнах 3, 5, 7, 11 — 28 из 168, меньше 6 м — 11.
   v1.17.2: не меньше 8.4 м (выход из замка, полотно 11.8 м).
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const SEEDS = [3, 7], RACE_SECS = 260;

function run(opt) {
  const r = R.result('Вставший не запирает узкую улицу (failRoom): мимо него не меньше порога, отказ находит место');
  const seeds = opt.seeds ? String(opt.seeds).split(',').map(Number) : SEEDS;
  let any = false;
  for (const T of H.tracks(true)) {
    const env0 = H.loadGame({ seed: 1, file: opt.file });
    H.setupWeekend(env0, { trackIdx: T.idx, diff: 'normal', laps: 5 });
    const FR = env0.evalIn('track.spec.failRoom||0') || (opt.room && opt.track === T.name ? opt.room : 0);   // --room=8 --track=Baku — зуб на сборке без ключа
    if (!FR) continue;
    any = true;
    for (const kind of ['tech', 'crash']) {
      let n = 0, left = 0, worst = 1e9, at = '', bad = [];
      for (const seed of seeds) {
        const env = H.loadGame({ seed, file: opt.file });
        H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 5 });
        H.startRaceAt(env, 11);
        H.lightsOut(env);
        H.noRetirements(env);
        const o = env.evalIn(`(function(){var dt=1/60,M=track.M,out=[],KIND='${kind}',off=${seed}*37;
          /* отказ — по расписанию, сценарий задан (жребий RET_MIX не тянется); дальше — как в игре */
          failBegin=function(c,iu){c.retireAt=0;c.err=null;c.errPh=0;c.spinPend=null;c.duel=null;c.ovLock=null;
            if(KIND==='tech')techStart(c,iu);else c.fail={wait:true,until:c.dist+RET_CRASH_WAIT};};
          var rc=retireCar;retireCar=function(c,here){rc(c,here);if(!here)return;
            var m=c.mesh,h=m.rotation.y,s=Math.sin(h),co=Math.cos(h),i=carIdx(c),P=track.P[i],R=track.R[i],hw=halfAt(i),lo=1e9,hi=-1e9;
            [[1.285,3.02],[-1.285,3.02],[1.285,-3.02],[-1.285,-3.02]].forEach(function(b){
              var x=m.position.x+b[0]*co+b[1]*s,z=m.position.z-b[0]*s+b[1]*co,l=(x-P.x)*R.x+(z-P.z)*R.z;lo=Math.min(lo,l);hi=Math.max(hi,l);});
            out.push([Math.round(track.S[i]),Math.max(Math.min(lo,hw)+hw,hw-Math.max(hi,-hw)),2*hw]);};
          field.filter(function(c){return c!==player;}).forEach(function(c,k){c.retireAt=c.dist+150+((k*283+off)%Math.round(track.length));});
          for(var f=0;f<Math.round(${RACE_SECS}/dt);f++)__drive(1,dt,'auto');
          return {out:out,left:field.filter(function(c){return c!==player&&!c.retired;}).map(function(c){return c.num+' на S '+Math.round(c.u*track.length);})};})()`);
        n += o.out.length; left += o.left.length;
        if (o.left.length) r.fail(`${T.name} ${kind}, зерно ${seed}: не сошли за ${RACE_SECS} с — ${o.left.join(', ')}`);
        for (const [S, free, w] of o.out) {
          if (free < worst) { worst = free; at = `S ${S}, полотно ${w.toFixed(1)} м`; }
          if (free < FR) bad.push(`S ${S}: ${free.toFixed(1)} м (полотно ${w.toFixed(1)})`);
        }
      }
      if (bad.length) r.fail(`${T.name} ${kind}: мимо вставшего меньше ${FR} м у ${bad.length} из ${n}: ${bad.slice(0, 8).join('; ')}`);
      r.line(`${T.name.padEnd(12)} ${kind.padEnd(5)} сошли ${n} (не сошли ${left}), мимо вставшего не меньше ${worst.toFixed(1)} м (${at}), порог ${FR}`);
    }
  }
  if (!any) r.note('трасс с ключом failRoom нет');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
