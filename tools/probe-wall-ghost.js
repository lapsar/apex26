/* ============================================================================
   Пробник — НЕВИДИМОЙ СТЕНЫ НЕТ (v1.16.80)

   Владелец (14.10.2026, скриншот, Майами, шикана T14 перед прямой к T17): «цепляешься за что-то невидимое».
   Две причины, обе в разрыве ленты барьера (перемычка spanPath, game.md):
   (1) отрезки видимой стены для проверки силуэтом (wallHullPush, v1.16.77) получали нормаль «к дороге» по точке осевой,
       ПОСЛЕДНЕЙ показанной перед разрывом; в тугом повороте она на 20–25 м позади и для отрезка у конца перемычки лежала
       за продолжением его линии — нормаль смотрела ОТ дороги: болид, коснувшийся стены там, толкало вбок и гасило ему скорость
       (Майами T14, Монако у пяти перемычек hug — до 1.5 м, Монца в выезде T1);
   (2) 8 точек корпуса мерили стену в разрыве поперёк дороги лучом W (wallSpanFill), а на изгибе перемычки луч врёт
       (Майами: 14.3 и 8.1 м в соседних точках) — болид упирался в стену на 0.9–1.2 м раньше нарисованной.
   Мерка — независимая от игры: видимая стена точками через 5 см (лента P±R·W по показанным точкам, разрыв — перемычкой
   spanPath, как её рисует wallBridges), силуэт болида — выпуклая оболочка модели.
   А. Каждый отрезок видимой стены в проверке силуэтом: нормаль смотрит к ближайшей точке осевой (к дороге).
   Б. Болид в каждой точке трассы, от осевой до стены через 0.5 м, курс ±1.2 рад через 0.3: если видимая стена от силуэта
      дальше FREE, проверка стены (8 точек + силуэт) не сдвигает болид больше PUSH.
   Фон (общий, давний): на изогнутой ленте поперёк дороги от ближайшей точки осевой стена в физике бывает на 0.3–0.5 м ближе
   нарисованной (хорда ленты против дуги) — до 0.50 м; порог выше него.
   До правки (v1.16.79): А — Майами 3, Монако 16, Монца 9 перевёрнутых; Б — Монца 2.18 м, Майами 1.19, Монако 0.97.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const FREE = 0.45, PUSH = 0.6;

const COMMON = `
var VIS=(function(){var M=track.M,out=[];
 for(var sg of [-1,1]){var V=sg>0?track.VR:track.VL,W=sg>0?track.WR:track.WL;
  var pt=function(j){return [track.P[j].x+track.R[j].x*sg*W[j],track.P[j].z+track.R[j].z*sg*W[j]];};
  var seg=function(A,B){var L=Math.hypot(B[0]-A[0],B[1]-A[1]),n=Math.max(1,Math.ceil(L/0.05));for(var k=0;k<=n;k++)out.push([A[0]+(B[0]-A[0])*k/n,A[1]+(B[1]-A[1])*k/n]);};
  for(var j=0;j<M;j++){var j2=(j+1)%M;if(V&&!V[j])continue;if(!V||V[j2]){seg(pt(j),pt(j2));continue;}
   var len=0;while(len<M&&!V[(j2+len)%M])len++;var path=spanPath(sg,W,j2,len);for(var q=0;q+1<path.length;q++)seg(path[q],path[q+1]);}}
 return out;})();
var VG={};VIS.forEach(function(p){var k=Math.floor(p[0]/4)+','+Math.floor(p[1]/4);(VG[k]=VG[k]||[]).push(p);});
var HULLE=(function(){var h=[[1.285,-2.2],[1.285,2.5],[1.05,3.2],[0.51,3.36],[-0.51,3.36],[-1.05,3.2],[-1.285,2.5],[-1.285,-2.2],[-0.78,-2.68],[0.78,-2.68]];
 return h.map(function(p,k){var q=h[(k+1)%h.length],ex=q[0]-p[0],ez=q[1]-p[1],l=Math.hypot(ex,ez),nx=ez/l,nz=-ex/l;return [nx,nz,nx*p[0]+nz*p[1]];});})();
/* Видимая стена дальше lim от силуэта? Выход на первой же точке ближе (болид, упёршийся в стену, — частый случай). */
function clearOf(lim){var s=Math.sin(player.hdg),c=Math.cos(player.hdg),gx=Math.floor(player.x/4),gz=Math.floor(player.z/4);
 for(var a=-2;a<=2;a++)for(var b=-2;b<=2;b++){var cell=VG[(gx+a)+','+(gz+b)];if(!cell)continue;
  for(var k=0;k<cell.length;k++){var dx=cell[k][0]-player.x,dz=cell[k][1]-player.z;if(dx*dx+dz*dz>49)continue;
   var x=dx*c-dz*s,z=dx*s+dz*c,m=-1e9;for(var e=0;e<HULLE.length;e++){var E=HULLE[e],d=(E[0]*x+E[1]*z)-E[2];if(d>m)m=d;}if(m<lim)return false;}}
 return true;}
