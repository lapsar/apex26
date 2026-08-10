/* ============================================================================
   Пробник 12 — ОКРУЖЕНИЕ НЕ ЗАХОДИТ НА ПОЛОТНО

   Написан после того, как пит-билдинг Монреаля встал ПОПЕРЁК трассы перед
   финишем и сквозь него можно было проехать. Владелец увидел это на
   устройстве — ни один пробник не поймал, потому что число мешей, материалы
   и отбойник были в порядке.

   Причина была в общем строителе: ориентация объекта собирается базисом
   (вдоль трассы, вверх, наружу). Для объекта справа по ходу такая тройка
   правая, слева — ЛЕВАЯ, то есть отражение, а не поворот. Монца и
   Сильверстоун ставят пит-билдинг справа, Монреаль — первый слева.

   Проверяются РЁБРА треугольников, а не вершины. Первая версия пробника
   смотрела вершины — и ту самую ошибку не поймала: у коробки 328 x 27 м,
   лежащей поперёк трассы, вершины остаются далеко по краям (ближайшая была
   в 116 м от осевой), а полотно пересекает её длинное ребро. Рёбра идут
   с шагом 2 м, поиск ближайшей точки осевой — по сетке 16 м.

   Проверяются только СТОЯЩИЕ НА ЗЕМЛЕ ОБЪЁМНЫЕ объекты: низ габарита ниже 2 м
   и высота от 1.5 м. Этот отбор важен — фильтровать сами вершины по высоте
   нельзя: у коробки здания вершины только на y=0 и y=12, в середину не попадает
   ни одна, и та самая ошибка прошла бы мимо пробника.

   Что отсекается и почему:
     плоское (высота < 1.5 м) — полотно, разметка, поребрики, ленты зон вылета,
                                щиты торможения: им положено лежать у асфальта;
     отбойник (высота ~1.0 м)  — он и должен стоять вплотную;
   Порог — кромка асфальта, а не край поребрика: стойки стартовой арки
   штатно стоят на поребрике в 0.6 м за кромкой.
     низ выше 2 м              — перекладина стартовой арки висит НАД трассой;
     габарит больше 900 м      — земля и небо.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const MIN_H = 1.5;           // ниже — это разметка и ленты, им положено лежать на асфальте
const ON_GROUND = 2.0;       // низ габарита: арка старта висит выше и в зачёт не идёт
const MARGIN = 0.0;          // до кромки асфальта: стойки стартовой арки штатно стоят на поребрике

const MEASURE = `(function(){
  var M=track.M, hits=[], checked=0, STEP=2.0;
  // сетка по точкам осевой: без неё перебор рёбер по всем M точкам неподъёмный
  var CELL=16, grid={};
  var key=function(x,z){ return Math.floor(x/CELL)+':'+Math.floor(z/CELL); };
  for(var k=0;k<M;k++){ var kk=key(track.P[k].x,track.P[k].z);
    (grid[kk]||(grid[kk]=[])).push(k); }
  function nearest(x,z){
    var bd=1e18,bi=-1,cx=Math.floor(x/CELL),cz=Math.floor(z/CELL);
    for(var a=-1;a<=1;a++)for(var b=-1;b<=1;b++){
      var c=grid[(cx+a)+':'+(cz+b)]; if(!c)continue;
      for(var t=0;t<c.length;t++){ var k=c[t];
        var dx=x-track.P[k].x,dz=z-track.P[k].z,d=dx*dx+dz*dz;
        if(d<bd){bd=d;bi=k;} } }
    return bi<0?null:{i:bi,d:Math.sqrt(bd)};
  }
  var v=new THREE.Vector3();
  scene.traverse(function(o){
    if(!o.isMesh||!o.geometry||!o.geometry.attributes.position)return;
    o.geometry.computeBoundingBox();
    var bb=o.geometry.boundingBox.clone(); bb.applyMatrix4(o.matrixWorld);
    var sz=bb.getSize(new THREE.Vector3());
    if(Math.max(sz.x,sz.z)>900)return;                      // земля и небо
    if(sz.y<${MIN_H})return;                                // плоское: разметка, ленты, щиты
    if(bb.min.y>${ON_GROUND})return;                        // висит над трассой: арка старта
    o.updateMatrixWorld(true);
    var pa=o.geometry.attributes.position, idx=o.geometry.index;
    var cnt=idx?idx.count:pa.count, worst=null;
    var P=[];
    for(var i=0;i<pa.count;i++){
      v.set(pa.getX(i),pa.getY(i),pa.getZ(i)).applyMatrix4(o.matrixWorld);
      P.push([v.x,v.z]);
    }
    for(var t=0;t+2<cnt;t+=3){
      var a=idx?idx.getX(t):t, b=idx?idx.getX(t+1):t+1, c=idx?idx.getX(t+2):t+2;
      var tri=[P[a],P[b],P[c]];
      for(var e=0;e<3;e++){
        var A=tri[e],B=tri[(e+1)%3];
        var L=Math.hypot(B[0]-A[0],B[1]-A[1]);
        var n=Math.max(1,Math.ceil(L/STEP));
        for(var q=0;q<=n;q++){
          var x=A[0]+(B[0]-A[0])*q/n, z=A[1]+(B[1]-A[1])*q/n;
          checked++;
          var nt=nearest(x,z); if(!nt)continue;
          var lim=track.HW[nt.i]+${MARGIN};
          if(nt.d<lim && (!worst||nt.d<worst.dist))
            worst={dist:+nt.d.toFixed(1), lim:+lim.toFixed(1), S:Math.round(track.S[nt.i])};
        }
      }
    }
    if(worst)hits.push({size:[Math.round(sz.x),+sz.y.toFixed(1),Math.round(sz.z)],
                        verts:pa.count, worst:worst});
  });
  return {hits:hits, checked:checked};
})()`;

function run(opt) {
  opt = opt || {};
  const r = R.result('Окружение не заходит на полотно');

  for (const T of H.tracks()) {
    const env = H.loadGame({ seed: opt.seed || 3 });
    H.setupWorld(env, { trackIdx: T.idx });
    const s = env.evalIn(MEASURE);
    r.line(`${T.name.padEnd(12)} проверено ${String(s.checked).padStart(7)} точек рёбер `
      + `объёмных объектов · нарушений ${s.hits.length}`);
    for (const h of s.hits) {
      const say = T.hidden ? r.note.bind(r) : r.fail.bind(r);
      say(`${T.name}: меш ${h.size.join('x')} м заходит на полотно — `
        + `ребро в ${h.worst.dist} м от осевой (кромка ${h.worst.lim} м) `
        + `на ${h.worst.S} м от старта`
        + (T.hidden ? ' — скрытая трасса, в зачёт не идёт' : ''));
    }
  }
  if (r.ok) r.line('ни один стоящий объект не пересекает полотно ни на одной трассе');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
