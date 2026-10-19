/* Съёмка схода соперника (v1.16.79): сценарии 'tech' (отказ техники), 'crash' (вылет), 'spin' (сход-разворот) и 'spinerr'
   (ошибка-разворот: развернулся, постоял, вернулся). До v1.16.86 здесь был 'seize' — «заклинило», убранное из игры в v1.16.82,
   и инструмент по умолчанию падал (seizeStart is not defined).
   Гонка крутится до --warm секунд (Math.random — на зерне --seed), затем ищется пара подряд идущих соперников T и F1,
   где F1 — в 10–45 м за T, а T — на прямой или в пологом повороте (для 'crash' — у точки решения ошибки, errCorners;
   для 'spin'/'spinerr' — у точки решения места разворота, spinCorners: у Монако, Монреаля, Майами мест нет).
   T получает сход принудительно; разворот случается в точке срыва (C.on, дальше по ходу) — отсчёт кадров (--times) идёт
   с момента срыва. --spin=рад задаёт угол разворота (по умолчанию — жребий игры); соседа на пути разворот не ждёт
   ни в игре, ни здесь — тогда сход-разворот уходит в вылет или ожидание, а ошибка становится обычной: смените --seed/--warm.
   Кадры (--times, с от начала схода) — виды --views:
     f1 — кокпит болида позади (y=1.42, 0.62 м позади центра — как у игрока); tv — «вертолёт» спереди-сверху;
     close — сзади-сбоку крупно; top — строго сверху; side — сбоку на уровне болида; stop — после остановки (+1 с), «вертолёт».
     node tools/shot-retire.js --track=1 --kind=spin --spin=2.6 --out=/tmp/ret
   Оговорки: программный рендерер (swiftshader), земляная плита опущена, как в shot-track. Игра не меняется. */
'use strict';
const path = require('path'), fs = require('fs');
const args = {};
process.argv.slice(2).forEach(a => { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) args[m[1]] = m[2]; });
const HTML = path.resolve(args.html || path.join(__dirname, '..', 'index.html'));
const OUT = path.resolve(args.out || '/tmp/ret');
const TRACK = +(args.track || 1), WARM = +(args.warm || 40), KIND = args.kind || 'spin';
const SPIN = args.spin === undefined ? null : +args.spin;
const TIMES = (args.times || '0.5,1.5,2.5,3.5').split(',').map(Number);
const VIEWS = (args.views || 'f1,tv,close').split(',');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

