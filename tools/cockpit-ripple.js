/* ============================================================================
   СПРАВКА — РЯБЬ КУЗОВА В КОКПИТЕ (v1.17.30)

   Владелец (02.11.2026, iPhone, Баку): «рябь цветом по бокам от шлема, на подъёме
   к замку есть, на стартовой прямой нет». В модели W17 слои лежат друг на друге
   (краска и наклейка, двойной карбон) — пока взгляд на кузов не меняется, видна
   одна и та же поверхность; если взгляд на кузов сдвигается каждый кадр, слои
   мигают. До v1.17.30 кузов кивал по сырому уклону, а взгляд догонял его за
   CAM_HEAD — на рельефе взгляд на кузов сдвигался каждый кадр.

   Что делает: болид игрока едет по осевой со скоростью 38 м/с (кадр 1/60 с),
   в сцене виден только он сам; каждая пара соседних кадров сравнивается:
   «искра» — точка кузова изменилась больше 12 из 255, а четыре соседа — нет.
   Печатает среднее число искр за кадр и долю изменившихся точек кузова.
   Ровное место без уклона — эталон «покоя» (остаток — края колёс, они крутятся).

     node tools/cockpit-ripple.js [S=2600] [кадров=60] [Ключ трассы=Baku]
     APEX_INDEX=<сборка> node tools/cockpit-ripple.js …   # другая сборка
   Замер v1.17.30: Баку S 2600 — 1070 → 90 искр за кадр.
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const HTML = path.resolve(process.env.APEX_INDEX || path.join(__dirname, '..', 'index.html'));
const S0 = +(process.argv[2] || 2600), N = +(process.argv[3] || 60), KEY = process.argv[4] || 'Baku';
const CHROME = '/opt/pw-browsers/chromium';

(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch({
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 480 } });
  p.on('pageerror', e => console.log('JS-ошибка: ' + e.message));
  await p.goto('file://' + HTML); await p.waitForTimeout(1000);
  const ok = await p.evaluate(key => {
    const t = TRACKS.findIndex(t => t.key === key); if (t < 0) return 'нет трассы ' + key;
    sel.track = t; sel.roster = 0; sel.diff = 'normal'; sel.laps = 1; sel.view = 'cockpit';
    selTeam = ROSTER[sel.roster].teamIdx; camMode = 'cockpit'; startWeekend(); return 'ok'; }, KEY);
  if (ok !== 'ok') { console.log(ok); await b.close(); process.exit(1); }
  await p.waitForTimeout(2500);
  const r = await p.evaluate(({ S0, N }) => {
    cancelAnimationFrame(rafId); paused = true;
    const keep = new Set(); player.mesh.traverse(o => keep.add(o));
    scene.traverse(o => { if (o.isMesh && !keep.has(o)) o.visible = false; });
    const gl = renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    let prev = null, bg = null, sparks = 0, chg = 0, pairs = 0, maxSlope = 0;
    for (let n = 0, s = S0; n < N; n++, s += 38 / 60) {
      let k = 0; while (k < track.M - 1 && track.S[k] < s) k++; k = Math.max(1, k);
      const a = k - 1, t = (s - track.S[a]) / (track.S[k] - track.S[a]);
      player.x = track.P[a].x + (track.P[k].x - track.P[a].x) * t; player.z = track.P[a].z + (track.P[k].z - track.P[a].z) * t;
      player.hdg = Math.atan2(track.P[k].x - track.P[a].x, track.P[k].z - track.P[a].z);
      player.speed = 38; player.hint = a; player.steerVis = 0;
      placePlayer(player); updateCamera(1 / 60); render();
      maxSlope = Math.max(maxSlope, Math.abs(player.slope || 0));
      const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (!bg) bg = [px[0], px[1], px[2]];
      if (prev) {
        const body = i => Math.max(Math.abs(px[i] - bg[0]), Math.abs(px[i + 1] - bg[1]), Math.abs(px[i + 2] - bg[2])) > 6 &&
                          Math.max(Math.abs(prev[i] - bg[0]), Math.abs(prev[i + 1] - bg[1]), Math.abs(prev[i + 2] - bg[2])) > 6;
        const d = i => Math.max(Math.abs(px[i] - prev[i]), Math.abs(px[i + 1] - prev[i + 1]), Math.abs(px[i + 2] - prev[i + 2])) > 12;
        let nb = 0, nc = 0, ns = 0;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const i = (y * W + x) * 4; if (!body(i)) continue; nb++; if (!d(i)) continue; nc++;
          if (!d(i - 4) && !d(i + 4) && !d(i - W * 4) && !d(i + W * 4)) ns++; }
        sparks += ns; chg += nb ? nc / nb : 0; pairs++; }
      prev = px; }
    return { sparks: sparks / pairs, chg: chg / pairs * 100, maxSlope }; }, { S0, N });
  console.log(`${KEY} S ${S0}, ${N} кадров, уклон до ${(r.maxSlope * 100).toFixed(1)} %: искр за кадр ${r.sparks.toFixed(0)}, ` +
    `изменилось точек кузова ${r.chg.toFixed(2)} %  (${path.basename(HTML)})`);
  await b.close();
})();
