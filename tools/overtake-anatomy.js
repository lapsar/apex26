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
      var dt=1/60, N=field.length, st={}, since={}, brk={}, startK={}, pv=[], ev=[];
      function key(a,b){return a+'|'+b;}
      for(var a=0;a<N;a++)for(var b=a+1;b<N;b++){
        var k=key(a,b); st[k]=field[a].dist-field[b].dist>0?1:-1; since[k]=-1; brk[k]=0; }
      __drive(Math.round(${600 * LAPS}/dt),dt,'auto',function(){
        var hard=[];                                            // кто в этом кадре тормозил всерьёз
        for(var i=0;i<N;i++){ hard[i] = pv[i]!==undefined && (pv[i]-field[i].speed)/dt > 8; }
        for(var a=0;a<N;a++)for(var b=a+1;b<N;b++){
          var k=key(a,b), d=field[a].dist-field[b].dist, ad=Math.abs(d);
          if(ad<6.04 && since[k]<0){ since[k]=raceTime; brk[k]=0;
            /* МЕСТО НАЧАЛА манёвра, а не его развязки. Первая версия справки брала точку,
               где обгон ЗАСЧИТАН (корпус удержан 3 с), и показывала треть обгонов
               «в медленном повороте» — но обгон, начатый в торможении, честно там
               и завершается. Это была ошибка чтения, а не игры (09.2026). */
            var bk = d>0 ? b : a;                              // кто в этой паре сзади
            var bi = Math.floor(((field[bk].u%1)+1)%1*track.M)%track.M;
            startK[k] = Math.abs(track.K[bi]); }
          if(ad>6.04 && (st[k]>0)===(d>0)){ since[k]=-1; brk[k]=0; }  // разъехались, не поменявшись
          /* «Тормозил ли обгоняющий» надо смотреть за ВЕСЬ манёвр: у самой развязки он уже
             разгоняется, и первая версия мерки (полсекунды до защёлки) видела торможение
             лишь в 12 % обгонов просто потому, что смотрела не в тот момент. */
          if(since[k]>=0){ if(hard[a]) brk[k]|=1; if(hard[b]) brk[k]|=2; }
          var flip = (st[k]>0 && d<-6.04) || (st[k]<0 && d>6.04);
          if(flip){
            var w = d>0 ? a : b;                                // кто вышел вперёд
            var c = field[w];
            var iu = Math.floor(((c.u%1)+1)%1*track.M)%track.M;
            ev.push({K: startK[k]!==undefined ? startK[k] : Math.abs(track.K[iu]),
                     endK: Math.abs(track.K[iu]), brake: !!(brk[k] & (w===a?1:2)), t:raceTime,
                     dur: since[k]>=0 ? raceTime-since[k] : -1});
            st[k] = d>0 ? 1 : -1; since[k]=-1; brk[k]=0;
          }
        }
        for(var i=0;i<N;i++) pv[i]=field[i].speed;
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
    '  НАЧАТ: на прямой ' + (100 * per.straight / per.total).toFixed(0) + '%' +
    '  в быстром ' + (100 * per.fast / per.total).toFixed(0) + '%' +
    '  в медленном ' + (100 * per.slow / per.total).toFixed(0) + '%' +
    '  |  обгоняющий тормозил ' + (100 * per.braking / per.total).toFixed(0) + '%' +
    '  |  первые 30 с ' + (100 * per.early / per.total).toFixed(0) + '%' +
    '  |  бок о бок до обгона: медиана ' + med(per.dur).toFixed(1) + ' с, дольше 5 с ' +
    (100 * per.dur.filter(x => x > 5).length / Math.max(1, per.dur.length)).toFixed(0) + '%');
  for (const k of ['straight', 'fast', 'slow', 'braking', 'total', 'early']) acc[k] += per[k];
  acc.dur = acc.dur.concat(per.dur);
}
/* ---------- второй раздел: ЖИЗНЬ В ОЧЕРЕДИ ----------
   Догоняющий ограничен ТЕКУЩЕЙ скоростью переднего (`ahd.speed+(gp-7.6)*0.6`), а не
   возможностью до неё замедлиться. Значит в зоне торможения он обязан тормозить вместе
   с передним, даже когда до него ещё 15 м. Здесь меряется, сколько это стоит:
   сколько времени болид проводит в очереди, как часто при этом теряет против своего
   свободного темпа и насколько, и как часто он тормозит, хотя САМ бы ещё не тормозил. */
