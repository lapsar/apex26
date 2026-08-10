/* ============================================================================
   Пробник 11 — ОТПЕЧАТОК УЖЕ ОТКАТАННЫХ ТРАСС

   Зачем он есть. Каждая трасса живёт в своих ячейках (TRACKDATA, строка
   в TRACKS, SCENERY_BY_KEY, STRAIGHTEN_STANDS), поэтому добавление новой
   трассы само по себе старые тронуть не может. Ломает их другое: правка
   ОБЩЕГО кода — строителей отбойника, зон вылета, трибун, кромок, профиля
   ширины, — сделанная ради новой трассы. Такую правку глазами не поймать:
   надо заново проехать Монцу и Сильверстоун и вспомнить, как было.

   Пробник снимает с каждой существующей трассы набор чисел и сверяет
   с эталоном. Разошлось — значит мир трассы физически другой.

   Что снимается:
     meshes/tris  — сколько мешей и треугольников в сцене;
     len/M        — длина круга и число точек осевой (сама геометрия трассы);
     hw           — сумма профиля полуширины: ловит правку buildWidth;
     wall         — суммы отступов и высот отбойника слева/справа:
                    это то, обо что бьётся игрок, а не картинка;
     grid         — 22 стартовые клетки (точка и курс) до сантиметра;
     geo          — хеш ВСЕЙ геометрии сцены: каждая вершина каждого меша,
                    округлённая до сантиметра. Сдвинулась любая полоса
                    отбойника, трибуна или кромка — хеш другой.

   Порядок мешей в сцене на хеш не влияет (хеши мешей сортируются): менять
   очередь scene.add можно свободно, это не видно на экране.

   ЕСЛИ ПРОБНИК ПРОВАЛИЛСЯ, а правка была намеренной — числа ниже надо
   переписать тем, что выдал изменённый код, и в том же коммите написать
   в CLAUDE.md, что именно на старых трассах изменилось и почему.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

// эталон снят 08.2026 на index.html v1.15.17
const PRINT = {
  Monza: {
    meshes: 43, tris: 24012, M: 1442, len: 5767.796, hw: 11536,
    wall: '24.25/21.02/0.99/1.00', grid: 'dba1c023', geo: 'c40107b8',
  },
  Silverstone: {
    meshes: 46, tris: 25166, M: 1466, len: 5867.002, hw: 10995,
    wall: '27.26/22.40/1.00/1.00', grid: '68f75fdf', geo: '80f4924e',
  },
  // 08.2026: убраны стопки покрышек (заглушка неразмеченных трасс) и сделан общим
  // материал трибун-заглушек. Сузука 218 → 40 мешей, 667 → 489 вызовов в гонке.
  // Монцу и Сильверстоун это не задело: у размеченных трасс ни того, ни другого нет —
  // их строки в этой таблице остались прежними, что и служит доказательством.
  Suzuka: {
    meshes: 40, tris: 20512, M: 1451, len: 5804.747, hw: 10157,
    wall: '18.57/18.47/0.99/0.99', grid: '3d2863dd', geo: '02421b55',
  },
  Monaco: {
    meshes: 36, tris: 12228, M: 830, len: 3319.511, hw: 4978.846,
    wall: '6.99/7.00/1.00/1.00', grid: 'aedeb351', geo: '1e24d466',
  },
  // Монреаль, 08.2026. Этап 3, часть 1: барьер размечен по спутниковому снимку
  // в гоночной конфигурации. Было обобщённо 10.00/10.00 (3 м за кромкой) —
  // стало 10.06/9.20: минимум 9 м (2 м за кромкой) плюс расширение до 16 м
  // снаружи шпильки. Зоны вылета и трибуны пока обобщённые — части 2 и 3,
  // на них числа изменятся снова.
  Montreal: {
    meshes: 42, tris: 14228, M: 1087, len: 4348.704, hw: 7609,
    wall: '10.06/9.20/1.00/1.00', grid: '319627f8', geo: '5908d5bc',
  },
};

// Хеш считается внутри игры: гонять 200 тысяч координат через границу vm дорого.
// FNV-1a по 32 битам, координаты квантуются до сантиметра.
const MEASURE = `(function(){
  function H32(){ this.h=2166136261>>>0; }
  H32.prototype.n=function(v){ v=v|0;
    for(var b=0;b<4;b++){ this.h^=(v>>>(b*8))&255; this.h=Math.imul(this.h,16777619)>>>0; }
    return this; };
  H32.prototype.hex=function(){ return ('0000000'+this.h.toString(16)).slice(-8); };
  var q=function(v){ return Math.round(v*100); };                 // сантиметр

  var meshes=0, tris=0, parts=[];
  scene.traverse(function(o){
    if(!o.isMesh||!o.geometry)return;
    var g=o.geometry, pa=g.attributes.position;
    var n=g.index?g.index.count/3:(pa?pa.count/3:0);
    meshes++; tris+=n;
    var h=new H32();
    h.n(Math.round(n)).n(g.index?g.index.count:0).n(pa?pa.count:0);
    o.updateMatrixWorld(true);
    var v=new THREE.Vector3();
    if(pa)for(var i=0;i<pa.count;i++){                             // в мировых координатах:
      v.set(pa.getX(i),pa.getY(i),pa.getZ(i)).applyMatrix4(o.matrixWorld);   // группу могли сдвинуть
      h.n(q(v.x)).n(q(v.y)).n(q(v.z)); }
    parts.push(h.hex());
  });
  parts.sort();                                                   // порядок scene.add значения не имеет
  var geo=new H32(); parts.forEach(function(s){ for(var i=0;i<s.length;i++)geo.n(s.charCodeAt(i)); });

  var hw=0; for(var i=0;i<track.M;i++)hw+=track.HW[i];

  var wl=0,wr=0,vl=0,vr=0;                                        // отбойник: отступы и высоты
  for(var i=0;i<track.M;i++){ wl+=track.WL?track.WL[i]:0; wr+=track.WR?track.WR[i]:0;
                              vl+=track.VL?track.VL[i]:0; vr+=track.VR?track.VR[i]:0; }
  var wall=[wl,wr,vl,vr].map(function(s){ return (s/track.M).toFixed(2); }).join('/');

  var gh=new H32();                                               // 22 стартовые клетки
  for(var k=0;k<22;k++){ var s=gridSpot(k);
    gh.n(q(s.pos.x)).n(q(s.pos.y)).n(q(s.pos.z)).n(Math.round(s.hdg*10000)); }

  return { name:track.name, meshes:meshes, tris:Math.round(tris), M:track.M,
           len:Math.round(track.length*1000)/1000,
           hw:Math.round(hw*1000)/1000,
           wall:wall, grid:gh.hex(), geo:geo.hex() };
})()`;

const FIELDS = [
  ['meshes', 'мешей'], ['tris', 'треугольников'], ['M', 'точек осевой'],
  ['len', 'длина круга'], ['hw', 'профиль ширины'], ['wall', 'отбойник'],
  ['grid', 'решётка'], ['geo', 'геометрия'],
];

function run(opt) {
  opt = opt || {};
  const r = R.result('Отпечаток трасс — старые трассы не сдвинулись');

  const env0 = H.loadGame();
  const names = env0.evalIn('TRACKS.map(function(t){return t.name;})');

  let checked = 0;
  for (let ti = 0; ti < names.length; ti++) {
    const env = H.loadGame({ seed: opt.seed || 3 });
    H.setupWorld(env, { trackIdx: ti });
    const got = env.evalIn(MEASURE);
    const want = PRINT[got.name];

    if (!want) {                                    // новая трасса: эталона ещё нет
      r.note(`${got.name}: эталона нет — новая трасса. Числа для записи: `
        + FIELDS.map(([k]) => `${k} ${got[k]}`).join(', '));
      continue;
    }
    checked++;
    const bad = FIELDS.filter(([k]) => String(want[k]) !== String(got[k]));
    r.line(`${got.name.padEnd(12)} ${got.meshes} мешей · ${got.tris} тр. · круг ${got.len} м · `
      + `отбойник ${got.wall} · геометрия ${got.geo}`
      + (bad.length ? '  ← РАЗОШЛОСЬ' : ''));
    for (const [k, ru] of bad) {
      r.fail(`${got.name} / ${ru}: было ${want[k]}, стало ${got[k]}`);
    }
  }

  if (r.ok && checked) r.line(`${checked} из ${names.length} трасс совпали с эталоном до сантиметра`);
  if (!r.ok) {
    r.note('Если правка была намеренной — перепиши числа в PRINT внутри этого файла '
      + 'и опиши в CLAUDE.md, что изменилось на старых трассах.');
  }
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
