/* ============================================================================
   Пробник — БОЛИД ИГРОКА И КАМЕРА СТОЯТ НА ДОРОГЕ, А НЕ ПОД НЕЙ

   Владелец (06.10.2026, v1.16.50, скриншот Монако): «ты что-то сломал» — камера
   кокпита у самой воды, между подпорными стенами, дорога высоко над головой.
   Причина: в placePlayer комментарий `//` дописали посреди строки, и он проглотил
   reliefSit(c) — болид перестал подниматься на рельеф и остался на нулевой высоте
   плоского мира (§8: всё, что ставится по ходу гонки, — через reliefSit). Ни один
   пробник этого не видел: высоту болида игрока никто не мерил.

   Проверка: на каждой видимой трассе автопилот едет квалификацию в кокпите ~25 с;
   каждый кадр болид игрока обязан стоять на высоте рельефа под собой (разница
   < 0.5 м; на трассах без рельефа — ноль), а камера кокпита — на 1.0–2.0 м выше
   болида (по контракту 1.42).
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const FRAMES = 1500;          // 25 с при 60 кадрах
const TOL = 0.5;              // м: болид от рельефа под собой
const CAM_LO = 1.0, CAM_HI = 2.0;

function run(opt) {
  opt = opt || {};
  const r = R.result('Болид игрока и камера кокпита стоят на дороге, а не под ней');
  for (const T of H.tracks(true)) {
    const env = H.loadGame({ seed: opt.seed || 11 });
    H.setupWeekend(env, { trackIdx: T.idx, view: 'cockpit' });
    const m = env.evalIn(`(function(){
      qualiLapsLeft=99; var worst=0, camLo=1e9, camHi=-1e9, at=0, rel=!!track.relief;
      for(var f=0;f<${FRAMES};f++){ __AP.drive(); update(1/60);
        var want=rel?reliefAt(player.x,player.z,true).y:0, d=Math.abs(player.mesh.position.y-want);
        if(d>worst){ worst=d; at=Math.round(track.S[player.hint]); }
        var ch=cam.position.y-player.mesh.position.y; if(ch<camLo)camLo=ch; if(ch>camHi)camHi=ch; }
      return {rel:rel, worst:+worst.toFixed(2), at:at, camLo:+camLo.toFixed(2), camHi:+camHi.toFixed(2)};
    })()`);
    const name = T.name.padEnd(12);
    r.line(`${name} ${m.rel ? 'рельеф' : 'плоская'}: болид от земли под собой до ${m.worst} м (S=${m.at}); камера над болидом ${m.camLo}–${m.camHi} м`);
    if (m.worst > TOL) r.fail(`${T.name}: болид игрока не на дороге — до ${m.worst} м от рельефа под собой (S=${m.at})`);
    if (m.camLo < CAM_LO || m.camHi > CAM_HI) r.fail(`${T.name}: камера кокпита ${m.camLo}–${m.camHi} м над болидом, ждём ${CAM_LO}–${CAM_HI}`);
  }
  r.note('ловит потерянный reliefSit у болида игрока (v1.16.50: комментарий посреди строки проглотил его)');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
