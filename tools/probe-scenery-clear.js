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
    if(o===(typeof skyMesh!=='undefined'?skyMesh:null))return;   // небо
    var gp=o.geometry.parameters;
    if(gp&&gp.width===9000)return;                          // травяное основание мира
    // Раньше здесь стояло «больше 900 м — пропустить», и это была ДЫРА: склейка
    // по материалам даёт один меш сидений на весь круг, он длиннее 900 м и целиком
    // выпадал из проверки. Трибуна Монреаля легла поперёк трассы, а пробник молчал.
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
    var W=sc.markers.panelW||1.6, a=Math.abs(off), outer=(sc.markers.postSide==='outer');
    var near=outer?(a-W):(a-W/2), far=outer?a:(a+W/2);   // края полотна по отступу от осевой
    out.push({name:(m.corner||'?')+' '+(m.dist||'?')+' м', off:+a.toFixed(2),
              near:+near.toFixed(2), far:+far.toFixed(2),
              wall:+wall.toFixed(2), S:Math.round(track.S[bi]),
              bottom:+(sc.markers.baseY||0).toFixed(2),
              top:+(((sc.markers.baseY||0)+(sc.markers.panelH||0.9))).toFixed(2),
              wallH:(track.style==='street'?1.1:1.0),
              corner:(m.corner||'?'), past:+(near-track.HW[bi]).toFixed(2)});
  }
  return {list:out, baseY:(sc.markers.baseY||0), postW:(sc.markers.postW||0),
          panelH:(sc.markers.panelH||0.9)};
})()`;
// Третья проверка: ТРИБУНЫ НЕ ДОЛЖНЫ ЛЕЗТЬ ДРУГ НА ДРУГА.
// Владелец увидел на устройстве перед шпилькой Монреаля две трибуны, сложенные
// одна на другую: они стояли по разные стороны узкой полосы между ногами петли,
// и их дальние края встретились. Мешевые пробники это не ловят — после склейки
// по материалам обе трибуны становятся одним мешем, и «пересечение с собой»
// уже не видно. Поэтому считаем по ДАННЫМ разметки, до всякой геометрии.
const STANDS = `(function(){
  var key=track.spec.key, sc=(typeof SCENERY_BY_KEY!=='undefined')?SCENERY_BY_KEY[key]:null;
  if(!sc||!sc.objects)return {list:[]};
  var h=scenHelpers(), M=track.M, LEN=track.length;
  function idxAtS(s){ s=((s%LEN)+LEN)%LEN; var bi=0,bd=1e18;
    for(var k=0;k<M;k++){ var dd=Math.abs(((track.S[k]-s+LEN/2)%LEN)-LEN/2); if(dd<bd){bd=dd;bi=k;} } return bi; }
  var out=[];
  for(var n=0;n<sc.objects.length;n++){
    var o=sc.objects[n]; if(o.kind!=='grandstand')continue;
    var sgn=(o.side==='R')?1:-1, pts=[];
    if(o.shape==='arc'){
      var a=scenIndexAt(h,o.fromLatLon,o.fromS), b=scenIndexAt(h,o.toLatLon,o.toS);
      var span=(b-a+M)%M; if(span>M/2)continue;
      for(var t=0;t<=span;t++){ var i=(a+t)%M, P=track.P[i], R=track.R[i];
        for(var q=0;q<=1;q+=0.25){ var off=o.off+o.d*q;
          pts.push([P.x+R.x*sgn*off, P.z+R.z*sgn*off]); } }
    } else {
      // ПРЯМАЯ трибуна строится настоящим строителем, а не повторением его
      // формул. Повторение уже соврало: buildScenery ПЕРЕСЧИТЫВАЕТ atS из latLon
      // (защита «трибуна не должна уехать на 100 м»), а пробник читал atS
      // из данных — и мерил футпринт трибуны, развёрнутой на 90° от настоящей.
      // Заодно так учитывается любой будущий ключ ориентации (faceLatLon).
      var ob={}; for(var kk in o)ob[kk]=o[kk];
      if(o.latLon)ob.atS=track.S[scenIndexAt(h,o.latLon,o.atS)];
      var mm=new THREE.MeshBasicMaterial();
      var g=buildSceneryObject(THREE,ob,{crowd:mm,struct:mm,glass:mm},h);
      if(!g)continue;
      g.updateMatrixWorld(true);
      var v3=new THREE.Vector3();
      g.traverse(function(ch){
        if(!ch.isMesh||!ch.geometry||!ch.geometry.attributes.position)return;
        var pa=ch.geometry.attributes.position;
        for(var q=0;q<pa.count;q++){
          v3.set(pa.getX(q),pa.getY(q),pa.getZ(q)).applyMatrix4(ch.matrixWorld);
          pts.push([v3.x,v3.z]); }
      });
    }
    out.push({name:o.name||('#'+n), pts:pts});
  }
  return {list:out};
})()`;
const STAND_GAP = 1.5;       // ближе этого две трибуны уже выглядят одной сложенной кучей

const MARKER_GAP = 0.15;     // насколько щит обязан выступать перед стеной, если он низкий
const MARKER_FREE = 2.0;     // ближе этого к стене считаем, что стена стоит прямо за щитом
// Четвёртая проверка: ЩИТ НЕ ДОЛЖЕН УЕХАТЬ ОТ КРОМКИ. Позиция щита снимается
// с линии отбойника, а отбойник местами убегает в вылет (у шпильки Монреаля
// 9.0 -> 16.0 м на ста метрах, вдоль прямой Casino стоит на потолке 12 м).
// В v1.15.24 потолок выноса потеряли, и щит «50» у шпильки уехал на 6.8 м
// за кромку — вчетверо дальше своих же соседей по зоне торможения; владелец
// увидел это на устройстве спустя 31 сборку, а пробник молчал, потому что
// смотрел только «не спрятан ли щит ЗА стеной». Порог взят с запасом над
// самыми дальними законными щитами: Сильверстоун/Village 4.07 и Монца/Lesmo 1
// 4.05 м за кромкой.
const MARKER_FAR = 5.0;      // дальше этого за кромкой щит уже не прочитать

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
    // Стена «стоит за щитом» только если она рядом; у Монцы отбойник в 24 м,
    // и щит на 11 м с ней вообще не пересекается — там проверять нечего.
    const behind = m => m.far > m.wall - MARKER_FREE;
    const bad = s.list.filter(m => behind(m) && m.near > m.wall - MARKER_GAP && m.bottom < m.wallH);
    const dim = s.list.filter(m => behind(m) && m.top <= m.wallH);
    const far = s.list.filter(m => m.past > MARKER_FAR);
    const byCorner = {};
    s.list.forEach(m => { (byCorner[m.corner] = byCorner[m.corner] || []).push(m.past); });
    let spread = 0, spreadAt = '';
    for (const c in byCorner) {
      const v = byCorner[c], d = Math.max(...v) - Math.min(...v);
      if (d > spread) { spread = d; spreadAt = c; }
    }
    r.line(`${T.name.padEnd(12)} щитов торможения ${String(s.list.length).padStart(3)} · `
      + `за отбойником ${bad.length} · тонет в отбойнике ${dim.length} · `
      + `дальше ${MARKER_FAR} м за кромкой ${far.length} · `
      + `наибольший разброс в зоне торможения ${spread.toFixed(2)} м (${spreadAt})`);
    for (const m of far) {
      const say = T.hidden ? r.note.bind(r) : r.fail.bind(r);
      say(`${T.name}: щит «${m.name}» стоит в ${m.off} м от осевой — это ${m.past} м `
        + `за кромкой (${m.S} м от старта), отбойник в ${m.wall} м. Позицию сняли `
        + `с линии барьера там, где она убегает в вылет; щит должен оставаться `
        + `у кромки, а не у стены`);
    }
    for (const m of dim) {
      const say = T.hidden ? r.note.bind(r) : r.fail.bind(r);
      say(`${T.name}: щит «${m.name}» стоит у отбойника (${m.wall} м), а его верх ${m.top} м `
        + `НИЖЕ верха стены ${m.wallH} м — читается как часть отбойника, а не как щит`);
    }
    for (const m of bad) {
      const say = T.hidden ? r.note.bind(r) : r.fail.bind(r);
      say(`${T.name}: полотно щита «${m.name}» лежит в ${m.near}..${m.far} м от осевой, `
        + `отбойник в ${m.wall} м (${m.S} м от старта), низ щита ${m.bottom} м — `
        + `щит целиком ЗА стеной и ниже её, из болида его не видно`);
    }
  }
  for (const T of H.tracks()) {
    const env = H.loadGame({ seed: opt.seed || 3 });
    H.setupWorld(env, { trackIdx: T.idx });
    const s = env.evalIn(STANDS);
    if (!s.list || s.list.length < 2) continue;
    let worst = null;
    for (let i = 0; i < s.list.length; i++) for (let j = i + 1; j < s.list.length; j++) {
      let d = 1e9;
      for (const a of s.list[i].pts) for (const b of s.list[j].pts)
        d = Math.min(d, Math.hypot(a[0] - b[0], a[1] - b[1]));
      if (d < STAND_GAP) {
        const say = T.hidden ? r.note.bind(r) : r.fail.bind(r);
        say(`${T.name}: трибуны «${s.list[i].name}» и «${s.list[j].name}» сходятся на ${d.toFixed(1)} м — `
          + `на экране это одна сложенная куча, а не две трибуны`);
      }
      if (!worst || d < worst.d) worst = { d, a: s.list[i].name, b: s.list[j].name };
    }
    r.line(`${T.name.padEnd(12)} трибун ${String(s.list.length).padStart(3)} · `
      + `ближайшая пара ${worst.d.toFixed(1)} м`);
  }
  if (r.ok) r.line('ни один стоящий объект не пересекает полотно, ни один щит не спрятан за отбойником');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
