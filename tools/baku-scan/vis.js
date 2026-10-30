/* Видно ли здание с трассы (v1.17.22): из кокпита через каждые STEP м круга кадр, где весь мир чёрный, а каждая цель — свой цвет
   (призма по контуру OSM на 0.6 м шире, от низа до верха); считается, сколько точек цели в кадре. Дома, трибуны, стены, деревья
   заслоняют, прозрачное (сетка над бортами) — нет; тумана нет. Кадр 16:9, вертикальный угол камеры игры (64°), смотрит вперёд по осевой.
     node tools/baku-scan/vis.js [targets.json] [STEP=10] [W=320]   → plans/vis.tsv (S, точек каждой цели) и сводка
   targets.json: [{name, poly:[[lat,lon]…], y0, y1}] — по умолчанию цели ниже.   */
const path = require('path'), fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const OUT = path.join(__dirname, 'plans'); fs.mkdirSync(OUT, { recursive: true });
const html = process.env.APEX_INDEX ? path.resolve(process.env.APEX_INDEX) : path.join(__dirname, '..', '..', 'index.html');
const STEP = +(process.env.STEP || 10), WPX = +(process.env.W || 320), HPX = Math.round(WPX * 9 / 16);
const DBGR = !!process.env.DBGR, NORMAL = !!process.env.NORMAL, S0 = +(process.env.S0 || 0), S1 = +(process.env.S1 || 1e9);   // NORMAL=1 — мир в своих цветах (для глаза); S0/S1 — участок
const DUMP = (process.env.DUMP || '').split(',').filter(Boolean).map(Number);
const TG = JSON.parse(fs.readFileSync(process.argv[2] || path.join(__dirname, 'vis-targets.json')));
(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: WPX, height: HPX } });
  page.on('pageerror', e => console.log('JS: ' + e.message));
  await page.goto('file://' + html); await page.waitForTimeout(1000);
  await page.evaluate(() => { const tr = TRACKS.findIndex(t => t.key === 'Baku'); sel.track = tr; sel.roster = 0; sel.diff = 'normal'; sel.laps = 1;
    sel.view = 'cockpit'; selTeam = ROSTER[sel.roster].teamIdx; camMode = 'cockpit'; startWeekend(); });
  await page.waitForTimeout(1500);
  const res = await page.evaluate(({ TG, STEP, WPX, HPX, DUMP, NORMAL, S0, S1, DBGR }) => {
    field.forEach(c => { c.mesh.visible = false; }); player.mesh.visible = false; updateCamera = function () {};
    const black = new THREE.MeshBasicMaterial({ color: 0, side: THREE.DoubleSide });
    if (!NORMAL) scene.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) { const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m && (m.transparent && m.opacity < 0.99 || m.depthWrite === false)) o.visible = false; else o.material = black; } });
    if (!NORMAL) { scene.background = new THREE.Color(0); scene.fog = null; }
    const cols = [], dbg = [];
    TG.forEach((t, i) => {
      const pts = t.poly.map(p => scenXZ(p[0], p[1]));
      let cx = 0, cz = 0; pts.forEach(p => { cx += p[0]; cz += p[1]; }); cx /= pts.length; cz /= pts.length;
      const sh = new THREE.Shape(pts.map(p => { const dx = p[0] - cx, dz = p[1] - cz, d = Math.hypot(dx, dz) || 1;
        return new THREE.Vector2(p[0] + dx / d * 0.6, -(p[1] + dz / d * 0.6)); }));
      const g = new THREE.ExtrudeGeometry(sh, { depth: t.y1 - t.y0, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, t.y0, 0);
      const c = new THREE.Color().setHSL(i / TG.length, 1, 0.5); cols.push([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]);
      const me = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); scene.add(me); me.frustumCulled = false;
      g.computeBoundingBox(); dbg.push([t.name, g.attributes.position.count, g.boundingBox.min.toArray().map(Math.round), g.boundingBox.max.toArray().map(Math.round)]);
    });
    renderer.setPixelRatio(1); renderer.setSize(WPX, HPX, false); cam.aspect = WPX / HPX; cam.fov = 64; cam.updateProjectionMatrix();
    const gl = renderer.getContext(), buf = new Uint8Array(WPX * HPX * 4), H0 = (x, z) => track.relief ? reliefY(x, z) : 0, out = [];
    const L = track.S[track.M - 1], dumps = [];
    for (let s = S0; s < Math.min(L, S1); s += STEP) {
      let i = 0; while (i < track.M - 1 && track.S[i] < s) i++;
      const f = track.F[i], p = track.P[i], y0 = H0(p.x, p.z), y1 = H0(p.x + f.x * 30, p.z + f.z * 30);
      cam.up.set(0, 1, 0); cam.position.set(p.x - f.x * 0.62, y0 + 1.42, p.z - f.z * 0.62); cam.lookAt(p.x + f.x * 30, y1 + 0.6, p.z + f.z * 30);
      if (DBGR) { const rc = new THREE.Raycaster(); [[1308, 180, -1157], [1328, 170, -990]].forEach(tp => { const v = new THREE.Vector3(...tp).sub(cam.position); const dd = v.length(); rc.set(cam.position, v.normalize()); rc.far = dd;
        const h = rc.intersectObjects(scene.children, true).slice(0, 3).map(x => [x.object.name || x.object.type, Math.round(x.distance), x.object.geometry && x.object.geometry.attributes.position.count, x.object.visible, x.point.toArray().map(Math.round)]); dbg.push(['ray', tp, Math.round(dd), h]); }); }
      if (skyMesh) { skyMesh.position.set(cam.position.x, y0, cam.position.z); if (!NORMAL) skyMesh.visible = false; }   // небо в игре ездит за камерой (r 1700 м)
      renderer.render(scene, cam); gl.readPixels(0, 0, WPX, HPX, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const n = TG.map(() => 0);
      for (let k = 0; k < buf.length; k += 4) { if (buf[k] + buf[k + 1] + buf[k + 2] < 60) continue;
        let best = -1, bd = 1e9; cols.forEach((c, j) => { const d = Math.abs(c[0] - buf[k]) + Math.abs(c[1] - buf[k + 1]) + Math.abs(c[2] - buf[k + 2]); if (d < bd) { bd = d; best = j; } });
        if (bd < 90) n[best]++; }
      out.push([s, ...n]);
      if (DUMP.includes(s)) dumps.push([s, Array.from(buf)]);
    }
    return { out, dumps, dbg };
  }, { TG, STEP, WPX, HPX, DUMP, NORMAL, S0, S1, DBGR });
  const rows = res.out; if (process.env.DBG) console.log(JSON.stringify(res.dbg));
  res.dumps.forEach(([s, b]) => fs.writeFileSync(path.join(OUT, `vis_${s}.rgba`), Buffer.from(b)));   // DUMP=S,S… — сырой кадр (RGBA, снизу вверх)
  fs.writeFileSync(path.join(OUT, 'vis.tsv'), ['S\t' + TG.map(t => t.name).join('\t'), ...rows.map(r => r.join('\t'))].join('\n') + '\n');
  const tot = WPX * HPX;
  TG.forEach((t, j) => {
    const seen = rows.filter(r => r[j + 1] > 0), big = rows.filter(r => r[j + 1] / tot > 0.005);
    const runs = []; let a = null, prev = null;
    seen.forEach(r => { if (a === null || r[0] - prev > STEP * 3) { if (a !== null) runs.push([a, prev]); a = r[0]; } prev = r[0]; }); if (a !== null) runs.push([a, prev]);
    const mx = rows.reduce((m, r) => r[j + 1] > m[1] ? [r[0], r[j + 1]] : m, [0, 0]);
    console.log(`${t.name.padEnd(22)} виден в ${seen.length}/${rows.length} кадров (${(seen.length * STEP / 1000).toFixed(2)} км круга), крупнее 0.5 % кадра — ${big.length};`
      + ` больше всего — S ${mx[0]} (${(mx[1] / tot * 100).toFixed(2)} % кадра); участки S: ${runs.map(r => r[0] + '–' + r[1]).join(', ')}`);
  });
  await browser.close();
})();
