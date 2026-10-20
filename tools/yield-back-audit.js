/* ============================================================================
   Справка — «ВЕРНИ ПОЗИЦИЮ»: успевают ли обогнанные срезкой пройти обратно (замер 20.10.2026, без правки игры)

   Владелец (20.10.2026): первая срезка шиканы Монако, на которой игрок выиграл позиции, — предупреждение и требование
   вернуть позицию за 10 с, иначе +5 с (open-tasks/tracks.md, п.2-а). Вопрос замера: хватает ли 10 с.

   Сценарий: настоящая гонка соперников; игрока ставят в тоннеле в GAP с позади соперника X (со скоростью X), газ в пол,
   перед шиканой — к правому краю и прямо по выезду (CUTV>0 — тормозит до CUTV км/ч). После возвращения на полотно —
   уступка: доля FRAC безопасной скорости автопилота, по осевой (SIDE=0) или сдвинувшись вбок на SIDE м (+ вправо).
   Строка JSON на срезку: кто обогнан, отрыв после срезки (gapSec), через сколько секунд ОТ ВОЗВРАЩЕНИЯ НА ПОЛОТНО
   (S toS+4) каждый прошёл обратно по rankCmp; inc — у соперника была ошибка/разворот/сход.

   Запуск: node tools/yield-back-audit.js <diff> <frac> <side> <seed> <gap> <сек гонки> <cutv>
           node tools/yield-back-audit.js normal 0.5 3 1 0.3 700 0
   Итоги замера — tracks/monaco.md, «Верни позицию».
   ========================================================================== */
'use strict';
const H = require('./harness');
const [diff, frac, side, seed, gap, dur, cutv] = [process.argv[2] || 'normal', +(process.argv[3] || 0.5), +(process.argv[4] || 0),
  +(process.argv[5] || 1), +(process.argv[6] || 0.5), +(process.argv[7] || 900), +(process.argv[8] || 0)];
