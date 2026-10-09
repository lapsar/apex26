/* ============================================================================
   Пробник — ГРАНИЦЫ ТРАССЫ: СРЕЗКА ПО ВЫЕЗДУ (v1.16.62)

   Владелец (09.10.2026): ребёнок начнёт ехать из тоннеля Монако прямо по выезду шиканы — срезка
   выигрывает 2.6–5.2 с; стену не строить, скорость не ограничивать; неаккуратный апекс не наказывать.
   Решение владельца: квала — время круга удаляется, попыток не больше двух (второй удалённый круг —
   без времени, старт последним); гонка — первая срезка предупреждение (жёлтый «!» в башне), каждая
   следующая +5 с к финишу (значок красный); круг со срезкой не идёт в лучший и в быстрый круг гонки.
   Срезка — центр болида дальше depth м за белой линией в зоне ключа трассы `cuts` (tracks/monaco.md).

   Проверка на каждой трассе с `cuts`:
     • мерка: неаккуратный проезд (руль у апекса сдвинут к выезду на 8 м) уходит за линию меньше
       depth−1 м, прямой проезд по выезду — дальше depth+1 м (граница не съехала с геометрией);
     • неаккуратный проезд ничего не включает ни в квале, ни в гонке;
     • квала: срезка → круг удалён, на линии попытка 2 и лучшего нет; вторая срезка → без времени, последний;
     • гонка: предупреждение → штраф 5 → штраф 10; круг со срезкой не стал лучшим;
     • финиш: соперник в 3.1 с позади встаёт впереди игрока со штрафом 5 с, в 6.5 с — нет.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const SRC = `
var __L={
 iAt:function(S){var b=0,bd=1e9;for(var i=0;i<track.M;i++){var d=Math.abs(track.S[i]-S);if(d<bd){bd=d;b=i;}}return b;},
 put:function(S,v){var i0=this.iAt(S),P=track.P[i0],F=track.F[i0];player.x=P.x;player.z=P.z;player.hdg=Math.atan2(F.x,F.z);player.speed=v;
   player.yawLag=0;player.hint=i0;player.prevIdx=i0;player.arcPrev=track.S[i0];player.lapLock=0;player.lapMark=-1e9;wallTouch=false;},
 /* проезд зоны z: 'cut' — прямо на точку за зоной, газ в пол; 'sloppy' — автопилот, цель руля у апекса сдвинута к выезду */
 pass:function(z,mode){var sg=z.side==='R'?1:-1,A=track.P[this.iAt(z.toS+4)],depth=-9,L=track.length;
   this.put(z.fromS-80,55);
   for(var k=0;k<60*15;k++){var s=track.S[player.hint],ds=s-z.fromS;if(ds<-L/2)ds+=L;
     if(mode==='cut'&&ds>-20&&s<z.toS+4){var w=Math.atan2(A.x-player.x,A.z-player.z),d=w-player.hdg;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
       controls.left=-d*2.4<-0.12?1:0;controls.right=-d*2.4>0.12?1:0;controls.gas=1;controls.brake=0;}
     else if(mode==='sloppy'&&s>z.fromS&&s<z.toS){var st=__AP.steer(),pr=project(player.x,player.z,player.hint),M=track.M,ah=Math.max(3,Math.round(3+player.speed*0.12)),j=(pr.idx+ah)%M,
       ww=Math.sin(Math.PI*(s-z.fromS)/(z.toS-z.fromS)),tx=track.P[j].x+track.R[j].x*8*sg*ww,tz=track.P[j].z+track.R[j].z*8*sg*ww,want=Math.atan2(tx-player.x,tz-player.z),dh=want-player.hdg;
       while(dh>Math.PI)dh-=2*Math.PI;while(dh<-Math.PI)dh+=2*Math.PI;controls.left=-dh*2.4<-0.12?1:0;controls.right=-dh*2.4>0.12?1:0;
       var v=__AP.safeSpeed(st.idx);controls.gas=player.speed<v?1:0;controls.brake=player.speed>v+1?1:0;}
     else __AP.drive();
     update(1/60);
     var q=project(player.x,player.z,player.hint),sq=track.S[q.idx];if(sq>=z.fromS&&sq<=z.toS){var dd=sg*q.off-halfAt(q.idx);if(dd>depth)depth=dd;}
     var e=track.S[player.hint]-z.toS;if(e<-L/2)e+=L;if(e>60&&e<L/2)break;}
   return depth;},
 /* доехать через линию старта (с подъезда в 40 м) */
 cross:function(){var lap=player.lap;this.put(track.length-40,40);for(var k=0;k<60*4&&player.lap===lap&&!qualiOutro&&phase!=='';k++){__AP.drive();update(1/60);}}
};`;

function run() {
  const r = R.result('Границы трассы: срезка по выезду — квала, предупреждение, штраф');
  let n = 0;
  for (const T of H.tracks()) {
    const env = H.loadGame({ seed: 11 });
    H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal' });
    const Z = env.evalIn('JSON.stringify(track.spec.cuts||[])');
    const cuts = JSON.parse(Z);
    if (!cuts.length) continue;
    env.evalIn(SRC);
    cuts.forEach((z, zi) => {
      n++;
      const tag = `${T.name} · срезка ${z.name} (S ${z.fromS}–${z.toS})`;
      // квала
      const q = env.evalIn(`(function(){var z=track.spec.cuts[${zi}],o={};player.started=true;
        o.sloppy=__L.pass(z,'sloppy');o.sloppyHit=!!player.lapCut;
        o.cut=__L.pass(z,'cut');o.del=!!player.lapCut&&tlKind==='del';__L.cross();o.try2=player.qTry;o.best1=isFinite(player.best);o.out1=!!player.noTime;
        __L.pass(z,'cut');__L.cross();o.noTime=!!player.noTime;o.pos=window.__grid?window.__grid.findIndex(function(g){return g.you;})+1:0;o.n=window.__grid?window.__grid.length:0;
        return o;})()`);
      r.line(`${tag}: за линией — неаккуратно ${q.sloppy.toFixed(1)} м, прямо ${q.cut.toFixed(1)} м (граница ${z.depth} м)`);
      if (!(q.sloppy < z.depth - 1)) r.fail(`${tag}: неаккуратный проезд уходит за линию на ${q.sloppy.toFixed(1)} м — ближе 1 м к границе ${z.depth}`);
      if (!(q.cut > z.depth + 1)) r.fail(`${tag}: прямой проезд по выезду уходит за линию лишь на ${q.cut.toFixed(1)} м — граница ${z.depth} его не ловит`);
      if (q.sloppyHit) r.fail(`${tag}: квала — неаккуратный проезд удалил круг`);
      if (!q.del) r.fail(`${tag}: квала — срезка не удалила круг`);
      if (q.try2 !== 2 || q.best1 || q.out1) r.fail(`${tag}: квала — после удалённого круга ждали попытку 2 без времени, вышло попытка ${q.try2}, время ${q.best1 ? 'есть' : 'нет'}${q.out1 ? ', уже без времени' : ''}`);
      if (!q.noTime || q.pos !== q.n) r.fail(`${tag}: квала — второй удалённый круг: ждали «без времени» и P${q.n}, вышло ${q.noTime ? 'без времени' : 'со временем'}, P${q.pos}`);
      else r.line(`  квала: круг удалён → попытка 2 → второй раз без времени, старт P${q.pos} из ${q.n}`);
      // гонка
      const g = env.evalIn(`(function(){var z=track.spec.cuts[${zi}],o={};
        player.best=qualiField[9].time-0.001;beginQualiOutro();clearTimeout(qualiOutroTimer);qualiOutro=false;raceOutro=false;hideQualiBanner();phase='quali';startRace();
        lights.seq=5;lights.offAt=0.0001;lights.go=true;field.forEach(function(c){c.retireAt=0;});totalLaps=99;
        __L.cross();o.started=!!player.started;   // первая линия в гонке только запускает секундомер круга
        __L.pass(z,'sloppy');o.sloppy=tlCount;
        __L.pass(z,'cut');o.k1=tlKind;o.c1=tlCount;o.p1=tlPen;o.cutLap=!!player.lapCutR;__L.cross();o.best=isFinite(player.best);o.fl=!!fastestLap.you;
        __L.pass(z,'cut');o.k2=tlKind;o.p2=tlPen;__L.pass(z,'cut');o.p3=tlPen;
        tlPen=5;var srt=cars.filter(function(c){return !c.isPlayer&&!c.retired;}).sort(function(a,b){return b.dist-a.dist;}),pace=track.paceSpeed||(track.length/100);
        player.dist=srt[1].dist-0.5;srt[2].dist=player.dist-pace*3.1;for(var i=3;i<srt.length;i++)srt[i].dist=player.dist-pace*(6.5+2*(i-3));
        var before=cars.slice().sort(rankCmp).indexOf(player)+1;finishRace();clearTimeout(raceOutroTimer);o.before=before;o.after=window.__raceOrder.indexOf(player)+1;
        o.ahead=window.__raceOrder[before-1]===srt[2];return o;})()`);
      if (!g.started) r.fail(`${tag}: гонка — секундомер круга не запустился, проверка лучшего круга пустая`);
      if (g.sloppy) r.fail(`${tag}: гонка — неаккуратный проезд засчитан как срезка`);
      if (g.k1 !== 'warn' || g.c1 !== 1 || g.p1 !== 0) r.fail(`${tag}: гонка — первая срезка: ждали предупреждение без штрафа, вышло ${g.k1}, срезок ${g.c1}, штраф ${g.p1}`);
      if (!g.cutLap || g.best || g.fl) r.fail(`${tag}: гонка — круг со срезкой ${g.best ? 'стал лучшим кругом игрока' : ''}${g.fl ? ' и быстрым кругом гонки' : ''}${g.cutLap ? '' : 'не помечен'}`);
      if (g.k2 !== 'pen' || g.p2 !== 5 || g.p3 !== 10) r.fail(`${tag}: гонка — штрафы: ждали 5 и 10 с, вышло ${g.p2} и ${g.p3}`);
      if (g.after !== g.before + 1 || !g.ahead) r.fail(`${tag}: финиш со штрафом 5 с — ждали P${g.before} → P${g.before + 1} (вперёд только отстававший на 3.1 с), вышло P${g.after}`);
      r.line(`  гонка: предупреждение → +5 → +10 с; круг со срезкой не лучший; финиш P${g.before} → P${g.after}`);
    });
  }
  if (!n) r.fail('ни на одной трассе нет зоны срезки (ключ cuts) — пробник ничего не проверил');
  r.note('решение владельца 09.10.2026; мерка и замер — tracks/monaco.md, «Срезка шиканы»');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
