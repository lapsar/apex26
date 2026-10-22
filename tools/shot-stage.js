/* ============================================================================
   СЪЁМКА ЭКРАНА ЭТАПА (v1.16.99)

   Экран перед квалификацией — как его видит игрок: меню → «В кокпит →» (startWeekend(true)).
   На каждую видимую трассу два кадра: «готовим трассу» (экран до постройки мира) и «готово»
   (точка на круге, кнопка «На прогревочный круг»). Плюс замер: сколько строится мир и сколько
   длятся первые кадры прогревочного круга против обычных — нужен ли прогрев отрисовки.
   Числа — Chromium с программной видеокартой (SwiftShader): годятся для сравнения
   «первый кадр против обычного», а не как время iPad.

   Запуск:  node tools/shot-stage.js [--w=1024 --h=768] [--out=папка] [--only=Monza,Monaco]
            iPhone 16 Pro Max боком: --w=932 --h=430
   index.html только читается.
   ========================================================================== */
'use strict';
const path = require('path'), fs = require('fs');
const args = {}; process.argv.slice(2).forEach(a => { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) args[m[1]] = m[2]; });
const HTML = path.resolve(args.html || path.join(__dirname, '..', 'index.html'));
const OUT = args.out ? path.resolve(args.out) : path.join(__dirname, 'shots', 'stage');
const CHROME = args.chrome || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const W = +(args.w || 1024), H = +(args.h || 768);

(async () => {
  const { chromium } = require('playwright');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', e => console.log('  JS-ошибка: ' + e.message));
  await page.goto('file://' + HTML); await page.waitForTimeout(800);
  const tracks = await page.evaluate(() => TRACKS.map((t, i) => ({ i, key: t.key, hidden: !!t.hidden })));
  const only = args.only ? args.only.split(',') : null;
  for (const t of tracks) {
    if (t.hidden || (only && !only.includes(t.key))) continue;
    /* «готовим трассу»: экран до постройки мира — тот же stageShow, что зовёт startWeekend */
    await page.evaluate(({ i }) => { if (typeof endLoop === 'function') endLoop();
      sel.track = i; sel.roster = 0; sel.diff = 'easy'; sel.laps = 3; sel.view = 'cockpit'; selTeam = ROSTER[0].teamIdx;
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      track = makeTrack(TRACKS[i]); stageAuto = false; stageShow(); document.getElementById('game').classList.add('active'); }, t);
    await page.waitForTimeout(200);
    const f0 = path.join(OUT, `${t.key.toLowerCase()}-${W}x${H}-0-gotovim.png`); await page.screenshot({ path: f0 });
    /* настоящий путь из меню: строится мир, экран ждёт кнопки */
    const ms = await page.evaluate(({ i }) => new Promise(res => { sel.track = i; const t0 = performance.now();
      startWeekend(true); const wait = () => stageOk ? res(Math.round(performance.now() - t0)) : setTimeout(wait, 20); wait(); }), t);
    await page.waitForTimeout(1500);   // точка успевает отъехать от линии старта
    const f1 = path.join(OUT, `${t.key.toLowerCase()}-${W}x${H}-1-gotovo.png`); await page.screenshot({ path: f1 });
    /* кнопка — первые кадры прогревочного круга против обычных */
    const fr = await page.evaluate(() => new Promise(res => { const ts = []; stageGo();
      const tick = now => { ts.push(now); if (ts.length < 40) requestAnimationFrame(tick); else {
        const d = ts.slice(1).map((v, k) => v - ts[k]), med = d.slice(10).sort((a, b) => a - b)[15];
        res({ first: d.slice(0, 3).map(Math.round), median: Math.round(med) }); } };
      requestAnimationFrame(tick); }));
    console.log(`  ${t.key}: мир строится ${ms} мс; первые кадры ${fr.first.join(', ')} мс, обычный ${fr.median} мс`);
    console.log(`    ${f0}\n    ${f1}`);
  }
  await browser.close();
})();
