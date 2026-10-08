/* ============================================================================
   Пробник — НОС И КОЛЁСА НЕ ЗАХОДЯТ ЗА ВИДИМЫЙ ОТБОЙНИК

   Владелец (08.10.2026, v1.16.57, скриншот Монако, выезд Сент-Девот): «левое колесо и нос
   частично заходят в борт». Стена в физике мерилась поперёк дороги от ближайшей ТОЧКИ осевой:
   где отбойник далеко от осевой в крутом повороте и меняет отступ (выезды-ловушки, внешние
   стены поворотов), он выходил в физике на 0.3–1 м дальше видимого — точки корпуса уходили в борт
   (Монако до 1.34 м, Хунгароринг 0.86, Монреаль 0.62, Майами 0.58). С v1.16.58 точка корпуса
   меряется и до самой линии стены (wallNear).

   Проверка: каждая трасса, у каждой видимой ленты стены через 3 точки — болид в 4 м от стены,
   курс в неё 25° и 45°, газ и руль в стену 2.5 с; после каждого кадра 8 точек корпуса (колёса,
   концы крыльев — те же, что у проверки стены) меряются до ВИДИМОЙ стены: ломаная P±R·W по показанным точкам ленты
   (±12), разрыв — перемычкой (spanPath, как wallBridges). Точка за ней дальше TOL — нарушение. Кадры, где болид ближе 3 точек
   к разрыву ленты, не мерятся: внутри тугих шпилек и у перемычек мерка стороны ошибается (Монако 1264, Монца 968 — ложные 0.8–3 м).
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const TOL = 0.05;             // м: на ровной стене точки корпуса держатся в 0.35 м от линии

function run() {
  const r = R.result('Нос и колёса не заходят за видимый отбойник');
  for (const T of H.tracks(true)) {
    const env = H.loadGame({ seed: 7 });
    H.setupWeekend(env, { trackIdx: T.idx });
    const m = env.evalIn(`(function(){const M=track.M;
      var pts=[[1.05,2.0],[-1.05,2.0],[1.05,-1.7],[-1.05,-1.7],[1.0,3.25],[-1.0,3.25],[0.78,-2.55],[-0.78,-2.55]];
      // видимая стена: лента по показанным точкам, разрыв ленты — перемычкой, как её строит wallBridges (spanPath)
      function beyond(x,z,sg,i){var W=sg>0?track.WR:track.WL,V=sg>0?track.VR:track.VL,best=3,bs=-9,segs=[];
        var pt=function(j){return [track.P[j].x+track.R[j].x*sg*W[j],track.P[j].z+track.R[j].z*sg*W[j]];};
        for(var k=-12;k<=12;k++){var j=(i+k+M)%M,j2=(j+1)%M;if(V&&!V[j])continue;
          if(!V||V[j2]){segs.push([pt(j),pt(j2),j]);continue;}
          var len=0;while(len<M&&!V[(j2+len)%M])len++;var path=spanPath(sg,W,j2,len);
          for(var q=0;q+1<path.length;q++)segs.push([path[q],path[q+1],j]);}
        for(var n=0;n<segs.length;n++){var A=segs[n][0],B=segs[n][1],ax=A[0],az=A[1],bx=B[0],bz=B[1];
          var ux=bx-ax,uz=bz-az,L2=ux*ux+uz*uz;if(L2<1e-9)continue;var t=((x-ax)*ux+(z-az)*uz)/L2;t=t<0?0:t>1?1:t;
          var qx=ax+ux*t,qz=az+uz*t,d=Math.hypot(x-qx,z-qz);
          if(d<best){best=d;var P=track.P[segs[n][2]],cr=ux*(z-az)-uz*(x-ax),cref=ux*(P.z-az)-uz*(P.x-ax);bs=(cr*cref<0)?d:-d;}}
        return bs;}
      var n=0,bad=0,worst=-9,at=0,side='';
      for(var i0=0;i0<M;i0+=3){for(var sg of [-1,1]){var V=sg>0?track.VR:track.VL;if(V&&!V[i0])continue;for(var yaw of [25,45]){
        qualiLapsLeft=99;var W=sg>0?track.WR:track.WL,i=i0;
        player.x=track.P[i].x+track.R[i].x*sg*Math.max(0,W[i]-4);player.z=track.P[i].z+track.R[i].z*sg*Math.max(0,W[i]-4);
        player.hdg=Math.atan2(track.F[i].x,track.F[i].z)-sg*yaw*Math.PI/180;player.speed=10;player.hint=i;player.steerAmt=0;
        var w=-9,ws=0;
        for(var f=0;f<150;f++){controls.gas=1;controls.brake=0;controls.left=sg<0?1:0;controls.right=sg>0?1:0;update(1/60);
          var s=Math.sin(player.hdg),co=Math.cos(player.hdg);
          var gap=false;for(var g=-3;g<=3;g++)if(V&&!V[(player.hint+g+M)%M])gap=true;if(gap)continue;   // у разрыва ленты (перемычка) — не мерим
          for(var q=0;q<8;q++){var wc=pts[q],wx=player.x+wc[0]*co+wc[1]*s,wz=player.z-wc[0]*s+wc[1]*co,e=beyond(wx,wz,sg,player.hint);if(e>w){w=e;ws=track.S[player.hint];}}}
        n++;if(w>${TOL})bad++;if(w>worst){worst=w;at=Math.round(ws);side=sg<0?'слева':'справа';}}}}
      controls.gas=controls.left=controls.right=0;
      return {n:n,bad:bad,worst:+worst.toFixed(2),at:at,side:side};})()`);
    r.line(`${T.name.padEnd(12)} заездов в стену ${String(m.n).padStart(5)} · за видимым отбойником ${m.bad} · ближе всех ${m.worst} м (S=${m.at} ${m.side})`);
    if (m.bad) r.fail(`${T.name}: точки корпуса за видимым отбойником в ${m.bad} заездах, худший ${m.worst} м у S=${m.at} ${m.side}`);
  }
  r.note('ловит физическую стену дальше видимой (v1.16.57: выезд Сент-Девот, нос и колесо в борту)');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
