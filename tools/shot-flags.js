/* ============================================================================
   СЪЁМКА ФЛАГОВ — как выглядят жёлтый флаг и VSC (08.2026)

   Отличие от shot-track.js: интерфейс НЕ прячется — именно его и надо показать.
   Скрипт доводит игру до гонки, устраивает сход у ближайшего соперника,
   ставит игрока в нескольких десятках метров позади и снимает кадры
   в четырёх состояниях: появление флага, установившийся вид, «VSC
   заканчивается» и зелёный флаг.

   Запуск:  node tools/shot-flags.js                # все кадры в tools/shots/flags
            node tools/shot-flags.js --track=4      # только одна трасса

   Оговорки те же, что у shot-track.js: программный рендерер даёт 16-битную
   глубину, поэтому земляная плита на время съёмки опускается. index.html
   только читается.
   ========================================================================== */
'use strict';

const path = require('path');
const fs = require('fs');

const args = {};
process.argv.slice(2).forEach(a => { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) args[m[1]] = m[2]; });
const HTML = path.resolve(args.html || path.join(__dirname, '..', 'index.html'));
const OUT = args.out ? path.resolve(args.out) : path.join(__dirname, 'shots', 'flags');
const CHROME = args.chrome || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ONLY = args.track === undefined ? null : +args.track;

// какую трассу чем снимать: где болиду есть куда встать — жёлтый, где нет — VSC
const PLAN = [
  { track: 0, kind: 'yellow', at: 0.42 },     // Monza
  { track: 4, kind: 'vsc',    at: 0.45 },     // Montreal
];

