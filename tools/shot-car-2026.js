/* ============================================================================
   СЪЁМКА БОЛИДА «СЕЙЧАС ПРОТИВ 2026» (23.10.2026, без правки игры)

   Снимает НАШУ модель (`makeCar`, болид игрока) ортокамерой сбоку, сверху и
   сзади — 100 px на метр, свет как в игре — в tools/shots/car-2026/, затем
   собирает лист tools/car-2026-compare.html: слева снимки, справа эскиз
   болида по зонам технического регламента FIA 2026 (Section C, выпуск 17),
   красным пунктиром — его силуэт поверх нашего. Числа и пункты регламента —
   docs/notes/game.md, «Наш болид и настоящий 2026». Эскиз — рисунок внутри
   разрешённых зон, а не модель: форма деталей, гало, шлем, диффузор — на глаз.
     node tools/shot-car-2026.js [--html=путь к сборке] [--out=лист.jpg]
   ========================================================================== */
'use strict';

const path = require('path');
const fs = require('fs');

const args = {};
process.argv.slice(2).forEach(a => { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) args[m[1]] = m[2]; });
const HTML = path.resolve(args.html || path.join(__dirname, '..', 'index.html'));
const SHOTS = path.join(__dirname, 'shots', 'car-2026');
const OUT = path.resolve(args.out || path.join(__dirname, '..', 'docs', 'notes', 'img', 'bolid-2026-sravnenie.jpg'));
const CHROME = args.chrome || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';

(async () => {
  const { chromium } = require('playwright');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', e => console.log('  JS-ошибка: ' + e.message));
  await page.goto('file://' + HTML);
  await page.waitForTimeout(1500);
  const shots = await page.evaluate(() => {
    const PX = 100;                                                     // пикселей на метр
    const views = { side: { w: 7.2, h: 1.8 }, top: { w: 7.2, h: 3.0 }, rear: { w: 3.0, h: 1.8 } };
    const res = {}, car = makeCar('#FF8000', 4, false);
    for (const k in views) {
      const V = views[k];
      const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
      r.setPixelRatio(2); r.setSize(Math.round(V.w * PX), Math.round(V.h * PX)); r.setClearColor(0x000000, 0);
      const sc = new THREE.Scene(); sc.add(car);
      sc.add(new THREE.HemisphereLight('#eaf3ff', '#5b6b4a', 1.05));  // свет — как в игре
      const d = new THREE.DirectionalLight('#fff4e2', 1.15); d.position.set(4, 8, 6); sc.add(d);
      const d2 = new THREE.DirectionalLight('#cfe0ff', 0.25); d2.position.set(-5, 3, -6); sc.add(d2);
      let cam;
      if (k === 'side') { cam = new THREE.OrthographicCamera(-V.w / 2, V.w / 2, V.h - 0.15, -0.15, 0.1, 50); cam.position.set(20, 0, 0); }
      if (k === 'top') { cam = new THREE.OrthographicCamera(-V.w / 2, V.w / 2, V.h / 2, -V.h / 2, 0.1, 50); cam.position.set(0, 20, 0); cam.up.set(1, 0, 0); }
      if (k === 'rear') { cam = new THREE.OrthographicCamera(-V.w / 2, V.w / 2, V.h - 0.15, -0.15, 0.1, 50); cam.position.set(0, 0, -20); }
      cam.lookAt(0, 0, 0);
      r.render(sc, cam); res['pl_' + k] = r.domElement.toDataURL('image/png'); r.dispose(); sc.remove(car);
    }
    return res;
  });
  for (const k in shots) fs.writeFileSync(path.join(SHOTS, k + '.png'), Buffer.from(shots[k].split(',')[1], 'base64'));
  const sheet = await browser.newPage({ viewport: { width: 1580, height: 900 }, deviceScaleFactor: 1.5 });
  sheet.on('pageerror', e => console.log('  JS-ошибка листа: ' + e.message));
  await sheet.goto('file://' + path.join(__dirname, 'car-2026-compare.html'));
  await sheet.waitForTimeout(500);
  await sheet.locator('.wrap').screenshot({ path: OUT, type: 'jpeg', quality: 88 });
  console.log('лист: ' + OUT);
  await browser.close();
})();
