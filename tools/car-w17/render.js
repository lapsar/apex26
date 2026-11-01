// Снимки болида из w17.json (до вписывания в игру): классы — нашими материалами, колёса — наши (makeCar игры).
'use strict';const path=require('path'),fs=require('fs'),http=require('http');
const SERVE=path.resolve(process.argv[2]),J=path.resolve(process.argv[3]),OUT=path.resolve(process.argv[4]);
const TYPES={'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=u==='/w17.json'?J:path.join(SERVE,u);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8792);
(async()=>{const {chromium}=require('playwright');const CH='/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';const b=await chromium.launch({executablePath:fs.existsSync(CH)?CH:undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',e.message));await p.goto('http://localhost:8792/index.html');await p.waitForTimeout(1200);
const r=await p.evaluate(async()=>{const D=await (await fetch('/w17.json')).json();
 const PAL={team:new THREE.MeshStandardMaterial({color:'#1E41FF',roughness:0.35,metalness:0.25}),carbon:new THREE.MeshStandardMaterial({color:'#13161c',roughness:0.45,metalness:0.5}),light:new THREE.MeshBasicMaterial({color:'#e02424'})};
 function car(k){const g=new THREE.Group(),L=D.lods[k].L;for(const c in L){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(L[c].p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(L[c].n,3));g.add(new THREE.Mesh(geo,PAL[c]));}
  const our=makeCar('#1E41FF',3,k==='a');our.userData.wheels.forEach(w=>{g.add(w.clone(true));});return g;}
 const objs={p:car('p'),a:car('a')};
 const V={q34:{pos:[2.5,1.15,3.9],look:[0,0.35,1.1],fov:40},fw:{pos:[-1.4,0.55,4.6],look:[-0.3,0.25,2.4],fov:40},rear:{pos:[-2.0,1.1,-4.0],look:[0,0.5,-1.1],fov:40},
  side:{pos:[3.4,0.45,-0.2],look:[0,0.3,-0.2],fov:50},hood:{pos:[1.6,1.6,-2.7],look:[0,0.7,-0.4],fov:40},chase:{pos:[0,2.7,-4.45],look:[0,1.1,8.5],fov:64},cockpit:{pos:[0,1.42,-0.62],look:[0,1.18,14],fov:64}};
 const R=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});R.setSize(800,450);R.outputEncoding=THREE.sRGBEncoding;R.setClearColor(0xe9edf2,1);const out={};
 for(const o in objs)for(const v in V){const sc=new THREE.Scene();sc.add(objs[o]);sc.add(new THREE.HemisphereLight('#eaf3ff','#5b6b4a',1.05));const d=new THREE.DirectionalLight('#fff4e2',1.15);d.position.set(4,8,6);sc.add(d);
  const gn=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshLambertMaterial({color:'#5d6168'}));gn.rotation.x=-Math.PI/2;gn.position.y=-0.003;sc.add(gn);
  const c=new THREE.PerspectiveCamera(V[v].fov,800/450,0.05,200);c.position.set(...V[v].pos);c.lookAt(...V[v].look);R.render(sc,c);out[o+'__'+v]=R.domElement.toDataURL('image/png');}
 return out;});
fs.mkdirSync(OUT,{recursive:true});for(const k in r)fs.writeFileSync(path.join(OUT,k+'.png'),Buffer.from(r[k].split(',')[1],'base64'));await b.close();srv.close();})();
