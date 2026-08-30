/* ============================================================================
   Пробник 13 — СХОД СОПЕРНИКА И НЕЙТРАЛИЗАЦИЯ (жёлтые флаги и VSC)

   Проверяется четыре вещи, и все четыре — замером, а не осмотром:

   1. ПОСТАНОВКА. Сошедший болид ставится по МЕСТНОЙ стене, а не по средней
      по кругу: его габарит обязан целиком помещаться внутрь отбойника в любой
      точке любой трассы. Признак «стоит на полотне» (blocking) обязан совпадать
      с настоящей геометрией — по нему выбирается жёлтый флаг или VSC.
      Перебираются ВСЕ точки круга и обе стороны, с обоими знаками угла.

   2. ФЛАГИ. Болид, вставший вне полотна, поднимает жёлтый (40 с) — потолок темпа
      в двух секторах. Болид на полотне поднимает VSC (30 с = 27 + 3 «кончается») —
      потолок на всём круге. Оба потолка ложатся и на игрока: проверяется, что он
      не едет быстрее своего потолка и не отыгрывает у соперника впереди.

   3. ПОД VSC НИКТО НИКОГО НЕ ОБГОНЯЕТ. Настоящим обгоном считается переход
      из «на 6 м позади» в «на 6 м впереди» — длина болида. Машины, едущие
      борт в борт, меняются местами в протоколе на сантиметрах, и это не обгон;
      зазоры в колонне под общим потолком дышат на несколько метров, потому что
      потолок берётся по МЕСТУ на трассе, и соседние болиды стоят в разных местах.
      Отдельно проверяется, что игрок не отыгрывает у того соперника, который
      был впереди в момент включения VSC. ПОТЕРЯТЬ место игрок может: кто
      не держит темп нейтрализации, того объезжают — так и в жизни.

      Это же исключение действует и между соперниками, и до 08.2026 пробник его
      не знал: он требовал НОЛЬ обгонов, а правило (§4-bis) разрешает объезжать
      того, кто провалился ниже половины своего потолка. На двух зёрнах (7 и 91)
      такого не случалось, и пробник казался зелёным; на зёрнах 3, 5, 13 та же
      сборка v1.15.37 его валила. Теперь обгон засчитывается нарушением, только
      если объехали болид, ДЕРЖАВШИЙ темп; разрешённые печатаются заметкой.

   4. ЭВАКУАЦИЯ. По окончании VSC маршалы оттаскивают болид ЗА отбойник,
      и он остаётся в сцене до клетчатого флага — не исчезает.

   Плюс отдельная проверка ловушки: под VSC потолок за пределами трассы
   не должен быть выше потолка на полотне, иначе срезать поворот по траве
   становится выгодно.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

function run(opt) {
  opt = opt || {};
  const r = R.result('Сход соперника: постановка, жёлтый флаг, VSC');

  /* ---- 1. постановка: перебор всех точек круга ---- */
  for (const T of H.tracks()) {
    const env = H.loadGame();
    H.setupWorld(env, { trackIdx: T.idx });
    const g = env.evalIn(`(function(){
      var M=track.M, outWall=0, badFlag=0, onRoad=0, worstOut=0, worstIn=0, n=0, freeMin=1e9;
      for(var i=0;i<M;i++)for(var s=-1;s<=1;s+=2){
        var fake={u:i/M, lane:s*3};
        var sp=retireSpot(fake);
        for(var k=-1;k<=1;k++){                       // угол ставится со случайным знаком и дрожанием ±0.1
          var ang=sp.base*(k||1)+0.1*k;
          var halfW=carHalfWidth(ang), wall=wallAt(sp.i,sp.side);
          var off=Math.min(sp.hw+halfW+0.2, wall-halfW);
          var blocking=off-halfW<sp.hw-0.05;
          n++;
          if(off+halfW>wall+0.01){outWall++;worstOut=Math.max(worstOut,off+halfW-wall);}   // торчит сквозь отбойник
          var intrude=sp.hw-(off-halfW);
          if(intrude>0.01){onRoad++;worstIn=Math.max(worstIn,intrude);}
          if((intrude>0.05)!==blocking)badFlag++;      // признак «мешает» разошёлся с геометрией
        }
        freeMin=Math.min(freeMin,sp.free);
      }
      return {n:n,outWall:outWall,onRoad:onRoad,badFlag:badFlag,
              worstOut:+worstOut.toFixed(2),worstIn:+worstIn.toFixed(2),
              freeMin:+freeMin.toFixed(2),onRoadPct:+(100*onRoad/n).toFixed(1)};
    })()`);
    r.line(`${T.name.padEnd(12)} мест проверено ${String(g.n).padStart(5)} · сквозь отбойник ${g.outWall}`
      + ` · частью на полотне ${g.onRoadPct} % (худшее ${g.worstIn} м) · признак разошёлся ${g.badFlag}`);
    if (g.outWall) r.fail(`${T.name}: сошедший торчит сквозь отбойник в ${g.outWall} местах, худшее ${g.worstOut} м`);
    if (g.badFlag) r.fail(`${T.name}: признак «стоит на полотне» разошёлся с геометрией в ${g.badFlag} местах`);
  }

  /* ---- 2..4. поведение в гонке ---- */
  const seeds = opt.seeds ? String(opt.seeds).split(',').map(Number) : [7, 91];
  for (const T of H.tracks(true)) {
    for (const seed of seeds) {
      const env = H.loadGame({ seed, file: opt.file });
      H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 3 });
      H.startRaceAt(env, 11);
      H.lightsOut(env);
      // сход устраивается принудительно: штатный график сходов случаен и до нужного места может не дойти
      const res = env.evalIn(`(function(){
        var dt=1/60;
        field.forEach(function(c){c.retireAt=0;});
        __drive(Math.round(12/dt),dt,'auto');            // дать полю разъехаться
        var victim=field[3]; victim.retireAt=victim.dist+1;
        var live=function(){return cars.filter(function(c){return !c.retired;}).sort(rankCmp);};
        /* Мерка «ехал ли болид» — своя, независимая от игровой: от темпа ПОЛЯ в этой точке,
           одна для игрока и для ИИ. Обгон прощается, только если обгоняемый ЛИБО встал
           (NEUT_STOPPED), ЛИБО шёл ниже половины темпа поля. Оба условия нужны: игра меряет
           «вставшего» абсолютным порогом, а пробник обязан ловить обгон над тем, кто ехал,
           не повторяя при этом формулу игры дословно. */
        var __bs=field.map(function(c){return c.base;}).sort(function(a,b){return a-b;});
        var FB=__bs[__bs.length>>1], FK=DIFF_CORNERK[sel.diff];
        var idxOf=function(c){return c.isPlayer?(player.hint||0):Math.floor(((c.u%1)+1)%1*track.M)%track.M;};
        var fieldNeut=function(i,nz){return aiTarget(i,0,FB,FK)*neutShare(nz);};
        var PASS=6.04;                                   // обгон = переход из «на корпус позади» в «на корпус впереди»
        var mode0='', modeSecs={}, capBad=0, n=0;
        var max=Math.round(75/dt), yellowCapped=0;
        var pairs=null, ev=[], crawled={}, inY=0, inV=0;
        var gapAhead0=null, gapAheadEnd=null, rank0=null, rankEnd=null, rival=null;
        var gapY0=null, gapYEnd=null, rivalY=null;
        var pRank0=null, pRankEnd=null;
        var floorY=0, floorV=0, breachY=0, breachV=0, breachWho='', firstY='', prevAheadV=0, prevAheadT=0;   // правило «не приближаться»: ниже своего пола падать нельзя
        while(n<max && !raceOver){
          __AP.drive();
          update(dt); n++;
          var m=neutral.mode; if(m)modeSecs[m]=(modeSecs[m]||0)+dt;
          if(!mode0&&m)mode0=m;
          var on=(m&&m!=='green');
          var neut=(m==='vsc'||m==='ending');
          if(!on){ if(m==='green')pairs=null; continue; }

          var L=cars.filter(function(c){return !c.retired;});
          var nz={}, held={};
          for(var q=0;q<L.length;q++){var qc=L[q], qi=idxOf(qc), qn=neutralAt(qi);
            nz[qc.code]=qn;
            held[qc.code]=!(qn && qc.speed<fieldNeut(qi,qn)*0.5);
            if(!held[qc.code])crawled[qc.code]=true;}   // кто хоть раз провалился — того объезжать разрешено (§4-bis)

          /* ОБГОНЫ. Считаются ВСЕ пары, включая пары с игроком в обе стороны, и пары,
             где под ограничением только обгоняемый — это граница зоны, и она тоже нарушение:
             задний, ещё не доехавший до линии сектора, не имеет права проехать мимо того,
             кто уже сбросил темп. Пары, где обгоняемый вообще не под ограничением, — обычная
             гонка на другой стороне круга, они не в счёт. */
          if(!pairs)pairs={};
          {
            for(var a2=0;a2<L.length;a2++)for(var b2=0;b2<L.length;b2++){
              if(a2===b2)continue;
              var A=L[a2], B=L[b2], k=A.code+'>'+B.code, was=pairs[k];
              var now=A.dist-B.dist, sign=now>PASS?1:(now<-PASS?-1:0);
              // защёлка знака, а не снимок первого кадра: пара, стоявшая ближе корпуса,
              // раньше в счёт не попадала вовсе — обгон между ними был невидим
              if(!sign)continue;
              if(was===undefined){pairs[k]=sign;continue;}
              if(was<0 && sign>0){ pairs[k]=sign;
                if(!nz[B.code])continue;                 // обгоняемый не под ограничением — это не зона
                ev.push({t:+raceTime.toFixed(1), v:B.code, mode:neut?'vsc':'yellow',
                         edge:!nz[A.code],
                         txt:k+(A.isPlayer?' (ИГРОК обогнал)':(B.isPlayer?' (обогнали ИГРОКА)':''))
                             +(nz[A.code]?'':' [обгонявший ещё не в зоне]')
                             +' (был позади, стал впереди на '+now.toFixed(1)+' м)',
                         byP:!!A.isPlayer, ofP:!!B.isPlayer});
              } else pairs[k]=sign;
            }
          }

          /* ИГРОК: место и правило «не приближаться». Пол — тот зазор, с которым он вошёл
             под ограничение, но не ближе NEUT_GAP: подъехать с 50 м до 9 правила разрешают,
             ближе 9 — нет. К тому, кто не держит темп, это не относится. */
          var pnz=neutralAt(player.hint||0);
          if(pnz){
            var ord=L.slice().sort(rankCmp), pi=ord.indexOf(player);
            if(pRank0===null)pRank0=pi+1; pRankEnd=pi+1;
            var ahead=pi>0?ord[pi-1]:null;
            if(ahead){
              var g=ahead.dist-player.dist;
              if(raceTime-prevAheadT>0.5){prevAheadV=ahead.speed;prevAheadT=raceTime;}
              if(pnz===1){
                if(rivalY!==ahead){rivalY=ahead;floorY=Math.min(g,NEUT_GAP);if(gapY0===null)gapY0=g;}
                gapYEnd=g;
                if(held[ahead.code]&&!firstY&&g<floorY-0.5){
                  firstY='ПЕРВЫЙ провал за '+ahead.code+' на '+raceTime.toFixed(1)+' с: зазор '+g.toFixed(1)
                    +', игрок '+player.speed.toFixed(1)+' (потолок темпа '+neutralCap(player.hint,player.speed,pnz).toFixed(1)
                    +', правило '+(function(){var b=neutBlocker();return b===null?'нет':b.toFixed(1);})()+')'
                    +', передний '+ahead.speed.toFixed(1)+' (был '+(prevAheadV||0).toFixed(1)+' полсекунды назад)';}
                if(held[ahead.code]){var bY=floorY-g;
                  if(bY>breachY){breachY=bY;
                    breachWho='за '+ahead.code+': зазор '+g.toFixed(1)+' м при поле '+floorY.toFixed(1)
                      +', игрок '+player.speed.toFixed(1)+' м/с, передний '+ahead.speed.toFixed(1)
                      +', правило даёт '+(function(){var b=neutBlocker();return b===null?'НИЧЕГО (передний считается вставшим)':b.toFixed(1);})()
                      +', потолок '+neutralCap(player.hint,player.speed,pnz).toFixed(1);}}
              } else {
                if(rival!==ahead){rival=ahead;floorV=Math.min(g,NEUT_GAP);if(gapAhead0===null)gapAhead0=g;}
                gapAheadEnd=g;
                if(held[ahead.code]){var bV=floorV-g; if(bV>breachV)breachV=bV;}
              }
            }
          }

          if(m==='yellow'){
            inY=pnz?inY+dt:0;                            // въезд в зону идёт на гоночной скорости: 2.5 с на сброс
            if(inY>2.5&&player.speed>neutralCap(player.hint,player.speed,pnz)+3)yellowCapped++;
          }
          if(neut){
            var Lv=live(); var pv=Lv.indexOf(player);
            if(rank0===null)rank0=pv+1; rankEnd=pv+1;
            inV+=dt;                                     // как и у жёлтого, вход в VSC идёт на гоночной скорости: 1.5 с на сброс
            if(inV>1.5&&player.speed>vscCap(player.hint,player.speed)+3)capBad++;
          }
        }
        /* Классифицировать в конце, а не в момент обгона: болид, за которым застряла очередь,
           проваливается ниже половины потолка через секунду-две ПОСЛЕ того, как его объехали. */
        var bad=[], okAllowed=[], badY=[], okY=[], passedPlayer=0, playerPassed=0, edgeBad=0;
        for(var e=0;e<ev.length;e++){var E=ev[e];
          var tgt = E.mode==='vsc' ? (crawled[E.v]?okAllowed:bad) : (crawled[E.v]?okY:badY);
          tgt.push(E.txt);
          if(!crawled[E.v]){ if(E.ofP)passedPlayer++; if(E.byP)playerPassed++; if(E.edge)edgeBad++; }
        }
        var v=victim, i=v.retiredIdx, P=track.P[i], R2=track.R[i];
        var offEnd=((v.x-P.x)*R2.x+(v.z-P.z)*R2.z)*v.retiredSide;
        return {mode0:mode0, secs:modeSecs, overtakes:bad.slice(0,6), nOver:bad.length,
                capBad:capBad, yellowCapped:yellowCapped,
                gained:(gapAhead0===null||gapAheadEnd===null)?null:+(gapAhead0-gapAheadEnd).toFixed(1),
                gainedY:(gapY0===null||gapYEnd===null)?null:+(gapY0-gapYEnd).toFixed(1),
                nOverY:badY.length, overtakesY:badY.slice(0,4),
                nAllowed:okAllowed.length, nAllowedY:okY.length,
                passedPlayer:passedPlayer, playerPassed:playerPassed, edgeBad:edgeBad,
                pRank0:pRank0, pRankEnd:pRankEnd,
                breachY:+breachY.toFixed(1), breachV:+breachV.toFixed(1), breachWho:breachWho, firstY:firstY,
                rank0:rank0, rankEnd:rankEnd,
                blocking0:v.blockedRoad, offEnd:+offEnd.toFixed(2),
                wall:+((v.retiredSide>0?track.WR:track.WL)[i]).toFixed(2),
                inScene:scene.children.indexOf(v.mesh)>=0, blockingEnd:v.blocking,
                retired:cars.filter(function(c){return c.retired;}).length};
      })()`);

      const tag = `${T.name} (зерно ${seed})`;
      const yel = +(res.secs.yellow || 0).toFixed(1), vsc = +(res.secs.vsc || 0).toFixed(1),
            end = +(res.secs.ending || 0).toFixed(1), grn = +(res.secs.green || 0).toFixed(1);
      r.line(`${tag.padEnd(24)} ${res.mode0 === 'vsc' ? 'VSC' : 'жёлтый'} · жёлтый ${yel} с · VSC ${vsc}+${end} с`
        + ` · зелёный ${grn} с`
        + (res.mode0 === 'vsc' ? ` · обгонов под VSC ${res.nOver}` : ` · обгонов под жёлтым ${res.nOverY}`)
        + (res.passedPlayer ? ` · ИГРОКА обогнали ${res.passedPlayer}` : '')
        + (res.playerPassed ? ` · ИГРОК обогнал ${res.playerPassed}` : '')
        + (res.edgeBad ? ` · из них на границе зоны ${res.edgeBad}` : '')
        + ((res.nAllowed + res.nAllowedY) ? ` · объехали вставшего ${res.nAllowed + res.nAllowedY}` : '')
        + (res.pRank0 === null ? '' : ` · место игрока P${res.pRank0}→P${res.pRankEnd}`)
        + ((res.breachY||res.breachV) ? ` · зазор проваливался на ${Math.max(res.breachY,res.breachV)} м` : '')
        + ` · болид стоит в ${res.offEnd} м (стена ${res.wall})`);

      /* Обгоны и место игрока — общая часть для обоих режимов. Пары с игроком считаются
         наравне с остальными: до 08.2026 они выбрасывались, и пробник был зелёным, пока
         игрока обгоняли в каждом заезде (§4-bis). Обгон засчитывается нарушением, только
         если обгоняемый ДЕРЖАЛ темп нейтрализации: объезжать вставшего правила разрешают. */
      if (res.passedPlayer) r.fail(`${tag}: под нейтрализацией игрока обогнали ${res.passedPlayer} раз, и он держал темп`);
      if (res.playerPassed) r.fail(`${tag}: под нейтрализацией игрок обогнал ${res.playerPassed} соперников, державших темп`);
      if (res.edgeBad) r.fail(`${tag}: ${res.edgeBad} обгонов на ГРАНИЦЕ зоны — обгонявший ещё не доехал до линии сектора`);
      /* Место — грубый сторож поверх счёта обгонов: две машины, идущие борт в борт, меняются
         строками на сантиметрах, и это не обгон (та же оговорка, что у башни). Поэтому
         сдвиг на одну позицию только печатается, а валит проба с двух. */
      if (res.pRank0 !== null && res.pRankEnd - res.pRank0 >= 2)
        r.fail(`${tag}: игрок потерял под нейтрализацией ${res.pRankEnd - res.pRank0} позиции (P${res.pRank0}→P${res.pRankEnd})`);

      if (res.mode0 === 'yellow') {
        if (Math.abs(yel - 40) > 0.6) r.fail(`${tag}: жёлтый горел ${yel} с вместо 40`);
        if (res.yellowCapped) r.fail(`${tag}: под жёлтым игрок ${res.yellowCapped} кадров ехал быстрее потолка своего сектора`);
        if (res.breachY > 1.5) r.fail(`${tag}: под жёлтым игрок подобрался к переднему на ${res.breachY} м ближе, чем позволяет правило — ${res.breachWho}\n      ${res.firstY}`);
        if (res.blocking0) r.fail(`${tag}: болид стоит на полотне, а поднят жёлтый вместо VSC`);
        if (res.nOverY) r.fail(`${tag}: в жёлтой зоне состоялось ${res.nOverY} обгонов: ${res.overtakesY.join(', ')}`);
      } else {
        if (Math.abs(vsc + end - 30) > 0.6) r.fail(`${tag}: VSC длился ${(vsc + end).toFixed(1)} с вместо 30`);
        if (res.nOver) r.fail(`${tag}: под VSC состоялось ${res.nOver} обгонов: ${res.overtakes.join(', ')}`);
        if (res.capBad) r.fail(`${tag}: игрок ${res.capBad} кадров ехал быстрее потолка VSC`);
        if (res.breachV > 1.5) r.fail(`${tag}: под VSC игрок подобрался к переднему на ${res.breachV} м ближе, чем позволяет правило`);
        if (res.offEnd < res.wall) r.fail(`${tag}: после эвакуации болид остался перед отбойником (${res.offEnd} м при стене ${res.wall} м)`);
        if (res.blockingEnd) r.fail(`${tag}: после эвакуации болид всё ещё помечен как мешающий`);
      }
      if (Math.abs(grn - 3) > 0.6) r.fail(`${tag}: зелёный флаг показан ${grn} с вместо 3`);
      if (!res.inScene) r.fail(`${tag}: сошедший болид исчез из сцены — он обязан стоять до клетчатого флага`);
    }
  }

  /* ---- 5. ловушка: срезать поворот по траве под VSC не должно быть выгодно ---- */
  for (const T of H.tracks(true)) {
    const env = H.loadGame();
    H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 3 });
    H.startRaceAt(env, 11);
    H.lightsOut(env);
    const t = env.evalIn(`(function(){
      var dt=1/60;
      field.forEach(function(c){c.retireAt=0;});
      // найти медленный поворот, где потолок VSC ниже потолка травы (22 м/с)
      var at=-1, cap=0;
      for(var i=0;i<track.M;i++){var c2=vscCap(i,20);
        if(Math.abs(track.K[i])>0.05 && c2<22 && (at<0||c2<cap)){at=i;cap=c2;}}
      if(at<0)return {none:true};
      neutral={mode:'vsc',left:60,secs:[],cars:[]};       // включить нейтрализацию вручную
      var P=track.P[at],R2=track.R[at],F=track.F[at];
      var off=Math.min(halfAt(at)+1.2, (track.WR[at]||99)-1.2);   // за кромкой, но НЕ в отбойнике
      player.x=P.x+R2.x*off;player.z=P.z+R2.z*off;player.hdg=Math.atan2(F.x,F.z);
      player.speed=22;player.hint=at;                     // ровно потолок травы: без правки он бы там и остался
      var start=player.speed, top=0;
      for(var f=0;f<30;f++){controls.gas=1;controls.brake=0;controls.left=controls.right=0;
        update(dt); if(player.speed>top)top=player.speed;}
      var pr=project(player.x,player.z,player.hint);
      return {at:at,cap:+cap.toFixed(1),grass:22,start:start,top:+top.toFixed(1),end:+player.speed.toFixed(1),
              offRoad:Math.abs(pr.off)>halfAt(pr.idx)+0.7};
    })()`);
    if (t.none) { r.line(`${T.name.padEnd(12)} медленных поворотов с потолком ниже травы нет`); continue; }
    r.line(`${T.name.padEnd(12)} за кромкой под VSC: потолок полотна ${t.cap}, травы 22 — с 22 м/с за полсекунды ${t.end}`);
    if (t.end > t.cap + 2) r.fail(`${T.name}: за кромкой под VSC держит ${t.end} м/с при потолке полотна ${t.cap} — срезать поворот по траве выгодно`);
  }

  /* ---- 6. ПЛАШКИ ФЛАГОВ: панель обязана совпадать с потолком, а не жить своей жизнью ----

     До v1.15.40 зелёный флаг показывался НА ВСЁМ КРУГЕ, хотя жёлтый горит в двух секторах:
     владелец видел «ЗЕЛЁНЫЙ ФЛАГ» на другой стороне трассы, ни разу не увидев жёлтого,
     и это читалось как вспышка на ровном месте. Плюс жёлтая плашка гасла молча — игрок
     не мог понять, действует ли ещё ограничение. Проверяется три вещи:
       - жёлтая плашка горит РОВНО пока действует потолок (0 расходящихся кадров);
       - на выезде из зоны загорается «КОНЕЦ ЗОНЫ» на 3 с;
       - зелёный флаг НЕ показывается вне секторов, где горел жёлтый.                     */
  for (const T of H.tracks(true)) {
    for (const mode of ['выезд', 'конец флага']) {
      const env = H.loadGame();
      H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 3 });
      H.startRaceAt(env, 11);
      H.noRetirements(env);
      H.lightsOut(env);
      const u = env.evalIn(`(function(){
        var dt=1/60, short=${mode === 'конец флага' ? 'true' : 'false'};
        for(var f=0;f<12*60;f++){__AP.drive();update(dt);}
        var p0=project(player.x,player.z,player.hint);
        // "конец флага": зона вокруг игрока и флаг гаснет через 2 с — он точно ещё внутри
        var s=sectorAt(p0.idx/track.M+(short?1/240:1/24)), prev=(s+MARSHAL_SECTORS-1)%MARSHAL_SECTORS;
        neutral={mode:'yellow',left:short?2.0:YELLOW_SECS,secs:[prev,s],cars:[]};
        try{zoneOut=0;wasInZone=false;greenSeen=false;}catch(e){}   // до v1.15.40 этих переменных нет — пробник обязан работать и на архивной сборке
        var capT=0,yelT=0,endT=0,grnT=0,mism=0,grnOut=0;
        for(var f=0;f<(short?12:50)*60;f++){
          __AP.drive();update(dt);
          // Сверять надо с player.hint: ИМЕННО его читают и потолок (в физике игрока),
          // и панель. Своя проекция здесь — третья величина: после расталкивания игрок
          // сдвигается ещё раз, и на границе сектора она расходится с обеими на кадр.
          var pr={idx:player.hint||0};
          var cap=neutralAt(pr.idx)===1;                       // потолок жёлтого действует прямо сейчас
          var h=document.getElementById('flagpanel').innerHTML;
          var yel=h.indexOf('ЖЁЛТЫЙ')>=0, end=h.indexOf('КОНЕЦ')>=0, grn=h.indexOf('ЗЕЛЁНЫЙ')>=0;
          if(cap)capT+=dt; if(yel)yelT+=dt; if(end)endT+=dt; if(grn)grnT+=dt;
          if(cap!==yel)mism++;
          if(grn&&grnT<=dt*1.5&&neutral.secs.indexOf(sectorAt(pr.idx/track.M))<0)grnOut++;   // зелёный защёлкивается: важно, где он ЗАГОРЕЛСЯ
        }
        return {capT:+capT.toFixed(1),yelT:+yelT.toFixed(1),endT:+endT.toFixed(1),
                grnT:+grnT.toFixed(1),mism:mism,grnOut:grnOut};
      })()`);
      const tag = `${T.name} (${mode})`;
      r.line(`${tag.padEnd(28)} потолок ${u.capT} с · жёлтая плашка ${u.yelT} с · «конец зоны» ${u.endT} с · зелёный ${u.grnT} с`);
      if (u.mism) r.fail(`${tag}: плашка и потолок разошлись на ${u.mism} кадров — панель обязана гореть ровно пока действует ограничение`);
      if (u.grnOut) r.fail(`${tag}: зелёный флаг ЗАГОРЕЛСЯ вне секторов, где горел жёлтый`);
      if (mode === 'выезд' && Math.abs(u.endT - 3) > 0.6)
        r.fail(`${tag}: «КОНЕЦ ЗОНЫ» показан ${u.endT} с вместо 3 — выезд из зоны обязан быть виден`);
      if (mode === 'конец флага' && Math.abs(u.grnT - 3) > 0.6)
        r.fail(`${tag}: флаг погас при игроке в зоне — зелёный показан ${u.grnT} с вместо 3`);
    }
  }

  /* ---- 7. ВСТАВШИЙ БОЛИД НЕ ЗАЕДАЕТ ПОТОК ПОД ФЛАГОМ ----

     Вопрос владельца: если игрок встанет под жёлтым, не остановит ли он весь пелотон?
     Замер 08.2026 сказал «да»: правило «объезжать можно того, кто не держит темп»
     срабатывало, первые 1–5 машин объезжали, а задние вставали намертво. Причина
     оказалась двойной, и обе — в общем коде, а не в нейтрализации:
       - профиль подтягивания пришпиливал к НУЛЮ того, кто уже решил объезжать,
         а на нуле болид не может выехать из полосы: на нуле двигаются только полосы,
         а они запираются (тяга к линии обгона и отталкивание от соседа уравновешиваются
         на ~1.9 м — внутри окна «в моей полосе» 2.3 м);
       - все, кто едет за вставшим, читают ОДНУ И ТУ ЖЕ его полосу, выбирают одну
         и ту же сторону объезда и запирают друг друга.
     Проверяется на игроке, потому что он — самый вероятный вставший болид: у соперника
     сход ставит болид за кромку, а игрок останавливается там, где стоял.                */
  for (const T of H.tracks(true)) {
    for (const seed of seeds) {                      // seeds уже разобраны выше: по строке цикл шёл посимвольно, и в подписи стояло «зерно ,»
      const env = H.loadGame({ seed });
      H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 3 });
      H.startRaceAt(env, 11);
      H.noRetirements(env);
      H.lightsOut(env);
      const j = env.evalIn(`(function(){
        var dt=1/60;
        for(var f=0;f<15*60;f++){__AP.drive();update(dt);}
        var p0=project(player.x,player.z,player.hint);
        var s=sectorAt(p0.idx/track.M), prev=(s+MARSHAL_SECTORS-1)%MARSHAL_SECTORS, nxt=(s+1)%MARSHAL_SECTORS;
        neutral={mode:'yellow',left:9999,secs:[prev,s,nxt],cars:[]};   // флаг на весь замер: интересует правило, а не 40 с
        try{zoneOut=0;wasInZone=false;greenSeen=false;}catch(e){}
        var behind=field.filter(function(c){return !c.retired&&c.dist<player.dist;});
        var reached={}, passed={}, t=0;
        for(var f=0;f<25*60;f++){
          controls.gas=0;controls.brake=1;controls.left=controls.right=0;   // игрок стоит
          update(dt);t+=dt;
          behind.forEach(function(c){
            var d=player.dist-c.dist;
            if(d<25&&d>-6&&reached[c.name]===undefined)reached[c.name]=t;    // реально упёрся в игрока
            if(reached[c.name]!==undefined&&passed[c.name]===undefined&&c.dist>player.dist+6)passed[c.name]=t;});
        }
        var stuck=[];
        Object.keys(reached).forEach(function(k){
          if(passed[k]===undefined){
            var c=field.filter(function(x){return x.name===k;})[0];
            stuck.push(k+' в '+(player.dist-c.dist).toFixed(0)+' м на '+c.speed.toFixed(1)+' м/с');}});
        return {reached:Object.keys(reached).length, passed:Object.keys(passed).length, stuck:stuck.join(', ')};
      })()`);
      const tag = `${T.name} (зерно ${seed})`;
      r.line(`${tag.padEnd(24)} игрок встал под жёлтым: упёрлись ${j.reached}, объехали ${j.passed}`);
      if (j.stuck) r.fail(`${tag}: за вставшим игроком встали под флагом — ${j.stuck}`);
    }
  }

  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
