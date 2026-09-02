/* ============================================================================
   СПРАВКА — ЕЗДА БОК О БОК (не пробник, порога нет)

   Владелец (09.2026) прислал кадры: соперники подолгу едут парами и тройками
   в разных полосах, в том числе В ПОВОРОТАХ, и это продолжается до третьего
   круга из пяти. Здесь мерится, сколько этого на самом деле.

   Бок о бок = корпуса перекрываются вдоль дороги (|Δdist| < 6.04) и полосы
   разведены не меньше 1.5 м. Эпизод не рвётся, если пара расходится меньше
   чем на 0.5 с.

   Замер 09.2026, 3 трассы x 3 зерна, гонка 5 кругов, Норма — v1.15.58 против v1.15.59
   (появился штраф за езду вне гоночной линии, OFFLINE_COST):

       пар бок о бок одновременно   2.24 -> 1.33
       эпизодов дольше 20 с         14.9 -> 5.6 за гонку
       вне гоночной линии           41 % -> 32 % болидо-кадров
       троек и шире                 вдвое меньше кадров

   Запуск: node tools/abreast-audit.js [--laps=5] [--diff=normal] [--seeds=7,91,13]
           [--track=Montreal]

   ЭТО НЕ ПРОБНИК: порога нет, в чек-лист не входит. Сторожем «не вернулась ли езда
   веером» служат `tower` (перестановки в башне) и `charge` (обгон доводится до конца) —
   именно они и упёрли величину штрафа сверху.
   ========================================================================== */
'use strict';
const H = require('./harness');


function arg(name, def) {
  const p = process.argv.find(a => a.startsWith('--' + name + '='));
  return p ? p.split('=').slice(1).join('=') : def;
}

const LAPS  = Number(arg('laps', 5));
const DIFF  = arg('diff', 'normal');
const SEEDS = String(arg('seeds', '7,91,13')).split(',').map(Number);
const ONLY  = arg('track', '');

const PROBE = `(function(){
  var dt=1/60, CAR_L=6.04, MINSEP=1.5, GAPTOL=0.5;
  var N=field.length, ep={}, out=[], t=0;
  var offLine=0, frames=0, carFrames=0, abreastFrames=0, abreastCorner=0;
  var groups={2:0,3:0,4:0,5:0}, lapBuckets={};
  function lineAt(c){
    var iu=Math.floor(((c.u%1)+1)%1*track.M)%track.M;
    var kA=0;for(var a=0;a<10;a++)kA+=track.K[(iu+a)%track.M];kA/=10;
    var hw=halfAt(iu);
    return {line:Math.sign(kA)*Math.min(1,Math.abs(kA)/0.06)*hw*0.42, k:Math.abs(kA)};
  }
  __drive(Math.round(1200/dt),dt,'auto',function(){
    t+=dt; frames++;
    var live=[]; for(var i=0;i<N;i++) if(!field[i].retired) live.push(i);
    // off-line time
    for(var q=0;q<live.length;q++){var c=field[live[q]];var L=lineAt(c);
      carFrames++; if(Math.abs(c.lane-L.line)>1.5) offLine++;}
    // pairs
    var adj={}; var any=false;
    for(var a=0;a<live.length;a++)for(var b=a+1;b<live.length;b++){
      var A=field[live[a]], B=field[live[b]];
      var dd=Math.abs(A.dist-B.dist), dl=Math.abs(A.lane-B.lane);
      var on = dd<CAR_L && dl>=MINSEP;
      var k=live[a]+'|'+live[b];
      if(on){
        abreastFrames++; any=true;
        var L=lineAt(A); if(L.k>0.02) abreastCorner++;
        var lp=Math.floor(A.dist/track.length)+1; lapBuckets[lp]=(lapBuckets[lp]||0)+1;
        if(!adj[live[a]])adj[live[a]]=[]; if(!adj[live[b]])adj[live[b]]=[];
        adj[live[a]].push(live[b]); adj[live[b]].push(live[a]);
        if(!ep[k]) ep[k]={t0:t,last:t,corner:0,n:0};
        else if(t-ep[k].last>GAPTOL){ out.push({d:ep[k].last-ep[k].t0,c:ep[k].corner/Math.max(1,ep[k].n),t0:ep[k].t0,p:k}); ep[k]={t0:t,last:t,corner:0,n:0}; }
        ep[k].last=t; ep[k].n++; if(L.k>0.02) ep[k].corner++;
      }
    }
    // group sizes (connected components of the abreast graph)
    var seen={};
    for(var g in adj){ if(seen[g])continue; var st=[g],comp=0;
      while(st.length){var v=st.pop(); if(seen[v])continue; seen[v]=1; comp++;
        var nb=adj[v]||[]; for(var z=0;z<nb.length;z++) if(!seen[nb[z]]) st.push(String(nb[z]));}
      if(comp>=2) groups[Math.min(5,comp)]=(groups[Math.min(5,comp)]||0)+1;}
    return !(phase===''||raceOver);
  });
  for(var k in ep) out.push({d:ep[k].last-ep[k].t0,c:ep[k].corner/Math.max(1,ep[k].n),t0:ep[k].t0,p:k});
  return {eps:out, frames:frames, carFrames:carFrames, offLine:offLine,
          abreastFrames:abreastFrames, abreastCorner:abreastCorner,
          groups:groups, lapBuckets:lapBuckets, raceTime:t, dt:dt};
})()`;

function run() {
  for (const T of H.tracks(true)) {
    if (ONLY && T.name !== ONLY) continue;
    for (const seed of SEEDS) {
      const env = H.loadGame({ seed });
      H.setupWeekend(env, { trackIdx: T.idx, diff: DIFF, laps: LAPS });
      H.startRaceAt(env, 11);
      H.lightsOut(env);
      H.noRetirements(env);
      const r = env.evalIn(PROBE);
      const eps = r.eps.filter(e => e.d >= 1.0).sort((a, b) => b.d - a.d);
      const long = eps.filter(e => e.d >= 5), vlong = eps.filter(e => e.d >= 10), xl = eps.filter(e => e.d >= 20);
      const pf = (r.abreastFrames / Math.max(1, r.frames));
      console.log(`${T.name}/${DIFF}/seed ${seed}  гонка ${r.raceTime.toFixed(0)} с`);
      console.log(`   бок о бок: ${(pf).toFixed(2)} пар одновременно в среднем;`
        + ` эпизодов ≥1 с ${eps.length}, ≥5 с ${long.length}, ≥10 с ${vlong.length}, ≥20 с ${xl.length}`);
      console.log(`   самые долгие: ${eps.slice(0, 6).map(e => e.d.toFixed(1) + 'с(' + (e.c * 100).toFixed(0) + '% в пов., с ' + e.t0.toFixed(0) + 'с)').join(', ')}`);
      console.log(`   доля кадров бок о бок в повороте: ${(100 * r.abreastCorner / Math.max(1, r.abreastFrames)).toFixed(0)}%`);
      console.log(`   вне гоночной линии (>1.5 м): ${(100 * r.offLine / Math.max(1, r.carFrames)).toFixed(1)}% болидо-кадров`);
      const gtot = Object.values(r.groups).reduce((a, b) => a + b, 0) || 1;
      console.log(`   групп по размеру (кадров): ${Object.keys(r.groups).sort().map(k => k + '-широко ' + r.groups[k]).join(', ')}`);
      const lb = r.lapBuckets;
      console.log(`   пар-кадров по кругам: ${Object.keys(lb).sort((a, b) => a - b).map(k => 'круг ' + k + ': ' + lb[k]).join(', ')}`);
      console.log('');
    }
  }
}
run();
