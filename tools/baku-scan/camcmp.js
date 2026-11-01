// Кокпит игры в позе болида онбоарда Баку: сейчас / другая высота, наклон, место, угол обзора (замер 01.11.2026, game.md).
// node tools/baku-scan/camcmp.js OUT '[{"t":"now"},{"t":"B","h":1.28,"tilt":17.8,"z":-0.05},{"t":"C","h":1.28,"tilt":17.8,"hf":80,"z":-0.05}]' 40,300,420
// OUT/povs.json — позы (povcmp.py); h — высота камеры над асфальтом, tilt — вниз, градусы; z — вдоль болида от центра; hf — угол по горизонтали
// helm — сдвиг шлема вперёд, м (вершины склеенного меша в сфере шлема); VW/VH — размер кадра (iPad: VW=1024 VH=768)
const path=require('path'),fs=require('fs');
const {chromium}=require('playwright');
const HTML=process.env.APEX_INDEX?path.resolve(process.env.APEX_INDEX):path.resolve(__dirname,'../../index.html'),OUT=process.argv[2];
const POVS=JSON.parse(fs.readFileSync(path.join(OUT,'povs.json'))).filter(p=>!process.argv[4]||process.argv[4].split(',').includes(''+p.k));
const VAR=JSON.parse(process.argv[3]);
(async()=>{
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']}).catch(()=>chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']}));
  const page=await browser.newPage({viewport:{width:+(process.env.VW||1280),height:+(process.env.VH||720)}});
  page.on('pageerror',e=>console.log('JS: '+e.message));
  await page.goto('file://'+HTML);await page.waitForTimeout(1000);
  await page.evaluate(()=>{const tr=TRACKS.findIndex(t=>t.key==='Baku');sel.track=tr;sel.roster=0;sel.diff='normal';sel.laps=1;
    sel.view='cockpit';selTeam=ROSTER[sel.roster].teamIdx;camMode='cockpit';startWeekend();});
  await page.waitForTimeout(2500);
  await page.evaluate(()=>{['topbtns','bigmsg','tower','topinfo','posbadge','lightsG','stage'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
    document.querySelectorAll('.btnrow,.pad,.touch,.hud').forEach(el=>(el.style.display='none'));
    scene.children.forEach(o=>{if(o.isMesh&&o.geometry&&o.geometry.parameters&&o.geometry.parameters.width===9000)o.position.y=-0.6;});
    field.forEach(c=>{if(c!==player&&c.mesh)c.mesh.visible=false;});
    const orig=updateCamera;window.__ov=null;
    updateCamera=function(dt){orig(dt);const v=window.__ov;cam.fov=64;
      if(v&&v.h){const gy=player.gy||0,sl=player.slope||0,vh=player.hdg+(player.yawLag||0),f=[Math.sin(vh),Math.cos(vh)];
        const ca=1/Math.sqrt(1+sl*sl),sa=sl*ca,zc=(v.z!==undefined?v.z:-0.62),hz=zc*ca-v.h*sa;cam.position.set(player.x+f[0]*hz,gy+v.h*ca+zc*sa,player.z+f[1]*hz);const pitch=Math.atan(sl)-v.tilt*Math.PI/180;
        cam.lookAt(cam.position.x+f[0]*14*Math.cos(pitch),cam.position.y+14*Math.sin(pitch),cam.position.z+f[1]*14*Math.cos(pitch));}
      if(v&&v.hf)cam.fov=2*Math.atan(Math.tan(v.hf*Math.PI/360)/cam.aspect)*180/Math.PI;
      cam.updateProjectionMatrix();};});
  const info=await page.evaluate(()=>({fov:cam.fov,near:cam.near,pm:!!(player.mesh&&player.mesh.visible)}));console.log(info);
  for(const p of POVS)for(const v of VAR){
    const r=await page.evaluate(([p,v])=>{player.x=p.x;player.z=p.z;player.hdg=p.hdg;player.speed=0;player.steerVis=0;player.yawLag=0;
      let best=1e18,bi=0;for(let i=0;i<track.M;i++){const d=(track.P[i].x-p.x)**2+(track.P[i].z-p.z)**2;if(d<best){best=d;bi=i;}}
      window.__ov=v;player.mesh.visible=!v.hide;if(v.helm&&!player.mesh.userData.helmMoved){player.mesh.userData.helmMoved=1;let n=0;player.mesh.updateMatrixWorld(true);
        player.mesh.traverse(o=>{if(!o.isMesh||!o.geometry||o.userData.shared)return;const a=o.geometry.attributes.position;
          const inv=new THREE.Matrix4().copy(player.mesh.matrixWorld).invert().multiply(o.matrixWorld),inv2=new THREE.Matrix4().copy(inv).invert(),q=new THREE.Vector3();
          for(let i=0;i<a.count;i++){q.fromBufferAttribute(a,i).applyMatrix4(inv);if(Math.hypot(q.x,q.y-0.82,q.z-0.24)<=0.156){q.z+=v.helm;q.applyMatrix4(inv2);a.setXYZ(i,q.x,q.y,q.z);n++;}}
          a.needsUpdate=true;o.geometry.computeBoundingSphere();});window.__hn=n;}
      player.hint=bi;placePlayer(player);updateCamera(0.016);
      const y0=cam.position.y,gy=player.gy||0;
      render();return {hn:window.__hn,y0:y0-gy,yc:cam.position.y-gy,fov:cam.fov,gy,slope:player.slope||0};},[p,v]);
    console.log(p.k,v.t,JSON.stringify(r));
    await page.waitForTimeout(150);
    await page.screenshot({path:path.join(OUT,'g_'+p.k+'_'+v.t+'.png')});
  }
  await browser.close();
})();
