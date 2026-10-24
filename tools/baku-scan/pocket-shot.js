/* Выезды Баку: «было / стало» (v1.17.9). Для каждого кармана — вид сверху строго вниз (север вверх, как на плане pocket-plan.py)
   и кадр из кокпита на подъезде, в двух сборках: archive/v1.17.8.html (серп) и index.html (карман по форме улицы).
   Лист — plans/pocket-shots.jpg (python3 сшивает), кадры — plans/ps_<сборка>_<поворот>_{top,cock}.png.
     node tools/baku-scan/pocket-shot.js [CHROME=…]   */
const path = require('path'), fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const OUT = path.join(__dirname, 'plans'); fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.join(__dirname, '..', '..');
const BUILDS = [['old', path.join(ROOT, 'archive', 'v1.17.8.html')], ['new', process.env.APEX_INDEX ? path.resolve(process.env.APEX_INDEX) : path.join(ROOT, 'index.html')]];
// поворот, S вершины (вид сверху), S подъезда (кокпит), высота вида сверху
const PK = [['T1', 215, 168, 75], ['T2', 548, 515, 55], ['T3', 1415, 1385, 50], ['T4', 1638, 1608, 50], ['T15', 3625, 3598, 45], ['T16', 3985, 3935, 75]];
(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  for (const [tag, html] of BUILDS) {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on('pageerror', e => console.log('JS: ' + e.message));
    await page.goto('file://' + html); await page.waitForTimeout(1000);
    await page.evaluate(() => { const tr = TRACKS.findIndex(t => t.key === 'Baku'); sel.track = tr; sel.roster = 0; sel.diff = 'normal'; sel.laps = 1;
      sel.view = 'cockpit'; selTeam = ROSTER[sel.roster].teamIdx; camMode = 'cockpit'; startWeekend(); });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { ['bigmsg', 'tower', 'topinfo', 'posbadge', 'lightsG', 'stage', 'sbox'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      document.querySelectorAll('.btnrow,.pad,.touch,.hud,button').forEach(el => (el.style.display = 'none'));
      scene.children.forEach(o => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 9000) o.position.y = -0.6; });
      field.forEach(c => { c.mesh.visible = false; }); updateCamera = function () {}; });
    for (const [n, sTop, sCock, h] of PK) {
      await page.evaluate(({ s, h }) => { let i = 0; while (i < track.M - 1 && track.S[i] < s) i++; const p = track.P[i];
        player.x = p.x + 400; player.z = p.z; placePlayer(player);                // болид — подальше из кадра
        cam.up.set(0, 0, 1); cam.position.set(p.x, h, p.z); cam.lookAt(p.x, 0, p.z); render(); }, { s: sTop, h });
      await page.waitForTimeout(150); await page.screenshot({ path: path.join(OUT, `ps_${tag}_${n}_top.png`) });
      await page.evaluate(({ s }) => { let i = 0; while (i < track.M - 1 && track.S[i] < s) i++;
        player.x = track.P[i].x; player.z = track.P[i].z; player.hdg = Math.atan2(track.F[i].x, track.F[i].z); player.speed = 0; player.hint = i; player.steerVis = 0;
        placePlayer(player); cam.up.set(0, 1, 0); const f = track.F[i];
        cam.position.set(player.x - f.x * 0.62, 1.42, player.z - f.z * 0.62); cam.lookAt(player.x + f.x * 30, 0.6, player.z + f.z * 30); render(); }, { s: sCock });
      await page.waitForTimeout(150); await page.screenshot({ path: path.join(OUT, `ps_${tag}_${n}_cock.png`) });
      console.log(tag, n);
    }
    await page.close();
  }
  await browser.close();
})();
