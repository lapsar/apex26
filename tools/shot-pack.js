/* Съёмка перестроения соперников после старта: камера ставится позади пелотона
   и смотрит вперёд, чтобы было видно, как болиды сходятся в колонну. */
const path=require('path'),fs=require('fs');
const HTML=path.resolve(process.env.APEX_INDEX||path.join(__dirname,'..','index.html'));
const OUT=process.argv[2]||'/tmp/pack.png';
const AT=+(process.argv[3]||16);          // секунд после погасания фонарей
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
(async()=>{
const {chromium}=require('playwright');
const b=await chromium.launch({executablePath:fs.existsSync(CHROME)?CHROME:undefined,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:1200,height:560}});
p.on('pageerror',e=>console.log('  JS-ОШИБКА: '+e.message));
await p.goto('file://'+HTML);
await p.waitForTimeout(600);
await p.evaluate(()=>{sel.track=4;sel.roster=0;sel.diff='normal';sel.laps=3;sel.view='chase';
  selTeam=ROSTER[sel.roster].teamIdx;camMode='chase';startWeekend();});
await p.waitForTimeout(1500);
const info=await p.evaluate((AT)=>{
  player.best=qualiField[20].time+2;                 // игрок на последнем месте: весь пелотон впереди
  beginQualiOutro();qualiOutro=false;raceOutro=false;startRace();
  clearTimeout(qualiOutroTimer);
  document.getElementById('s-quali').classList.remove('active');
  document.getElementById('game').classList.add('active');
  lights.t=0;lights.seq=5;lights.offAt=0.0001;lights.go=true;lights.hide=0;raceTime=0;
  for(let f=0;f<Math.round(AT*60);f++){controls.gas=1;update(1/60);}
  // камера: позади самого заднего соперника, смотрит вперёд вдоль трассы
  const last=field.slice().sort((a,b)=>a.dist-b.dist)[0];
  const i=Math.floor(((last.u%1)+1)%1*track.M)%track.M, P=track.P[i], F=track.F[i];
  cam.position.set(P.x-F.x*26,7.5,P.z-F.z*26);
  cam.lookAt(P.x+F.x*40,1.0,P.z+F.z*40);
  renderer.render(scene,cam);
  return field.map(c=>({n:c.code,crab:+(c.crab*57.3).toFixed(1)})).sort((a,b)=>Math.abs(b.crab)-Math.abs(a.crab)).slice(0,5);
},AT);
await p.evaluate(()=>document.querySelectorAll('#pauseov,#topbtns,#tower,#topinfo,#posbadge,#kb,.kb,#pad').forEach(e=>e&&(e.style.visibility='hidden')));
await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
await p.waitForTimeout(300);
await p.screenshot({path:OUT,animations:'disabled'});
console.log(OUT,'| наибольший угол доворота, град:',JSON.stringify(info));
await b.close();})();