(async () => {
  const { chromium } = require('playwright');
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 560 } });
  p.on('pageerror', e => console.log('  JS-ОШИБКА: ' + e.message));
  const SEED = +(args.seed || 7);
  await p.addInitScript(sd => { let a = sd >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }, SEED);
  await p.goto('file://' + HTML);
  await p.waitForTimeout(600);
  await p.evaluate(([T]) => {
    sel.track = T; sel.roster = 0; sel.diff = 'normal'; sel.laps = 5; sel.view = 'cockpit';
    selTeam = ROSTER[sel.roster].teamIdx; camMode = 'cockpit'; startWeekend();
  }, [TRACK]);
  await p.waitForTimeout(1500);
  const info = await p.evaluate(([WARM, KIND, SPIN]) => {
    player.best = qualiField[20].time + 2;                     // игрок последним: он стоит на решётке и никому не мешает
    beginQualiOutro(); qualiOutro = false; raceOutro = false; startRace();
    clearTimeout(qualiOutroTimer);
    document.getElementById('s-quali').classList.remove('active');
    document.getElementById('game').classList.add('active');
    cancelAnimationFrame(rafId);
    lights.t = 0; lights.seq = 5; lights.offAt = 0.0001; lights.go = true; lights.hide = 0; raceTime = 0;
    field.forEach(c => { c.retireAt = 0; });
    updateCamera = function () {};
    ['bigmsg', 'tower', 'topinfo', 'posbadge', 'lightsG'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.querySelectorAll('.btnrow,.pad,.touch,.hud,#pauseov,#topbtns,#kb,.kb,#pad').forEach(el => (el.style.display = 'none'));
    scene.children.forEach(o => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 9000) o.position.y = -0.6; });
    for (let f = 0; f < Math.round(WARM * 60); f++) { controls.gas = 0; update(1 / 60); }
    const ec = errCorners(), sc = spinCorners(), M = track.M, SPINK = KIND === 'spin' || KIND === 'spinerr';
    if (SPINK && !sc.list.length) return { name: track.spec.name, fail: 'на трассе нет мест разворота' };
    for (let f = 0; f < 60 * 120; f++) {
      controls.gas = 0; update(1 / 60);
      const ord = field.filter(c => !c.retired).sort((a, c) => c.dist - a.dist);
      for (let k = 1; k < ord.length - 1; k++) {
        const T = ord[k], F1 = ord[k + 1];
        if (T.err || neutral.mode) continue;
        const iu = carIdx(T);
        if (KIND === 'crash') { if (ec.trig[iu] < 0) continue; }
        else if (SPINK) { if (sc.trig[iu] < 0) continue; }
        else { let km = 0; for (let a = 0; a < 25; a++) km = Math.max(km, Math.abs(track.K[(iu + a) % M])); if (km > 0.05 || T.speed < 45) continue; }
        const g1 = Math.hypot(T.x - F1.x, T.z - F1.z);
        if (g1 < 10 || g1 > 45) continue;
        if (KIND === 'crash') { T.fail = { wait: true, until: T.dist + 1500 }; T.err = null; T.errI = (iu - 1 + M) % M; }
        else if (KIND === 'tech') techStart(T, iu);
        else { const C = sc.list[sc.trig[iu]]; T.err = null; T.spinPend = KIND === 'spin' ? { C, ret: true, d0: T.dist, until: T.dist + C.toEx, wu: T.dist + 1500 }
          : { C, ret: false, d0: T.dist, until: T.dist + C.toEx }; }
        window.__L = { T, F1, born: raceTime, wait: SPINK };
        window.__camF1 = () => { const m = F1.mesh, h = m.rotation.y;
          cam.position.set(m.position.x - Math.sin(h) * 0.62, m.position.y + 1.42, m.position.z - Math.cos(h) * 0.62);
          cam.lookAt(m.position.x + Math.sin(h) * 40, m.position.y + 0.9, m.position.z + Math.cos(h) * 40); cam.updateMatrixWorld(); };
        window.__camF1();
        return { name: track.spec.name, T: T.code, F1: F1.code, pos: k + 1, g1: +g1.toFixed(1), v: +(T.speed * 3.6).toFixed(0),
          S: +track.S[iu].toFixed(0), spinMax: T.fail && T.fail.spinMax !== undefined ? +(T.fail.spinMax * 57.3).toFixed(0) : null };
      }
    }
    return { name: track.spec.name, fail: 'пары не нашлось' };
  }, [WARM, KIND, SPIN]);
  console.log(JSON.stringify(info));
  if (info.fail) { await b.close(); process.exit(1); }
  const shoot = async (v, name, st) => {
    await p.evaluate(([v]) => { const L = window.__L, m = L.T.mesh, h = L.T.retired ? m.rotation.y : Math.atan2(track.F[carIdx(L.T)].x, track.F[carIdx(L.T)].z);
      const fx = Math.sin(h), fz = Math.cos(h);       // оси — по дороге, а не по развёрнутому кузову: иначе камера крутится вместе с ним
      field.forEach(c => c.mesh.visible = true);
      if (v === 'top') { cam.position.set(m.position.x, m.position.y + 18, m.position.z); cam.up.set(fx, 0, fz);
        cam.lookAt(m.position.x, m.position.y, m.position.z); cam.up.set(0, 1, 0); }
      else if (v === 'close') { cam.position.set(m.position.x - fx * 13 + fz * 6, m.position.y + 4.5, m.position.z - fz * 13 - fx * 6);
        cam.lookAt(m.position.x, m.position.y + 0.4, m.position.z); }
      else if (v === 'side') { cam.position.set(m.position.x + fz * 14 + fx * 3, m.position.y + 2.2, m.position.z - fx * 14 + fz * 3);
        cam.lookAt(m.position.x, m.position.y + 0.6, m.position.z); }
      else if (v === 'tv' || v === 'stop') { cam.position.set(m.position.x + fx * 24 - fz * 4, m.position.y + 16, m.position.z + fz * 24 + fx * 4);
        cam.lookAt(m.position.x - fx * 4, m.position.y, m.position.z - fz * 4); }
      else { const c = L.F1, mm = c.mesh, hh = mm.rotation.y, gx = Math.sin(hh), gz = Math.cos(hh);
        mm.visible = false;
        cam.position.set(mm.position.x - gx * 0.62, mm.position.y + 1.42, mm.position.z - gz * 0.62);
        cam.lookAt(mm.position.x + gx * 40, mm.position.y + 0.9, mm.position.z + gz * 40); }
      cam.updateMatrixWorld(); smokeUpdate(); render(); }, [v]);
    const f = path.join(OUT, name + '.png');
    const png = await p.evaluate(() => { render(); return renderer.domElement.toDataURL('image/png'); });
    fs.writeFileSync(f, Buffer.from(png.split(',')[1], 'base64'));
    console.log(f, JSON.stringify(st));
  };
  for (const t of TIMES) {
    const st = await p.evaluate(([t, SPIN]) => { const L = window.__L;
      for (let f = 0; L.wait && f < 60 * 30; f++) { controls.gas = 0; __camF1(); update(1 / 60);   // разворот — с точки срыва, а не с назначения
        const ff = L.T.fail; if (ff && ff.on) { L.wait = false; L.born = raceTime; L.kind = ff.kind; if (SPIN !== null && ff.kind === 'spin') ff.spinMax = SPIN * (ff.spinMax < 0 ? -1 : 1); }
        else if (!L.T.spinPend && !(ff && ff.wait)) { L.wait = false; L.kind = L.T.err ? 'обычная ошибка (разворота нет)' : 'нет схода'; } }
      while (raceTime - L.born < t - 1e-6 && !L.T.retired) { controls.gas = 0; __camF1(); update(1 / 60); }
      const T = L.T, f = T.fail; return { t: +(raceTime - L.born).toFixed(2), kind: (f && f.kind) || L.kind, v: +(T.speed * 3.6).toFixed(0),
        yaw: +((T.crab || 0) * 57.3).toFixed(0), lane: +T.lane.toFixed(2), hw: +halfAt(carIdx(T)).toFixed(1), g1: +Math.hypot(T.x - L.F1.x, T.z - L.F1.z).toFixed(1),
        retired: T.retired, flag: neutral.mode }; }, [t, SPIN]);
    for (const v of VIEWS) await shoot(v, v + '-' + t.toFixed(2), st);
  }
  const st = await p.evaluate(() => { const L = window.__L;
    for (let f = 0; f < 60 * 40 && !L.T.retired; f++) { controls.gas = 0; __camF1(); update(1 / 60); }
    for (let f = 0; f < 60; f++) { controls.gas = 0; __camF1(); update(1 / 60); }
    const T = L.T; return { t: +(raceTime - L.born).toFixed(2), kind: T.retKind, yaw: +((T.crab || 0) * 57.3).toFixed(0), lane: +T.lane.toFixed(2),
      hw: +halfAt(carIdx(T)).toFixed(1), blocking: T.blocking, flag: neutral.mode }; });
  for (const v of (args.after || 'stop,top,side').split(',')) await shoot(v, 'after-' + v, st);
  await b.close();
})();
