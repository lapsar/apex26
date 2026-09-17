/* Снимок ОТТУДА, ГДЕ БОЛИД УПЁРСЯ: выезжаем в зону вылета под углом настоящей физикой,
   и как только проверка барьера начинает возвращать болид — снимаем вид из кокпита.
   Нужен, чтобы увидеть глазами то, что владелец называет «невидимым рельсом». */
'use strict';
const path=require('path'), fs=require('fs');
const args={}; process.argv.slice(2).forEach(a=>{const m=/^--([^=]+)=(.*)$/.exec(a); if(m)args[m[1]]=m[2];});
const HTML=path.resolve(args.html||path.join(__dirname,'..','index.html'));
const TAG=args.tag||'stuck', TRACK=+(args.track||5), S=+(args.s||0);
const SIDE=(args.side||'L')==='R'?1:-1, ANG=+(args.ang||35);
const OUT=path.join(__dirname,'shots');
const CHROME=args.chrome||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
(async()=>{
  const {chromium}=require('playwright');
  fs.mkdirSync(OUT,{recursive:true});
  const browser=await chromium.launch({executablePath:fs.existsSync(CHROME)?CHROME:undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1200,height:560}});
  page.on('pageerror',e=>console.log('  JS-ошибка: '+e.message));
  await page.goto('file://'+HTML); await page.waitForTimeout(1000);
  await page.evaluate(({tr})=>{ sel.track=tr;sel.roster=0;sel.diff='normal';sel.laps=1;sel.view='cockpit';
    selTeam=ROSTER[sel.roster].teamIdx;camMode='cockpit';startWeekend(); },{tr:TRACK});
  await page.waitForTimeout(1200);
  await page.evaluate(()=>{ ['bigmsg','tower','topinfo','posbadge','lightsG'].forEach(id=>{
      const el=document.getElementById(id); if(el)el.style.display='none';});
    document.querySelectorAll('.btnrow,.pad,.touch,.hud').forEach(el=>(el.style.display='none'));
    scene.children.forEach(o=>{ if(o.isMesh&&o.geometry&&o.geometry.parameters&&o.geometry.parameters.width===9000)o.position.y=-0.6;});});
  const info=await page.evaluate(({s,side,ang})=>{
    let i=0; while(i<track.M-1&&track.S[i]<s)i++;
    player.x=track.P[i].x;player.z=track.P[i].z;player.hint=i;player.prevIdx=i;
    player.arcPrev=track.S[i];player.steerAmt=0;player.steerVis=0;
    const hdg=Math.atan2(track.F[i].x,track.F[i].z)+side*ang*Math.PI/180;
    let blocked=0;
    for(let f=0;f<70;f++){ player.hdg=hdg;player.speed=14;
      controls.gas=1;controls.brake=0;controls.left=0;controls.right=0;
      update(1/60); if(wallTouch)blocked++; }
    player.speed=0;player.hdg=hdg;
    placePlayer(player);updateCamera(0.016);render();
    window.__p={x:player.x,z:player.z,h:hdg};
    const pr=project(player.x,player.z,player.hint);
    return {i,S:+track.S[i].toFixed(0),name:track.spec.name,blocked,
      off:+Math.abs(pr.off).toFixed(2),atS:Math.round(track.S[pr.idx]),
      wall:+((pr.off>=0?track.WR:track.WL)[pr.idx]).toFixed(2)};
  },{s:S,side:SIDE,ang:ANG});
  await page.waitForTimeout(200);
  const base=info.name.toLowerCase()+'-s'+info.S+'-'+(SIDE>0?'R':'L')+ANG+'-';
  await page.screenshot({path:path.join(OUT,base+'cockpit-'+TAG+'.png')});
  await page.evaluate(()=>{ updateCamera=function(){};
    const p=window.__p; cam.position.set(p.x-Math.sin(p.h)*35,55,p.z-Math.cos(p.h)*35);
    cam.lookAt(p.x+Math.sin(p.h)*20,0,p.z+Math.cos(p.h)*20); render();});
  await page.waitForTimeout(200);
  await page.screenshot({path:path.join(OUT,base+'top-'+TAG+'.png')});
  console.log(`${info.name} S=${info.S} ${SIDE>0?'R':'L'}${ANG}°: упирался ${info.blocked} кадров, встал в ${info.off} м от осевой (станция S=${info.atS}, борт ${info.wall} м)`);
  await browser.close();
})();
