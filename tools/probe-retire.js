/* ============================================================================
   Пробник — СХОД ЕЗДОЙ, А НЕ ОДНИМ КАДРОМ (v1.16.79)

   Владелец (14.10.2026): «сход чаще всего выглядит как внезапная и мгновенная остановка болида, иногда прямо на глазах».
   До v1.16.79 retireCar за один кадр обнулял скорость (хоть с 300 км/ч), переставлял болид вбок на 2–12 м и разворачивал
   до 45°. Теперь три сценария (решение владельца 50/35/15): 'tech' — отказ техники (дым мотора, накат до места, которое
   пилот выбрал сам, в глубине выезда), 'crash' — вылет в повороте тяжёлого торможения (блокировка, за поребрик, удар
   о стену), 'spin' — сход-разворот (v1.16.82 вместо 'seize' — «заклинило»: в ближайшем месте разворота spinCorners сорвало,
   за 1–2 с протаскивает с вращением через выезд в стену или в гравий; дымят передние колёса). Трасса без мест разворота
   (Монако, Майами) — там 'spin' по жребию становится вылетом, и сценарий отмечается как «нет мест».

   На каждой видимой трассе каждый сценарий — с нескольких мест (зёрна SEEDS), Норма, игрок-автопилот:
     • сход доходит до остановки в срок (MAX_SECS по сценарию; вылет — ещё и дожидается своего поворота);
     • ни кадра «телепортации»: ход за кадр отличается от хода прошлого кадра не больше JUMP (150 м/с² — это 0.04 м; болид далеко
       вбок от осевой на изломе её точек в тугой шикане даёт до ~0.7 м — так ставится любой соперник, и это не скачок); курс кузова за кадр — не больше YAWJ;
     • замедление не резче MAX_DEC (у вылета — удар о стену RET_WALL_HIT, ~0.15 с, а не обрыв за кадр);
     • вставший не стоит углом в ВИДИМОМ отбойнике (мерка — своя, как у aierr/wallvis);
     • признак «на полотне» совпадает с геометрией кузова; флаг поднят в момент остановки: на полотне — VSC;
     • отказ техники там, где за кромкой есть место (на подходе 45 м), — встаёт целиком за линией, а где места с запасом —
       не ближе DEEP_MIN от неё (было 0.2 м);
     • дым есть: у отказа техники — мотора (сизый, вид 2), у разворота — передних колёс (до v1.16.82 у «заклинило» — задних);
     • вставший на полотне — не призрак: корпус соперника не заходит в его корпус глубже OVERLAP за 30 с после остановки
       (до v1.16.79 соперники вставшего не видели вовсе и проезжали сквозь него).
     • уборка после VSC (v1.16.92): у трассы с clearAway (Монако) болид увозят совсем — не виден, не дымит, игрока не толкает;
       у остальных — за отбойник и виден.
     • не на глазах (v1.16.94, clearAway): вставший в 60 м перед стоящим игроком не увезён и через 20 с после VSC; игрок поехал —
       увезён, когда камера на него не смотрит (до v1.16.94 — через 12 с, в кадре; ожидание игрока v1.16.93 снято).
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const SEEDS = [3, 11], MAX_SECS = { tech: 40, crash: 14, spin: 14 }, JUMP = 1.0, YAWJ = 12, OVERLAP = 0.3, DEEP_MIN = 0.5;
const MAX_DEC = { tech: 60, crash: 160, spin: 160 };
const PARK_NEED = 2 * 1.86 + 0.6;   // ширина вставшего под углом 0.2 рад + зазор до стены (RET_PARK_YAW, RET_PARK_WALL); у сборок с ними — из игры (v1.17.24)

function run(opt) {
  const r = R.result('Сход соперника — ездой: без скачков, у стены не в борту, флаг при остановке, соперники объезжают');
  const seeds = opt.seeds ? String(opt.seeds).split(',').map(Number) : SEEDS;
  for (const T of H.tracks(true)) {
    const rows = [];
    for (const kind of ['tech', 'crash', 'spin']) for (const seed of seeds) {
      const env = H.loadGame({ seed, file: opt.file });
      H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 3 });
      H.startRaceAt(env, 11);
      H.lightsOut(env);
      H.noRetirements(env);
      const o = env.evalIn(`(function(){var dt=1/60,M=track.M,KIND='${kind}';
        var __HL=typeof CAR_HL!=='undefined'?CAR_HL:3.02,__HW=typeof CAR_HW!=='undefined'?CAR_HW:1.285;   // размер болида — из игры (v1.17.24), у старых сборок прежний
        var BODY=(typeof CAR_PTS!=='undefined'?CAR_PTS:[[1.05,2.0],[-1.05,2.0],[1.05,-1.7],[-1.05,-1.7],[1.0,3.25],[-1.0,3.25],[0.78,-2.55],[-0.78,-2.55]]);
        function beyond(x,z,sg,i){var W=sg>0?track.WR:track.WL,V=sg>0?track.VR:track.VL,best=3,bs=-9,segs=[];
          var pt=function(j){return [track.P[j].x+track.R[j].x*sg*W[j],track.P[j].z+track.R[j].z*sg*W[j]];};
          for(var k=-12;k<=12;k++){var j=(i+k+M)%M,j2=(j+1)%M;if(V&&!V[j])continue;
            if(!V||V[j2]){segs.push([pt(j),pt(j2),j]);continue;}
            var len=0;while(len<M&&!V[(j2+len)%M])len++;var path=spanPath(sg,W,j2,len);
            for(var q=0;q+1<path.length;q++)segs.push([path[q],path[q+1],j]);}
          for(var n=0;n<segs.length;n++){var A=segs[n][0],B=segs[n][1],ax=A[0],az=A[1],ux=B[0]-ax,uz=B[1]-az,L2=ux*ux+uz*uz;if(L2<1e-9)continue;
            var t=((x-ax)*ux+(z-az)*uz)/L2;t=t<0?0:t>1?1:t;var d=Math.hypot(x-ax-ux*t,z-az-uz*t);
            if(d<best){best=d;var P=track.P[segs[n][2]],cr=ux*(z-az)-uz*(x-ax),cref=ux*(P.z-az)-uz*(P.x-ax);bs=(cr*cref<0)?d:-d;}}
          return bs;}
        function hull(c){var m=c.mesh,h=m.rotation.y,s=Math.sin(h),co=Math.cos(h);
          return BODY.map(function(b){return [m.position.x+b[0]*co+b[1]*s,m.position.z-b[0]*s+b[1]*co];});}
        function rect(c){var m=c.mesh,h=m.rotation.y;return {x:m.position.x,z:m.position.z,fx:Math.sin(h),fz:Math.cos(h)};}
        function pen(a,b){var best=1e9,ax=[[a.fx,a.fz],[a.fz,-a.fx],[b.fx,b.fz],[b.fz,-b.fx]],dx=b.x-a.x,dz=b.z-a.z;   // перекрытие двух корпусов 6.04×2.57 (SAT)
          for(var k=0;k<4;k++){var ux=ax[k][0],uz=ax[k][1],d=Math.abs(dx*ux+dz*uz);
            var ra=__HL*Math.abs(a.fx*ux+a.fz*uz)+__HW*Math.abs(a.fz*ux-a.fx*uz),rb=__HL*Math.abs(b.fx*ux+b.fz*uz)+__HW*Math.abs(b.fz*ux-b.fx*uz);
            var o=ra+rb-d;if(o<=0)return 0;if(o<best)best=o;}return best;}
        /* место отказа: на прямой и не медленно (для вылета — до ближайшего тяжёлого торможения) */
        var v=null,f0=0;
        while(!v&&f0<Math.round(120/dt)){__drive(30,dt,'auto');f0+=30;if(raceTime<15)continue;
          for(var k=0;k<field.length;k++){var c=field[k];if(c.retired||c.speed<40||c.err)continue;var iu=carIdx(c),km=0;
            for(var a=0;a<20;a++)km=Math.max(km,Math.abs(track.K[(iu+a)%M]));if(km<0.04){v=c;break;}}}
        if(!v)return {skip:'нет болида на прямой'};
        var iu=carIdx(v);
        if(KIND==='spin'&&!spinCorners().list.length)return {skip:'нет мест разворота (правило 8 м) — сход-разворот здесь становится вылетом'};
        if(KIND==='tech')techStart(v,iu);else if(KIND==='spin')v.fail={wait:true,spin:true,until:v.dist+1500};else v.fail={wait:true,until:v.dist+1500};
        var __pn=0,__eng=0,__rear=0,__pa=smokeAt;smokeAt=function(x,y,z,k,vv,F,R,sd,al,kind){__pn++;if(kind===2)__eng++;return __pa.apply(null,arguments);};
        var __pq=retSmokeQ;retSmokeQ=function(c,iu,kind){if(c===v&&kind==='lock')__rear++;return __pq.apply(null,arguments);};   // __rear — у разворота дым ПЕРЕДНИХ колёс; заявки, а не частицы: частицы ставятся только у камеры
        var t0=raceTime,tS=null,px=v.mesh.position.x,pz=v.mesh.position.z,py=v.mesh.rotation.y,ps=v.speed,jump=0,yawJ=0,dec=0,n=0,qx=0,qz=0;
        while(!v.retired&&n<Math.round(60/dt)){__drive(1,dt,'auto');n++;
          if(tS===null&&v.fail&&v.fail.on)tS=raceTime;
          if(tS===null){qx=v.mesh.position.x-px;qz=v.mesh.position.z-pz;px=v.mesh.position.x;pz=v.mesh.position.z;py=v.mesh.rotation.y;ps=v.speed;continue;}
          /* скачок — излом хода между соседними кадрами (вторая разность положения): плавный ход по внешней стороне поворота
             длиннее осевой и сам по себе скачком не считается; прежний сход переставлял болид на 2–12 м за кадр */
          var m=v.mesh.position,mx=m.x-px,mz=m.z-pz,j=Math.hypot(mx-qx,mz-qz);if(n>1&&j>jump)jump=j;qx=mx;qz=mz;
          var dy=Math.abs(((v.mesh.rotation.y-py+Math.PI*3)%(2*Math.PI))-Math.PI);if(dy>yawJ)yawJ=dy;
          var d=(ps-v.speed)/dt;if(d>dec)dec=d;
          px=m.x;pz=m.z;py=v.mesh.rotation.y;ps=v.speed;}
        if(!v.retired)return {kind:KIND,notStopped:1,started:tS!==null,secs:+(raceTime-(tS||t0)).toFixed(1)};
        var flag=neutral.mode,i=v.retiredIdx,hw=halfAt(i),side=v.retiredSide,secs=raceTime-tS;
        /* геометрия вставшего: ближний к оси край кузова (по 4 углам корпуса) и углы против видимой стены */
        var P=track.P[i],Rr=track.R[i],h=v.mesh.rotation.y,s=Math.sin(h),co=Math.cos(h),near=1e9;
        [[__HW,__HL],[-__HW,__HL],[__HW,-__HL],[-__HW,-__HL]].forEach(function(b){var x=v.mesh.position.x+b[0]*co+b[1]*s,z=v.mesh.position.z-b[0]*s+b[1]*co;
          var lat=((x-P.x)*Rr.x+(z-P.z)*Rr.z)*side;if(lat<near)near=lat;});
        var wall=-9;hull(v).forEach(function(p){var b=beyond(p[0],p[1],side,i);if(b>wall)wall=b;});
        var room=1e9;for(var q=0;q*track.length/M<=45;q++){var jq=(i-q+M)%M;room=Math.min(room,((side>0?track.WR:track.WL)[jq])-0.35-halfAt(jq));}   // простор за кромкой на подходе (45 м), как выбирает место игра
        /* 30 с после остановки: соперники не проезжают сквозь вставшего (если он на полотне) */
        var ov=0,ovWho='',me=rect(v);
        if(v.blocking){for(var f=0;f<Math.round(30/dt);f++){__drive(1,dt,'auto');
          for(var k2=0;k2<field.length;k2++){var c2=field[k2];if(c2===v||c2.retired)continue;
            if(Math.hypot(c2.x-v.x,c2.z-v.z)>7)continue;var pp=pen(me,rect(c2));if(pp>ov){ov=pp;ovWho=c2.code+' '+(c2.speed*3.6).toFixed(0)+' км/ч';}}}}
        return {kind:v.retKind,secs:+secs.toFixed(1),jump:+jump.toFixed(2),yawJ:+(yawJ*57.3).toFixed(1),dec:+dec.toFixed(0),
          blocking:v.blocking,flag:flag,near:+(near-hw).toFixed(2),wall:+wall.toFixed(2),room:+room.toFixed(1),parkNeed:(typeof RET_PARK_YAW!=='undefined'?2*carHalfWidth(RET_PARK_YAW)+RET_PARK_WALL:null),
          ang:+((v.crab||0)*57.3).toFixed(0),vscA:!!track.spec.vscAlways,ov:+ov.toFixed(2),ovWho:ovWho,eng:__eng,rear:__rear,smoke:__pn};})()`);
      const tag = `${T.name} ${kind} (зерно ${seed})`;
      if (o.skip) { r.note(`${tag}: ${o.skip}`); continue; }
      if (o.notStopped) { r.fail(`${tag}: болид не встал за 60 с (сход ${o.started ? 'начался' : 'не начался'}, ${o.secs} с)`); continue; }
      rows.push(o);
      if (o.secs > MAX_SECS[kind]) r.fail(`${tag}: вставал ${o.secs} с при пределе ${MAX_SECS[kind]}`);
      if (o.jump > JUMP) r.fail(`${tag}: скачок — ход за кадр изменился на ${o.jump} м`);
      if (o.yawJ > YAWJ) r.fail(`${tag}: кузов повернулся за кадр на ${o.yawJ}°`);
      if (o.dec > MAX_DEC[kind]) r.fail(`${tag}: замедление ${o.dec} м/с² при пределе ${MAX_DEC[kind]}`);
      if (o.wall > 0.05) r.fail(`${tag}: вставший стоит углом в видимом отбойнике на ${o.wall} м`);
      const geo = o.near < -0.05;
      if (geo !== o.blocking && Math.abs(o.near + 0.05) > 0.15) r.fail(`${tag}: «на полотне» = ${o.blocking}, а ближний край кузова в ${o.near} м от линии`);
      if (o.flag !== (o.blocking || o.vscA ? 'vsc' : 'yellow')) r.fail(`${tag}: при остановке флаг «${o.flag || 'нет'}» (на полотне: ${o.blocking})`);
      if (kind === 'tech' && o.room >= (o.parkNeed || PARK_NEED) + 0.2 && o.blocking) r.fail(`${tag}: место за кромкой ${o.room} м, а встал частью на полотне`);
      if (kind === 'tech' && o.room >= (o.parkNeed || PARK_NEED) + DEEP_MIN + 0.5 && o.near < DEEP_MIN) r.fail(`${tag}: место за кромкой ${o.room} м, а встал в ${o.near} м от линии`);
      if (kind === 'tech' && !o.eng) r.fail(`${tag}: нет дыма мотора`);
      if (kind === 'spin' && o.kind === 'spin' && !o.rear) r.fail(`${tag}: нет дыма передних колёс`);
      if (kind === 'spin' && o.kind !== 'spin') r.note(`${tag}: места разворота без соседа на пути не нашлось за 1500 м — ${o.kind}`);
      if (o.ov > OVERLAP) r.fail(`${tag}: соперник вошёл в корпус вставшего на ${o.ov} м (${o.ovWho})`);
    }
    const by = k => rows.filter(o => o.kind === k);
    const fmt = (k) => { const a = by(k); if (!a.length) return `${k} —`;
      return `${k} ${a.map(o => o.secs).join('/')} с, ${a.map(o => (o.blocking ? 'полотно' : 'за линией ' + o.near)).join(', ')}, угол ${a.map(o => o.ang + '°').join('/')}`; };
    r.line(`${T.name.padEnd(12)} ${fmt('tech')} · ${fmt('crash')} · ${fmt('spin')}`);
    const w = rows.reduce((m, o) => ({ jump: Math.max(m.jump, o.jump), yawJ: Math.max(m.yawJ, o.yawJ), ov: Math.max(m.ov, o.ov), wall: Math.max(m.wall, o.wall) }), { jump: 0, yawJ: 0, ov: 0, wall: -9 });
    r.line(`${''.padEnd(12)} худшие: скачок ${w.jump} м, поворот кузова ${w.yawJ}°/кадр, угол в стене ${w.wall} м, соперник в корпусе ${w.ov} м`);
    // Уборка после VSC (v1.16.92): у трассы с clearAway (Монако) болид увозят совсем — не виден, корпус игрока не держит, дым гаснет;
    // у остальных — убран за отбойник и виден, как раньше. Сход мгновенный, на полотне, камеру смотрит игрок-автопилот.
    {
      const env = H.loadGame({ seed: 3, file: opt.file });
      H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 3 });
      H.startRaceAt(env, 11); H.lightsOut(env); H.noRetirements(env);
      const q = env.evalIn(`(function(){var dt=1/60;for(var f=0;f<60;f++)__drive(1,dt,'auto');
        var v=field[8];v.lane=0;retireCar(v,true);v.blocking=true;v.retiredSide=1;raiseNeutral('vsc',v);v.smokeTill=raceTime+60;
        for(var f=0;f<Math.round((VSC_SECS+VSC_END_SECS+RET_CLEAR_MAX+3)/dt)&&!v.cleared;f++)__drive(1,dt,'auto');
        var out={away:!!track.spec.clearAway,cleared:!!v.cleared,vis:v.mesh.visible,smoke:v.smokeTill>raceTime,push:0};
        var px=player.x,pz=player.z,ph=player.hdg,ps=player.speed;player.x=v.x;player.z=v.z;player.speed=10;carContacts(dt);
        out.push=+(Math.hypot(player.x-v.x,player.z-v.z)+Math.abs(player.speed-10)).toFixed(2);
        player.x=px;player.z=pz;player.hdg=ph;player.speed=ps;return out;})()`);
      const tag = `${T.name} уборка после VSC`;
      if (!q.cleared) r.fail(`${tag}: болид не убран за ${'VSC + RET_CLEAR_MAX'}`);
      else if (q.away) {
        if (q.vis) r.fail(`${tag}: clearAway — болид должен быть увезён, а он виден`);
        if (q.smoke) r.fail(`${tag}: увезённый болид ещё дымит`);
        if (q.push > 0.01) r.fail(`${tag}: увезённый болид толкнул игрока (${q.push})`);
      } else if (!q.vis) r.fail(`${tag}: болид пропал, а у трассы нет clearAway`);
      r.line(`${''.padEnd(12)} уборка после VSC: ${q.away ? 'увезён (clearAway), игрок проходит его место свободно' : 'за отбойник, виден'}`);
    }
    // Не на глазах, без предела (v1.16.94, только clearAway): игрок стоит, вставший — в 60 м перед ним, в кадре. До v1.16.94 через
    // RET_CLEAR_MAX=12 с после VSC его увозили прямо в кадре. Теперь: и через 20 с после VSC он на месте и виден; игрок поехал —
    // увезён, как только камера на него не смотрит (своя мерка пробника: дальше 400 м или не в кадре ±66° и дальше 40 м).
    {
      const env = H.loadGame({ seed: 3, file: opt.file });
      H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 5 });
      if (env.evalIn('!!track.spec.clearAway')) {
        H.startRaceAt(env, 11); H.lightsOut(env); H.noRetirements(env);
        const q = env.evalIn(`(function(){var dt=1/60,L=track.length;
          var v=null,best=-1;for(var k=0;k<field.length;k++){var c=field[k],dd=Math.hypot(c.x-player.x,c.z-player.z);if(dd>best){best=dd;v=c;}}
          var Sw=(track.S[player.hint]+60)%L,i=0;while(i<track.M-1&&track.S[i]<Sw)i++;
          v.u=(i+0.5)/track.M;v.lane=halfAt(i)-2;v.crab=0;v.speed=0;placeAI(v,dt);retireCar(v,true);v.blocking=true;raiseNeutral('vsc',v);   // у края, частью на полотне: автопилот пробника едет по осевой и в стоящего по центру упёрся бы
          var tEnd=null,o={};
          for(var f=0;f<Math.round(60/dt)&&tEnd===null;f++){var was=neutral.mode;__drive(1,dt,'idle');if(was==='ending'&&neutral.mode!=='ending')tEnd=raceTime;}
          for(var f=0;f<Math.round(20/dt);f++)__drive(1,dt,'idle');
          o.tEnd=tEnd;o.held=!v.cleared&&v.mesh.visible;o.dist20=+Math.hypot(player.x-v.x,player.z-v.z).toFixed(0);
          o.clearAt=null;o.seenAtClear=null;
          for(var f=0;f<Math.round(90/dt)&&!v.cleared;f++){
            var dx=v.x-cam.position.x,dz=v.z-cam.position.z,d=Math.hypot(dx,dz),e=cam.matrixWorld.elements,fx=-e[8],fz=-e[10],fl=Math.hypot(fx,fz)||1;
            var seen=d<=400&&(d<40||(dx*fx+dz*fz)/(d*fl)>0.4);
            __drive(1,dt,'auto');if(v.cleared){o.clearAt=+(raceTime-tEnd).toFixed(1);o.seenAtClear=seen;o.dClear=+d.toFixed(0);}}
          o.vis=v.mesh.visible;return o;})()`);
        const tag = `${T.name} не на глазах`;
        if (q.tEnd === null) r.fail(`${tag}: VSC не кончился`);
        else {
          if (!q.held) r.fail(`${tag}: вставший в ${q.dist20} м перед стоящим игроком увезён в кадре (до 20 с после VSC)`);
          if (q.held && q.clearAt === null) r.fail(`${tag}: игрок поехал, а болид так и не увезён за 90 с`);
          else if (q.seenAtClear) r.fail(`${tag}: увезён, когда камера на него смотрела (${q.dClear} м)`);
          if (q.clearAt !== null && q.vis) r.fail(`${tag}: увезён, но виден`);
        }
        r.line(`${''.padEnd(12)} не на глазах: игрок стоит — через 20 с после VSC болид ${q.held ? 'на месте' : 'УВЕЗЁН'} (${q.dist20} м); поехал — увезён на ${q.clearAt} с после VSC, в ${q.dClear} м, ${q.seenAtClear ? 'В КАДРЕ' : 'не в кадре'}`);
      }
    }
  }
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
