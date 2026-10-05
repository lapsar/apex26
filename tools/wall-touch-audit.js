/* ============================================================================
   Справка — СКОЛЬКО СТОИТ КАСАНИЕ СТЕНЫ (v1.16.49)

   Владелец (05.10.2026): «не слишком ли большая цена в Монако у простого касания
   стены? У нас почти мгновенная остановка». До v1.16.49 стена срезала 10 %
   скорости В КАЖДОМ КАДРЕ касания — цена зависела от частоты кадров устройства
   (iPad ~53 кадра/с, iPhone 60), а касание по касательной стоило как удар.

   Опыт. Длинная прямая Монреаля (S≈3300); стена слева ставится на время опыта
   в 1.5 м от кромки, как в Монако (настоящая — за 5 м травы). Болид
   ставится так, чтобы через ~60 м хода войти в стену под углом θ со скоростью v0,
   газ в пол. «Пилот»: после первого касания ждёт REACT=0.2 с (руки прочь —
   выравниватель руля работает, как в игре), потом рулит ОТ стены, пока нос
   не встанет параллельно дороге или от неё, и дальше держит полосу в 0.6 м
   от стены (так же едет и опорный заезд без касания). Мерится время, за
   которое болид проходит D=300 м по дуге, — против того же старта без касания
   (θ=0). Разность — цена касания в секундах.

   Частота кадров: 30, 53 (iPad mini 5), 60 (iPhone), 120.
   Сравнивать сборки — двумя процессами: APEX_INDEX=archive/v1.16.48.html.

   Запуск: node tools/wall-touch-audit.js [--fps=53,60] [--v=25,45,70] [--deg=2,5,10]
   ========================================================================== */
'use strict';

const H = require('./harness');

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1].split(',').map(Number) : d; };
const FPS = arg('fps', [30, 53, 60, 120]);
const V0 = arg('v', [25, 45, 70]);
const DEG = arg('deg', [1, 2, 3, 5, 8, 12, 20, 30, 45, 90]);
const D = 300, REACT = 0.2, APPROACH = 60, WALL_GAP = 1.5;   // стена в 1.5 м от кромки

const SRC = `
var WALL_GAP=${WALL_GAP};
function __wallKeep(lane){
  var pr=project(player.x,player.z,player.hint), M=track.M, ah=Math.max(3,Math.round(3+player.speed*0.12));
  var j=(pr.idx+ah)%M, tp=track.P[j], Rj=track.R[j];
  var dh=Math.atan2(tp.x+Rj.x*lane-player.x, tp.z+Rj.z*lane-player.z)-player.hdg;
  while(dh>Math.PI)dh-=2*Math.PI; while(dh<-Math.PI)dh+=2*Math.PI;
  var st=-dh*2.4; controls.left=st<-0.12?1:0; controls.right=st>0.12?1:0;
}
function __wallTry(i0, sgn, deg, v0, dt, react, D, approach){
  var P=track.P[i0], F=track.F[i0], Rr=track.R[i0];
  var W=(sgn>0?track.WR:track.WL)[i0]-0.35;
  var th=deg*Math.PI/180, sn=Math.sin(th), cs=Math.cos(th);
  var reach=Math.max(1.05*cs+2.0*sn, 1.0*cs+3.25*sn);           // как далеко вбок от центра торчит нос
  var L=sn>1e-6?Math.min(approach,(2*W-2*reach-1)/sn):0;
  var off0=deg>0?sgn*(W-reach-L*sn):sgn*(W-1.6);
  var hx=F.x*cs+Rr.x*sgn*sn, hz=F.z*cs+Rr.z*sgn*sn, hdg0=Math.atan2(hx,hz);
  player.x=P.x+Rr.x*off0; player.z=P.z+Rr.z*off0; player.hdg=hdg0; player.speed=v0;
  player.hint=i0; player.prevIdx=i0; player.arcPrev=track.S[i0]; player.dist=0; player.lapLock=0;
  player.steerAmt=0; player.steerVis=0; player.revArm=0; player.revLeft=REV_RANGE;
  wallTouch=false; qualiLapsLeft=99;
  var t=0, touched=-1, done=false, contacts=0, was=false, vmin=v0, vAt=0, n=Math.round(60/dt);
  for(var f=0;f<n;f++){
    controls.gas=1; controls.brake=0; controls.left=0; controls.right=0;
    if(touched<0 && deg>0){ player.hdg=hdg0; player.steerAmt=0; }
    else if(touched<0 || done){ __wallKeep(sgn*(W-2.2)); }       // держит полосу в 0.6 м от стены (прямая чуть изгибается)
    else if(t-touched>=react){
      var s=Math.sin(player.hdg), c=Math.cos(player.hdg), pr=project(player.x,player.z,player.hint), R2=track.R[pr.idx];
      if((s*R2.x+c*R2.z)*sgn > -Math.sin(Math.PI/180)){ if(sgn>0) controls.left=1; else controls.right=1; }
      else done=true;
    }
    var d0=player.dist;
    update(dt); t+=dt;
    if(wallTouch&&!was){ contacts++; if(touched<0){ touched=t; vAt=player.speed; } }
    was=wallTouch;
    if(touched>=0 && player.speed<vmin) vmin=player.speed;
    if(player.dist>=D) return { t: t-dt*(player.dist-D)/Math.max(1e-6,player.dist-d0), contacts:contacts, vmin:vmin, vAt:vAt, touched:touched>=0 };
  }
  return { t: Infinity, contacts:contacts, vmin:vmin, vAt:vAt, touched:touched>=0 };
}`;

