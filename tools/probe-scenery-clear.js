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


// Вторая проверка: ЩИТ ТОРМОЖЕНИЯ НЕ ДОЛЖЕН ОКАЗАТЬСЯ ЗА ОТБОЙНИКОМ.
// Появилась после того, как барьер Монреаля встал по настоящей линии (9 м вместо
// обобщённых 10) и проглотил щиты 150 и 100 в Senna S и у шпильки: они стояли
// в 8.7-9.4 м, то есть СНАРУЖИ новой стены. Владелец увидел это на устройстве.
// Щит задаётся координатами, стена — своей линией, и ничто их не связывало.
const MARKERS = `(function(){
  var key=track.spec.key, sc=(typeof SCENERY_BY_KEY!=='undefined')?SCENERY_BY_KEY[key]:null;
  if(!sc||!sc.markers||!sc.markers.markers)return {list:[]};
  var o=(typeof SCEN_ORIGIN!=='undefined')?SCEN_ORIGIN[key]:null; if(!o)return {list:[]};
  var out=[];
  var mk=sc.markers.markers;
  for(var n=0;n<mk.length;n++){
    var m=mk[n]; if(!m.latLon)continue;
    var x=-(m.latLon[1]-o.lon0)*o.mlon, z=(m.latLon[0]-o.lat0)*110540;
    var bi=0,bd=1e18;
    for(var k=0;k<track.M;k++){var dx=x-track.P[k].x,dz=z-track.P[k].z,d=dx*dx+dz*dz;if(d<bd){bd=d;bi=k;}}
    var R=track.R[bi], off=(x-track.P[bi].x)*R.x+(z-track.P[bi].z)*R.z;
    var wall=off<0?track.WL[bi]:track.WR[bi];
    out.push({name:(m.corner||'?')+' '+(m.dist||'?')+' м', off:+Math.abs(off).toFixed(2),
              wall:+wall.toFixed(2), S:Math.round(track.S[bi]),
              top:+(((sc.markers.baseY||0)+(sc.markers.panelH||0.9))).toFixed(2),
              wallH:(track.style==='street'?1.1:1.0)});
  }
  return {list:out, baseY:(sc.markers.baseY||0), postW:(sc.markers.postW||0),
          panelH:(sc.markers.panelH||0.9)};
})()`;
const MARKER_GAP = 0.15;     // щит должен стоять хотя бы настолько ПЕРЕД стеной
const MARKER_FREE = 1.5;     // либо стоять настолько свободно, чтобы стена ему не фон

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
  for (const T of H.tracks()) {
    const env = H.loadGame({ seed: opt.seed || 3 });
    H.setupWorld(env, { trackIdx: T.idx });
    const s = env.evalIn(MARKERS);
    if (!s.list || !s.list.length) continue;
    if (s.baseY > 0.02 && !s.postW) {           // щит без стойки обязан стоять на земле
      const say = T.hidden ? r.note.bind(r) : r.fail.bind(r);
      say(`${T.name}: щиты подняты на ${s.baseY} м, а стойки нет (postW=0) — `
        + `табличка висит в воздухе. Либо ставить на землю, либо задать postW`);
    }
    const bad = s.list.filter(m => m.wall - m.off < MARKER_GAP);
    const dim = s.list.filter(m => m.wall - m.off >= MARKER_GAP
                               && m.wall - m.off < MARKER_FREE && m.top <= m.wallH);
    r.line(`${T.name.padEnd(12)} щитов торможения ${String(s.list.length).padStart(3)} · `
      + `за отбойником ${bad.length} · тонет в отбойнике ${dim.length}`);
    for (const m of dim) {
      const say = T.hidden ? r.note.bind(r) : r.fail.bind(r);
      say(`${T.name}: щит «${m.name}» стоит в ${m.off} м вплотную к отбойнику (${m.wall} м), `
        + `а его верх ${m.top} м НИЖЕ верха стены ${m.wallH} м — читается как часть отбойника`);
    }
    for (const m of bad) {
      const say = T.hidden ? r.note.bind(r) : r.fail.bind(r);
      say(`${T.name}: щит «${m.name}» стоит в ${m.off} м от осевой, а отбойник в ${m.wall} м `
        + `(${m.S} м от старта) — щит ЗА стеной, из болида его не видно`);
    }
  }
  if (r.ok) r.line('ни один стоящий объект не пересекает полотно, ни один щит не спрятан за отбойником');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
