/* Не начала ли башня с позициями мельтешить?
   Башня строится сортировкой по rankCmp (по dist), поэтому любая перестановка
   соседей в этом порядке — это строка, которая на экране прыгнула.
   Считаем:
     • перестановок в башне за гонку (все, включая сантиметровые);
     • «мельтешение» — пара поменялась и вернулась обратно в пределах 3 с;
     • самое частое мельтешение одной пары за гонку.
   Игрок в счёт входит: его строку в башне видно тоже. */
'use strict';
const H = require('/home/user/apex26/tools/harness.js');
const arg = k => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
const seeds = (arg('seeds') || '7,91,13').split(',').map(Number);
const only = arg('tracks') ? arg('tracks').split(',') : null;
const laps = Number(arg('laps') || 3);
const tracks = H.tracks(true).filter(t => !only || only.includes(t.name));
console.log('файл:', H.INDEX_HTML, '· кругов', laps);

for (const T of tracks) {
  const acc = { sw: 0, flip: 0, worst: 0, dur: 0 };
  for (const seed of seeds) {
    const env = H.loadGame({ seed });
    H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps });
    H.startRaceAt(env, 11);
    H.lightsOut(env);
    H.noRetirements(env);
    const o = env.evalIn(`(function(){
      var dt=1/60, N=cars.length, K=function(a,b){return a+'|'+b;};
      var sign={}, last={}, cnt={}, sw=0, flip=0, worst=0, tEnd=0, a, b;
      for(a=0;a<N;a++)for(b=a+1;b<N;b++) sign[K(a,b)] = cars[a].dist-cars[b].dist>0?1:-1;
      __drive(Math.round(900/dt),dt,'auto',function(){
        tEnd=raceTime;
        for(var a=0;a<N;a++)for(var b=a+1;b<N;b++){
          var k=K(a,b), s=cars[a].dist-cars[b].dist>0?1:-1;
          if(s!==sign[k]){
            sign[k]=s; sw++;
            if(last[k]!==undefined && raceTime-last[k]<3.0){
              flip++; cnt[k]=(cnt[k]||0)+1; if(cnt[k]>worst) worst=cnt[k];
            }
            last[k]=raceTime;
          }}
        return !(phase===''||raceOver);});
      return {sw:sw, flip:flip, worst:worst, t:tEnd};})()`);
    acc.sw += o.sw; acc.flip += o.flip; acc.dur += o.t;
    if (o.worst > acc.worst) acc.worst = o.worst;
  }
  const n = seeds.length, dur = acc.dur / n;
  console.log(`\n=== ${T.name} === гонка ${dur.toFixed(0)} с`);
  console.log(`  перестановок в башне: ${(acc.sw / n).toFixed(0)} за гонку`
    + ` = ${(acc.sw / n / dur * 60).toFixed(1)} в минуту`);
  console.log(`  из них мельтешение (туда-обратно за 3 с): ${(acc.flip / n).toFixed(0)} за гонку`
    + ` = ${(100 * acc.flip / Math.max(1, acc.sw)).toFixed(0)} % всех перестановок`);
  console.log(`  худшая пара: ${acc.worst} мельтешений за гонку`);
}
