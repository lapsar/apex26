// Кадр из кокпита игры в позе болида онбоарда (povs.json от povcmp.py), рядом — сам кадр онбоарда того же размера (16:9).
// node tools/baku-scan/povcmp.js  -> tools/baku-scan/plans/pov_K.png (сверху онбоард, снизу игра)
const path = require('path'), fs = require('fs');
const { chromium } = require('/home/user/apex26/tools/node_modules/playwright');
const HTML = path.resolve(__dirname, '../../index.html'), CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';   // CHROME=… — другой Chromium
const DY = +(process.argv[2] || 0), TAGN = process.argv[3] || '', HFOV = +(process.argv[4] || 0);   // HFOV — опыт: горизонтальный угол кадра, градусы   // DY — сдвиг камеры кокпита по высоте, м (опыт)
const POVS = JSON.parse(fs.readFileSync(path.join(__dirname, 'povs.json')));
(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1173, height: 660 } });
  page.on('pageerror', e => console.log('JS: ' + e.message));
  await page.goto('file://' + HTML); await page.waitForTimeout(1000);
  await page.evaluate(() => { const tr = TRACKS.findIndex(t => t.key === 'Baku'); sel.track = tr; sel.roster = 0; sel.diff = 'normal'; sel.laps = 1;
    sel.view = 'cockpit'; selTeam = ROSTER[sel.roster].teamIdx; camMode = 'cockpit'; startWeekend(); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { ['bigmsg', 'tower', 'topinfo', 'posbadge', 'lightsG', 'stage'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.querySelectorAll('.btnrow,.pad,.touch,.hud').forEach(el => (el.style.display = 'none'));
    scene.children.forEach(o => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 9000) o.position.y = -0.6; });
    field.forEach(c => { c.mesh.visible = false; }); });
  for (const p of POVS) {
    await page.evaluate(p => { player.x = p.x; player.z = p.z; player.hdg = p.hdg; player.speed = 0; player.steerVis = 0;
      const pr = project(p.x, p.z, 0); let best = 1e18, bi = 0; for (let i = 0; i < track.M; i++) { const d = (track.P[i].x - p.x) ** 2 + (track.P[i].z - p.z) ** 2; if (d < best) { best = d; bi = i; } }
      player.hint = bi; placePlayer(player); updateCamera(0.016);
      if (p.dy) { cam.position.y += p.dy; const f = [Math.sin(player.hdg), Math.cos(player.hdg)]; cam.lookAt(player.x + f[0] * 14, 1.18 + p.dy, player.z + f[1] * 14); }
      if (p.hf) { cam.fov = 2 * Math.atan(Math.tan(p.hf * Math.PI / 360) / cam.aspect) * 180 / Math.PI; cam.updateProjectionMatrix(); }
      render(); }, Object.assign({ dy: DY, hf: HFOV }, p));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(__dirname, 'plans', 'game_' + p.k + TAGN + '.png') });
  }
  await browser.close();
})();