const env = H.loadGame({ seed });
H.setupWeekend(env, { trackIdx: H.tracks().find(t => t.key === 'Monaco').idx, diff, laps: 3 });
H.startRaceAt(env, 22);
H.lightsOut(env);
H.noRetirements(env);
const out = env.evalIn(`(function(){
  totalLaps=99;
  var z=track.spec.cuts[0],L=track.length,M=track.M,FR=${frac},SIDE=${side},GAP=${gap},SEEDPICK=${seed*3},CUTV=${cutv},res=[],st='drive',ahead=null,tg=null,t0=0,tNext=120,frames=0,want=null,wantT=0,pick=SEEDPICK;
  function iAt(S){S=((S%L)+L)%L;var b=0,bd=1e9;for(var i=0;i<M;i++){var d=Math.abs(track.S[i]-S);if(d<bd){bd=d;b=i;}}return b;}
  function sOf(c){return track.S[Math.floor((((c.u%1)+1)%1)*M)%M];}
  var A=track.P[iAt(z.toS+4)];
  function order(){return cars.slice().sort(rankCmp);}
  function steerTo(tx,tz){var d=Math.atan2(tx-player.x,tz-player.z)-player.hdg;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
    controls.left=-d*2.4<-0.12?1:0;controls.right=-d*2.4>0.12?1:0;}
  function busy(c){return !!(c.retired||c.err||c.fail||c.spinPend);}
  while(phase==='race'&&raceTime<${dur}&&frames<60*(${dur}+60)){frames++;
    var s=track.S[player.hint];
    if(st==='drive'){__AP.drive();
      if(raceTime>tNext){   // ищем соперника в тоннеле, сзади которого 80 м пусто — туда ставим игрока
        if(!want||raceTime-wantT>30){var oa=order().filter(function(c){return !c.isPlayer&&!c.retired;});for(var r=0;r<oa.length;r++){var cw=oa[(pick+r)%oa.length],q=sOf(cw);if(!busy(cw)&&((z.fromS-345-q)%L+L)%L<1500){want=cw;wantT=raceTime;pick=(pick+r+7)%oa.length;break;}}}
        var ais=want?[want].filter(function(c){return !busy(c);}):[];
        for(var kk=0;kk<ais.length;kk++){var X=ais[kk],sx=sOf(X);if(sx<z.fromS-340||sx>z.fromS-300)continue;
          var gm=GAP*X.speed,free=cars.every(function(c){return c===X||c.isPlayer||c.retired||Math.abs(c.dist-(X.dist-gm))>12;});
          if(!free)continue;
          var i0=iAt(sx-gm),P=track.P[i0],F=track.F[i0];player.x=P.x;player.z=P.z;player.hdg=Math.atan2(F.x,F.z);player.speed=X.speed;
          player.yawLag=0;player.hint=i0;player.prevIdx=i0;player.arcPrev=track.S[i0];player.dist=X.dist-gm;player.lapLock=60;wallTouch=false;
          var o=order(),ip=o.indexOf(player);window.__xc=X.code+' P'+(o.indexOf(X)+1);ahead=o.slice(0,ip);st='cut';want=null;break;}}}
    if(st==='cut'){
      if(s>=z.fromS-20&&s<=z.toS+4){steerTo(A.x,A.z);}
      else if(s>=z.fromS-200&&s<z.fromS-20){var pq=project(player.x,player.z,player.hint),aq=Math.max(3,Math.round(3+player.speed*0.12)),jq=(pq.idx+aq)%M;
        steerTo(track.P[jq].x+track.R[jq].x*4,track.P[jq].z+track.R[jq].z*4);}
      else __AP.drive();
      if(s<z.fromS-200){controls.gas=1;controls.brake=0;}
      if(s>=z.fromS-200&&s<=z.toS+4){var vc=CUTV>0?CUTV/3.6:1e9;controls.gas=player.speed<vc?1:0;controls.brake=player.speed>vc+1?1:0;}
      if(s>z.toS+4&&s<z.toS+200){var o2=order(),ip2=o2.indexOf(player);
        tg=ahead.filter(function(c){return !c.retired&&o2.indexOf(c)>ip2;}).map(function(c){return {c:c,code:c.code||c.name,gap:gapSec(player,c),back:null,inc:false};});
        res.push({x:window.__xc,t:+raceTime.toFixed(0),pos:ip2+1,gained:tg.length,gaps:tg.map(function(t){return +t.gap.toFixed(2);})});
        t0=raceTime;st=tg.length?'yield':'drive';if(!tg.length)tNext=raceTime+20;}}
    if(st==='yield'){
      var pr=project(player.x,player.z,player.hint),ah=Math.max(3,Math.round(3+player.speed*0.12)),j=(pr.idx+ah)%M;
      steerTo(track.P[j].x+track.R[j].x*SIDE,track.P[j].z+track.R[j].z*SIDE);
      var v=__AP.safeSpeed(pr.idx)*FR;controls.gas=player.speed<v?1:0;controls.brake=player.speed>v+1?1:0;
      var o3=order(),ip3=o3.indexOf(player),left=0;
      tg.forEach(function(t){if(busy(t.c))t.inc=true;if(t.back===null&&o3.indexOf(t.c)<ip3)t.back=raceTime-t0;if(t.back===null)left++;});
      if(!left||raceTime-t0>40){var r2=res[res.length-1];r2.back=tg.map(function(t){return t.back===null?null:+t.back.toFixed(2);});
        r2.inc=tg.map(function(t){return t.inc;});r2.all=left?null:+(raceTime-t0).toFixed(2);r2.endS=+track.S[player.hint].toFixed(0);
        st='drive';tNext=raceTime+20;}}
    update(1/60);}
  return res;})()`);
out.forEach(r => console.log(JSON.stringify(Object.assign({ diff, frac, side, seed, gap, cutv }, r))));
