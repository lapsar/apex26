/* ============================================================================
   СЪЁМКА КАМЕРОЙ В ПРОИЗВОЛЬНОЙ ТОЧКЕ (v1.16.55) — вариант shot-track.js

   shot-track ставит БОЛИД в точку и снимает из кокпита — но физика за 200 мс
   выталкивает болид обратно за стену, и «вид с пит-лейна» не снять. Здесь
   камера ставится сама: --s (S трассы), --off (м вбок от осевой, + вправо),
   --h (м над рельефом), --yaw (градусы от направления трассы); болид — на осевой.
   --rays=1 печатает, во что попадают лучи из четырёх точек экрана (меш, цвет,
   высота, нормаль) — так нашлись нормали меша домов, посчитанные до подъёма
   на рельеф (v1.16.55). Второй кадр — вид сверху, как у shot-track.
     node tools/shot-cam.js --track=3 --s=3180 --off=30 --h=3 --yaw=0   # Монако, пит-лейн
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
const OFF = +(args.off || 0); const HGT = +(args.h || 1.5);                // сдвиг вбок от осевой, м (+ вправо по ходу)
const YAW = +(args.yaw || 0) * Math.PI / 180; // поворот камеры от направления трассы, градусы
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
  const info = await page.evaluate(({ s, off, yaw, hg }) => { updateCamera=function(){};
    let i = 0; while (i < track.M - 1 && track.S[i] < s) i++;
    player.x = track.P[i].x; player.z = track.P[i].z;
    player.hdg = Math.atan2(track.F[i].x, track.F[i].z) + yaw;
    player.x += track.R[i].x * off; player.z += track.R[i].z * off;   // вид с вылета, лицом к стене
    player.speed = 0; player.hint = i; player.steerVis = 0;
    placePlayer(player); { const q=track.P[i], r=track.R[i], f=track.F[i]; const cx=q.x+r.x*off, cz=q.z+r.z*off, cy=(track.relief?reliefY(cx,cz):0)+hg; const c=Math.cos(yaw), sn=Math.sin(yaw), dx=f.x*c+r.x*sn, dz=f.z*c+r.z*sn; cam.position.set(cx,cy,cz); cam.lookAt(cx+dx*30,cy-2,cz+dz*30); } render();
    window.__i = i;
    return { i, S: +track.S[i].toFixed(0), name: track.spec.name };
  }, { s: S, off: OFF, yaw: YAW, hg: HGT });
  if (args.rays) console.log(await page.evaluate(() => { const rc=new THREE.Raycaster(), out=[];
    for (const [px,py] of [[640,390],[520,480],[760,330],[300,480]]) { rc.setFromCamera({x:px/600-1,y:1-py/280}, cam);
      const h=rc.intersectObjects(scene.children,true)[0]; if(!h){out.push('нет');continue;}
      const o=h.object, m=o.material; out.push(px+','+py+' → '+(o.name||o.type)+' верш='+o.geometry.attributes.position.count+' цвет='+(m.color?m.color.getHexString():'')+' vc='+!!m.vertexColors+' map='+!!m.map+' y='+h.point.y.toFixed(2)+' n='+(h.face?[h.face.normal.x,h.face.normal.y,h.face.normal.z].map(v=>v.toFixed(2)).join(','):'')); }
    return out.join('\n'); }));
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
