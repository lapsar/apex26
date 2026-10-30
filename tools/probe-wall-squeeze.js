/* ============================================================================
   Пробник — СОСЕД НЕ ВДАВЛИВАЕТ В СТЕНУ, ОСТРЫЙ УГОЛ СТЕНЫ НЕ ВХОДИТ В КОРПУС (v1.16.77)

   Владелец (13.10.2026, 5 скриншотов, Монако, шпилька Fairmont): «поворот близко к стене, справа подпирает соперник —
   болид оказывается внутри стены, застревает, потом вылезает; зацепиться можно, как будто что-то невидимое торчит».
   Две причины (game.md): (1) касание с соперником двигало игрока ПОСЛЕ проверки стены — прямо в неё; (2) 8 точек
   проверки стены не видят острого угла (кончик островка шпильки), входящего в борт между колёсами.

   Мерка — независимая от игры: видимая стена (лента P±R·W по показанным точкам, разрыв — перемычкой spanPath, как её
   строит wallBridges) точками через 5 см; глубина — насколько точка стены внутри силуэта болида (выпуклая оболочка модели).
   А. Шпилька Монако: игрок у островка, руль влево до упора, соперник рядом справа (полоса +2.6/+3.0 м, вровень и на 2 м
      спереди/сзади), 6 точек входа × 3 полосы × 2 скорости — 5 с каждый.
   Б. Все трассы, прямые места у стены: игрок вплотную к стене, соперник ВНАХЛЁСТ сбоку (центры в 2.0 м при ширине 2.57),
      оба прямо, 2 с; пока сосед сбоку (центры ближе 4 м вдоль), его полоса каждый кадр возвращается внахлёст (не быстрее 8 м/с вбок,
      как ездит ИИ) — он давит, как сосед, зашедший сбоку (правило «ближе
      не становится» держит его там), и раньше вдавливал игрока в стену каждый кадр.
   Порог: стена в силуэте не глубже TOL, корпуса внахлёст не глубже OVL (касание держится на 8 см, как всегда).
   До правки (v1.16.76): А — 102 заезда из 216 глубже 0.15 м, худший 1.28 м; Б — см. checklist.md.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const TOL = 0.15, OVL = 0.2;

const COMMON = `
var VIS=(function(){var M=track.M,out=[];
 for(var sg of [-1,1]){var V=sg>0?track.VR:track.VL,W=sg>0?track.WR:track.WL;
  var pt=function(j){return [track.P[j].x+track.R[j].x*sg*W[j],track.P[j].z+track.R[j].z*sg*W[j]];};
  var seg=function(A,B){var L=Math.hypot(B[0]-A[0],B[1]-A[1]),n=Math.max(1,Math.ceil(L/0.05));for(var k=0;k<=n;k++)out.push([A[0]+(B[0]-A[0])*k/n,A[1]+(B[1]-A[1])*k/n]);};
  for(var j=0;j<M;j++){var j2=(j+1)%M;if(V&&!V[j])continue;if(!V||V[j2]){seg(pt(j),pt(j2));continue;}
   var len=0;while(len<M&&!V[(j2+len)%M])len++;var path=spanPath(sg,W,j2,len);for(var q=0;q+1<path.length;q++)seg(path[q],path[q+1]);}}
 return out;})();
var VG={};VIS.forEach(function(p){var k=Math.floor(p[0]/4)+','+Math.floor(p[1]/4);(VG[k]=VG[k]||[]).push(p);});
var __HL=typeof CAR_HL!=='undefined'?CAR_HL:3.02,__HW=typeof CAR_HW!=='undefined'?CAR_HW:1.285;   // размер болида — из игры (v1.17.24), у старых сборок прежний
var HULLE=(function(){var h=typeof CAR_HULL!=='undefined'?CAR_HULL:[[1.285,-2.2],[1.285,2.5],[1.05,3.2],[0.51,3.36],[-0.51,3.36],[-1.05,3.2],[-1.285,2.5],[-1.285,-2.2],[-0.78,-2.68],[0.78,-2.68]];
 return h.map(function(p,k){var q=h[(k+1)%h.length],ex=q[0]-p[0],ez=q[1]-p[1],l=Math.hypot(ex,ez),nx=ez/l,nz=-ex/l;return [nx,nz,nx*p[0]+nz*p[1]];});})();
function inHull(x,z){var m=1e9;for(var k=0;k<HULLE.length;k++){var e=HULLE[k],d=e[2]-(e[0]*x+e[1]*z);if(d<=0)return 0;if(d<m)m=d;}return m;}
function wallIn(){var s=Math.sin(player.hdg),c=Math.cos(player.hdg),best=0,gx=Math.floor(player.x/4),gz=Math.floor(player.z/4);
 for(var a=-1;a<=1;a++)for(var b=-1;b<=1;b++){var cell=VG[(gx+a)+','+(gz+b)];if(!cell)continue;
  for(var k=0;k<cell.length;k++){var dx=cell[k][0]-player.x,dz=cell[k][1]-player.z;if(dx*dx+dz*dz>16)continue;
   var p=inHull(dx*c-dz*s,dx*s+dz*c);if(p>best)best=p;}}return best;}
function overlap(o){var dx=player.x-o.x,dz=player.z-o.z;if(dx*dx+dz*dz>45)return 0;var a=player.hdg,b=o.mesh.rotation.y,
  ax=[[Math.sin(a),Math.cos(a)],[Math.cos(a),-Math.sin(a)],[Math.sin(b),Math.cos(b)],[Math.cos(b),-Math.sin(b)]],m=1e9;
 for(var k=0;k<4;k++){var ux=ax[k][0],uz=ax[k][1],d=Math.abs(dx*ux+dz*uz);
  var r=__HL*(Math.abs(ax[0][0]*ux+ax[0][1]*uz)+Math.abs(ax[2][0]*ux+ax[2][1]*uz))+__HW*(Math.abs(ax[1][0]*ux+ax[1][1]*uz)+Math.abs(ax[3][0]*ux+ax[3][1]*uz));
  var q=r-d;if(q<=0)return 0;if(q<m)m=q;}return m;}
var rv=field[0];field.forEach(function(c){if(c!==rv){c.retired=true;c.x=c.z=9999;c.mesh.position.set(9999,0,9999);}});
function setRival(i0,lane,v,lon){rv.retired=false;rv.u=(track.S[i0]+lon)/track.length;rv.lane=lane;rv.lanePrev=lane;rv.speed=v;rv.dist=player.dist+lon;
  rv.errPh=0;rv.err=null;rv.crab=0;placeAI(rv,1/60);}
function setPlayer(i0,lane,v,steer){var P=track.P[i0],Rr=track.R[i0],F=track.F[i0];player.x=P.x+Rr.x*lane;player.z=P.z+Rr.z*lane;
  player.hdg=Math.atan2(F.x,F.z);player.speed=v;player.hint=i0;player.steerAmt=steer;player.yawLag=0;}
`;

function run() {
  const r = R.result('Сосед не вдавливает в стену, острый угол стены не входит в корпус');
  for (const T of H.tracks(true)) {
    const env = H.loadGame({ seed: 7 });
    H.setupWeekend(env, { trackIdx: T.idx, diff: 'easy', laps: 3 });
    H.startRaceAt(env, 22); H.lightsOut(env);
    const m = env.evalIn(COMMON + `(function(){var o={n:0,bad:0,w:0,ws:0,ov:0,hp:null};
      function drive(frames,v,left,press){var w=0,ov=0;for(var f=0;f<frames;f++){if(press!==undefined){var Fp=track.F[player.hint];if(Math.abs((player.x-rv.x)*Fp.x+(player.z-rv.z)*Fp.z)<4){rv.lane+=Math.max(-8/60,Math.min(8/60,press-rv.lane));rv.lanePrev=rv.lane;}}controls.left=left?1:0;controls.right=0;
        controls.gas=player.speed<v?1:0;controls.brake=player.speed>v+1?1:0;update(1/60);var p=wallIn();if(p>w)w=p;var q=overlap(rv);if(q>ov)ov=q;}
        o.n++;if(w>${TOL}||ov>${OVL})o.bad++;if(w>o.w){o.w=w;o.ws=Math.round(track.S[player.hint]);}if(ov>o.ov)o.ov=ov;return w;}
      if(track.spec.name==='Monaco'){var hp={n:0,bad:0,w:0};                                       // А. шпилька Fairmont
        for(var i0=304;i0<=314;i0+=2)for(var lane of [-2.5,-4,-5.5])for(var v of [8,11])for(var dl of [2.6,3.0])for(var lon of [-2,0,2]){
          setPlayer(i0,lane,v,-0.5);setRival(i0,lane+dl,v,lon);var b0=o.bad,w=drive(300,v,true);hp.n++;if(o.bad>b0)hp.bad++;if(w>hp.w)hp.w=w;}
        o.hp=hp;}
      // Б. прямые места у стены: игрок вплотную, сосед внахлёст сбоку
      var M=track.M;for(var i0=0;i0<M;i0+=Math.max(1,Math.round(M/40))){var straight=true;for(var w2=-8;w2<=8;w2++)if(Math.abs(track.K[(i0+w2+M)%M])>0.05)straight=false;
        if(!straight)continue;for(var sg of [-1,1]){var V=sg>0?track.VR:track.VL,W=sg>0?track.WR:track.WL;if(V&&!V[i0])continue;
          var lane=sg*(W[i0]-0.35-1.45);setPlayer(i0,lane,20,0);setRival(i0,lane-sg*2.0,20,0);drive(120,20,false,lane-sg*2.0);}}
      rv.retired=true;return o;})()`);
    let s = `${T.name.padEnd(12)} заездов ${String(m.n).padStart(4)} · плохих ${m.bad} · стена в силуэте до ${m.w.toFixed(2)} м`
      + (m.w > 0 ? ` (S=${m.ws})` : '') + ` · корпуса внахлёст до ${m.ov.toFixed(2)} м`;
    if (m.hp) s += ` · из них шпилька: ${m.hp.n} заездов, плохих ${m.hp.bad}, до ${m.hp.w.toFixed(2)} м`;
    r.line(s);
    if (m.bad) r.fail(`${T.name}: ${m.bad} заездов — стена в силуэте глубже ${TOL} м или корпуса внахлёст глубже ${OVL} м (худшее ${m.w.toFixed(2)} у S=${m.ws}, внахлёст ${m.ov.toFixed(2)})`);
  }
  r.note('ловит игрока, вдавленного соседом в стену, и острый угол стены в борту (v1.16.76: шпилька Монако, до 1.28 м)');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
