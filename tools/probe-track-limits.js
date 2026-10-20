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
     • финиш: соперник в 4.6 с позади (по журналу пробника) встаёт впереди игрока со штрафом 5 с, в 5.4 с — нет;
       секундомер точек трассы называет их отставание с точностью 0.02 с (v1.16.63; до неё — подстановка
       дистанции по paceSpeed, 3.1 и 6.5 с).
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

/* «Верни позицию» (v1.16.89, владелец 20.10.2026): первая срезка, выигравшая позиции, — пропустить обогнанных за TL_RET_SECS,
   иначе +TL_PEN. Часть 1 — правило по шагам: дистанции соперников ставит пробник, кадры не крутятся (tlRetStep зовётся сам);
   часть 2 — живой заезд: игрок в тоннеле за соперником, газ в пол по выезду, потом уступает, отъехав вбок на 3 м (замер
   yield-back-audit: так за 15 с пропускают почти всегда). */
const RET_SRC = `
var __R={
 setup:function(){tlReset();towerOrd=null;neutral={mode:'',left:0,secs:[],cars:[]};raceOver=false;raceOutro=false;
   var a=cars.filter(function(c){return !c.isPlayer;});a.forEach(function(c,i){c.retired=false;c.fail=null;c.err=null;c.spinPend=null;c.dist=900-i*10;});
   player.dist=1000;a[0].dist=1010;a[1].dist=1020;a[2].dist=1200;return a;},
 /* проезд зоны: въезд, срезка, выезд; до выезда игрок встаёт на дистанцию pd */
 pass:function(zi,pd,before){var z=track.spec.cuts[zi],iIn=__L.iAt(z.fromS+30),sg=z.side==='R'?1:-1;
   checkCut(__L.iAt(z.fromS-10),0);checkCut(iIn,0);checkCut(iIn,sg*(halfAt(iIn)+z.depth+2));player.dist=pd;if(before)before();checkCut(__L.iAt(z.toS+10),0);},
 run:function(sec){for(var t=0;t<sec-1e-9&&tlRet;t+=0.1)tlRetStep(0.1);},
 plate:function(){renderFlagUI();var e=document.getElementById('flagpanel');return e.className+' | '+e.innerHTML;},
 codes:function(){return tlRet?tlRet.cars.map(function(t){return t.c.code+(t.done?':'+t.done:'');}).join(','):'';}
};`;
function retCheck(r, T, zi, tag) {
  const env = H.loadGame({ seed: 11 });
  H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal' });
  env.evalIn(SRC); env.evalIn(RET_SRC);
  H.startRaceAt(env, 22); H.lightsOut(env); H.noRetirements(env);
  const u = env.evalIn(`(function(){var o={},a;totalLaps=99;
    /* 1. выиграл две позиции: A и B впереди на въезде, позади на выезде; C впереди и остался */
    a=__R.setup();__R.pass(${zi},1030);o.t1=__R.codes();o.k1=tlKind;o.pl1=tlPlate;o.pos1=tlRetPos();o.plate1=__R.plate();
    __R.run(1);o.left1=tlRet.left;neutral.mode='vsc';__R.run(5);o.leftV=tlRet.left;o.plateV=__R.plate();neutral.mode='';
    a[0].dist=player.dist+TOWER_HYST-0.5;__R.run(0.1);o.near=__R.codes();   // нос впереди, но не на корпус — ещё не пропустил
    a[0].dist=player.dist+TOWER_HYST+1;__R.run(0.1);o.t2=__R.codes();o.pos2=tlRetPos();o.plate2=__R.plate();
    a[1].retired=true;__R.run(0.1);o.k3=tlKind;o.ret3=!!tlRet;o.pen3=tlPen;o.plate3=__R.plate();
    /* 2. не пропустил — штраф ровно на 15-й секунде */
    a=__R.setup();__R.pass(${zi},1030);__R.run(TL_RET_SECS-0.2);o.pen4a=tlPen;__R.run(0.4);o.pen4=tlPen;o.k4=tlKind;o.why4=tlRetPen;o.plate4=__R.plate();
    /* 3. ошибся и развернулся — засчитаны, уступать некому */
    a=__R.setup();__R.pass(${zi},1030);a[0].err={d0:0,side:1,lead:0,toAp:1,toEx:2};__R.run(0.1);o.t5=__R.codes();
    a[1].fail={on:true,kind:'spin',ret:false};__R.run(0.1);o.k5=tlKind;o.pen5=tlPen;
    /* 4. без выигрыша — ничего; обогнал одного — только он */
    a=__R.setup();__R.pass(${zi},1005);o.t6=!!tlRet;o.k6=tlKind;
    a=__R.setup();__R.pass(${zi},1015);o.t7=__R.codes();
    /* 5. ошибавшийся на выезде обогнан не срезкой — не в счёт */
    a=__R.setup();__R.pass(${zi},1030,function(){a[0].err={d0:0,side:1,lead:0,toAp:1,toEx:2};});o.t8=__R.codes();
    /* 6. вторая срезка с выигрышем — только +5, без «верни» */
    a=__R.setup();__R.pass(${zi},1005);a[0].dist=1040;a[1].dist=1050;__R.pass(${zi},1060);o.t9=!!tlRet;o.pen9=tlPen;o.k9=tlKind;
    /* 7. финиш, пока отсчёт стоит под VSC: невозвращённые впереди, без штрафа */
    a=__R.setup();__R.pass(${zi},1030);neutral.mode='vsc';__R.run(3);finishRace();clearTimeout(raceOutroTimer);
    var ro=window.__raceOrder,ip=ro.indexOf(player);o.fin=ip>ro.indexOf(a[0])&&ip>ro.indexOf(a[1])&&ip===3;o.pen10=tlPen;o.out10=(tlRetOut||[]).length;
    o.ord10=ro[ip-2]===a[1]&&ro[ip-1]===a[0];   // между собой — в своём порядке: B (1020) впереди A (1010)
    /* башня после такого финиша (v1.16.90): у игрока «УСТУПИЛ», следующий — от того, кому игрок отдал позицию, а не от самого игрока */
    cars.forEach(function(c){if(c.tm){c.tm.pd=0;c.tm.pt=0;}});raceTime=10;   // секундомеры: все шли ровно от 0 — отставания у разных пар разные
    raceOutro=true;o.cell10=towerGapText(a[0],player);o.self10=gapSec(player,ro[ip+1]);o.next10=towerGap(player,ro[ip+1]);o.want10=gapSec(a[0],ro[ip+1]);o.cellA=towerGapText(a[1],a[0]);raceOutro=false;
    showRaceResult();o.res10=document.getElementById('rGap').innerHTML;
    return o;})()`);
  const bad = [];
  if (u.t1.split(',').length !== 2 || u.k1 !== 'warn' || u.pl1 !== 0)
    bad.push(`выиграл две позиции: ждали двух обогнанных и плашку «верни» вместо предупреждения, вышло «${u.t1}», ${u.k1}, плашка ${u.pl1}`);
  if (u.pos1 !== 4 || !/ВЕРНИ 4 ПОЗИЦИЮ/.test(u.plate1) || !/tlret/.test(u.plate1) || !/tlcd">15</.test(u.plate1))
    bad.push(`плашка: ждали «ВЕРНИ 4 ПОЗИЦИЮ» и отсчёт 15, вышло позиция ${u.pos1}: ${u.plate1.slice(0, 160)}`);
  if (Math.abs(u.left1 - 14) > 1e-6 || Math.abs(u.leftV - 14) > 1e-6 || !/vsc/.test(u.plateV))
    bad.push(`отсчёт: ждали 14 с после секунды и 14 с после 5 с под VSC (на плашке VSC), вышло ${u.left1.toFixed(2)} и ${u.leftV.toFixed(2)}`);
  if (/:ok/.test(u.near)) bad.push(`соперник впереди меньше чем на корпус засчитан пропущенным: ${u.near}`);
  if (!/:ok/.test(u.t2) || u.pos2 !== 4 || !/ВЕРНИ 4 ПОЗИЦИЮ/.test(u.plate2) || !/tlchip ok/.test(u.plate2))
    bad.push(`один пропущен: ждали отметку и ту же 4 позицию, вышло ${u.t2}, позиция ${u.pos2}`);
  if (u.k3 !== 'retok' || u.ret3 || u.pen3 !== 0 || !/ПОЗИЦИЯ ВОЗВРАЩЕНА/.test(u.plate3))
    bad.push(`второй сошёл: ждали «ПОЗИЦИЯ ВОЗВРАЩЕНА» без штрафа, вышло ${u.k3}, штраф ${u.pen3}`);
  if (u.pen4a !== 0 || u.pen4 !== 5 || u.k4 !== 'retpen' || !u.why4 || !/ПОЗИЦИЯ НЕ ВОЗВРАЩЕНА ЗА 15 С/.test(u.plate4))
    bad.push(`не пропустил: ждали +5 ровно на 15-й секунде, вышло ${u.pen4a} → ${u.pen4}, ${u.k4}`);
  if (!/:ошибка/.test(u.t5) || u.k5 !== 'retnone' || u.pen5 !== 0)
    bad.push(`ошибка и разворот обогнанных: ждали «уступать некому» без штрафа, вышло ${u.t5}, ${u.k5}, штраф ${u.pen5}`);
  if (u.t6 || u.k6 !== 'warn') bad.push(`срезка без выигрыша: ждали одно предупреждение, вышло «верни» ${u.t6}, ${u.k6}`);
  if (u.t7.split(',').length !== 1) bad.push(`обогнал одного: ждали одного в списке, вышло ${u.t7}`);
  if (u.t8.split(',').length !== 1) bad.push(`ошибавшийся на выезде попал в список: ${u.t8}`);
  if (u.t9 || u.pen9 !== 5 || u.k9 !== 'pen') bad.push(`вторая срезка с выигрышем: ждали только +5, вышло «верни» ${u.t9}, штраф ${u.pen9}, ${u.k9}`);
  if (!u.fin || u.pen10 !== 0 || u.out10 !== 2 || !/поставлены впереди/.test(u.res10))
    bad.push(`финиш под VSC с отсчётом: ждали обоих впереди (игрок P4) без штрафа и строку в итогах, вышло ${u.fin}, штраф ${u.pen10}, ${u.out10}`);
  if (!u.ord10) bad.push('финиш под VSC с отсчётом: поставленные впереди стоят между собой не в своём порядке');
  if (u.cell10 !== 'УСТУПИЛ' || !/^\+\d/.test(u.cellA) || Math.abs(u.next10 - u.want10) > 1e-9 || !(Math.abs(u.self10 - u.want10) > 0.05))
    bad.push(`башня после финиша с отданной позицией: ждали у игрока «УСТУПИЛ», у следующего — отставание от отданного (${u.want10.toFixed(3)}), вышло «${u.cell10}» и ${u.next10.toFixed(3)}`);
  bad.forEach(b => r.fail(`${tag}: верни позицию — ${b}`));
  if (!bad.length) r.line(`  верни позицию: две позиции → «ВЕРНИ 4 ПОЗИЦИЮ», 15 с, под VSC стоит; пропустил на корпус / сошёл → возвращена; 15 с → +5; ошибка и разворот засчитаны; без выигрыша, второй срезкой и ошибавшийся — без «верни»; финиш под VSC — оба впереди без штрафа, в башне «УСТУПИЛ», следующий — от отданного`);

  // часть 2: живой заезд — срезка газом в пол за соперником, уступка вбок на 3 м вполсилы
  const env2 = H.loadGame({ seed: 11 });
  H.setupWeekend(env2, { trackIdx: T.idx, diff: 'normal' });
  env2.evalIn(SRC);
  H.startRaceAt(env2, 22); H.lightsOut(env2); H.noRetirements(env2);
  const live = env2.evalIn(`(function(){totalLaps=99;var z=track.spec.cuts[${zi}],L=track.length,M=track.M,sg=z.side==='R'?1:-1,A=track.P[__L.iAt(z.toS+4)];
    function sOf(c){return track.S[Math.floor((((c.u%1)+1)%1)*M)%M];}
    function steer(tx,tz){var d=Math.atan2(tx-player.x,tz-player.z)-player.hdg;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;controls.left=-d*2.4<-0.12?1:0;controls.right=-d*2.4>0.12?1:0;}
    function side(off){var pr=project(player.x,player.z,player.hint),j=(pr.idx+Math.max(3,Math.round(3+player.speed*0.12)))%M;steer(track.P[j].x+track.R[j].x*off,track.P[j].z+track.R[j].z*off);return pr.idx;}
    var X=null,f;
    for(f=0;f<60*200&&!X;f++){__AP.drive();update(1/60);if(raceTime<120)continue;   // поле растянулось — ищем соперника в тоннеле, за ним место
      cars.some(function(c){var q=sOf(c);if(c.isPlayer||c.retired||c.err||c.fail||q<z.fromS-340||q>z.fromS-300)return false;var gm=0.5*c.speed;
        if(!cars.every(function(o){return o===c||o.isPlayer||Math.abs(o.dist-(c.dist-gm))>12;}))return false;
        var i0=__L.iAt(q-gm),P=track.P[i0],F=track.F[i0];player.x=P.x;player.z=P.z;player.hdg=Math.atan2(F.x,F.z);player.speed=c.speed;player.yawLag=0;
        player.hint=i0;player.prevIdx=i0;player.arcPrev=track.S[i0];player.dist=c.dist-gm;player.lapLock=60;X=c;return true;});}
    if(!X)return {err:'не нашли соперника в тоннеле'};
    var o={x:X.code},t0=-1,plate='';
    for(f=0;f<60*60;f++){var s=track.S[player.hint];
      if(t0<0){if(s>=z.fromS-20&&s<=z.toS+4)steer(A.x,A.z);else if(s>=z.fromS-200&&s<z.fromS-20)side(4*sg);else __AP.drive();controls.gas=1;controls.brake=0;}
      else{var ix=side(3);var v=__AP.safeSpeed(ix)*0.5;controls.gas=player.speed<v?1:0;controls.brake=player.speed>v+1?1:0;}
      update(1/60);
      if(t0<0&&tlRet){t0=raceTime;o.n=tlRet.cars.length;o.codes=tlRet.cars.map(function(t){return t.c.code;}).join(',');plate=document.getElementById('flagpanel').innerHTML;}
      if(t0<0&&track.S[player.hint]>z.toS+60&&track.S[player.hint]<z.toS+400){o.noGain=true;break;}
      if(t0>=0&&!tlRet){o.sec=raceTime-t0;break;}}
    o.k=tlKind;o.pen=tlPen;o.plate=/ВЕРНИ \\d+ ПОЗИЦИЮ/.test(plate);return o;})()`);
  if (live.err || live.noGain) r.fail(`${tag}: верни позицию, живой заезд — ${live.err || 'срезка за ' + live.x + ' не выиграла позиций'}`);
  else if (live.k !== 'retok' || live.pen !== 0 || !live.plate || !(live.sec <= 15))
    r.fail(`${tag}: верни позицию, живой заезд — обогнал ${live.codes}, уступил вбок вполсилы: ждали «возвращена» за ≤15 с без штрафа, вышло ${live.k} за ${live.sec && live.sec.toFixed(1)} с, штраф ${live.pen}${live.plate ? '' : ', плашки «ВЕРНИ» не было'}`);
  else r.line(`  живой заезд: срезка за ${live.x} обогнала ${live.codes}; отъехал вбок вполсилы — пропустил за ${live.sec.toFixed(1)} с, штрафа нет`);
}

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
        /* финиш (v1.16.63): штраф — по секундомеру точек трассы. Игрок честно едет 50 с, пробник пишет свой журнал
           «время, дистанция»; соперники встают туда, где игрок был 4.6 и 5.4 с назад (прежняя мерка на финише Монако
           называла 4.6 настоящих секунды больше чем 5 — штраф его не пропускал), остальные — дальше 7 с */
        var lt=[raceTime],ld=[player.dist];for(var k=0;k<60*50;k++){__AP.drive();update(1/60);lt.push(raceTime);ld.push(player.dist);}
        function at(sec){var T=raceTime-sec;for(var j=lt.length-1;j>0;j--)if(lt[j-1]<=T&&T<=lt[j])return ld[j-1]+(ld[j]-ld[j-1])*(T-lt[j-1])/(lt[j]-lt[j-1]);return NaN;}
        tlPen=5;var srt=cars.filter(function(c){return !c.isPlayer&&!c.retired;});
        srt[0].dist=player.dist+80;srt[1].dist=player.dist+40;srt[2].dist=at(4.6);srt[3].dist=at(5.4);for(var i=4;i<srt.length;i++)srt[i].dist=at(7+2*(i-4));
        o.g46=gapSec(player,srt[2]);o.g54=gapSec(player,srt[3]);o.old46=(player.dist-srt[2].dist)/(track.paceSpeed||(track.length/100));
        var before=cars.slice().sort(rankCmp).indexOf(player)+1;finishRace();clearTimeout(raceOutroTimer);o.before=before;o.after=window.__raceOrder.indexOf(player)+1;
        o.ahead=window.__raceOrder[before-1]===srt[2];
        /* башня после финиша (v1.16.64): отставания — по итоговому времени игрока с +5 с, а не по месту на трассе
           (было: у игрока +0.000, у идущего следом — полный разрыв, без вычета штрафа) */
        raceOutro=true;var ro=window.__raceOrder,ip=ro.indexOf(player);o.tUp=towerGap(ro[ip-1],player);o.tDn=towerGap(player,ro[ip+1]);o.dn=ro[ip+1]===srt[3];
        raceOutro=false;return o;})()`);
      if (!g.started) r.fail(`${tag}: гонка — секундомер круга не запустился, проверка лучшего круга пустая`);
      if (g.sloppy) r.fail(`${tag}: гонка — неаккуратный проезд засчитан как срезка`);
      if (g.k1 !== 'warn' || g.c1 !== 1 || g.p1 !== 0) r.fail(`${tag}: гонка — первая срезка: ждали предупреждение без штрафа, вышло ${g.k1}, срезок ${g.c1}, штраф ${g.p1}`);
      if (!g.cutLap || g.best || g.fl) r.fail(`${tag}: гонка — круг со срезкой ${g.best ? 'стал лучшим кругом игрока' : ''}${g.fl ? ' и быстрым кругом гонки' : ''}${g.cutLap ? '' : 'не помечен'}`);
      if (g.k2 !== 'pen' || g.p2 !== 5 || g.p3 !== 10) r.fail(`${tag}: гонка — штрафы: ждали 5 и 10 с, вышло ${g.p2} и ${g.p3}`);
      if (!(Math.abs(g.g46 - 4.6) < 0.02 && Math.abs(g.g54 - 5.4) < 0.02)) r.fail(`${tag}: секундомер на финише — соперники в 4.6 и 5.4 с позади названы ${g.g46.toFixed(3)} и ${g.g54.toFixed(3)} с`);
      if (g.after !== g.before + 1 || !g.ahead) r.fail(`${tag}: финиш со штрафом 5 с — ждали P${g.before} → P${g.before + 1} (вперёд только отстававший на 4.6 с, не на 5.4), вышло P${g.after}`);
      if (!g.dn || !(Math.abs(g.tUp - 0.4) < 0.02 && Math.abs(g.tDn - 0.4) < 0.02)) r.fail(`${tag}: башня после финиша со штрафом — ждали у игрока +0.400 (5 − 4.6) и у следующего +0.400 (5.4 − 5), вышло ${g.tUp.toFixed(3)} и ${g.tDn.toFixed(3)}`);
      else r.line(`  башня после финиша: игрок +${g.tUp.toFixed(3)} от вставшего вперёд, следующий +${g.tDn.toFixed(3)} — с учётом штрафа`);
      r.line(`  гонка: предупреждение → +5 → +10 с; круг со срезкой не лучший; финиш P${g.before} → P${g.after}`);
      r.line(`  финиш: позади 4.6 и 5.4 с — секундомер ${g.g46.toFixed(3)} и ${g.g54.toFixed(3)} с (прежняя мерка назвала бы 4.6 с ${g.old46.toFixed(2)})`);
      retCheck(r, T, zi, tag);
    });
  }
  if (!n) r.fail('ни на одной трассе нет зоны срезки (ключ cuts) — пробник ничего не проверил');
  r.note('решение владельца 09.10.2026; мерка и замер — tracks/monaco.md, «Срезка шиканы»');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
