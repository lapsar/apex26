/* Съёмка борьбы бок о бок: гонка крутится до заданной секунды, затем ищется пара
   соперников, идущих рядом (по продольному зазору меньше корпуса), и камера
   ставится сзади-сверху над ними. Нужна, чтобы посмотреть глазами на то, что
   пробники видят только числами: как выглядит доведённый до конца обгон и не
   висит ли болид на краю полотна.

   node tools/shot-duel.js --out=/tmp/duel.png --track=4 --at=25 [--html=archive/vX.html]
   Оговорки те же, что у shot-track.js: программный рендерер, 16-битная глубина,
   поэтому земляная плита на время кадра опускается. Игра не меняется. */
'use strict';
const path = require('path'), fs = require('fs');
const args = {};
process.argv.slice(2).forEach(a => { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) args[m[1]] = m[2]; });
const HTML = path.resolve(args.html || path.join(__dirname, '..', 'index.html'));
const OUT = path.resolve(args.out || '/tmp/duel.png');
const TRACK = +(args.track || 4), AT = +(args.at || 25), DIFF = args.diff || 'normal';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch({
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1200, height: 620 } });
  p.on('pageerror', e => console.log('  JS-ОШИБКА: ' + e.message));
  await p.goto('file://' + HTML);
  await p.waitForTimeout(600);
  await p.evaluate(([T, D]) => {
    sel.track = T; sel.roster = 0; sel.diff = D; sel.laps = 3; sel.view = 'chase';
    selTeam = ROSTER[sel.roster].teamIdx; camMode = 'chase'; startWeekend();
  }, [TRACK, DIFF]);
  await p.waitForTimeout(1500);

  const info = await p.evaluate(([AT]) => {
    player.best = qualiField[20].time + 2;              // игрок последним, весь пелотон впереди и в кадре
    beginQualiOutro(); qualiOutro = false; raceOutro = false; startRace();
    clearTimeout(qualiOutroTimer);
    document.getElementById('s-quali').classList.remove('active');
    document.getElementById('game').classList.add('active');
    lights.t = 0; lights.seq = 5; lights.offAt = 0.0001; lights.go = true; lights.hide = 0; raceTime = 0;
    for (let f = 0; f < Math.round(AT * 60); f++) { controls.gas = 1; update(1 / 60); }

    // пара, идущая бок о бок: продольный зазор меньше корпуса, поперечный — больше половины ширины
    let best = null;
    for (let a = 0; a < field.length; a++) for (let c = a + 1; c < field.length; c++) {
      const A = field[a], B = field[c];
      if (A.retired || B.retired) continue;
      const dd = Math.abs(A.dist - B.dist), dl = Math.abs(A.lane - B.lane);
      if (dd < 6.04 && dl > 2.0 && dl < 5.5 && (!best || dd < best.dd)) best = { A, B, dd, dl };
    }
    const ref = best ? best.A : field.slice().sort((x, y) => y.dist - x.dist)[10];
    const i = Math.floor(((ref.u % 1) + 1) % 1 * track.M) % track.M;
    const P = track.P[i], F = track.F[i];
    scene.traverse(o => {                                          // см. оговорку в шапке: опускаем земляную плиту
      if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 9000) o.position.y = -0.6; });
    // вид сверху: только он честно показывает, где болид стоит по ширине полотна
    updateCamera = function () {};                                 // цикл иначе вернёт камеру в кокпит
    cam.position.set(P.x, 46, P.z);
    cam.up.set(F.x, 0, F.z);                                       // «вперёд по трассе» — вверх кадра
    cam.lookAt(P.x, 0, P.z);
    renderer.render(scene, cam);
    const hw = halfAt(i);
    return best
      ? { pair: best.A.code + ' / ' + best.B.code, gapLong: +best.dd.toFixed(2), gapLat: +best.dl.toFixed(2),
          laneA: +best.A.lane.toFixed(2), laneB: +best.B.lane.toFixed(2), hw: +hw.toFixed(1),
          relA: +(Math.abs(best.A.lane) / hw * 100).toFixed(0), relB: +(Math.abs(best.B.lane) / hw * 100).toFixed(0) }
      : { pair: 'пары бок о бок нет' };
  }, [AT]);

  await p.evaluate(() => document.querySelectorAll('#pauseov,#topbtns,#tower,#topinfo,#posbadge,#kb,.kb,#pad')
    .forEach(e => e && (e.style.visibility = 'hidden')));
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT, animations: 'disabled' });
  console.log(OUT, '|', JSON.stringify(info));
  await b.close();
})();
