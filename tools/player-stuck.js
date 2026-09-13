/* ============================================================================
   СПРАВКА: «упираешься в идущего впереди» — жалоба владельца после v1.15.78.

   Штатный автопилот для этого НЕ ГОДИТСЯ: он на 15-20 с круга медленнее поля,
   то есть сам является препятствием, а не догоняющим. Здесь ему даётся бонус
   (--fast=1.15), чтобы он вёл себя как владелец: быстрее поля, идёт сквозь него.

   Меряется: сколько времени игрок проводит УПЁРШИСЬ (соперник впереди ближе 15 м
   и в пределах 3 м поперёк), сколько длится один такой эпизод, чем он кончается
   (прошёл / отвалился) и сколько мест игрок отыграл за гонку.

   ОГОВОРКА, найденная первым же прогоном: бонус НЕ делает автопилот игроком.
   На Монце круг выходит 102-104 с при поуле поля 90.6 — и на 1.15, и на 1.45,
   потому что упирается он в собственный рулевой закон, а не в темп. Финиш P22
   на всех бонусах. Поэтому справка честно отвечает только на вопрос «часто ли
   упираются в трафик ВООБЩЕ» и НЕ отвечает на вопрос «каково владельцу, который
   быстрее поля». Для второго ближе пробник `charge` (болид +2 % из хвоста).

   Не пробник: порогов нет, index.html не трогает.
   Запуск: node tools/player-stuck.js [--fast=1.15] [--diff=normal] [--laps=3]
   ========================================================================== */
'use strict';
const H = require('./harness');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const FAST = +arg('fast', 1.15), DIFF = arg('diff', 'normal'), LAPS = +arg('laps', 3);
const SEEDS = arg('seeds', '7,91,13').split(',').map(Number);
const med = a => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN;

for (const T of H.tracks(true)) {
  const rows = [];
  for (const seed of SEEDS) {
    const env = H.loadGame({ seed });
    H.setupWeekend(env, { trackIdx: T.idx, diff: DIFF, laps: LAPS });
    const start = H.startRaceAt(env, 11);
    H.lightsOut(env);
    H.noRetirements(env);
    rows.push(env.evalIn(`(function(){
      var o=__AP.safeSpeed; __AP.safeSpeed=function(i){return o.call(__AP,i)*${FAST};};
      var dt=1/60, frames=0, stuck=0, ep=[], cur=-1, passed=0, dropped=0, startPos=0;
      var pr0=project(player.x,player.z,player.hint);
      __drive(Math.round(${600 * LAPS}/dt),dt,'auto',function(){
        frames++;
        if(raceTime<3) return true;
        // ближайший соперник ВПЕРЕДИ по дороге и в пределах трёх метров поперёк
        var pr=project(player.x,player.z,player.hint), best=null, bd=1e9;
        for(var i=0;i<field.length;i++){var c=field[i]; if(c.retired)continue;
          var dx=c.x-player.x, dz=c.z-player.z, d=Math.sqrt(dx*dx+dz*dz);
          if(d>15) continue;
          var f=track.F[pr.idx], lon=dx*f.x+dz*f.z;            // вдоль дороги
          if(lon<=0) continue;                                  // он позади — не в счёт
          var lat=Math.abs(dx*f.z-dz*f.x);
          if(lat>3) continue;                                   // не на моей траектории
          if(d<bd){bd=d;best=c;}}
        if(best){ stuck++; if(cur<0){cur=raceTime;} }
        else if(cur>=0){ ep.push(raceTime-cur); cur=-1; }
        return !(phase===''||raceOver);});
      if(cur>=0) ep.push(raceTime-cur);
      var order=(window.__raceOrder||cars.slice().sort(rankCmp));
      return {frames:frames, stuck:stuck, ep:ep,
              pos:order.findIndex(function(c){return c.isPlayer;})+1, lap:player.best};})()`));
  }
  const S = k => rows.reduce((a, x) => a + x[k], 0);
  const eps = rows.reduce((a, x) => a.concat(x.ep), []);
  console.log(T.name.padEnd(12) +
    ' упёрт ' + (100 * S('stuck') / S('frames')).toFixed(1) + ' % времени' +
    ' · эпизодов ' + (eps.length / rows.length).toFixed(0) + ' за гонку' +
    ', медиана ' + med(eps).toFixed(1) + ' с, дольше 5 с ' +
    (100 * eps.filter(x => x > 5).length / Math.max(1, eps.length)).toFixed(0) + ' %' +
    ', худший ' + Math.max(...eps).toFixed(1) + ' с' +
    ' · финиш P' + rows.map(x => x.pos).join('/') +
    ' · лучший круг ' + med(rows.map(x => x.lap)).toFixed(2) + ' с');
}
