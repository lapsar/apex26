/* Съёмка стартовой последовательности: предмет съёмки — ИНТЕРФЕЙС, а не мир.
   Скрипт проезжает круг квалификации (чтобы панели набрали «квалификационное»
   состояние), ставит решётку и снимает кадр, пока горят фонари. Панели печатаются
   ещё и текстом, так что сверять можно без картинки.

   Запуск:  node tools/shot-start.js [файл.png]
            APEX_INDEX=archive/v1.15.37.html node tools/shot-start.js старое.png   */
'use strict';
const path=require('path'),fs=require('fs');
const HTML=path.resolve(process.env.APEX_INDEX||path.join(__dirname,'..','index.html'));
const OUT=path.resolve(process.argv[2]||path.join(__dirname,'shots','start.png'));
fs.mkdirSync(path.dirname(OUT),{recursive:true});
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
(async()=>{
const {chromium}=require('playwright');
const b=await chromium.launch({executablePath:fs.existsSync(CHROME)?CHROME:undefined,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:1200,height:560}});
p.on('pageerror',e=>console.log('  JS-ОШИБКА: '+e.message));
await p.goto('file://'+HTML);
await p.waitForTimeout(600);
await p.evaluate(()=>{sel.track=4;sel.roster=0;sel.diff='normal';sel.laps=3;sel.view='cockpit';
  selTeam=ROSTER[sel.roster].teamIdx;camMode='cockpit';startWeekend();});
await p.waitForTimeout(1500);
// проехать круг квалификации, чтобы HUD набрал «квалификационное» состояние
await p.evaluate(()=>{for(let f=0;f<600;f++){controls.gas=1;update(1/60);} controls.gas=0;});
await p.evaluate(()=>{player.best=qualiField[10].time-0.001;beginQualiOutro();qualiOutro=false;raceOutro=false;startRace();});
await p.evaluate(()=>{for(let f=0;f<170;f++)update(1/60);
  clearTimeout(qualiOutroTimer);document.getElementById('s-quali').classList.remove('active');document.getElementById('game').classList.add('active');});     // ~2.8 с: фонари горят
await p.evaluate(()=>document.querySelectorAll('#pauseov,#topbtns').forEach(e=>e.style.visibility='hidden'));
await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
await p.waitForTimeout(300);
await p.screenshot({path:OUT,animations:'disabled'});
const txt=await p.evaluate(()=>({top:document.getElementById('topinfo').innerText,pos:document.getElementById('posbadge').innerText,tower:document.getElementById('tower').dataset.head}));
console.log(OUT,JSON.stringify(txt));
await b.close();})();
