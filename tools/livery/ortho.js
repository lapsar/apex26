// Болид ортокамерой в масштабе фото ливреи (v1.17.32): наложить на фото и сверить силуэт и рисунок.
// node tools/livery/ortho.js <index.html> <out.png> <top|side> <W> <H> <ppm> <cx> <cy> <z при cx (1.80)> <y при cy (0.355 сбоку, 0 сверху)> [цвет команды]
// Нос влево, как на фото; сверху — экран вверх = −x. Фон прозрачный.
'use strict';const path=require('path'),fs=require('fs'),http=require('http');
const [IDX,OUT,VIEW,W,H,PPM,CX,CY,ZC,VC,COL]=process.argv.slice(2);
const srv=http.createServer((q,r)=>{fs.readFile(path.resolve(IDX),(e,d)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end(d);});}).listen(0);
(async()=>{const {chromium}=require('playwright');const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',e.message));await p.goto('http://localhost:'+srv.address().port+'/');await p.waitForTimeout(1500);
const r=await p.evaluate(a=>{const [VIEW,W,H,PPM,CX,CY,ZC,VC,COL]=a;const car=makeCar(COL||'#4E8F92',63,false);
 const R=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:true});R.setSize(W,H);R.setClearColor(0x000000,0);
 const sc=new THREE.Scene();sc.add(car);sc.add(new THREE.HemisphereLight('#eaf3ff','#5b6b4a',1.0));const d=new THREE.DirectionalLight('#fff4e2',1.0);d.position.set(4,8,6);sc.add(d);
 // screen x -> z decreasing to the right (nose left), as in photos
 const l=-CX/PPM,rr=(W-CX)/PPM,t=CY/PPM,bt=-(H-CY)/PPM;const c=new THREE.OrthographicCamera(l,rr,t,bt,0.01,100);
 if(VIEW==='side'){c.position.set(20,VC,ZC);c.lookAt(0,VC,ZC);}         // from -x: screen right = -z
 else{c.up.set(-1,0,0);c.position.set(0,20,ZC);c.lookAt(0,0,ZC);}       // from top: screen right = -z, screen up = -x
 R.render(sc,c);return R.domElement.toDataURL('image/png');},[VIEW,+W,+H,+PPM,+CX,+CY,+ZC,+VC,COL]);
fs.writeFileSync(OUT,Buffer.from(r.split(',')[1],'base64'));await b.close();srv.close();})();
