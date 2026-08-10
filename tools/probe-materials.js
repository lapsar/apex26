/* ============================================================================
   Пробник 8 — ЦЕЛОСТНОСТЬ МАТЕРИАЛОВ

   Две ошибки, каждая из которых уже стоила итерации (CLAUDE.md §8 п.4):
     • материал с текстурой на геометрии без атрибута uv — текстура не ложится;
     • материал с vertexColors на геометрии без атрибута color — меш чёрный.
   Обе появлялись после склейки по материалам: mergeGeos переносит только те
   атрибуты, которые знает.

   Проверяется вся сцена: полотно, окружение, болид игрока и оба уровня
   детализации каждого соперника (скрытый LOD тоже, иначе поломка всплывёт
   только когда машина подъедет ближе).
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const SCAN = `(function(){
  var MAPS=['map','alphaMap','aoMap','bumpMap','displacementMap','emissiveMap','envMap',
            'lightMap','metalnessMap','normalMap','roughnessMap','specularMap','gradientMap'];
  var noUV=[], noCol=[], meshes=0, mats={}, tris=0;
  scene.traverse(function(o){
    if(!o.isMesh||!o.geometry) return;
    meshes++;
    var g=o.geometry, hasUV=!!(g.attributes&&g.attributes.uv), hasCol=!!(g.attributes&&g.attributes.color);
    var pos=g.attributes&&g.attributes.position;
    tris += g.index ? g.index.count/3 : (pos?pos.count/3:0);
    var list=Array.isArray(o.material)?o.material:[o.material];
    list.forEach(function(m){
      if(!m) return;
      mats[m.uuid]=1;
      var used=MAPS.filter(function(k){ return m[k]; });
      // envMap на сцене общая и работает без uv второго набора — она не в счёт
      var needUV=used.filter(function(k){ return k!=='envMap'; });
      if(needUV.length && !hasUV)
        noUV.push((o.name||m.type)+' ← '+needUV.join('/'));
      if(m.vertexColors && !hasCol)
        noCol.push((o.name||m.type)+' ('+m.type+')');
    });
  });
  return {meshes:meshes, mats:Object.keys(mats).length, tris:Math.round(tris),
          noUV:noUV, noCol:noCol};
})()`;

function run(opt) {
  opt = opt || {};
  const r = R.result('Целостность материалов — текстура без UV и vertexColors без цвета');

  for (const T of H.tracks()) {                        // все трассы, сколько бы их ни было
    const ti = T.idx;
    const env = H.loadGame({ seed: opt.seed || 31 });
    H.setupWeekend(env, { trackIdx: ti, diff: 'normal', laps: 1 });
    H.startRaceAt(env, 11);              // в сцене теперь и игрок, и 21 соперник с двумя LOD
    env.evalIn(`__drive(1,1/60,'idle');`);
    const s = env.evalIn(SCAN);
    const name = env.evalIn('track.name');

    r.line(`${name.padEnd(12)} мешей ${String(s.meshes).padStart(4)} · материалов ${String(s.mats).padStart(3)}`
      + ` · треугольников ${s.tris} · без UV: ${s.noUV.length} · без цвета: ${s.noCol.length}`);
    const uniq = a => [...new Set(a)];
    for (const b of uniq(s.noUV).slice(0, 6)) r.fail(`${name}: текстура без UV — ${b}`);
    for (const b of uniq(s.noCol).slice(0, 6)) r.fail(`${name}: vertexColors без атрибута цвета — ${b}`);
  }
  if (r.ok) r.line('битых мешей нет ни на одной трассе');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
