/* ============================================================================
   СЪЁМКА ИНТЕРФЕЙСА ГОНКИ — башня и плашки (08.2026, v1.15.51)

   Показывает то, что нельзя проверить числами: красный номер лидера и слово
   «ЛИДЕР» в первой строке башни, значок «БК» у владельца лучшего круга гонки,
   плашку лучшего круга (то же место и тот же вид, что у флагов) и плашки
   результата, где место теперь пишется без буквы «P».

   Запуск:  node tools/shot-hud.js            # кадры в tools/shots/hud
   Оговорки те же, что у shot-track.js: программный рендерер даёт 16-битную
   глубину, поэтому земляная плита на время съёмки опускается. index.html
   только читается.
   ========================================================================== */
'use strict';
const path = require('path'), fs = require('fs');
const args = {}; process.argv.slice(2).forEach(a => { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) args[m[1]] = m[2]; });
const HTML = path.resolve(args.html || path.join(__dirname, '..', 'index.html'));
const OUT = args.out ? path.resolve(args.out) : path.join(__dirname, 'shots', 'hud');
const CHROME = args.chrome || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TRACK = args.track === undefined ? 4 : +args.track;

async function snap(page, file) {
  for (let a = 0; a < 3; a++) {
    try {
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.waitForTimeout(300);
      await page.screenshot({ path: file, animations: 'disabled', timeout: 20000 });
      return;
    } catch (e) { if (a === 2) throw e; }
  }
}

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
  await page.waitForTimeout(800);

  await page.evaluate(({ tr }) => {
    sel.track = tr; sel.roster = 0; sel.diff = 'normal'; sel.laps = 3; sel.view = 'cockpit';
    selTeam = ROSTER[sel.roster].teamIdx; camMode = 'cockpit'; startWeekend();
  }, { tr: TRACK });
  await page.waitForTimeout(1800);
  const name = await page.evaluate(() => {
    player.best = qualiField[9].time - 0.001;
    beginQualiOutro(); clearTimeout(qualiOutroTimer); qualiOutro = false; raceOutro = false;
    hideQualiBanner(); startRace();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('game').classList.add('active');
    lights.t = 0; lights.seq = 5; lights.offAt = 0.0001; lights.go = true; lights.hide = 0; raceTime = 0;
    endLoop(); showGantry(false);
    field.forEach(c => { c.retireAt = 0; });          // сходов в кадре не надо
    for (let f = 0; f < 60 * 20; f++) update(1 / 60);
    scene.children.forEach(o => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 9000) o.position.y = -0.6; });
    return track.name;
  });
  await page.addStyleTag({ content: '.kb{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}' });

  const shoot = async (tag, note, fn, arg) => {
    const dbg = await page.evaluate(fn, arg);
    console.log('    ' + JSON.stringify(dbg));
    const file = path.join(OUT, `${name.toLowerCase()}-${tag}.png`);
    await snap(page, file);
    console.log(`  ${file}  — ${note}`);
  };

  const rows = () => Array.from(document.querySelectorAll('#tower .trow')).slice(0, 3)
    .map(r => r.className + ' [' + Array.from(r.children).map(c => c.textContent).join('|') + ']');

  await shoot('race', 'гонка: красный номер лидера и «ЛИДЕР»', () => {
    updateHUD(); render();
    return { rows: Array.from(document.querySelectorAll('#tower .trow')).slice(0, 2).map(r => r.className + ' ' + r.textContent),
             pos: document.getElementById('posbadge').innerText.replace(/\n/g, ' ') };
  });

  // рекорд у соперника: ставим время, которое живой круг не побьёт, и даём показу дозреть
  await shoot('best-ai', 'плашка лучшего круга гонки (соперник) + значок БК', () => {
    const c = cars.filter(x => !x.isPlayer).sort((a, b) => b.dist - a.dist)[0];
    const rr = ROSTER.find(r => r.num === c.num);
    fastestLap = { time: 70.317, name: c.name, team: rr ? rr.team : '', color: c.color, you: false, car: c };
    for (let f = 0; f < 60 * 3.2; f++) update(1 / 60);
    updateHUD(); render();
    return { plate: document.getElementById('flagpanel').innerText.replace(/\n/g, ' · '),
             mark: Array.from(document.querySelectorAll('#tower .trow')).findIndex(r => r.querySelector('.tf').classList.contains('on')) + 1 };
  });

  await shoot('best-you', 'плашка лучшего круга гонки — поставил игрок', () => {
    fastestLap = { time: 69.115, name: player.name, team: ROSTER[sel.roster].team, color: player.color, you: true, car: player };
    for (let f = 0; f < 60 * 3.2; f++) update(1 / 60);
    updateHUD(); render();
    return { plate: document.getElementById('flagpanel').innerText.replace(/\n/g, ' · '),
             mark: Array.from(document.querySelectorAll('#tower .trow')).findIndex(r => r.querySelector('.tf').classList.contains('on')) + 1 };
  });

  await shoot('finish', 'после флага: «ПОБЕДА» в первой строке и плашка финиша без «P»', () => {
    window.__raceOrder = cars.slice().sort(rankCmp); raceOutro = true;
    const yp = window.__raceOrder.findIndex(c => c.isPlayer) + 1;
    showRaceBanner(yp, player.name, ROSTER[sel.roster].team);
    for (let i = 0; i < 6; i++) updateHUD();          // строки башни перерисовываются каждым шестым вызовом
    render();
    return { top: document.querySelectorAll('#tower .trow')[0].querySelector('.tg').textContent,
             banner: document.getElementById('qbanner').innerText.replace(/\n/g, ' · ') };
  });

  await browser.close();
})();
