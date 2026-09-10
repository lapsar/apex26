/* ============================================================================
   СПРАВКА: КАК устроен обгон соперника соперником — где он случается и сколько длится.

   Пробник `aiover` считает, СКОЛЬКО обгонов; эта справка отвечает, ЧТО это за обгоны:
   на прямой или в повороте, в торможении или на разгоне, и сколько секунд пара едет
   рядом, прежде чем один выйдет вперёд на корпус.

   Обгоном считается то же, что показывает башня: разница по `dist` перевалила за корпус
   (6.04 м) и продержалась 3 с. Место берётся по точке трассы обгоняющего в момент
   защёлки, «тормозил ли он» — по падению его скорости за предыдущие 0.5 с.

   Не пробник: порогов нет, ничего не заваливает, index.html не трогает.
   Запуск: node tools/overtake-anatomy.js [--diff=normal] [--laps=3] [--seeds=7,91]
   ========================================================================== */
'use strict';
const H = require('./harness');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const DIFF = arg('diff', 'normal'), LAPS = +arg('laps', 3);
const SEEDS = arg('seeds', '7,91').split(',').map(Number);

const acc = { straight: 0, fast: 0, slow: 0, braking: 0, total: 0, early: 0, dur: [], stuck: 0 };

for (const T of H.tracks(true)) {
  const per = { straight: 0, fast: 0, slow: 0, braking: 0, total: 0, early: 0, dur: [] };
  for (const seed of SEEDS) {
    const env = H.loadGame({ seed });
    H.setupWeekend(env, { trackIdx: T.idx, diff: DIFF, laps: LAPS });
    H.startRaceAt(env, 11);
    H.lightsOut(env);
    H.noRetirements(env);
    const out = env.evalIn(`(function(){
      var dt=1/60, N=field.length, st={}, side={}, since={}, prev={}, ev=[];
      function key(a,b){return a+'|'+b;}
      for(var a=0;a<N;a++)for(var b=a+1;b<N;b++){
        var k=key(a,b); st[k]=field[a].dist-field[b].dist>0?1:-1; since[k]=-1; }
      __drive(Math.round(${600 * LAPS}/dt),dt,'auto',function(){
        for(var i=0;i<N;i++){ var c=field[i]; if(!prev[i])prev[i]=[];
          prev[i].push(c.speed); if(prev[i].length>30)prev[i].shift(); }
        for(var a=0;a<N;a++)for(var b=a+1;b<N;b++){
          var k=key(a,b), d=field[a].dist-field[b].dist, ad=Math.abs(d);
          if(ad<6.04 && since[k]<0) since[k]=raceTime;          // пара сошлась в пределах корпуса
          if(ad>6.04 && (st[k]>0)===(d>0)) since[k]=-1;         // разъехались, не поменявшись
          var flip = (st[k]>0 && d<-6.04) || (st[k]<0 && d>6.04);
          if(flip){
            var w = d>0 ? a : b;                                // кто вышел вперёд
            var c = field[w];
            var iu = Math.floor(((c.u%1)+1)%1*track.M)%track.M;
            var K = Math.abs(track.K[iu]);
            var h = prev[w], drop = h.length>1 ? h[0]-c.speed : 0;
            ev.push({K:K, brake:drop>3, t:raceTime, dur: since[k]>=0 ? raceTime-since[k] : -1});
            st[k] = d>0 ? 1 : -1; since[k]=-1;
          }
        }
        return !(phase===''||raceOver);});
      return ev;})()`);
    for (const e of out) {
      per.total++;
      if (e.K < 0.03) per.straight++; else if (e.K < 0.08) per.fast++; else per.slow++;
      if (e.brake) per.braking++;
      if (e.t < 30) per.early++;
      if (e.dur >= 0) per.dur.push(e.dur);
    }
  }
  const med = a => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN;
  console.log(T.name.padEnd(12) + ' обгонов ' + String(per.total).padStart(4) +
    '  на прямой ' + (100 * per.straight / per.total).toFixed(0) + '%' +
    '  в быстром ' + (100 * per.fast / per.total).toFixed(0) + '%' +
    '  в медленном ' + (100 * per.slow / per.total).toFixed(0) + '%' +
    '  |  обгоняющий тормозил ' + (100 * per.braking / per.total).toFixed(0) + '%' +
    '  |  первые 30 с ' + (100 * per.early / per.total).toFixed(0) + '%' +
    '  |  бок о бок до обгона: медиана ' + med(per.dur).toFixed(1) + ' с, дольше 5 с ' +
    (100 * per.dur.filter(x => x > 5).length / Math.max(1, per.dur.length)).toFixed(0) + '%');
  for (const k of ['straight', 'fast', 'slow', 'braking', 'total', 'early']) acc[k] += per[k];
  acc.dur = acc.dur.concat(per.dur);
}
const med = a => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN;
console.log('\nвсего ' + acc.total + ': на прямой ' + (100 * acc.straight / acc.total).toFixed(0) +
  '%, в быстром повороте ' + (100 * acc.fast / acc.total).toFixed(0) +
  '%, в медленном ' + (100 * acc.slow / acc.total).toFixed(0) +
  '%; обгоняющий тормозил в ' + (100 * acc.braking / acc.total).toFixed(0) +
  '% случаев; медиана «бок о бок до обгона» ' + med(acc.dur).toFixed(1) + ' с');
