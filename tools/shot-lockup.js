/* Съёмка ошибки соперника («проскочил поворот») глазами болида позади (v1.16.68, дым блокировки PUFF_*).
   Гонка крутится до --warm секунд, затем ищется тройка подряд идущих соперников T, F1, F2, где T подъезжает
   к точке решения ошибки (errCorners), а F1 — в 8–45 м за ним. T получает ошибку принудительно (без броска
   Math.random — съёмке зерно не важно). От первого клуба дыма снимаются кадры через --dt секунд:
   кокпит F1 (на позицию позади), кокпит F2 (на две позиции) и «телевизионный» вид сверху-спереди,
   как у съёмки трансляции. Камера кокпита — как у игрока: y=1.42 над асфальтом, 0.62 м позади центра.
     node tools/shot-lockup.js --track=0 --warm=40 --out=/tmp/lock [--html=archive/vX.html]
   Оговорки: программный рендерер (swiftshader), земляная плита опущена, как в shot-track. Игра не меняется. */
'use strict';
const path = require('path'), fs = require('fs');
const args = {};
process.argv.slice(2).forEach(a => { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) args[m[1]] = m[2]; });
const HTML = path.resolve(args.html || path.join(__dirname, '..', 'index.html'));
const OUT = path.resolve(args.out || '/tmp/lock');
const TRACK = +(args.track || 0), WARM = +(args.warm || 40);
const TIMES = (args.times || '0.1,0.35,0.7,1.0,1.4').split(',').map(Number);
const VIEWS = (args.views || 'f1,f2,tv').split(',');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

