// Болид игрока в игре (свет и отражение неба игры), камера вокруг него (v1.17.32, ливреи).
// node tools/livery/shots.js <index.html> <префикс выхода> [трасса] [номер в ROSTER]   (Mercedes — 4)
// VIEWS='{"имя":[камера x,y,z, цель x,y,z (в осях болида), угол]}' — свои ракурсы.
'use strict';const path=require('path'),fs=require('fs');
const [HTML,OUT,TR,RO]=process.argv.slice(2);
(async()=>{const {chromium}=require('playwright');
const b=await chromium.launch({executablePath:require('fs').existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:1000,height:560}});p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('file://'+path.resolve(HTML));await p.waitForTimeout(1000);
await p.evaluate(({tr,ro})=>{sel.track=tr;sel.roster=ro;sel.diff='normal';sel.laps=1;sel.view='chase';selTeam=ROSTER[sel.roster].teamIdx;camMode='chase';startWeekend();},{tr:+(TR||0),ro:+(RO||4)});
await p.waitForTimeout(2500);
await p.evaluate(()=>{['bigmsg','tower','topinfo','posbadge','lightsG'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  document.querySelectorAll('.btnrow,.pad,.touch,.hud').forEach(el=>(el.style.display='none'));updateCamera=function(){};});
const V=process.env.VIEWS?JSON.parse(process.env.VIEWS):{q34f:[3.0,1.5,4.8,0,0.4,0.8,40],q34r:[-3.4,2.8,-4.4,0,0.4,-0.3,40],side:[6.5,0.9,0.2,0,0.45,0.2,40],chase:[0,2.2,-6.2,0,0.8,2,60],top:[0.01,8,0.3,0,0,0.3,45]};
for(const v in V){await p.evaluate(a=>{const m=player.mesh;m.updateMatrixWorld(true);const P=new THREE.Vector3(a[0],a[1],a[2]).applyMatrix4(m.matrixWorld),L=new THREE.Vector3(a[3],a[4],a[5]).applyMatrix4(m.matrixWorld);
  cam.fov=a[6];cam.clearViewOffset&&cam.clearViewOffset();cam.updateProjectionMatrix();cam.position.copy(P);cam.up.set(0,1,0);cam.lookAt(L);render();},V[v]);
 await p.waitForTimeout(150);await p.screenshot({path:OUT+'_'+v+'.png'});}
await b.close();})();
