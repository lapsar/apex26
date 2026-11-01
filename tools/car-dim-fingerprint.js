/* ============================================================================
   car-dim-fingerprint.js — справка (v1.17.24): гонка целиком, отпечаток до последнего знака.
   Для правок, которые НЕ должны менять езду (например, размер болида собран в одно место):
   три минуты гонки со сходами и ошибками на каждой видимой трассе, затем хеш всех dist/lane/speed
   и позы игрока. Сравнивать две сборки — двумя процессами (APEX_INDEX), строки обязаны совпасть.
     node tools/car-dim-fingerprint.js [--secs=180] [--seed=7]
   ========================================================================== */
'use strict';
const H = require('./harness');
const crypto = require('crypto');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const secs = +arg('secs', 180), seed = +arg('seed', 7);
for (const T of H.tracks(true)) {
  const env = H.loadGame({ seed });
  H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 5 });
  H.startRaceAt(env, 11);
  H.lightsOut(env);
  const s = env.evalIn(`(function(){var dt=1/60;__drive(Math.round(${secs}/dt),dt,'auto',function(){return !(phase===''||raceOver);});
    return JSON.stringify([player.x,player.z,player.hdg,player.speed].concat(field.map(function(c){return [c.dist,c.lane,c.speed,c.retired?1:0];})));})()`);
  const h = crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
  const o = JSON.parse(s);
  console.log(T.name.padEnd(12), h, 'игрок', o[0].toFixed(3), o[1].toFixed(3), 'сошли', o.slice(4).filter(c => c[3]).length);
}