(async () => {
  const { chromium } = require('playwright');
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 560 } });
  p.on('pageerror', e => console.log('  JS-ОШИБКА: ' + e.message));
  const SEED = +(args.seed || 7);                 // зерно Math.random: две сборки снимают одну и ту же гонку
  await p.addInitScript(sd => { let a = sd >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }, SEED);
  await p.goto('file://' + HTML);
  await p.waitForTimeout(600);
  await p.evaluate(([T]) => {
    sel.track = T; sel.roster = 0; sel.diff = 'normal'; sel.laps = 5; sel.view = 'cockpit';
    selTeam = ROSTER[sel.roster].teamIdx; camMode = 'cockpit'; startWeekend();
  }, [TRACK]);
  await p.waitForTimeout(1500);
  const info = await p.evaluate(([WARM]) => {
    player.best = qualiField[20].time + 2;                     // игрок последним: он стоит на решётке и никому не мешает
    beginQualiOutro(); qualiOutro = false; raceOutro = false; startRace();
    clearTimeout(qualiOutroTimer);
    document.getElementById('s-quali').classList.remove('active');
    document.getElementById('game').classList.add('active');
    cancelAnimationFrame(rafId);                                // кадры двигаем сами
    lights.t = 0; lights.seq = 5; lights.offAt = 0.0001; lights.go = true; lights.hide = 0; raceTime = 0;
    updateCamera = function () {};
    ['bigmsg', 'tower', 'topinfo', 'posbadge', 'lightsG'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.querySelectorAll('.btnrow,.pad,.touch,.hud,#pauseov,#topbtns,#kb,.kb,#pad').forEach(el => (el.style.display = 'none'));
    scene.children.forEach(o => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 9000) o.position.y = -0.6; });
    for (let f = 0; f < Math.round(WARM * 60); f++) { controls.gas = 0; update(1 / 60); }
    const ec = errCorners(), M = track.M;
    for (let f = 0; f < 60 * 120; f++) {
      controls.gas = 0; update(1 / 60);
      const ord = field.filter(c => !c.retired).sort((a, c) => c.dist - a.dist);
      for (let k = 2; k < ord.length - 2; k++) {
        const T = ord[k], F1 = ord[k + 1], F2 = ord[k + 2];
        if (T.err || !lights.go) continue;
        const iu = Math.floor(((T.u % 1) + 1) % 1 * M) % M, ci = ec.trig[iu];
        if (ci < 0 || neutralAt(iu)) continue;
        const g1 = Math.hypot(T.x - F1.x, T.z - F1.z), g2 = Math.hypot(T.x - F2.x, T.z - F2.z);
        if (g1 < 8 || g1 > 45 || g2 > 90) continue;
        const C = ec.list[ci];
        T.err = { d0: T.dist, side: C.side, lead: C.lead, toAp: C.toAp, toEx: C.toEx }; T.duel = null;
        window.__L = { T, F1, F2, born: null };
        window.__camF1 = () => { const m = F1.mesh, h = m.rotation.y;          // камера «игрока» — кокпит F1: клубы ставятся только у камеры
          cam.position.set(m.position.x - Math.sin(h) * 0.62, m.position.y + 1.42, m.position.z - Math.cos(h) * 0.62);
          cam.lookAt(m.position.x + Math.sin(h) * 40, m.position.y + 0.9, m.position.z + Math.cos(h) * 40); cam.updateMatrixWorld(); };
        window.__camF1();
        return { name: track.spec.name, T: T.code, F1: F1.code, F2: F2.code, pos: k + 1, g1: +g1.toFixed(1), g2: +g2.toFixed(1),
          v: +(T.speed * 3.6).toFixed(0), S: +track.S[iu].toFixed(0) };
      }
    }
    return { name: track.spec.name, fail: 'тройки у точки решения не нашлось' };
  }, [WARM]);
  console.log(JSON.stringify(info));
  if (info.fail) { await b.close(); process.exit(1); }
  if (args.overdraw) {                           // цена для видеокарты: доля экрана под полупрозрачным дымом, кадр за кадром, из кокпита F1
    const od = await p.evaluate(() => { const L = window.__L, H = renderer.domElement.height, W = renderer.domElement.width;
      const k = H / 2 / Math.tan(cam.fov * Math.PI / 360), scr = W * H, v = new THREE.Vector3();
      const area = (x, y, z, r) => { v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse); const d = -v.z; if (d < 0.3) return 0;
        const hp = r * k / d, sx = W / 2 + v.x * k / d, sy = H / 2 - v.y * k / d;   // квадрат со стороной 2r в пикселях, обрезанный краем экрана
        const w = Math.max(0, Math.min(W, sx + hp) - Math.max(0, sx - hp)), h = Math.max(0, Math.min(H, sy + hp) - Math.max(0, sy - hp));
        return w * h; };                                                   // у сферы — круг, ×π/4
      let mx = 0, sum = 0, n = 0, calls = 0, mxCalls = 0;
      for (let f = 0; f < 60 * 3.5; f++) { controls.gas = 0; __camF1(); update(1 / 60); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
        let a = 0; calls = 0;
        if (track._puffs) for (const m of track._puffs.list) if (m.visible && m.material.opacity > 0) { calls++;
          a += 5 * Math.PI / 4 * area(m.position.x, m.position.y + 0.6 * m.scale.x, m.position.z, 0.48 * m.scale.x); }
        if (track._smoke && track._smoke.mesh.visible) { calls++; const pa = track._smoke.mesh.geometry.attributes.position.array;
          for (let q = 0; q < SMOKE_N; q++) { const o = q * 12; if (pa[o] === 0 && pa[o + 2] === 0) continue;
            const cx = (pa[o] + pa[o + 6]) / 2, cy = (pa[o + 1] + pa[o + 7]) / 2, cz = (pa[o + 2] + pa[o + 8]) / 2;
            const r = Math.hypot(pa[o + 6] - pa[o], pa[o + 7] - pa[o + 1], pa[o + 8] - pa[o + 2]) / 2 / Math.SQRT2;
            a += area(cx, cy, cz, r); } }
        a /= scr; mx = Math.max(mx, a); sum += a; n++; mxCalls = Math.max(mxCalls, calls); }
      return { maxScreens: +mx.toFixed(2), meanScreens: +(sum / n).toFixed(3), maxCalls: mxCalls }; });
    console.log('OVERDRAW', JSON.stringify(od)); await b.close(); return;
  }
  // до первого клуба
  await p.evaluate(() => { const L = window.__L;
    for (let f = 0; f < 600 && !(L.T.err && L.T.dist - L.T.err.d0 >= L.T.err.lead - 18); f++) { controls.gas = 0; __camF1(); update(1 / 60); }
    L.born = raceTime; const m = L.T.mesh, h = m.rotation.y, fx = Math.sin(h), fz = Math.cos(h);
    L.tv = { x: m.position.x + fx * 60 - fz * 6, y: m.position.y + 22, z: m.position.z + fz * 60 + fx * 6,
      lx: m.position.x + fx * 18, ly: m.position.y, lz: m.position.z + fz * 18 }; });
  for (const t of TIMES) {
    const st = await p.evaluate(([t]) => { const L = window.__L;
      while (raceTime - L.born < t - 1e-6) { controls.gas = 0; __camF1(); update(1 / 60); }
      const T = L.T; return { v: +(T.speed * 3.6).toFixed(0), g1: +Math.hypot(T.x - L.F1.x, T.z - L.F1.z).toFixed(1),
        g2: +Math.hypot(T.x - L.F2.x, T.z - L.F2.z).toFixed(1), puffs: track._puffs ? track._puffs.list.filter(m => m.visible).length : 0,
        smoke: track._smoke ? track._smoke.p.filter(q => raceTime - q.born < SMOKE_LIFE).length + (track._smoke.mesh.visible ? "v" : "h") + (track._smoke.mesh.parent === scene ? "s" : "-") : "нет" }; }, [t]);
    for (const v of VIEWS) {
      await p.evaluate(([v]) => { const L = window.__L;
        field.forEach(c => c.mesh.visible = true);
        if (v === 'tv') { const m = L.T.mesh, h = m.rotation.y, fx = Math.sin(h), fz = Math.cos(h);   // «вертолёт» спереди-сверху: болид едет на камеру, шлейф за ним
          cam.position.set(m.position.x + fx * 22 - fz * 3, m.position.y + 17, m.position.z + fz * 22 + fx * 3);
          cam.lookAt(m.position.x - fx * 6, m.position.y, m.position.z - fz * 6); }
        else { const c = v === 'f1' ? L.F1 : L.F2, m = c.mesh, h = m.rotation.y, fx = Math.sin(h), fz = Math.cos(h);
          m.visible = false;
          cam.position.set(m.position.x - fx * 0.62, m.position.y + 1.42, m.position.z - fz * 0.62);
          cam.lookAt(m.position.x + fx * 40, m.position.y + 0.9, m.position.z + fz * 40); }
        cam.updateMatrixWorld(); (typeof smokeUpdate === "function" ? smokeUpdate : puffUpdate)(); render(); }, [v]);
      const f = path.join(OUT, v + '-' + t.toFixed(2) + '.png');
      // снимок с самого холста: снимок страницы у Playwright ждёт шрифтов и иногда виснет навсегда
      const png = await p.evaluate(() => { render(); return renderer.domElement.toDataURL('image/png'); });
      fs.writeFileSync(f, Buffer.from(png.split(',')[1], 'base64'));
      console.log(f, JSON.stringify(st));
    }
  }
  await b.close();
})();