function queue() {
  console.log('\n########  ЖИЗНЬ В ОЧЕРЕДИ (ограничен передним, а не поворотом)  ########');
  for (const T of H.tracks(true)) {
    const rows = [];
    for (const seed of SEEDS) {
      const env = H.loadGame({ seed });
      H.setupWeekend(env, { trackIdx: T.idx, diff: DIFF, laps: LAPS });
      H.startRaceAt(env, 11);
      H.lightsOut(env);
      H.noRetirements(env);
      rows.push(env.evalIn(`(function(){
        var dt=1/60, all=0, inq=0, lose=0, sum=0, early=0, worst=0, dly=[];
        __drive(Math.round(${600 * LAPS}/dt),dt,'auto',function(){
          if(raceTime<3) return true;                 // стартовую свалку в счёт не берём
          for(var i=0;i<field.length;i++){ var c=field[i]; if(c.retired||!c.free) continue;
            all++;
            var g = c.ahd ? c.gp : 1e9;
            if(g>15.1) continue;                      // вне окна подтягивания
            inq++;
            var d = c.free - c.speed;                 // сколько недобирает против свободного темпа
            if(d>0.5){ lose++; sum+=d; if(d>worst) worst=d; }
            /* КТО НАЧИНАЕТ ТОРМОЗИТЬ ПЕРВЫМ. В настоящей гонке атакующий тормозит ПОЗЖЕ
               обороняющегося — этим обгон и делается. Здесь ловится момент, когда каждый
               из пары сбросил больше 5 м/с² за кадр-другой, и считается, кто был первым. */
            var a = c.ahd;
            if(a && !a.retired){
              var was = c.__pv===undefined ? c.speed : c.__pv, wasA = a.__pv===undefined ? a.speed : a.__pv;
              var brC = (was - c.speed)/dt > 5, brA = (wasA - a.speed)/dt > 5;
              if(brA && !c.__brk){ c.__brk = raceTime; }            // передний начал тормозить
              if(brC && c.__brk!==undefined && c.__brkDone!==c.__brk){
                dly.push(raceTime - c.__brk); c.__brkDone = c.__brk; early++; }
            }
          }
          for(var i=0;i<field.length;i++) field[i].__pv = field[i].speed;
          return !(phase===''||raceOver);});
        return {all:all, inq:inq, lose:lose, sum:sum, early:early, worst:worst, dly:dly};})()`));
    }
    const S = k => rows.reduce((a, x) => a + x[k], 0);
    const all = S('all'), inq = S('inq'), lose = S('lose');
    console.log('  ' + T.name.padEnd(12) +
      ' в очереди ' + (100 * inq / all).toFixed(1) + ' % кадро-машин' +
      ' · из них теряет темп ' + (100 * lose / Math.max(1, inq)).toFixed(0) + ' %' +
      ' · средняя потеря ' + (S('sum') / Math.max(1, lose)).toFixed(2) + ' м/с' +
      ' (худшая ' + Math.max(...rows.map(x => x.worst)).toFixed(1) + ')');
    const dly = rows.reduce((a, x) => a.concat(x.dly), []).sort((x, y) => x - y);
    const q = f => dly.length ? dly[Math.min(dly.length - 1, Math.floor(dly.length * f))] : NaN;
    console.log('               догоняющий тормозит ПОСЛЕ переднего на ' + q(0.5).toFixed(2) + ' с (медиана), ' +
      'четверть случаев позже ' + q(0.75).toFixed(2) + ' с; событий ' + dly.length +
      ', «тормозит одновременно или раньше» ' + (100 * dly.filter(x => x <= 0.05).length / Math.max(1, dly.length)).toFixed(0) + ' %');
  }
}
queue();

const med = a => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN;
console.log('\nвсего ' + acc.total + ': на прямой ' + (100 * acc.straight / acc.total).toFixed(0) +
  '%, в быстром повороте ' + (100 * acc.fast / acc.total).toFixed(0) +
  '%, в медленном ' + (100 * acc.slow / acc.total).toFixed(0) +
  '%; обгоняющий тормозил в ' + (100 * acc.braking / acc.total).toFixed(0) +
  '% случаев; медиана «бок о бок до обгона» ' + med(acc.dur).toFixed(1) + ' с');