/* Первый кадр после длинной пачки update() программный рендерер отдаёт не сразу:
   ждём два настоящих кадра браузера и при неудаче пробуем ещё раз. */
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

  for (const job of PLAN) {
    if (ONLY !== null && job.track !== ONLY) continue;
    const page = await browser.newPage({ viewport: { width: 1200, height: 560 } });
    page.on('pageerror', e => console.log('  JS-ошибка: ' + e.message));
    await page.goto('file://' + HTML);
    await page.waitForTimeout(800);

    // до гонки: трасса, пилот, решётка, фонари погашены
    const started = await page.evaluate(({ tr }) => {
      sel.track = tr; sel.roster = 0; sel.diff = 'normal'; sel.laps = 3; sel.view = 'cockpit';
      selTeam = ROSTER[sel.roster].teamIdx; camMode = 'cockpit'; startWeekend();
      return track ? 'ok' : 'нет трассы';
    }, { tr: job.track });
    if (started !== 'ok') { console.log(started); await page.close(); continue; }
    // размытие под экранными кнопками (backdrop-filter) вешает съёмку на программном
    // рендерере намертво — снимаем только его, сами кнопки остаются на месте
    await page.addStyleTag({ content: '.kb{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}' });
    await page.waitForTimeout(1500);

    const name = await page.evaluate(({ want }) => {
      player.best = qualiField[9].time - 0.001;      // встать в середину решётки
      beginQualiOutro(); clearTimeout(qualiOutroTimer);   // иначе через 3 с поверх игры всплывёт экран квалификации
      qualiOutro = false; raceOutro = false; hideQualiBanner(); startRace();
      document.querySelectorAll('.screen').forEach(s2 => s2.classList.remove('active'));
      document.getElementById('game').classList.add('active');
      lights.t = 0; lights.seq = 5; lights.offAt = 0.0001; lights.go = true; lights.hide = 0; raceTime = 0;
      endLoop(); showGantry(false);                   // кадры дальше крутим сами; консоль старта убрать
      for (let f = 0; f < 60 * 10; f++) update(1 / 60);   // 10 с гонки, поле разъезжается
      scene.children.forEach(o => {                   // см. про 16-битную глубину в shot-track.js
        if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 9000) o.position.y = -0.6; });
      // сход у соперника, идущего впереди игрока — В ЗАДАННОМ МЕСТЕ:
      // где болиду есть куда встать, поднимается жёлтый, где нет — VSC,
      // а куда именно доедет машина, само по себе дело случая
      const ahead = field.filter(c => !c.retired && c.dist > player.dist).sort((a, b) => a.dist - b.dist)[0] || field[0];
      window.__victim = ahead;
      field.forEach(c => { if (c !== ahead) c.retireAt = 0; });      // никаких посторонних сходов в кадре
      const i0 = Math.floor(((ahead.u % 1) + 1) % 1 * track.M) % track.M;
      const seg = track.length / track.M;
      let step = 0;
      const need = 2 * carHalfWidth(0.1) + 0.4;
      const good = (k) => {                                  // место должно подходить с ОБЕИХ сторон:
        const u = ((i0 + k) % track.M) / track.M;            // на какой окажется болид, к моменту схода ещё неизвестно
        const a = retireSpot({ u, lane: 3 }), b = retireSpot({ u, lane: -3 });
        return want === 'vsc' ? Math.max(a.free, b.free) < need : Math.min(a.free, b.free) >= need;
      };
      for (let k = 1; k < track.M; k++) {                     // и держаться десяток точек подряд: точка остановки
        let ok = true;                                       // считается по дистанции и на пару индексов гуляет
        for (let d = -2; d <= 8 && ok; d++) ok = good(k + d);
        if (ok) { step = k; break; }
      }
      ahead.retireAt = ahead.dist + step * seg + 0.5;
      for (let f = 0; f < 60 * 20 && !ahead.retired; f++) update(1 / 60);
      return track.name;
    }, { want: job.kind });

    // поставить игрока позади сошедшего и снять кадр
    const shoot = async (tag, note) => {
      await page.evaluate(({ back }) => {
        const v = window.__victim, i = v.retiredIdx;
        const j = (i - Math.round(back / (track.length / track.M)) + track.M * 2) % track.M;
        const P = track.P[j], F = track.F[j], R = track.R[j];
        const lane = v.retiredSide * 2.0;              // ехать по той же стороне: так авария в кадре, а не за краем
        player.x = P.x + R.x * lane; player.z = P.z + R.z * lane;
        player.hdg = Math.atan2(F.x, F.z); player.hint = j;
        player.speed = vscOn() ? vscCap(j, 30) : 45;
        placePlayer(player); updateCamera(0.016); updateHUD(); render();
        const dx = v.x - player.x, dz = v.z - player.z;
        const s2 = Math.sin(player.hdg), c2 = Math.cos(player.hdg);
        window.__dbg = { lon: +(dx * s2 + dz * c2).toFixed(1), lat: +(dx * c2 - dz * s2).toFixed(1),
                         victim: v.code, retired: v.retired, mode: neutral.mode,
                         retiredList: cars.filter(c => c.retired).map(c => c.code).join(','),
                         towerLast: (document.querySelectorAll('#tower .trow')[21] || {}).textContent,
                         big: (document.getElementById('bigmsg').textContent || '').slice(0, 24) };
      }, { back: 30 });
      console.log('    ' + JSON.stringify(await page.evaluate(() => window.__dbg)));
      const file = path.join(OUT, `${name.toLowerCase()}-${tag}.png`);
      await snap(page, file);
      console.log(`  ${file}  — ${note}`);
    };

    const state = () => page.evaluate(() => ({ mode: neutral.mode, left: +neutral.left.toFixed(1),
      blocking: !!window.__victim.blockedRoad }));
    const run = (secs) => page.evaluate(({ s }) => { for (let f = 0; f < Math.round(60 * s); f++) update(1 / 60); }, { s: secs });

    // Состояния переключаются явно, а не «домоткой» таймера: пробник neutral
    // уже проверил, что 40 / 27 / 3 / 3 секунды отсчитываются верно, а кадру
    // нужна не длительность, а сам вид.
    console.log(`${name}: ${JSON.stringify(await state())}`);
    // сообщение по центру живёт 1.4 с настоящего времени и к моменту съёмки успевает
    // погаснуть — показываем ровно то, что показывает сама игра при подъёме флага
    await page.evaluate(({ k }) => k === 'vsc'
      ? big('VSC', 'болид на трассе — темп ограничен', 60000)
      : big('ЖЁЛТЫЙ ФЛАГ', 'болид сошёл — обгон запрещён', 60000), { k: job.kind });
    await shoot(job.kind + '-1-появление', 'флаг только что подняли');
    await page.evaluate(() => big('', ''));      // всплывающее сообщение живёт полторы секунды, дальше остаётся только плашка
    await run(6); await shoot(job.kind + '-2-держится', 'установившийся вид');
    if (job.kind === 'vsc') {
      await page.evaluate(() => { neutral.left = 0.01; });         // vsc -> «заканчивается»
      await run(0.1);
      console.log(`  ${JSON.stringify(await state())}`);
      await shoot('vsc-3-заканчивается', 'сообщение «VSC заканчивается»');
    }
    await page.evaluate(() => { neutral.left = 0.01; });           // -> зелёный
    await run(0.1);
    console.log(`  ${JSON.stringify(await state())}`);
    await shoot(job.kind + '-4-зелёный', 'зелёный флаг, гонка возобновлена');
    // и вид сверху на то, где остался болид
    await page.evaluate(() => {
      updateCamera = function () {};
      const v = window.__victim, i = v.retiredIdx, p = track.P[i], f = track.F[i];
      cam.position.set(p.x - f.x * 26, 46, p.z - f.z * 26);
      cam.lookAt(p.x + f.x * 14, 0, p.z + f.z * 14);
      render();
    });
    const top = path.join(OUT, `${name.toLowerCase()}-${job.kind}-5-сверху.png`);
    await snap(page, top);
    console.log(`  ${top}  — где остался болид`);
    await page.close();
  }
  await browser.close();
})();
