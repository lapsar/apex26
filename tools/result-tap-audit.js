/* ============================================================================
   Справка: кнопки экранов итогов под НАСТОЯЩИМИ касаниями (Chromium, CDP) — v1.16.65.

   Жалоба владельца (10.2026, третий раз): после итогов квалификации «В меню»
   и «Старт гонки» не нажимаются. Причина: клик браузер делает из касания, только
   если на стекле нет ДРУГОГО пальца, а итоги появляются сами, через 3 с после
   финиша, когда пальцы ещё лежат на месте педалей. Пробник `taps` (раздел 4)
   сторожит правило игры; здесь — тот же вопрос живому браузеру, по раскладам.

   Запуск:  node tools/result-tap-audit.js [путь к сборке]
   (по умолчанию index.html; прежняя — archive/v1.16.64.html).
   В CDP у touchEnd перечисляются ОТПУСКАЕМЫЕ точки, а не оставшиеся.
   ========================================================================== */
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const CHROME = '/opt/pw-browsers/chromium';
(async () => {
  const br = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const ctx = await br.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage(); pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await pg.goto('file://' + FILE); await pg.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(pg);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const wait = ms => pg.waitForTimeout(ms);
  const stub = () => pg.evaluate(() => { window.__hits = []; window.startRace = () => __hits.push('start'); window.quitToMenu = () => __hits.push('menu');
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById('game').classList.add('active'); });
  const showRes = () => pg.evaluate(() => { const g = []; for (let i = 0; i < 22; i++) g.push({ name: 'P' + i, num: i, color: '#f00', team: 'T', time: 90 + i * .1, you: i === 7 }); showQualiResult(g); });
  const ctr = sel => pg.evaluate(s => { const q = document.querySelector(s).getBoundingClientRect(); return { x: (q.left + q.right) / 2, y: (q.top + q.bottom) / 2 }; }, sel);
  await stub(); const GAS = { ...(await ctr('.kb.gas')), id: 1 }, LEFT = { ...(await ctr('.kb[data-c=left]')), id: 2 };
  const tap = async (p, held) => { await T('touchStart', [...held, p]); await wait(70); await T('touchEnd', [p]); await wait(250); };
  async function sc(name, fn) { await pg.reload(); await wait(300); await stub(); await fn(); await wait(300);
    const h = await pg.evaluate(() => __hits.slice()); console.log(name.padEnd(66), h.length ? h.join(',') : '— ничего'); }
  const PRIM = '#s-quali .btn.primary', GH = '#s-quali .btn.ghost';
  await sc('1. один палец, тап «Старт гонки»', async () => { await showRes(); await wait(300); await tap({ ...(await ctr(PRIM)), id: 5 }, []); });
  await sc('2. палец остался на месте GAS, тап «Старт гонки»', async () => {
    await T('touchStart', [GAS]); await wait(500); await showRes(); await wait(700);
    await tap({ ...(await ctr(PRIM)), id: 5 }, [GAS]); await T('touchEnd', [GAS]); });
  await sc('3. палец остался на месте GAS, тап «В меню»', async () => {
    await T('touchStart', [GAS]); await wait(500); await showRes(); await wait(700);
    await tap({ ...(await ctr(GH)), id: 5 }, [GAS]); await T('touchEnd', [GAS]); });
  await sc('4. два пальца (руль+газ) лежат, 4 тапа «Старт гонки»', async () => {
    await T('touchStart', [GAS, LEFT]); await wait(500); await showRes(); await wait(700);
    const b = await ctr(PRIM); for (let k = 0; k < 4; k++) await tap({ ...b, id: 10 + k }, [GAS, LEFT]); await T('touchEnd', [GAS, LEFT]); });
  await sc('5. палец на GAS снят до тапа (всё отпущено)', async () => {
    await T('touchStart', [GAS]); await wait(500); await showRes(); await wait(300); await T('touchEnd', [GAS]); await wait(500);
    await tap({ ...(await ctr(PRIM)), id: 5 }, []); });
  await sc('6. большой палец держит край экрана (фон), тап «Старт гонки»', async () => {
    await showRes(); await wait(300); const E = { x: 8, y: 380, id: 3 }; await T('touchStart', [E]); await wait(800);
    await tap({ ...(await ctr(PRIM)), id: 5 }, [E]); await T('touchEnd', [E]); });
  await sc('7. палец уехал с кнопки и отпущен мимо (передумал)', async () => {
    await showRes(); await wait(300); const b = await ctr(PRIM);
    await T('touchStart', [{ ...b, id: 5 }]); await wait(50); await T('touchMove', [{ x: b.x, y: b.y - 250, id: 5 }]); await wait(50); await T('touchEnd', [{ x: b.x, y: b.y - 250, id: 5 }]); });
  for (const [nm, sel] of [['В меню', GH], ['Старт гонки', PRIM]]) {   // настоящий обработчик «В меню»: нет ли проскока на следующий экран
    await pg.reload(); await wait(300);
    await pg.evaluate(() => { window.__go = []; const g = window.go; window.go = id => { __go.push(id); g(id); }; window.startRace = () => __go.push('startRace'); });
    await showRes(); await wait(300); await tap({ ...(await ctr(sel)), id: 5 }, []); await wait(900);
    console.log(('8. один палец, «' + nm + '», переходы экранов').padEnd(66), JSON.stringify(await pg.evaluate(() => [__go, document.querySelector('.screen.active').id])));
  }
  // экран финиша
  await pg.reload(); await wait(300); await stub();
  await pg.evaluate(() => { window.rematch = () => __hits.push('rematch'); document.getElementById('game').classList.remove('active'); document.getElementById('s-result').classList.add('active'); });
  await T('touchStart', [GAS]); await wait(300);
  await tap({ ...(await ctr('#s-result .btn.primary')), id: 6 }, [GAS]); await tap({ ...(await ctr('#s-result .btn.ghost')), id: 7 }, [GAS]); await T('touchEnd', [GAS]); await wait(300);
  console.log('9. финиш: палец лежит, тап «Ещё заезд», потом «В меню»'.padEnd(66), (await pg.evaluate(() => __hits.join(','))) || '— ничего');
  await br.close();
})();
