/* Взгляд на Баку из игры (v1.17.11): сверху строго вниз (север вверх, как планы pocket-plan.py), из кокпита по осевой и в позе
   болида онбоарда (povs.json от povcmp.py) — в двух сборках: archive/v<OLD>.html и index.html. Кадры — plans/lk_<сборка>_<вид>.png.
     node tools/baku-scan/look.js top:S:высота[:dx:dz] cock:S[:вбок[:1 — без болида]] eye:x:z:h:tx:tz[:th[:fov]] topr:S:h:вбок pov:K …   [OLD=1.17.10] [ONLY=new] [CHROME=…] [APEX_INDEX=…] [TRACK=Monaco]   */
const path = require('path'), fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const OUT = path.join(__dirname, 'plans'); fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.join(__dirname, '..', '..');
const OLD = process.env.OLD || '1.17.10';
let BUILDS = [['old', path.join(ROOT, 'archive', 'v' + OLD + '.html')], ['new', process.env.APEX_INDEX ? path.resolve(process.env.APEX_INDEX) : path.join(ROOT, 'index.html')]];
if (process.env.ONLY) BUILDS = BUILDS.filter(b => b[0] === process.env.ONLY);
const POVS = fs.existsSync(path.join(__dirname, 'povs.json')) ? Object.fromEntries(JSON.parse(fs.readFileSync(path.join(__dirname, 'povs.json'))).map(p => [p.k, p])) : {};
const VIEWS = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  for (const [tag, html] of BUILDS) {
    const page = await browser.newPage({ viewport: { width: 1173, height: 660 } });
    page.on('pageerror', e => console.log('JS: ' + e.message));
    await page.goto('file://' + html); await page.waitForTimeout(1000);
    await page.evaluate((TK) => { const tr = TRACKS.findIndex(t => t.key === TK); sel.track = tr; sel.roster = 0; sel.diff = 'normal'; sel.laps = 1;
      sel.view = 'cockpit'; selTeam = ROSTER[sel.roster].teamIdx; camMode = 'cockpit'; startWeekend(); }, process.env.TRACK || 'Baku');
    await page.waitForTimeout(1500);
    await page.evaluate(() => { ['bigmsg', 'tower', 'topinfo', 'posbadge', 'lightsG', 'stage', 'sbox'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      document.querySelectorAll('.btnrow,.pad,.touch,.hud,button').forEach(el => (el.style.display = 'none'));
      field.forEach(c => { c.mesh.visible = false; }); updateCamera = function () {}; });
    for (const v of VIEWS) {
      const a = v.split(':'), kind = a[0];
      await page.evaluate(({ kind, a, pov }) => {
        const H0 = (x, z) => track.relief ? reliefY(x, z) : 0;   // рельеф «для глаза» (v1.17.16): камера над дорогой, а не над нулём
        const at = s => { let i = 0; while (i < track.M - 1 && track.S[i] < s) i++; return i; };
        cam.fov = 64; cam.updateProjectionMatrix();
        if (kind === 'eye') { const x = +a[1], z = +a[2], h = +a[3], tx = +a[4], tz = +a[5], th = +(a[6] || 0);   // eye:x:z:высота:tx:tz[:высота цели] — камера над землёй, взгляд в точку
          player.x = x + 400; player.z = z; placePlayer(player); cam.up.set(0, 1, 0);
          if (a[7]) { cam.fov = +a[7]; cam.updateProjectionMatrix(); }   // eye:…:th:fov — узкий угол (v1.17.21: плакат на Marriott)
          cam.position.set(x, H0(x, z) + h, z); cam.lookAt(tx, H0(tx, tz) + th, tz); }
        else if (kind === 'topr') { const i = at(+a[1]), p = track.P[i], r = track.R[i], o = +(a[3] || 0), x = p.x + r.x * o, z = p.z + r.z * o, y0 = H0(x, z);   // topr:S:высота:вбок
          player.x = p.x + 400; player.z = p.z; placePlayer(player);
          cam.up.set(0, 0, 1); cam.position.set(x, y0 + +a[2], z); cam.lookAt(x, y0, z); }
        else if (kind === 'top') { const i = at(+a[1]), p = track.P[i], h = +a[2], dx = +(a[3] || 0), dz = +(a[4] || 0), y0 = H0(p.x, p.z);
          player.x = p.x + 400; player.z = p.z; placePlayer(player);
          cam.up.set(0, 0, 1); cam.position.set(p.x + dx, y0 + h, p.z + dz); cam.lookAt(p.x + dx, y0, p.z + dz); }
        else if (kind === 'cock') { const i = at(+a[1]), f = track.F[i], r = track.R[i], o = +(a[2] || 0);
          player.x = track.P[i].x + r.x * o; player.z = track.P[i].z + r.z * o; player.hdg = Math.atan2(f.x, f.z); player.speed = 0; player.hint = i; player.steerVis = 0;
          placePlayer(player); cam.up.set(0, 1, 0); const y0 = H0(player.x, player.z), y1 = H0(player.x + f.x * 30, player.z + f.z * 30);
          if (a[3]) player.mesh.visible = false;   // cock:S:вбок:1 — без болида
          cam.position.set(player.x - f.x * 0.62, y0 + 1.42, player.z - f.z * 0.62); cam.lookAt(player.x + f.x * 30, y1 + 0.6, player.z + f.z * 30); }
        else if (kind === 'pov') { const p = pov; player.x = p.x; player.z = p.z; player.hdg = p.hdg; player.speed = 0; player.steerVis = 0;
          let best = 1e18, bi = 0; for (let i = 0; i < track.M; i++) { const d = (track.P[i].x - p.x) ** 2 + (track.P[i].z - p.z) ** 2; if (d < best) { best = d; bi = i; } }
          player.hint = bi; placePlayer(player); cam.up.set(0, 1, 0); const f = [Math.sin(p.hdg), Math.cos(p.hdg)];
          const y0 = H0(p.x, p.z), y1 = H0(p.x + f[0] * 30, p.z + f[1] * 30);
          cam.position.set(p.x - f[0] * 0.62, y0 + 1.42, p.z - f[1] * 0.62); cam.lookAt(p.x + f[0] * 30, y1 + 0.6, p.z + f[1] * 30);
          cam.fov = 2 * Math.atan(Math.tan(32 * Math.PI / 180) / cam.aspect) * 180 / Math.PI; cam.updateProjectionMatrix(); }
        render(); }, { kind, a, pov: kind === 'pov' ? POVS[+a[1]] : null });
      await page.waitForTimeout(120);
      await page.screenshot({ path: path.join(OUT, `lk_${tag}_${v.replace(/[:.]/g, '_')}.png`) });
    }
    await page.close();
  }
  await browser.close();
})();
