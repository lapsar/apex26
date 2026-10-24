/* ============================================================================
   Пробник — НЕВИДИМОЙ СТЕНЫ НЕТ (v1.16.80; проход вдоль стены точкой — v1.16.81)

   Владелец (14.10.2026, скриншот, Майами, шикана T14 перед прямой к T17): «цепляешься за что-то невидимое».
   В v1.16.80 нашлись две причины — обе в разрыве ленты барьера (game.md «Невидимая стена у перемычек»):
   (1) нормаль отрезков видимой стены для проверки силуэтом (wallHullPush, v1.16.77) смотрела ОТ дороги;
   (2) 8 точек корпуса мерили стену в разрыве лучом W поперёк дороги, а на изгибе перемычки луч врёт.
   Первая редакция пробника (v1.16.80) ставила в каждую точку трассы ВЕСЬ болид и пропустила третью, давнюю: где стена идёт
   под углом к дороге, физика брала её отступ ступенькой (W ближайшей точки осевой), а нарисована она прямой между точками —
   в половине каждого шага стена в физике стояла до 1 м ближе нарисованной (Сильверстоун, Хунгароринг, Монца, Майами T16, Монако).
   Владелец (14.10.2026) предложил проверять саму стену, сантиметр за сантиметром, — так и сделано (v1.16.81).

   Мерка — независимая от игры: нарисованная стена (лента P±R·W по показанным точкам, разрыв — перемычкой spanPath, как её
   рисует wallBridges), её сторона «к дороге» — к ближайшей точке осевой по всей трассе.
   А. Каждый отрезок стены в проверке силуэтом (track.segGrid) смотрит нормалью к дороге.
   Б. Проход вдоль нарисованной стены шагом 1 см, обе стороны: в каждой точке игре задаётся точка корпуса (wallPoint — та же
      проверка, что у 8 точек болида) на 0.6 и 0.4 м перед стеной и на 0.1 м за ней. Запас физики 0.35 м: перед стеной на 0.6 и
      0.4 м толкать нечего — толчок больше NEAR_TOL значит невидимую стену; за стеной толчок должен быть не меньше положенного
      без UNDER_TOL, а после толчка точка — перед нарисованной стеной (у излома стены толчок идёт вдоль соседнего куска — так верно).
   До правки (v1.16.80): Б — Сильверстоун до 1.11 м, Монца 1.08, Хунгароринг 1.03, Майами 1.02, Монако 0.97 (Монреаль 0.29 —
   его лента сглажена). v1.16.79: А — Майами 3, Монако 16, Монца 9 отрезков от дороги.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const STEP = 0.01, NEAR_TOL = 0.10, UNDER_TOL = 0.25;

const SRC = `(function(){var M=track.M,o={segs:0,flip:0,flipS:[],pts:0,ghost:0,gw:0,gS:'',under:0,uw:0,uS:'',dir:0,dS:''};
 if(typeof wallPoint!=='function')return {nofn:1};
 /* нарисованная стена: отрезки [ax,az,bx,bz,j,sg] (j — точка осевой, к которой относится кусок) */
 /* PK — куски кармана по форме улицы (path, v1.17.9) */
 var SEG=[],PK=new Set();for(var sg of [-1,1]){var V=sg>0?track.VR:track.VL,W=sg>0?track.WR:track.WL;if(!W)continue;
  var pt=function(j){return [track.P[j].x+track.R[j].x*sg*W[j],track.P[j].z+track.R[j].z*sg*W[j]];};
  for(var j=0;j<M;j++){var j2=(j+1)%M;if(V&&!V[j])continue;if(!V||V[j2]){var A=pt(j),B=pt(j2);SEG.push([A[0],A[1],B[0],B[1],j,sg]);continue;}
   var len=0;while(len<M&&!V[(j2+len)%M])len++;var path=spanPath(sg,W,j2,len);
   var pk=track.gapPathAt&&track.gapPathAt[sg>0?'R':'L'][j2]>=0;
   for(var q=0;q+1<path.length;q++){var jj=(j+Math.round(q/(path.length-1)*(len+1)))%M;if(pk)PK.add(SEG.length);SEG.push([path[q][0],path[q][1],path[q+1][0],path[q+1][1],jj,sg]);}}}
 /* ближайшая точка осевой — по всей трассе */
 var PG={};for(var i=0;i<M;i++){var k=Math.floor(track.P[i].x/16)+','+Math.floor(track.P[i].z/16);(PG[k]=PG[k]||[]).push(i);}
 function nearestP(x,z){var bi=-1,bd=1e18,cx=Math.floor(x/16),cz=Math.floor(z/16);
  for(var rr=1;rr<12&&(bi<0||Math.sqrt(bd)>(rr-1)*16);rr++)for(var a=-rr;a<=rr;a++)for(var b=-rr;b<=rr;b++){var c=PG[(cx+a)+','+(cz+b)];if(!c)continue;
   for(var q=0;q<c.length;q++){var P=track.P[c[q]],d=(P.x-x)*(P.x-x)+(P.z-z)*(P.z-z);if(d<bd){bd=d;bi=c[q];}}}return bi;}
 /* А. нормали отрезков проверки силуэтом */
 var key=function(a,b,c,d){return a.toFixed(2)+','+b.toFixed(2)+','+c.toFixed(2)+','+d.toFixed(2);},PKK=new Map();
 PK.forEach(function(n){var s=SEG[n],dx=s[2]-s[0],dz=s[3]-s[1],l=Math.hypot(dx,dz);if(l>1e-6)PKK.set(key(s[0],s[1],s[2],s[3]),s[5]>0?[dz/l,-dx/l]:[-dz/l,dx/l]);});
 var seen=new Set();track.segGrid.forEach(function(c){c.forEach(function(s){if(seen.has(s))return;seen.add(s);o.segs++;
  var mx=(s[0]+s[2])/2,mz=(s[1]+s[3])/2,bi=nearestP(mx,mz);if(bi<0)return;var P=track.P[bi];
  var pn=PKK.get(key(s[0],s[1],s[2],s[3]));   // кусок кармана: нормаль — по обходу, а не к ближайшей точке осевой (v1.17.9)
  if(pn?(pn[0]*s[4]+pn[1]*s[5]<0.99):((P.x-mx)*s[4]+(P.z-mz)*s[5]<0)){o.flip++;if(o.flipS.length<6)o.flipS.push(Math.round(track.S[bi]));}});});
 /* Б. проход вдоль нарисованной стены */
 var SG={};SEG.forEach(function(s,n){var dx=s[2]-s[0],dz=s[3]-s[1],l=Math.hypot(dx,dz);s.push(l);if(l<1e-6){s.push(0,0);return;}
  var mx=(s[0]+s[2])/2,mz=(s[1]+s[3])/2,P=track.P[nearestP(mx,mz)],nx=-dz/l,nz=dx/l;if((P.x-mx)*nx+(P.z-mz)*nz<0){nx=-nx;nz=-nz;}
  /* стены кармана смотрят внутрь кармана, осевая — за углом: сторона дороги по обходу (справа — слева от хода), как в игре (v1.17.9) */
  if(PK.has(n)){nx=s[5]>0?dz/l:-dz/l;nz=s[5]>0?-dx/l:dx/l;}
  s.push(nx,nz);
  for(var q=0,st=Math.ceil(l/2);q<=st;q++){var k=Math.floor((s[0]+dx*q/st)/4)+','+Math.floor((s[1]+dz*q/st)/4);var c=SG[k]||(SG[k]=[]);if(c[c.length-1]!==n)c.push(n);}});
 var NR=[0,0,0];   // расстояние до нарисованной стены со знаком (+ — со стороны дороги), отрезок, ближайшая точка
 function near(x,z){var gx=Math.floor(x/4),gz=Math.floor(z/4),bd=1e9,bs=-1,bx=0,bz=0;
  for(var a=-1;a<=1;a++)for(var b=-1;b<=1;b++){var c=SG[(gx+a)+','+(gz+b)];if(!c)continue;
   for(var q=0;q<c.length;q++){var s=SEG[c[q]];if(s[6]<1e-6)continue;var ux=s[2]-s[0],uz=s[3]-s[1],t=((x-s[0])*ux+(z-s[1])*uz)/(s[6]*s[6]);t=t<0?0:t>1?1:t;
    var px=s[0]+ux*t,pz=s[1]+uz*t,d=Math.hypot(x-px,z-pz);if(d<bd-1e-9){bd=d;bs=c[q];bx=px;bz=pz;}}}
  if(bs<0)return null;var s=SEG[bs],sd=(x-bx)*s[7]+(z-bz)*s[8];return [sd>=0?bd:-bd,bs,bx,bz];}
 SEG.forEach(function(s,n){if(s[6]<1e-6)return;var st=Math.max(1,Math.round(s[6]/${STEP}));
  for(var q=0;q<st;q++){var t=(q+0.5)/st,qx=s[0]+(s[2]-s[0])*t,qz=s[1]+(s[3]-s[1])*t;
   for(var off of [0.6,0.4,-0.1]){var x=qx+s[7]*off,z=qz+s[8]*off,dd=near(x,z);if(!dd)continue;
    var sn=SEG[dd[1]],dj=Math.abs(sn[4]-s[4]);dj=Math.min(dj,M-dj);if(sn[5]!==s[5]||dj>3)continue;   // ближе всего чужая стена (другая нога) — не этот опыт
    var w=wallPoint(x,z,s[4]),want=0.35-dd[0],e=Math.max(w.ex,0)-Math.max(want,0),tag=Math.round(track.S[s[4]])+(s[5]<0?' слева':' справа');o.pts++;
    if(e>${NEAR_TOL}){o.ghost++;if(e>o.gw){o.gw=e;o.gS=tag;}}
    if(want>0&&e<-${UNDER_TOL}){o.under++;if(-e>o.uw){o.uw=-e;o.uS=tag;}}
    if(want>0&&w.ex>0){var ok=near(x+w.dx,z+w.dz);if(ok&&ok[0]<0.35-${UNDER_TOL}){o.dir++;if(!o.dS)o.dS=tag+' остался '+ok[0].toFixed(2)+' м';}}}}});
 return o;})()`;

function run() {
  const r = R.result('Невидимой стены нет: стена в физике там же, где нарисована');
  for (const T of H.tracks(true)) {
    const env = H.loadGame({ seed: 7 });
    H.setupWeekend(env, { trackIdx: T.idx, diff: 'easy', laps: 3 });
    const m = env.evalIn(SRC);
    if (m.nofn) { r.fail(`${T.name}: в сборке нет wallPoint — пробник не к чему приложить`); continue; }
    r.line(`${T.name.padEnd(12)} отрезков ${String(m.segs).padStart(4)}, нормаль от дороги ${m.flip}`
      + (m.flip ? ` (S ${m.flipS.join(', ')})` : '')
      + ` · точек вдоль стены ${m.pts} · невидимая стена >${NEAR_TOL * 100} см: ${m.ghost}` + (m.ghost ? ` (до ${m.gw.toFixed(2)} м, S ${m.gS})` : '')
      + ` · недотолкнула >${UNDER_TOL * 100} см: ${m.under}` + (m.under ? ` (до ${m.uw.toFixed(2)} м, S ${m.uS})` : '')
      + ` · толчок не вывел из стены: ${m.dir}` + (m.dir ? ` (S ${m.dS})` : ''));
    if (m.flip) r.fail(`${T.name}: ${m.flip} отрезков стены с нормалью от дороги (S ${m.flipS.join(', ')})`);
    if (m.ghost) r.fail(`${T.name}: ${m.ghost} точек — стена в физике ближе нарисованной, до ${m.gw.toFixed(2)} м (S ${m.gS})`);
    if (m.under) r.fail(`${T.name}: ${m.under} точек — за стеной толчок меньше положенного на ${m.uw.toFixed(2)} м (S ${m.uS})`);
    if (m.dir) r.fail(`${T.name}: ${m.dir} точек — после толчка точка не вышла из стены (S ${m.dS})`);
  }
  r.note(`проход вдоль нарисованной стены шагом ${STEP * 100} см, точка в 0.6 и 0.4 м перед стеной и в 0.1 м за ней (v1.16.80: до 1.11 м невидимой стены)`);
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
