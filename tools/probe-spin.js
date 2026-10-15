/* ============================================================================
   Пробник — ОШИБКА-РАЗВОРОТ СОПЕРНИКА (v1.16.82)

   Владелец (15.10.2026): прежний сход «заклинило» крутил болид медленно (~35–45°/с ~5 с) и где угодно, в том числе на прямой —
   «так не бывает много лет». Разворот теперь — доля ошибок (SPIN_SHARE) и сход-разворот; места — spinCorners: тяжёлое
   торможение и входы в быстрые повороты, где снаружи до стены обычно не меньше SPIN_ROOM (правило 8 м). Замер по трём
   вылетам 2026 года (openf1 + кадры): от срыва до остановки 1.2–2 с, 30–80 м, дымят передние; поехал через 2–5.5 с.

   На каждой видимой трассе, в каждом месте разворота — ошибка-разворот у первого подъехавшего соперника (Норма, игрок-автопилот):
        • (с 60-й секунды гонки, до 10 болидов на место: с соседом рядом разворота нет — это поведение, а не огрех)
     • места: сторона — внешняя (sign(K) апекса), медиана места снаружи ≥ SPIN_ROOM; у Монако и Майами мест нет;
     • срыв не медленнее SPIN_MIN_V и не раньше входа в поворот (v1.16.83: у быстрого поворота был за 30 м до входа — на прямой); от срыва до остановки не дольше STOP_MAX, путь не длиннее PATH_MAX;
     • встал целиком за белой линией (ближний край кузова дальше EDGE_MIN), углом кузова не в ВИДИМОМ отбойнике;
     • кузов крутится не быстрее YAW_MAX °/с; ни кадра «телепортации» (излом хода ≤ JUMP), поворот кузова за кадр ≤ YAWJ;
     • дым передних колёс есть;
     • вернулся в обычную езду не позже BACK_MAX с, отдал её в полосе не дальше SPIN_LANE полуширины (+5 см) — без скачка;
     • за всё время ни один соперник не вошёл в его корпус глубже OVERLAP.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const STOP_MAX = 3.0, PATH_MAX = 120, EDGE_MIN = 0.3, YAW_MAX = 460, JUMP = 1.0, YAWJ = 12, BACK_MAX = 40, OVERLAP = 0.3;

function run(opt) {
  const r = R.result('Ошибка-разворот: срыв в месте разворота, 1–3 с до остановки за линией, без стены и скачков, возврат в езду');
  for (const T of H.tracks(true).filter(t => !process.env.SPIN_ONLY || t.name === process.env.SPIN_ONLY)) {
    const env = H.loadGame({ seed: 3, file: opt && opt.file });
    H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 30 });
    H.startRaceAt(env, 11);
    H.lightsOut(env);
    H.noRetirements(env);
    const o = env.evalIn(`(function(){var dt=1/60,M=track.M,sc=spinCorners(),seg=track.length/M;
      var BODY=[[1.05,2.0],[-1.05,2.0],[1.05,-1.7],[-1.05,-1.7],[1.0,3.25],[-1.0,3.25],[0.78,-2.55],[-0.78,-2.55]];
      function beyond(x,z,sg,i){var W=sg>0?track.WR:track.WL,V=sg>0?track.VR:track.VL,best=3,bs=-9,segs=[];   // мерка видимой стены — как у wallvis/retire
        var pt=function(j){return [track.P[j].x+track.R[j].x*sg*W[j],track.P[j].z+track.R[j].z*sg*W[j]];};
        for(var k=-12;k<=12;k++){var j=(i+k+M)%M,j2=(j+1)%M;if(V&&!V[j])continue;
          if(!V||V[j2]){segs.push([pt(j),pt(j2),j]);continue;}
          var len=0;while(len<M&&!V[(j2+len)%M])len++;var path=spanPath(sg,W,j2,len);
          for(var q=0;q+1<path.length;q++)segs.push([path[q],path[q+1],j]);}
        for(var n=0;n<segs.length;n++){var A=segs[n][0],B=segs[n][1],ax=A[0],az=A[1],ux=B[0]-ax,uz=B[1]-az,L2=ux*ux+uz*uz;if(L2<1e-9)continue;
          var t=((x-ax)*ux+(z-az)*uz)/L2;t=t<0?0:t>1?1:t;var d=Math.hypot(x-ax-ux*t,z-az-uz*t);
          if(d<best){best=d;var P=track.P[segs[n][2]],cr=ux*(z-az)-uz*(x-ax),cref=ux*(P.z-az)-uz*(P.x-ax);bs=(cr*cref<0)?d:-d;}}
        return bs;}
      function rect(c){var m=c.mesh,h=m.rotation.y;return {x:m.position.x,z:m.position.z,fx:Math.sin(h),fz:Math.cos(h)};}
      function pen(a,b){var best=1e9,ax=[[a.fx,a.fz],[a.fz,-a.fx],[b.fx,b.fz],[b.fz,-b.fx]],dx=b.x-a.x,dz=b.z-a.z;
        for(var k=0;k<4;k++){var ux=ax[k][0],uz=ax[k][1],d=Math.abs(dx*ux+dz*uz);
          var ra=3.02*Math.abs(a.fx*ux+a.fz*uz)+1.285*Math.abs(a.fz*ux-a.fx*uz),rb=3.02*Math.abs(b.fx*ux+b.fz*uz)+1.285*Math.abs(b.fz*ux-b.fx*uz);
          var oo=ra+rb-d;if(oo<=0)return 0;if(oo<best)best=oo;}return best;}
      /* места: сторона и правило 8 м — своей меркой (медиана места снаружи от апекса до выхода +120 м) */
      var sites=sc.list.map(function(C,ci){var rooms=[];for(var d=0;d<=C.toEx-C.toAp+120;d+=seg){var j=(C.ap+Math.round(d/seg))%M;rooms.push(wallAt(j,C.side)-halfAt(j));}
        rooms.sort(function(a,b){return a-b;});return {ci:ci,S:Math.round(track.S[C.ap]),side:C.side,sideOk:C.side===Math.sign(track.K[C.ap]),room:+rooms[rooms.length>>1].toFixed(1)};});
      /* дым ставится только у камеры (SMOKE_RANGE), а камера — у игрока: считаются заявки на дым, а не частицы */
      var front=0,__pa=retSmokeQ,cur=null;retSmokeQ=function(c,iu,kind){if(c===cur&&kind==='lock')front++;return __pa.apply(null,arguments);};
      var used={},ev=[],t0=raceTime,TRIES=10;
      while(raceTime-t0<2400&&ev.length<sc.list.length){__drive(1,dt,"auto");if(raceTime<60)continue;   // с 60-й секунды: на старте поле плотное, и у каждого сосед рядом (тогда — обычная ошибка)
        for(var k=0;k<field.length;k++){var c=field[k];if(c.retired||c.fail||c.err||c.spinPend)continue;var si=sc.trig[carIdx(c)];if(si<0||used[si]>=TRIES)continue;used[si]=(used[si]||0)+1;   // соседа рядом не всегда нет — до TRIES попыток на место
          c.spinPend={C:sc.list[si],ret:false,d0:c.dist,until:c.dist+sc.list[si].toEx};var dDec=c.dist;
          var e={ci:si,S:sites[si].S,code:c.code},f=null,T=0,d0=0,px=0,pz=0,qx=0,qz=0,py=0,n=0,yawMax=0,yawJ=0,jump=0,ov=0,ovWho='',stopped=false;front=0;cur=c;
          while(n<60*60){__drive(1,dt,'auto');n++;
            if(!f){if(c.fail&&c.fail.on){f=c.fail;T=raceTime;d0=c.dist;e.onAt=+(c.dist-dDec-sc.list[si].lead).toFixed(1);e.v0=+(c.speed*3.6).toFixed(0);px=c.mesh.position.x;pz=c.mesh.position.z;py=c.mesh.rotation.y;qx=null;}
              else if(!c.spinPend){e.skip=+(c.speed*3.6).toFixed(0);e.why=c.speed<SPIN_MIN_V?'медленно':(spinCrowd(c,sc.list[si].side)?'сосед рядом':'негде встать');e.err=!!c.err;break;}continue;}
            var m=c.mesh.position,mx=m.x-px,mz=m.z-pz,jj=qx===null?0:Math.hypot(mx-qx,mz-qz),wh=(c.fail?(c.fail.ph===undefined?(c.fail.world?'скольжение':'скольжение по полосе'):'возврат '+c.fail.ph):'езда')+' '+(c.speed*3.6).toFixed(0)+' км/ч';if(jj>jump){jump=jj;e.jumpAt=wh;}qx=mx;qz=mz;px=m.x;pz=m.z;
            var dy=Math.abs(((c.mesh.rotation.y-py+Math.PI*3)%(2*Math.PI))-Math.PI);if(dy>yawJ){yawJ=dy;e.yawAt=wh;}if(dy/dt>yawMax)yawMax=dy/dt;py=c.mesh.rotation.y;
            for(var k2=0;k2<field.length;k2++){var c2=field[k2];if(c2===c||c2.retired||Math.hypot(c2.x-c.x,c2.z-c.z)>7)continue;var pp=pen(rect(c),rect(c2));if(pp>ov){ov=pp;ovWho=c2.code;}}
            if(!stopped&&f.ph!==undefined){stopped=true;var iu=carIdx(c),hw=halfAt(iu),Pp=track.P[iu],Rr=track.R[iu],h=c.mesh.rotation.y,s=Math.sin(h),co=Math.cos(h),near=1e9,w=-9;
              [[1.285,3.02],[-1.285,3.02],[1.285,-3.02],[-1.285,-3.02]].forEach(function(b){var x=m.x+b[0]*co+b[1]*s,z=m.z-b[0]*s+b[1]*co,lat=((x-Pp.x)*Rr.x+(z-Pp.z)*Rr.z)*f.side;if(lat<near)near=lat;});
              BODY.forEach(function(b){var bq=beyond(m.x+b[0]*co+b[1]*s,m.z-b[0]*s+b[1]*co,f.side,iu);if(bq>w)w=bq;});
              e.stopT=+(raceTime-T).toFixed(2);e.why=(f.blk?'сосед придержал':'')+(f.hit?' стена':'')+(f.blk||f.hit?'':'');e.path=+(c.dist-d0).toFixed(0);e.edge=+(near-hw).toFixed(2);e.wall=+w.toFixed(2);e.ang=+(c.crab*57.3).toFixed(0);}
            if(!c.fail){e.back=+(raceTime-T).toFixed(1);e.laneOut=+(Math.abs(c.lane)/halfAt(carIdx(c))).toFixed(3);
              var cr0=c.crab;__drive(1,dt,'auto');e.crabJ=+(Math.abs(c.crab-cr0)*57.3).toFixed(1);break;}}
          e.yawMax=+(yawMax*57.3).toFixed(0);e.yawJ=+(yawJ*57.3).toFixed(1);e.jump=+jump.toFixed(2);e.ov=+ov.toFixed(2);e.ovWho=ovWho;e.front=front;cur=null;
          if(f&&e.back===undefined)e.noBack=1;if(e.skip===undefined)used[si]=TRIES;if(e.skip===undefined||used[si]>=TRIES)ev.push(e);break;}}
      retSmokeQ=__pa;
      return {name:track.spec.name,sites:sites,ev:ev,lane:SPIN_LANE,minV:SPIN_MIN_V*3.6};})()`);
    const tag = T.name;
    if (!o.sites.length) { r.line(`${tag.padEnd(12)} мест разворота нет (правило ${8} м) — ошибки прежние`); continue; }
    for (const s of o.sites) {
      if (!s.sideOk) r.fail(`${tag} S ${s.S}: сторона разворота — внутренняя`);
      if (s.room < 8) r.fail(`${tag} S ${s.S}: место снаружи ${s.room} м < 8`);
    }
    const done = o.ev.filter(e => e.v0 !== undefined);
    for (const e of o.ev) {
      const t = `${tag} S ${e.S} (${e.code})`;
      if (e.skip !== undefined) { r.note(`${t}: разворота нет (${e.why}, ${e.skip} км/ч) — ${e.err ? 'обычная ошибка' : 'ошибки нет'}`); continue; }
      if (e.noBack) { r.fail(`${t}: не вернулся в езду за 60 с`); continue; }
      if (e.v0 < o.minV - 1) r.fail(`${t}: срыв на ${e.v0} км/ч — медленнее ${o.minV.toFixed(0)}`);
      if (e.onAt < -1) r.fail(`${t}: срыв за ${-e.onAt} м ДО входа в поворот — на прямой (v1.16.83)`);
      if (e.stopT > STOP_MAX) r.fail(`${t}: до остановки ${e.stopT} с (предел ${STOP_MAX})`);
      if (e.path > PATH_MAX) r.fail(`${t}: путь ${e.path} м (предел ${PATH_MAX})`);
      if (e.edge < EDGE_MIN) r.fail(`${t}: встал не целиком за линией — ближний край в ${e.edge} м от неё${e.why ? ' (' + e.why.trim() + ')' : ''}`);
      if (e.wall > 0) r.fail(`${t}: углом кузова в видимом отбойнике на ${e.wall} м`);
      if (e.yawMax > YAW_MAX) r.fail(`${t}: кузов крутится ${e.yawMax}°/с (предел ${YAW_MAX})`);
      if (e.yawJ > YAWJ) r.fail(`${t}: кузов повернулся за кадр на ${e.yawJ}° (${e.yawAt})`);
      if (e.jump > JUMP) r.fail(`${t}: скачок — ход за кадр изменился на ${e.jump} м (${e.jumpAt})`);
      if (!e.front) r.fail(`${t}: нет дыма передних колёс`);
      if (e.back > BACK_MAX) r.fail(`${t}: вернулся в езду через ${e.back} с (предел ${BACK_MAX})`);
      if (e.laneOut > o.lane + 0.01) r.fail(`${t}: отдал езду в полосе ${e.laneOut} полуширины (обычная держит ≤ 0.75)`);
      if (e.crabJ > 3) r.fail(`${t}: после возврата кузов повернулся за кадр на ${e.crabJ}°`);
      if (e.ov > OVERLAP) r.fail(`${t}: соперник ${e.ovWho} вошёл в корпус на ${e.ov} м`);
    }
    if (done.length * 2 < o.sites.length) r.fail(`${tag}: разворотов ${done.length} из ${o.sites.length} мест — меньше половины`);
    const f1 = (a, k) => a.length ? `${Math.min(...a.map(e => e[k]))}–${Math.max(...a.map(e => e[k]))}` : '—';
    r.line(`${tag.padEnd(12)} мест ${o.sites.length}, разворотов ${done.length} (срыв ${f1(done, 'v0')} км/ч): до остановки ${f1(done, 'stopT')} с, ` +
      `${f1(done, 'path')} м, за линией ${f1(done, 'edge')} м, угол ${done.map(e => e.ang + '°').join('/')}; в езде через ${f1(done, 'back')} с`);
  }
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
