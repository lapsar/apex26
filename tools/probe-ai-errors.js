/* ============================================================================
   Пробник — ОШИБКА СОПЕРНИКА «ПРОСКОЧИЛ ПОВОРОТ» (v1.16.66)

   Владелец (10.10.2026): «широкий выход из поворота не очень заметен — часто это выглядит
   просто как потеря темпа уже после поворота». Замер подтвердил и нашёл причины: ошибка
   начиналась где придётся (на прямой — 33 %), увод шёл ВНУТРЬ поворота (знак перепутан)
   и к тому же обрезался общим коридором hw*0.62 — болид ни разу не выехал за белую линию.
   Вариант Б владельца: ошибка привязана к тормозному повороту, увод НАРУЖУ за линию.

   Проверка на каждой видимой трассе (гонка, Норма, зерно 7):
     • повороты ошибок (errCorners) есть, сторона каждого — внешняя: знак lane наружу = sign(K) апекса;
     • ошибки случаются (не меньше MIN_ERR за гонку);
     • у большинства ошибок внешние колёса уходят за белую линию (доля не ниже WHEELS_OUT);
     • глубина ошибки — в повороте, а не на прямой (доля на прямой не выше DEEP_STRAIGHT);
     • ошибка не «стоп-кран»: замедление после апекса (сама потеря темпа) не резче MAX_DEC м/с²
       за 0.5 с (до v1.15.76 худшее было 101, на v1.15.76 — 74);
     • углы кузова (8 точек, с доворотом) не заходят за ВИДИМЫЙ отбойник — мерка пробника wallvis (до 11.10.2026
       мерилась стена по данным, она дальше видимой: углы заходили в борт до 0.39 м, Майами).
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const RACE_SECS = 200, MIN_ERR = 5, WHEELS_OUT = 0.8, DEEP_STRAIGHT = 0.35, MAX_DEC = 60;

function run() {
  const r = R.result('Ошибка соперника — «проскочил поворот»: наружу, за линию, в повороте');
  for (const T of H.tracks(true)) {
    const env = H.loadGame({ seed: 7 });
    H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 99 });
    H.startRaceAt(env, 11);
    H.lightsOut(env);
    H.noRetirements(env);
    const o = env.evalIn(`(function(){
      var M=track.M,BODY=[[1.05,2.0],[-1.05,2.0],[1.05,-1.7],[-1.05,-1.7],[1.0,3.25],[-1.0,3.25],[0.78,-2.55],[-0.78,-2.55]];
      /* видимая стена — та же мерка, что у пробника wallvis: лента по показанным точкам, разрыв — перемычкой (spanPath).
         До v1.16.66 здесь стояла стена по данным (W поперёк осевой) — она дальше видимой, и углы кузова заходили в отбойник. */
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
      var ec=errCorners(),badSide=0;
      ec.list.forEach(function(C){if(C.side!==Math.sign(track.K[C.ap]))badSide++;});
      var dt=1/60,ev=[],hist={},wall=0,wallWorst=-9;
      for(var f=0;f<${RACE_SECS}*60&&phase!=='';f++){__AP.drive();update(dt);
        for(var i=0;i<field.length;i++){var c=field[i];if(c===player||c.retired)continue;
          var h=hist[c.num]||(hist[c.num]={v:[]});h.v.push(c.speed);if(h.v.length>31)h.v.shift();
          var d=h.v.length>30?(h.v[0]-h.v[30])/0.5:0;
          if(!c.err){h.e=null;h.eo=null;continue;}
          if(c.err!==h.eo){h.eo=c.err;h.e={side:c.err.side,out:-99,dec:0,wheels:0,deep:0,deepStr:0};ev.push(h.e);}
          var e=h.e,iu=Math.floor(((c.u%1)+1)%1*track.M)%track.M,hw=halfAt(iu),o=c.lane*e.side;
          if(o-hw>e.out)e.out=o-hw;
          if(o+1.05>hw)e.wheels=1;
          if(c.dist-c.err.d0>c.err.toAp+15&&d>e.dec)e.dec=d;
          if(c.errPh>0.8){e.deep++;if(Math.abs(track.K[iu])<0.096)e.deepStr++;}
          if(o>hw*0.5){var sg=e.side,V=sg>0?track.VR:track.VL,gap=false;for(var gg=-3;gg<=3;gg++)if(V&&!V[(iu+gg+track.M)%track.M])gap=true;
            if(!gap){var yaw=c.mesh.rotation.y,s=Math.sin(yaw),co=Math.cos(yaw),w=-9;
              for(var q=0;q<8;q++){var wc=BODY[q],bq=beyond(c.x+wc[0]*co+wc[1]*s,c.z-wc[0]*s+wc[1]*co,sg,iu);if(bq>w)w=bq;}
              if(w>0)wall++;if(w>wallWorst)wallWorst=w;}}}}
      return {n:ec.list.length,badSide:badSide,ev:ev,wall:wall,wallWorst:wallWorst};})()`);
    const tag = T.name, ev = o.ev, n = ev.length;
    const wheels = n ? ev.filter(e => e.wheels).length / n : 0;
    const deep = ev.reduce((s, e) => s + e.deep, 0), deepStr = deep ? ev.reduce((s, e) => s + e.deepStr, 0) / deep : 0;
    const dec = ev.reduce((m, e) => Math.max(m, e.dec), 0);
    const outs = ev.map(e => e.out).sort((a, b) => a - b), med = n ? outs[n >> 1] : NaN;
    r.line(`${tag}: поворотов ошибок ${o.n}; ошибок ${n}; колёса за линией ${(100 * wheels).toFixed(0)} %,`
      + ` центр за линией (медиана) ${med.toFixed(2)} м; глубина на прямой ${(100 * deepStr).toFixed(0)} %;`
      + ` замедление ошибки до ${dec.toFixed(0)} м/с²; угол кузова до видимой стены ${(-o.wallWorst).toFixed(2)} м`);
    if (!o.n) r.fail(`${tag}: нет ни одного поворота для ошибок (errCorners)`);
    if (o.badSide) r.fail(`${tag}: у ${o.badSide} поворотов сторона ошибки — внутренняя, а не внешняя`);
    if (n < MIN_ERR) r.fail(`${tag}: ошибок ${n} за ${RACE_SECS} с — меньше ${MIN_ERR}`);
    if (n && wheels < WHEELS_OUT) r.fail(`${tag}: колёса за белой линией лишь у ${(100 * wheels).toFixed(0)} % ошибок (порог ${100 * WHEELS_OUT} %)`);
    if (deepStr > DEEP_STRAIGHT) r.fail(`${tag}: глубина ошибки на прямой ${(100 * deepStr).toFixed(0)} % (порог ${100 * DEEP_STRAIGHT} %)`);
    if (dec > MAX_DEC) r.fail(`${tag}: ошибка тормозит резко — ${dec.toFixed(0)} м/с² за 0.5 с (порог ${MAX_DEC})`);
    if (o.wall) r.fail(`${tag}: ошибающийся болид углом кузова за видимым отбойником ${o.wall} кадров (до ${o.wallWorst.toFixed(2)} м)`);
  }
  r.note('вариант Б владельца 10.10.2026; до v1.16.66 колёса за линией — 0 %, увод шёл внутрь поворота');
  return r;
}

module.exports = { run };
