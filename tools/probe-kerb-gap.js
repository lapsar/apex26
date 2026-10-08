/* ============================================================================
   Пробник — ПОРЕБРИК ЛЕЖИТ НАД АСФАЛЬТОМ, А НЕ В НЁМ

   Владелец (08.10.2026, v1.16.55, скриншот Монако): «на выезде из шпильки, поворачивая
   к тоннелю, на поребрике давно есть какие-то проплешины». Поребрик — тонкая лента над
   обочиной (на ровных трассах 1 см над полотном); на рельефе вершины поребрика и асфальта
   под ним поднимались каждая по своему ближайшему отрезку, и на крутом спуске зазор
   съедался до 2 мм (на iPad асфальт просвечивает), а у Сент-Девот и в тоннельной шикане
   поребрик уходил под асфальт до 3 см. Лечение — kerbConform (v1.16.56).

   Проверка: на каждой трассе из центра каждого треугольника поребрика луч вниз (и вверх —
   на 0.5 м) по всем остальным мешам; ближайшая поверхность обязана лежать ниже поребрика
   не меньше чем на GAP_MIN. Треугольник без поверхности под собой не считается.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const GAP_MIN = 0.005;        // м: тоньше — на iPad (16-битная глубина) асфальт просвечивает

function run() {
  const r = R.result('Поребрик лежит над асфальтом, а не в нём');
  for (const T of H.tracks()) {
    const env = H.setupWorld(H.loadGame(), { trackIdx: T.idx });
    const m = env.evalIn(`(function(){scene.updateMatrixWorld(true);var ms=[];scene.traverse(function(o){if(o.isMesh)ms.push(o);});
      var kerb=function(o){var t=o.material&&o.material.map&&o.material.map.image;return !!t&&t.width===32&&t.height===16;};
      var K=ms.filter(kerb),O=ms.filter(function(o){return !kerb(o);}),rc=new THREE.Raycaster(),dn=new THREE.Vector3(0,-1,0);
      var n=0,bad=0,worst=1e9,at=0,v=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
      K.forEach(function(k){var pa=k.geometry.attributes.position,ix=k.geometry.index.array;
        for(var t=0;t<ix.length;t+=3){for(var q=0;q<3;q++)v[q].fromBufferAttribute(pa,ix[t+q]).applyMatrix4(k.matrixWorld);
          var p=v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1/3);rc.set(new THREE.Vector3(p.x,p.y+0.5,p.z),dn);rc.far=1.5;
          var h=rc.intersectObjects(O,false)[0];if(!h)continue;n++;var g=p.y-h.point.y;
          if(g<${GAP_MIN})bad++;if(g<worst){worst=g;var bi=0,bd=1e18;for(var i=0;i<track.M;i++){var d=Math.pow(track.P[i].x-p.x,2)+Math.pow(track.P[i].z-p.z,2);if(d<bd){bd=d;bi=i;}}at=Math.round(track.S[bi]);}}});
      return {n:n,bad:bad,worst:n?+(worst*100).toFixed(1):0,at:at};})()`);
    r.line(`${T.name.padEnd(12)} треугольников поребрика ${String(m.n).padStart(4)} · тоньше ${GAP_MIN * 1000} мм ${m.bad} · наименьший зазор ${m.worst} см (S=${m.at})`);
    if (m.bad) r.fail(`${T.name}: поребрик над асфальтом тоньше ${GAP_MIN * 1000} мм или под ним — ${m.bad} треугольников, худший ${m.worst} см у S=${m.at}`);
  }
  r.note('ловит «проплешины» поребрика на рельефе (v1.16.55: Монако, S 1328–1348, 196–208, 2081–2140)');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
