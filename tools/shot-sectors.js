/* ============================================================================
   СЪЁМКА СЕКТОРОВ КВАЛИФИКАЦИИ (v1.16.95)

   Настоящий кадр игры с плашкой секторов: линия сектора 1 (время крупно),
   между линиями, финиш круга, круг со срезкой и экран итогов. Игрок ставится
   перед линией и проезжает её сам (update), лапТ подставляется таким, чтобы
   было видно все три цвета; всё остальное — штатный код игры.

   Запуск:  node tools/shot-sectors.js [--track=3] [--out=папка] [--css='#sbox .big{font-size:24px}'] [--only=0,1]
            --css — примерить стиль плашки, не трогая index.html; --only — какие кадры снимать
   index.html только читается.
   ========================================================================== */
'use strict';
const path = require('path'), fs = require('fs');
const args = {}; process.argv.slice(2).forEach(a => { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) args[m[1]] = m[2]; });
const HTML = path.resolve(args.html || path.join(__dirname, '..', 'index.html'));
const OUT = args.out ? path.resolve(args.out) : path.join(__dirname, 'shots', 'sectors');
const CHROME = args.chrome || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TRACK = args.track === undefined ? 3 : +args.track;

(async () => {
  const { chromium } = require('playwright');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: +(args.w || 1024), height: +(args.h || 768) } });   // iPhone 16 Pro Max боком: --w=932 --h=430
  page.on('pageerror', e => console.log('  JS-ошибка: ' + e.message));
  await page.goto('file://' + HTML); await page.waitForTimeout(800);
  await page.evaluate(({ tr }) => { sel.track = tr; sel.roster = 0; sel.diff = 'easy'; sel.laps = 3; sel.view = 'cockpit';
    selTeam = ROSTER[0].teamIdx; camMode = 'cockpit'; startWeekend(); }, { tr: TRACK });
  await page.waitForTimeout(2500);
  const name = await page.evaluate(() => { endLoop();
    scene.children.forEach(o => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 9000) o.position.y = -0.6; });
    /* поставить перед S и проехать её штатным update; t — лапТ на этом месте */
    window.__put = (S, v) => { let i = 0; while (i < track.M - 1 && track.S[i] < S) i++;
      const p = track.P[i], f = track.F[i]; player.x = p.x; player.z = p.z; player.hdg = Math.atan2(f.x, f.z); player.yawLag = 0; player.speed = v;
      player.hint = i; player.prevIdx = i; player.arcPrev = track.S[i]; player.lapLock = 999; };
    window.__drive = (n) => { for (let k = 0; k < n; k++) { controls.gas = 1; controls.brake = 0; controls.left = controls.right = 0; update(1 / 60); } };
    return track.name; });
  await page.addStyleTag({ content: '.kb{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}' + (args.css || '') });
  const only = args.only ? args.only.split(',') : null;
  const snap = async (tag, note, fn, arg) => {
    if (only && !only.includes(tag.split('-')[0])) { await page.evaluate(fn, arg); return; }
    const dbg = await page.evaluate(fn, arg);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(300);
    const file = path.join(OUT, `${name.toLowerCase()}-${tag}.png`); await page.screenshot({ path: file });
    console.log(`  ${file}  — ${note}  ${dbg ? JSON.stringify(dbg) : ''}`);
  };
  const box = () => document.getElementById('sbox').innerText.replace(/\n/g, ' | ');
  const L = await page.evaluate(() => track.spec.sectors);
  await snap('0-do-s1', 'до линии сектора 1: только секундомер и пустая полоска', (L) => {
    player.started = true; qSec = { at: [], k: -1, flash: 0 }; player.lapCut = false;
    __put(L[0] - 400, 50); player.lapT = 14.8; __drive(20); render();
    return document.getElementById('sbox').innerText.replace(/\n/g, ' | '); }, L);
  // поул и десятый по сектору 1: игроку время между ними — зелёный; быстрее поула — фиолетовый
  await snap('1-sektor1', 'линия сектора 1: время сектора крупно, «СЕКТОР 1», разница с поулом и место', (L) => {
    const s1 = qualiField.map(r => r.at[0]).sort((a, b) => a - b);
    player.started = true; qSec = { at: [], k: -1, flash: 0 }; player.lapCut = false;
    __put(L[0] - 30, 40); player.lapT = s1[0] - 0.08 - 30 / 40;
    let k = 0; while (qSec.at.length < 1 && k++ < 200) __drive(1); __drive(20); render();
    return document.getElementById('sbox').innerText.replace(/\n/g, ' | '); }, L);
  await snap('2-mezhdu', 'между линиями: секундомер, итог прошлой линии остаётся', () => { qSec.flash = 0; __drive(1); render();
    return document.getElementById('sbox').innerText.replace(/\n/g, ' | '); });
  await snap('3-sektor2', 'линия сектора 2: зелёный (в десятке)', (L) => {
    const s2 = qualiField.map(r => r.at[1] - r.at[0]).sort((a, b) => a - b);
    __put(L[1] - 30, 40); player.lapT = qSec.at[0] + (s2[0] + s2[9]) / 2 - 30 / 40;
    let k = 0; while (qSec.at.length < 2 && k++ < 200) __drive(1); __drive(20); render();
    return document.getElementById('sbox').innerText.replace(/\n/g, ' | '); }, L);
  await snap('4-finish', 'финиш круга: время круга, три цвета, разница с поулом и место', () => {
    const s3 = qualiField.map(r => r.time - r.at[1]).sort((a, b) => a - b);
    __put(track.length - 30, 40); player.prevIdx = track.M - 2; player.lapLock = 0; player.lapMark = -1e9; player.lapT = qSec.at[1] + s3[15] - 30 / 40;
    let k = 0; while (!qualiOutro && k++ < 200) __drive(1); clearTimeout(qualiOutroTimer); __drive(5); render();
    return document.getElementById('sbox').innerText.replace(/\n/g, ' | '); });
  await snap('5-itogi', 'экран итогов: таблица «Ты / поул / разница»', () => { endQualiToResult();
    return document.getElementById('qSec').innerText.replace(/\n/g, ' | '); });
  if (await page.evaluate(() => !!track.spec.cuts)) {
    await snap('6-srezka', 'круг со срезкой: серым, «КРУГ УДАЛЁН»', (L) => {
      document.getElementById('s-quali').classList.remove('active'); document.getElementById('game').classList.add('active');
      phase = 'quali'; qualiOutro = false; player.noTime = false; player.qTry = 1; qSec = { at: [], k: -1, flash: 0 };
      const s1 = qualiField.map(r => r.at[0]).sort((a, b) => a - b);
      __put(L[0] - 30, 40); player.lapT = s1[12] - 30 / 40; let k = 0; while (qSec.at.length < 1 && k++ < 200) __drive(1);
      player.lapCut = true; tlKind = 'del'; tlWhat = 'шиканы'; tlPlate = TL_SHOW; __drive(10); render();
      return document.getElementById('sbox').innerText.replace(/\n/g, ' | '); }, L);
  }
  await browser.close();
})();
