/* Подъём к Старому городу (v1.17.16): кадры игры камерой самой игры (кокпит с рельефом: updateCamera, камера-голова) и сбоку/сверху.
     node tools/baku-scan/hill-shot.js cock:S[:вбок[:курс°]] side:S:вбок:высота[:взгляд вперёд] back:S:назад:высота top:S:высота …  [OUT=папка] [APEX_INDEX=…] [TAG=new]
   Кадры — OUT/hs_<TAG>_<вид>.png (по умолчанию tools/baku-scan/plans). Болиды скрыты, интерфейс тоже. */
const path = require('path'), fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));
const OUT = process.env.OUT || path.join(__dirname, 'plans'); fs.mkdirSync(OUT, { recursive: true });
const HTML = process.env.APEX_INDEX ? path.resolve(process.env.APEX_INDEX) : path.join(__dirname, '..', '..', 'index.html');
const TAG = process.env.TAG || 'new', VIEWS = process.argv.slice(2);
(async () => {
  const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1173, height: 660 } });
  page.on('pageerror', e => console.log('JS: ' + e.message));
  await page.goto('file://' + HTML); await page.waitForTimeout(1000);
  await page.evaluate(() => { const tr = TRACKS.findIndex(t => t.key === 'Baku'); sel.track = tr; sel.roster = 0; sel.diff = 'normal'; sel.laps = 1;
    sel.view = 'cockpit'; selTeam = ROSTER[sel.roster].teamIdx; camMode = 'cockpit'; startWeekend(); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { ['bigmsg', 'tower', 'topinfo', 'posbadge', 'lightsG', 'stage', 'sbox'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.querySelectorAll('.btnrow,.pad,.touch,.hud,button').forEach(el => (el.style.display = 'none'));
    field.forEach(c => { if (c !== player) c.mesh.visible = false; }); window.__uc = updateCamera; updateCamera = function () {}; });
  for (const v of VIEWS) {
    await page.evaluate(({ a }) => {
      const kind = a[0], at = s => { let i = 0; while (i < track.M - 1 && track.S[i] < s) i++; return i; };
      const i = at(+a[1]), f = track.F[i], r = track.R[i], P = track.P[i];
      cam.fov = 64; cam.updateProjectionMatrix(); cam.up.set(0, 1, 0);
      if (kind === 'cock') { const o = +(a[2] || 0), hd = Math.atan2(f.x, f.z) + (+(a[3] || 0)) * Math.PI / 180;
        player.x = P.x + r.x * o; player.z = P.z + r.z * o; player.hdg = hd; player.speed = 0; player.hint = i; player.steerVis = 0; player.camSl = undefined;
        placePlayer(player); player.mesh.visible = true; window.__uc(0); }
      else if (kind === 'side') { const o = +a[2], h = +a[3], ah = +(a[4] || 0), y0 = reliefY(P.x, P.z);
        player.mesh.visible = false; const j = at(+a[1] + ah), Q = track.P[j];
        cam.position.set(P.x + r.x * o, y0 + h, P.z + r.z * o); cam.lookAt(Q.x, reliefY(Q.x, Q.z) + 2, Q.z); }
      else if (kind === 'back') { const d = +a[2], h = +a[3], j = at(+a[1] - d), Q = track.P[j];   // сзади-сверху: с осевой в d м позади, h м над полотном
        player.mesh.visible = false; cam.position.set(Q.x, reliefY(Q.x, Q.z) + h, Q.z); cam.lookAt(P.x, reliefY(P.x, P.z), P.z); }
      else if (kind === 'top') { const h = +a[2]; player.mesh.visible = false; cam.up.set(0, 0, 1); cam.position.set(P.x, h, P.z); cam.lookAt(P.x, 0, P.z); }
      render(); }, { a: v.split(':') });
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(OUT, `hs_${TAG}_${v.replace(/[:.\-]/g, '_')}.png`) });
  }
  await browser.close();
})();
