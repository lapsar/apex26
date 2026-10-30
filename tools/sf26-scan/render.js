/* ============================================================================
   ЗАМЕР В (30.10.2026, без правки игры): наша модель (`makeCar`) против готовой модели
   «2026 Ferrari SF-26» с Sketchfab (CC BY 4.0, автор Dave Love) — целиком и упрощённой
   до 20 / 8 / 3 тыс. треугольников (meshoptimizer; не дошёл — кластеризация сеткой).
   Снимки сбоку, 3/4, сзади с 14 м, сверху — 100 px/м, свет как в игре. Разбор — game.md.
   Модель в репозиторий НЕ кладётся. Подготовка папки SF26_SERVE:
     index.html (игра), sf26/ (распакованный glTF-архив), GLTFLoader.js (three@0.128.0
     examples/js/loaders), meshopt_simplifier.js (meshoptimizer@0.21.0)
   SF26_SERVE=папка SF26_OUT=папка_снимков node tools/sf26-scan/render.js
   Числа модели: python3 -I inspect.py|wheels.py|zones.py путь/scene.gltf (zones и wheels
   берут разбор из inspect.py — запускать из этой папки).
   ========================================================================== */
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const SERVE = path.resolve(process.env.SF26_SERVE || 'serve'), OUT = path.resolve(process.env.SF26_OUT || 'shots');
const CHROME = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  const f = path.join(SERVE, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
}).listen(8765);

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', e => console.log('JS-ошибка: ' + e.message));
  page.on('console', m => console.log('  ' + m.text()));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForTimeout(1500);
  await page.addScriptTag({ url: '/GLTFLoader.js' });
  await page.addScriptTag({ url: '/meshopt_simplifier.js' });
  const res = await page.evaluate(async () => {
    await MeshoptSimplifier.ready;
    const gltf = await new Promise((ok, no) => new THREE.GLTFLoader().load('/sf26/scene.gltf', ok, undefined, no));
    const full = gltf.scene;
    const tris = o => { let n = 0; o.traverse(m => { if (m.isMesh) { const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return n; };
    const calls = o => { let n = 0; o.traverse(m => { if (m.isMesh) n += Array.isArray(m.material) ? m.material.length : 1; }); return n; };
    const TOT = tris(full);
    // упрощение: сварка по позиции (швы UV не мешают), meshopt simplify; не дошли — кластеризация сеткой
    function decimate(target) {
      const c = full.clone(true);
      c.traverse(m => {
        if (!m.isMesh) return;
        const g = m.geometry.clone(), P = g.attributes.position, n = P.count;
        const idx = g.index ? Array.from(g.index.array) : [...Array(n).keys()];
        const want = Math.min(idx.length, Math.max(12, Math.round(target * (idx.length / 3) / TOT)) * 3);
        const key = new Map(), weld = new Uint32Array(n), rep = [], wp = [];
        for (let i = 0; i < n; i++) {
          const k = Math.round(P.getX(i) * 1e4) + ',' + Math.round(P.getY(i) * 1e4) + ',' + Math.round(P.getZ(i) * 1e4);
          let w = key.get(k); if (w === undefined) { w = rep.length; key.set(k, w); rep.push(i); wp.push(P.getX(i), P.getY(i), P.getZ(i)); }
          weld[i] = w;
        }
        const wi = new Uint32Array(idx.map(i => weld[i])), wpos = new Float32Array(wp);
        let [out] = MeshoptSimplifier.simplify(wi, wpos, 3, want, 1.0, []);
        if (out.length > want * 1.15) {                                  // не дошли — сетка
          let cell = 0.005;
          for (let it = 0; it < 40 && out.length > want * 1.15; it++, cell *= 1.35) {
            const cm = new Map(), cr = new Uint32Array(rep.length);
            for (let w = 0; w < rep.length; w++) {
              const k = Math.floor(wpos[3 * w] / cell) + ',' + Math.floor(wpos[3 * w + 1] / cell) + ',' + Math.floor(wpos[3 * w + 2] / cell);
              let r = cm.get(k); if (r === undefined) { r = w; cm.set(k, r); } cr[w] = r;
            }
            const o = [], seen = new Set();
            for (let t = 0; t < wi.length; t += 3) {
              const a = cr[wi[t]], b = cr[wi[t + 1]], d = cr[wi[t + 2]];
              if (a === b || b === d || a === d) continue;
              const s = [a, b, d].sort((x, y) => x - y).join(); if (seen.has(s)) continue; seen.add(s);
              o.push(a, b, d);
            }
            out = new Uint32Array(o);
          }
        }
        g.setIndex(Array.from(out, w => rep[w]));
        m.geometry = g;
      });
      return c;
    }
    const d20 = decimate(20000), d8 = decimate(8000), d3 = decimate(3000);
    const ours = makeCar('#DC0000', 16, false), oursS = makeCar('#DC0000', 16, true);
    const models = { ours, oursS, full, d20, d8, d3 };
    const stat = {};
    for (const k in models) stat[k] = { tris: Math.round(tris(models[k])), calls: calls(models[k]) };
    const box = new THREE.Box3().setFromObject(full); stat.bbox = [box.min.toArray(), box.max.toArray()];
    // снимки: сбоку и сверху ортокамерой 100 px/м, 3/4 спереди перспективой
    const PX = 100, shots = {};
    function shoot(obj, view) {
      const V = { side: { w: 7.0, h: 1.7 }, top: { w: 7.0, h: 2.9 }, q34: { w: 6.4, h: 3.6 }, back: { w: 6.4, h: 3.6 } }[view];
      const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
      r.setPixelRatio(1.5); r.setSize(Math.round(V.w * PX), Math.round(V.h * PX)); r.setClearColor(0xe9edf2, 1);
      r.outputEncoding = THREE.sRGBEncoding;
      const sc = new THREE.Scene(); sc.add(obj);
      sc.add(new THREE.HemisphereLight('#eaf3ff', '#5b6b4a', 1.05));
      const d = new THREE.DirectionalLight('#fff4e2', 1.15); d.position.set(4, 8, 6); sc.add(d);
      const d2 = new THREE.DirectionalLight('#cfe0ff', 0.25); d2.position.set(-5, 3, -6); sc.add(d2);
      let cam;
      if (view === 'side') { cam = new THREE.OrthographicCamera(-V.w / 2, V.w / 2, V.h - 0.15, -0.15, 0.1, 50); cam.position.set(20, 0, 0); cam.lookAt(0, 0, 0); }
      if (view === 'top') { cam = new THREE.OrthographicCamera(-V.w / 2, V.w / 2, V.h / 2, -V.h / 2, 0.1, 50); cam.position.set(0, 20, 0); cam.up.set(1, 0, 0); cam.lookAt(0, 0, 0); }
      if (view === 'q34') { cam = new THREE.PerspectiveCamera(30, V.w / V.h, 0.1, 100); cam.position.set(6.5, 3.2, 8.5); cam.lookAt(0, 0.45, 0); }
      if (view === 'back') { cam = new THREE.PerspectiveCamera(60, V.w / V.h, 0.1, 100); cam.position.set(-1.2, 1.42, -14); cam.lookAt(-0.4, 0.6, 0); }
      r.render(sc, cam); const u = r.domElement.toDataURL('image/png'); r.dispose(); sc.remove(obj); return u;
    }
    for (const k in models) for (const v of ['side', 'top', 'q34', 'back']) shots[k + '_' + v] = shoot(models[k], v);
    return { stat, shots };
  });
  fs.mkdirSync(OUT, { recursive: true });
  for (const k in res.shots) fs.writeFileSync(path.join(OUT, k + '.png'), Buffer.from(res.shots[k].split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, 'stat.json'), JSON.stringify(res.stat, null, 1));
  console.log(JSON.stringify(res.stat));
  await browser.close(); srv.close();
})();
