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
      const env = H.loadGame({ seed });
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
        var mode0='', modeSecs={}, overtakes=[], capBad=0, n=0;
        var max=Math.round(75/dt), yellowCapped=0, playerPassed=0;
        var pairs=null, pairsY=null, overtakesY=[], crawled={}, allowedY=[], allowed=[];
        var gapAhead0=null, gapAheadEnd=null, rank0=null, rankEnd=null, rival=null;
        var gapY0=null, gapYEnd=null, rankY0=null, rivalY=null, inY=0, inV=0;
        while(n<max && !raceOver){
          __AP.drive();
          update(dt); n++;
          var m=neutral.mode; if(m)modeSecs[m]=(modeSecs[m]||0)+dt;
          if(m&&m!=='green'){                              // кто под флагом провалился ниже ПОЛОВИНЫ своего потолка — того правила разрешают объезжать (§4-bis), и это не нарушение
            var Ls=cars.filter(function(c){return !c.retired&&!c.isPlayer;});
            for(var si=0;si<Ls.length;si++){var sc=Ls[si];
              var sidx=Math.floor(((sc.u%1)+1)%1*track.M)%track.M, snz=neutralAt(sidx);
              if(snz&&sc.speed<neutralCap(sidx,sc.speed,snz)*0.5)crawled[sc.code]=true;}}
          if(!mode0&&m)mode0=m;
          var neut=(m==='vsc'||m==='ending');
          if(m==='yellow'){                                // жёлтый: в своих секторах потолок обязан быть наложен
            var nzP=neutralAt(player.hint);
            inY=nzP?inY+dt:0;                              // въезд в зону идёт на гоночной скорости: 2.5 с на сброс
            if(inY>2.5&&player.speed>neutralCap(player.hint,player.speed,nzP)+3)yellowCapped++;
            if(nzP){var Ly=cars.filter(function(c){return !c.retired;}).sort(rankCmp);
              var py=Ly.indexOf(player);
              if(rankY0===null){rankY0=py+1;rivalY=py>0?Ly[py-1]:null;}
              if(rivalY){var gy=rivalY.dist-player.dist; if(gapY0===null)gapY0=gy; gapYEnd=gy;}}
          }
          if(m==='yellow'){                                // обгонов не должно быть и в жёлтой зоне — но считаем
            var Lz=live().filter(function(c){                // только пары, где ОБА в ней: снаружи гонка идёт как шла
              return neutralAt(c.isPlayer?player.hint:Math.floor(((c.u%1)+1)%1*track.M)%track.M);});
            if(!pairsY){pairsY={};
              for(var ay=0;ay<Lz.length;ay++)for(var by=0;by<Lz.length;by++)if(ay!==by)
                pairsY[Lz[ay].code+'>'+Lz[by].code]=Lz[ay].dist-Lz[by].dist;
            } else {
              for(var ay2=0;ay2<Lz.length;ay2++)for(var by2=0;by2<Lz.length;by2++){
                if(ay2===by2)continue;
                if(Lz[ay2].isPlayer||Lz[by2].isPlayer)continue;    // пары с игроком — отдельно, по отыгранным метрам:
                var ky=Lz[ay2].code+'>'+Lz[by2].code, wasy=pairsY[ky];   // ПОТЕРЯТЬ место под флагом можно, отыграть — нет
                if(wasy===undefined){pairsY[ky]=Lz[ay2].dist-Lz[by2].dist;continue;}
                var nowy=Lz[ay2].dist-Lz[by2].dist;
                if(wasy<-6&&nowy>6){pairsY[ky]=nowy;
                  var txty=ky+' ('+wasy.toFixed(1)+' -> '+nowy.toFixed(1)+')';
                  overtakesY.push({t:txty,v:Lz[by2].code});}
              }
            }
          }
          if(neut){
            var L=live();
            var pi=L.indexOf(player);
            if(rank0===null){rank0=pi+1;rival=pi>0?L[pi-1]:null;}    // ЗАПОМНИТЬ соперника: по ходу VSC впереди может оказаться другой
            rankEnd=pi+1;
            if(rival){var gp=rival.dist-player.dist;
              if(gapAhead0===null)gapAhead0=gp; gapAheadEnd=gp;}
            if(!pairs){                                   // снимок «кто за кем» на входе в нейтрализацию
              pairs={};
              for(var a=0;a<L.length;a++)for(var b=0;b<L.length;b++)if(a!==b)
                pairs[L[a].code+'>'+L[b].code]=L[a].dist-L[b].dist;
            } else {
              for(var a2=0;a2<L.length;a2++)for(var b2=0;b2<L.length;b2++){
                if(a2===b2)continue;
                if(L[a2].isPlayer||L[b2].isPlayer)continue;         // пары с игроком считаются отдельно, по отыгранным метрам
                var k=L[a2].code+'>'+L[b2].code, was=pairs[k];
                if(was===undefined)continue;
                var now=L[a2].dist-L[b2].dist;
                if(was<-6&&now>6){pairs[k]=now;
                  var txt=k+' ('+was.toFixed(1)+' -> '+now.toFixed(1)+')';
                  overtakes.push({t:txt,v:L[b2].code});}
              }
            }
            inV+=dt;                                     // как и у жёлтого, вход в VSC идёт на гоночной скорости: дать 1.5 с на сброс.
            if(inV>1.5&&player.speed>vscCap(player.hint,player.speed)+3)capBad++;   // без этого пробник ловил ровно 3 кадра (0.05 с) сразу после включения — сброс, а не нарушение
          }
          if(m==='green'&&pairs)pairs=null;
        }
        // Классифицировать в конце, а не в момент обгона: болид, за которым застряла очередь,
        // проваливается ниже половины потолка через секунду-две ПОСЛЕ того, как его объехали.
        var sift=function(arr){var bad=[],ok=[];
          for(var q=0;q<arr.length;q++)(crawled[arr[q].v]?ok:bad).push(arr[q].t);
          return {bad:bad,ok:ok};};
        var sY=sift(overtakesY), sV=sift(overtakes);
        overtakesY=sY.bad; allowedY=sY.ok; overtakes=sV.bad; allowed=sV.ok;
        var v=victim, i=v.retiredIdx, P=track.P[i], R2=track.R[i];
        var offEnd=((v.x-P.x)*R2.x+(v.z-P.z)*R2.z)*v.retiredSide;
        return {mode0:mode0, secs:modeSecs, overtakes:overtakes.slice(0,6), nOver:overtakes.length,
                capBad:capBad, yellowCapped:yellowCapped,
                gained:(gapAhead0===null||gapAheadEnd===null)?null:+(gapAhead0-gapAheadEnd).toFixed(1),
                gainedY:(gapY0===null||gapYEnd===null)?null:+(gapY0-gapYEnd).toFixed(1),
                nOverY:overtakesY.length, overtakesY:overtakesY.slice(0,4),
                nAllowed:allowed.length, nAllowedY:allowedY.length,
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
        + ` · зелёный ${grn} с · обгонов ИИ под VSC ${res.nOver}`
        + (res.mode0 === 'yellow' ? ` · обгонов в жёлтой зоне ${res.nOverY}` : '')
        + ((res.nAllowed + res.nAllowedY) ? ` · объехали вставшего ${res.nAllowed + res.nAllowedY}` : '')
        + (res.gained === null ? '' : ` · игрок отыграл ${res.gained} м, место P${res.rank0}→P${res.rankEnd}`)
        + (res.gainedY === null ? '' : ` · игрок отыграл в жёлтой зоне ${res.gainedY} м`)
        + ` · болид стоит в ${res.offEnd} м (стена ${res.wall})`);

      if (res.mode0 === 'yellow') {
        if (Math.abs(yel - 40) > 0.6) r.fail(`${tag}: жёлтый горел ${yel} с вместо 40`);
        if (res.yellowCapped) r.fail(`${tag}: под жёлтым игрок ${res.yellowCapped} кадров ехал быстрее потолка своего сектора`);
        if (res.gainedY !== null && res.gainedY > 12) r.fail(`${tag}: под жёлтым игрок отыграл ${res.gainedY} м у соперника впереди`);
        if (res.blocking0) r.fail(`${tag}: болид стоит на полотне, а поднят жёлтый вместо VSC`);
        if (res.nOverY) r.fail(`${tag}: в жёлтой зоне состоялось ${res.nOverY} обгонов: ${res.overtakesY.join(', ')}`);
      } else {
        if (Math.abs(vsc + end - 30) > 0.6) r.fail(`${tag}: VSC длился ${(vsc + end).toFixed(1)} с вместо 30`);
        if (res.nOver) r.fail(`${tag}: под VSC состоялось ${res.nOver} обгонов между соперниками: ${res.overtakes.join(', ')}`);
        if (res.capBad) r.fail(`${tag}: игрок ${res.capBad} кадров ехал быстрее потолка VSC`);
        if (res.gained !== null && res.gained > 12) r.fail(`${tag}: игрок отыграл под VSC ${res.gained} м у соперника, который был впереди`);
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

  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
