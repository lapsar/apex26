/* ============================================================================
   СЪЁМКА ИГРЫ — картинка, а не числа (08.2026)

   Пробники меряют геометрию, но не видят, КАК это выглядит. До сих пор картинку
   мог посмотреть только владелец на устройстве, и каждая мелкая правка внешнего
   вида стоила отдельной сборки (CLAUDE.md §11, история щитов Монреаля). Этот
   скрипт снимает игру в headless-браузере: ставит болид в заданную точку круга
   и делает два кадра — из кокпита и сверху.

   Запуск (playwright ставится отдельно, в зависимости пробников он не входит):
     npm i -D playwright            # браузер в песочнице уже стоит, качать нечего
     node tools/shot-track.js --html=index.html --tag=after --track=4 --s=3400
     node tools/shot-track.js --html=archive/v1.15.26.html --tag=before --track=4 --s=3400
   Кадры лягут в tools/shots/.

   Три приёма, без которых ничего не выходит:
     • верхние let/const игрового скрипта видны из page.evaluate — глобальная
       лексическая область у скриптов страницы общая, поэтому sel, track, player
       и render() доступны снаружи ровно так же, как из vm в harness.js;
     • игровой цикл каждый кадр ставит камеру сам, поэтому для вида сверху
       updateCamera приходится заменить пустышкой, иначе кадр вернётся в кокпит;
     • программный рендерер (SwiftShader) даёт 16-битную глубину, и земляная
       плита (y=-0.05) местами забивает полотно (y=0.02) — картинка выходит
       сплошь травяной. На устройстве этого нет: там глубина 24-битная.
       Поэтому на время съёмки плита опускается на 0.6 м. Это правка КАДРА,
       игра остаётся какая есть.
   ========================================================================== */
'use strict';

const path = require('path');
const fs = require('fs');

const args = {};
process.argv.slice(2).forEach(a => { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) args[m[1]] = m[2]; });
const HTML = path.resolve(args.html || path.join(__dirname, '..', 'index.html'));
const TAG = args.tag || 'shot';
const TRACK = +(args.track || 0);
const S = +(args.s || 0);
const OUT = args.out ? path.resolve(args.out) : path.join(__dirname, 'shots');
const CHROME = args.chrome || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

(async () => {
  const { chromium } = require('playwright');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 560 } });
  page.on('pageerror', e => console.log('  JS-ошибка: ' + e.message));
  await page.goto('file://' + HTML);
  await page.waitForTimeout(1000);
  const started = await page.evaluate(({ tr }) => {
    if (typeof sel === 'undefined') return 'игровой скрипт не виден';
    sel.track = tr; sel.roster = 0; sel.diff = 'normal'; sel.laps = 1; sel.view = 'cockpit';
    selTeam = ROSTER[sel.roster].teamIdx; camMode = 'cockpit'; startWeekend();
    return 'ok';
  }, { tr: TRACK });
  if (started !== 'ok') { console.log(started); await browser.close(); process.exit(1); }
  await page.waitForTimeout(1200);
  await page.evaluate(() => {                       // наложения закрывают ровно то, что надо разглядеть
    ['bigmsg', 'tower', 'topinfo', 'posbadge', 'lightsG'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.querySelectorAll('.btnrow,.pad,.touch,.hud').forEach(el => (el.style.display = 'none'));
    scene.children.forEach(o => {                   // см. про 16-битную глубину в шапке
      if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 9000) o.position.y = -0.6; });
  });
  const info = await page.evaluate(({ s }) => {
    let i = 0; while (i < track.M - 1 && track.S[i] < s) i++;
    player.x = track.P[i].x; player.z = track.P[i].z;
    player.hdg = Math.atan2(track.F[i].x, track.F[i].z);
    player.speed = 0; player.hint = i; player.steerVis = 0;
    placePlayer(player); updateCamera(0.016); render();
    window.__i = i;
    return { i, S: +track.S[i].toFixed(0), name: track.spec.name };
  }, { s: S });
  await page.waitForTimeout(200);
  const base = info.name.toLowerCase() + '-s' + info.S + '-';
  await page.screenshot({ path: path.join(OUT, base + 'cockpit-' + TAG + '.png') });
  await page.evaluate(() => {
    updateCamera = function () {};                  // иначе цикл вернёт камеру в кокпит
    const i = window.__i, p = track.P[i], f = track.F[i];
    cam.position.set(p.x - f.x * 40, 90, p.z - f.z * 40);
    cam.lookAt(p.x + f.x * 30, 0, p.z + f.z * 30);
    render();
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, base + 'top-' + TAG + '.png') });
  console.log(info.name + '  i=' + info.i + '  S=' + info.S + '  ->  ' + path.join(OUT, base + '*-' + TAG + '.png'));
  await browser.close();
})();