function main() {
  const T = H.tracks(true).find(t => t.key === 'montreal' || /Montreal/i.test(t.name));
  const env = H.loadGame({ seed: 11 });
  H.setupWeekend(env, { trackIdx: T.idx });
  env.evalIn(SRC);
  // самая длинная ровная стена Монреаля — слева, i≈829 при шаге 4 м (ищем заново: шаг может поменяться)
  const spot = env.evalIn(`(function(){var M=track.M,best=null;var W=track.WL;
    for(var i=0;i<M;i++){var n=0;while(n<M){var j=(i+n)%M;if(Math.abs(track.K[j])>0.0025||Math.abs(W[j]-W[i])>0.3)break;n++;}
      if(!best||n>best.n)best={i:i,n:n,S:track.S[i],W:W[i]};}
    // стену ставим вплотную к асфальту, как в Монако (у Монреаля тут 5 м травы — болид мерился бы по траве)
    for(var k=-5;k<best.n+5;k++){var j=(best.i+k+M)%M;W[j]=halfAt(j)+WALL_GAP;}
    best.W=W[best.i];return best;})()`);
  console.log(`файл: ${H.INDEX_HTML}`);
  console.log(`${T.name}: прямая от S=${spot.S.toFixed(0)}, ${(spot.n * env.evalIn('track.length/track.M')).toFixed(0)} м, стена слева в ${spot.W.toFixed(1)} м; заход ~${APPROACH} м, мерим ${D} м, реакция ${REACT} с`);
  for (const v0 of V0) {
    console.log(`\nv0 = ${v0} м/с (${Math.round(v0 * 3.6)} км/ч) — потеря времени, с [мин. скорость, км/ч; касаний]`);
    console.log('угол  ' + FPS.map(f => (f + ' к/с').padStart(22)).join(''));
    const ref = {};
    for (const fps of FPS) ref[fps] = env.evalIn(`__wallTry(${spot.i},-1,0,${v0},${1 / fps},${REACT},${D},${APPROACH})`);
    for (const deg of DEG) {
      let row = (deg + '°').padStart(4) + '  ';
      for (const fps of FPS) {
        const r = env.evalIn(`__wallTry(${spot.i},-1,${deg},${v0},${1 / fps},${REACT},${D},${APPROACH})`);
        const cell = !r.touched ? 'нет касания' : !isFinite(r.t) ? 'застрял' :
          `${(r.t - ref[fps].t).toFixed(2)} [${Math.round(r.vmin * 3.6)}; ${r.contacts}]`;
        row += cell.padStart(22);
      }
      console.log(row);
    }
  }
}
main();