`;

function run() {
  const r = R.result('Невидимой стены нет: проверка стены не толкает там, где стены не видно');
  for (const T of H.tracks(true)) {
    const env = H.loadGame({ seed: 7 });
    H.setupWeekend(env, { trackIdx: T.idx, diff: 'easy', laps: 3 });
    H.startRaceAt(env, 22);
    const m = env.evalIn(COMMON + `(function(){var M=track.M,o={segs:0,flip:0,flipS:[],n:0,bad:0,w:0,ws:0,wl:0};
      // А. нормали отрезков — к ближайшей точке осевой
      var PG={};for(var i=0;i<M;i++){var k=Math.floor(track.P[i].x/16)+','+Math.floor(track.P[i].z/16);(PG[k]=PG[k]||[]).push(i);}
      var seen=new Set();track.segGrid.forEach(function(c){c.forEach(function(s){if(seen.has(s))return;seen.add(s);o.segs++;
        var mx=(s[0]+s[2])/2,mz=(s[1]+s[3])/2,bi=-1,bd=1e18,cx=Math.floor(mx/16),cz=Math.floor(mz/16);
        for(var rr=1;rr<12&&(bi<0||Math.sqrt(bd)>(rr-1)*16);rr++)for(var a=-rr;a<=rr;a++)for(var b=-rr;b<=rr;b++){var cell=PG[(cx+a)+','+(cz+b)];if(!cell)continue;
          for(var q=0;q<cell.length;q++){var P=track.P[cell[q]],d=(P.x-mx)*(P.x-mx)+(P.z-mz)*(P.z-mz);if(d<bd){bd=d;bi=cell[q];}}}
        if(bi<0)return;var P=track.P[bi];if((P.x-mx)*s[4]+(P.z-mz)*s[5]<0){o.flip++;if(o.flipS.length<6)o.flipS.push(Math.round(track.S[bi]));}});});
      // Б. толчок стены при свободном силуэте
      for(var i=0;i<M;i++){var P=track.P[i],Rr=track.R[i],F=track.F[i];
        for(var sg of [-1,1]){var W=(sg>0?track.WR:track.WL)[i];
          /* ближе видимой стены этой стороны на 4.5 м (полудиагональ болида 3.6 + запас) толкать нечему — оттуда и начинаем */
          var dmin=W,gx=Math.floor((P.x+Rr.x*sg*W/2)/4),gz=Math.floor((P.z+Rr.z*sg*W/2)/4),rad=Math.ceil(W/8)+2;
          for(var a=-rad;a<=rad;a++)for(var b=-rad;b<=rad;b++){var cell=VG[(gx+a)+','+(gz+b)];if(!cell)continue;
            for(var q=0;q<cell.length;q+=4){var dx=cell[q][0]-P.x,dz=cell[q][1]-P.z;if((dx*Rr.x+dz*Rr.z)*sg<=0)continue;var dd=Math.hypot(dx,dz);if(dd<dmin)dmin=dd;}}
          for(var lane=Math.max(0,Math.floor((dmin-4.5)*2)/2);lane<=W;lane+=0.5)for(var dh=-1.2;dh<=1.21;dh+=0.3){
          var x0=P.x+Rr.x*sg*lane,z0=P.z+Rr.z*sg*lane;player.x=x0;player.z=z0;player.hdg=Math.atan2(F.x,F.z)+dh;player.hint=i;
          o.n++;playerWallPush();var d=Math.hypot(player.x-x0,player.z-z0);player.x=x0;player.z=z0;if(d<0.3)continue;
          if(!clearOf(${FREE}))continue;                                // стена рядом — толчок честный
          if(d>${PUSH})o.bad++;if(d>o.w){o.w=d;o.ws=Math.round(track.S[i]);o.wl=sg*lane;}}}}
      return o;})()`);
    r.line(`${T.name.padEnd(12)} отрезков ${String(m.segs).padStart(4)} · нормаль от дороги ${m.flip}`
      + (m.flip ? ` (S ${m.flipS.join(', ')})` : '')
      + ` · поз ${m.n} · толчок при свободном силуэте до ${m.w.toFixed(2)} м` + (m.w > 0 ? ` (S=${m.ws}, ${m.wl.toFixed(1)} м)` : '')
      + ` · больше ${PUSH} м: ${m.bad}`);
    if (m.flip) r.fail(`${T.name}: ${m.flip} отрезков видимой стены с нормалью от дороги (S ${m.flipS.join(', ')})`);
    if (m.bad) r.fail(`${T.name}: ${m.bad} поз — стену не видно ближе ${FREE} м, а болид толкает до ${m.w.toFixed(2)} м (S=${m.ws})`);
  }
  r.note('ловит невидимую стену: нормаль отрезка от дороги и стену в физике дальше нарисованной (v1.16.79: Майами T14, Монако, Монца)');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
